'use client'

import { useEffect, useRef, useState } from 'react'

declare global {
  interface Window {
    maplibregl?: any
  }
}

const MAPLIBRE_JS = 'https://unpkg.com/maplibre-gl@5.6.2/dist/maplibre-gl.js'
const MAPLIBRE_CSS = 'https://unpkg.com/maplibre-gl@5.6.2/dist/maplibre-gl.css'

const HYDRANT_DB_NAME = 'saskatoon-block-finder'
const HYDRANT_DB_VERSION = 1
const HYDRANT_STORE = 'offline-data'
const HYDRANT_CACHE_KEY = 'all-hydrants-v1'
const HYDRANT_VERSION_KEY = 'hydrant-data-version'

function openHydrantDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB is not available'))
      return
    }
    const request = window.indexedDB.open(HYDRANT_DB_NAME, HYDRANT_DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(HYDRANT_STORE)) db.createObjectStore(HYDRANT_STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Could not open hydrant cache'))
  })
}

async function readHydrantCache(): Promise<any | null> {
  try {
    const db = await openHydrantDb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(HYDRANT_STORE, 'readonly')
      const request = tx.objectStore(HYDRANT_STORE).get(HYDRANT_CACHE_KEY)
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
      tx.oncomplete = () => db.close()
    })
  } catch {
    return null
  }
}

async function writeHydrantCache(data: any) {
  try {
    const db = await openHydrantDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(HYDRANT_STORE, 'readwrite')
      tx.objectStore(HYDRANT_STORE).put(data, HYDRANT_CACHE_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch (error) {
    console.warn('Admin hydrant cache write failed:', error)
  }
}

function isManualHydrant(feature: any) {
  const value = feature?.properties?._manual
  return value === true || value === 'true' || value === 1 || value === '1'
}

function makeHydrantBundle(city: any[], manual: any[]) {
  const features = [...city, ...manual]
  return {
    type: 'FeatureCollection',
    features,
    counts: { city: city.length, manual: manual.length, total: features.length },
  }
}

async function loadAdminHydrantData() {
  const cached = await readHydrantCache()
  let serverVersion: number | null = null

  try {
    const versionResponse = await fetch('/api/hydrant-version', {
      credentials: 'same-origin',
      cache: 'no-store',
    })
    if (versionResponse.ok) {
      const versionData = await versionResponse.json()
      const parsed = Number(versionData?.version)
      if (Number.isFinite(parsed)) serverVersion = parsed
    }
  } catch {
    // The large saved dataset can still be used if the tiny version check fails.
  }

  if (cached?.features?.length) {
    const localVersion = Number(window.localStorage.getItem(HYDRANT_VERSION_KEY) || 0)
    if (serverVersion !== null && localVersion !== serverVersion) {
      try {
        const manualResponse = await fetch('/api/manual-hydrants', {
          credentials: 'same-origin',
          cache: 'no-store',
        })
        if (!manualResponse.ok) throw new Error('Could not update manual hydrants')
        const manualData = await manualResponse.json()
        const city = cached.features.filter((feature: any) => !isManualHydrant(feature))
        const manual = Array.isArray(manualData?.features) ? manualData.features : []
        const updated = makeHydrantBundle(city, manual)
        await writeHydrantCache(updated)
        window.localStorage.setItem(HYDRANT_VERSION_KEY, String(serverVersion))
        return updated
      } catch (error) {
        console.warn('Admin manual hydrant refresh failed; using saved hydrants:', error)
      }
    }
    return cached
  }

  // First hydrant use on this browser only: get the full snapshot once and save it.
  const response = await fetch('/api/hydrants', {
    credentials: 'same-origin',
    cache: 'no-store',
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data) throw new Error(data?.error || 'Could not load existing hydrants.')
  await writeHydrantCache(data)
  if (serverVersion !== null) window.localStorage.setItem(HYDRANT_VERSION_KEY, String(serverVersion))
  return data
}

type PickedPoint = {
  latitude: number
  longitude: number
}

function loadMapLibre() {
  return new Promise<void>((resolve, reject) => {
    if (window.maplibregl) {
      resolve()
      return
    }

    if (!document.querySelector(`link[href="${MAPLIBRE_CSS}"]`)) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = MAPLIBRE_CSS
      document.head.appendChild(link)
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${MAPLIBRE_JS}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Could not load map.')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = MAPLIBRE_JS
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Could not load map.'))
    document.head.appendChild(script)
  })
}

export default function HydrantPicker() {
  const mapNode = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const markerRefs = useRef<any[]>([])
  const [points, setPoints] = useState<PickedPoint[]>([])
  const [mapError, setMapError] = useState('')
  const [fullScreen, setFullScreen] = useState(false)
  const [hydrantCount, setHydrantCount] = useState<number | null>(null)

  function redrawPickedMarkers(nextPoints: PickedPoint[]) {
    const maplibregl = window.maplibregl
    const map = mapRef.current
    if (!maplibregl || !map) return

    markerRefs.current.forEach((marker) => marker.remove())
    markerRefs.current = nextPoints.map((point, index) => {
      const el = document.createElement('div')
      el.className = 'admin-picked-hydrant-marker'
      el.textContent = String(index + 1)
      el.title = `New hydrant ${index + 1}`
      return new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([point.longitude, point.latitude])
        .addTo(map)
    })
  }

  function addPoint(latitude: number, longitude: number) {
    const point = {
      latitude: Number(latitude.toFixed(6)),
      longitude: Number(longitude.toFixed(6)),
    }

    setPoints((current) => {
      const alreadyPicked = current.some(
        (item) =>
          Math.abs(item.latitude - point.latitude) < 0.000001 &&
          Math.abs(item.longitude - point.longitude) < 0.000001
      )
      if (alreadyPicked) return current
      const next = [...current, point]
      redrawPickedMarkers(next)
      return next
    })
  }

  function removeLastPoint() {
    setPoints((current) => {
      const next = current.slice(0, -1)
      redrawPickedMarkers(next)
      return next
    })
  }

  function clearPoints() {
    setPoints([])
    redrawPickedMarkers([])
  }

  useEffect(() => {
    let cancelled = false

    loadMapLibre()
      .then(() => {
        if (cancelled || !mapNode.current || !window.maplibregl) return

        const map = new window.maplibregl.Map({
          container: mapNode.current,
          style: {
            version: 8,
            sources: {
              osm: {
                type: 'raster',
                tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                tileSize: 256,
                attribution: '© OpenStreetMap contributors',
              },
            },
            layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
          },
          center: [-106.6700, 52.1332],
          zoom: 12,
        })

        mapRef.current = map
        map.addControl(new window.maplibregl.NavigationControl({ showCompass: false }), 'top-right')

        map.on('load', async () => {
          try {
            // Reuse the same permanent IndexedDB cache as the normal map.
            // The full City dataset is downloaded only on this browser's first hydrant use.
            const data = await loadAdminHydrantData()

            const features = Array.isArray(data.features) ? data.features : []
            setHydrantCount(features.length)

            map.addSource('admin-existing-hydrants', {
              type: 'geojson',
              data: { type: 'FeatureCollection', features },
            })

            map.addLayer({
              id: 'admin-existing-hydrants',
              type: 'circle',
              source: 'admin-existing-hydrants',
              paint: {
                'circle-radius': [
                  'interpolate', ['linear'], ['zoom'],
                  11, 2.5,
                  13, 3.5,
                  15, 5,
                  17, 7,
                  19, 9,
                ],
                'circle-color': '#e53935',
                'circle-stroke-color': [
                  'case',
                  ['==', ['get', '_manual'], true],
                  '#ffd54f',
                  '#ffffff',
                ],
                'circle-stroke-width': [
                  'case',
                  ['==', ['get', '_manual'], true],
                  3,
                  1.5,
                ],
                'circle-opacity': 0.96,
              },
            })

            map.on('click', 'admin-existing-hydrants', (event: any) => {
              event.originalEvent?.stopPropagation?.()
              const feature = event.features?.[0]
              if (!feature) return
              const p = feature.properties || {}
              const coords = feature.geometry?.coordinates
              if (!Array.isArray(coords)) return
              const manual = p._manual === true || p._manual === 'true' || p._manual === 1 || p._manual === '1'
              new window.maplibregl.Popup({ offset: 10 })
                .setLngLat(coords)
                .setHTML(
                  `<strong>🔥 Existing hydrant</strong><br>${manual ? 'Admin-added hydrant' : 'City hydrant'}${p.ADDRESS ? `<br>${p.ADDRESS}` : ''}`
                )
                .addTo(map)
            })

            map.on('mouseenter', 'admin-existing-hydrants', () => {
              map.getCanvas().style.cursor = 'pointer'
            })
            map.on('mouseleave', 'admin-existing-hydrants', () => {
              map.getCanvas().style.cursor = ''
            })

            if (data.cityLoadError) {
              setMapError('City hydrants are temporarily unavailable, but admin-added hydrants are shown.')
            } else {
              setMapError('')
            }
          } catch (error) {
            console.error(error)
            setMapError('The picker works, but existing hydrants could not be loaded right now.')
          }
        })

        map.on('click', (event: any) => {
          if (map.getLayer('admin-existing-hydrants')) {
            const existing = map.queryRenderedFeatures(event.point, { layers: ['admin-existing-hydrants'] })
            if (existing.length > 0) return
          }
          addPoint(event.lngLat.lat, event.lngLat.lng)
        })
      })
      .catch((error) => setMapError(error instanceof Error ? error.message : 'Could not load map.'))

    return () => {
      cancelled = true
      markerRefs.current.forEach((marker) => marker.remove())
      markerRefs.current = []
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => mapRef.current?.resize(), 50)
    return () => window.clearTimeout(timer)
  }, [fullScreen])

  function useMyLocation() {
    if (!navigator.geolocation) {
      setMapError('Location is not available in this browser.')
      return
    }

    setMapError('Getting your location…')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude
        const longitude = position.coords.longitude
        addPoint(latitude, longitude)
        mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 17 })
        setMapError('')
      },
      () => setMapError('Could not get your location. You can tap the map instead.'),
      { enableHighAccuracy: true, timeout: 12000 }
    )
  }

  const lastPoint = points[points.length - 1]

  return (
    <>
      <div>
        <label>Pick hydrant location(s)</label>
        <div className="muted" style={{ margin: '5px 0 9px' }}>
          Tap every missing hydrant you want to add. Existing hydrants are already shown in red.
        </div>
        <div className={`hydrant-picker-shell${fullScreen ? ' fullscreen' : ''}`}>
          <div className="hydrant-picker-toolbar">
            <div className="row" style={{ margin: 0 }}>
              <button
                className="secondary hydrant-fullscreen-button"
                type="button"
                onClick={() => setFullScreen((value) => !value)}
              >
                {fullScreen ? '↙ Exit full screen' : '⛶ Full screen'}
              </button>
              <button className="secondary" type="button" onClick={removeLastPoint} disabled={points.length === 0}>
                ↶ Undo last
              </button>
              <button className="secondary" type="button" onClick={clearPoints} disabled={points.length === 0}>
                🗑 Clear picks
              </button>
            </div>
            <div className="hydrant-count-wrap">
              {hydrantCount !== null ? (
                <span className="hydrant-count">🔥 {hydrantCount} existing</span>
              ) : null}
              <span className="hydrant-count new-pick-count">➕ {points.length} selected</span>
            </div>
          </div>
          <div ref={mapNode} className="hydrant-picker-map" />
        </div>
        {mapError ? <div className="message" style={{ marginTop: 8 }}>{mapError}</div> : null}
        <button className="secondary" type="button" onClick={useMyLocation} style={{ marginTop: 10 }}>
          📍 Add my current location
        </button>
      </div>

      <input type="hidden" name="hydrantPoints" value={JSON.stringify(points)} />
      <input type="hidden" name="latitude" value={lastPoint?.latitude ?? ''} />
      <input type="hidden" name="longitude" value={lastPoint?.longitude ?? ''} />

      <div className="coordinate-grid">
        <div>
          <label>Selected hydrants</label>
          <input value={points.length ? `${points.length} location${points.length === 1 ? '' : 's'} ready to add` : ''} readOnly placeholder="Tap the map" />
        </div>
        <div>
          <label>Last selected point</label>
          <input
            value={lastPoint ? `${lastPoint.latitude.toFixed(6)}, ${lastPoint.longitude.toFixed(6)}` : ''}
            readOnly
            placeholder="None yet"
          />
        </div>
      </div>

      <div>
        <label htmlFor="hydrantAddress">Address / location name (optional)</label>
        <input id="hydrantAddress" name="address" placeholder="Applied to all selected hydrants" maxLength={160} />
      </div>

      <div>
        <label htmlFor="hydrantNote">Note (optional)</label>
        <input id="hydrantNote" name="note" placeholder="Applied to all selected hydrants" maxLength={300} />
      </div>
    </>
  )
}
