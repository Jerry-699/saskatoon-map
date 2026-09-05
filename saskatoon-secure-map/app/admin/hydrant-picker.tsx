'use client'

import { useEffect, useRef, useState } from 'react'

declare global {
  interface Window {
    maplibregl?: any
  }
}

const MAPLIBRE_JS = 'https://unpkg.com/maplibre-gl@5.6.2/dist/maplibre-gl.js'
const MAPLIBRE_CSS = 'https://unpkg.com/maplibre-gl@5.6.2/dist/maplibre-gl.css'

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
  const markerRef = useRef<any>(null)
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [mapError, setMapError] = useState('')
  const [fullScreen, setFullScreen] = useState(false)
  const [hydrantCount, setHydrantCount] = useState<number | null>(null)

  function selectPoint(latitude: number, longitude: number) {
    const safeLat = Number(latitude.toFixed(6))
    const safeLng = Number(longitude.toFixed(6))
    setLat(String(safeLat))
    setLng(String(safeLng))

    const maplibregl = window.maplibregl
    if (!maplibregl || !mapRef.current) return

    if (!markerRef.current) {
      markerRef.current = new maplibregl.Marker({ color: '#e53935' })
        .setLngLat([safeLng, safeLat])
        .addTo(mapRef.current)
    } else {
      markerRef.current.setLngLat([safeLng, safeLat])
    }
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

        map.addControl(new window.maplibregl.NavigationControl({ showCompass: false }), 'top-right')

        map.on('load', async () => {
          try {
            const response = await fetch('/api/hydrants', {
              credentials: 'same-origin',
              cache: 'no-store',
            })

            if (!response.ok) throw new Error('Could not load existing hydrants.')

            const data = await response.json()
            const features = Array.isArray(data.features) ? data.features : []
            setHydrantCount(features.length)

            map.addSource('admin-existing-hydrants', {
              type: 'geojson',
              data: {
                type: 'FeatureCollection',
                features,
              },
            })

            map.addLayer({
              id: 'admin-existing-hydrants',
              type: 'circle',
              source: 'admin-existing-hydrants',
              paint: {
                'circle-radius': [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
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
          } catch (error) {
            console.error(error)
            setMapError('The picker works, but existing hydrants could not be loaded right now.')
          }
        })

        map.on('click', (event: any) => {
          const existing = map.queryRenderedFeatures(event.point, { layers: ['admin-existing-hydrants'] })
          if (existing.length > 0) return
          selectPoint(event.lngLat.lat, event.lngLat.lng)
        })
        mapRef.current = map
      })
      .catch((error) => setMapError(error instanceof Error ? error.message : 'Could not load map.'))

    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      mapRef.current?.resize()
    }, 50)
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
        selectPoint(latitude, longitude)
        mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 17 })
        setMapError('')
      },
      () => setMapError('Could not get your location. You can tap the map instead.'),
      { enableHighAccuracy: true, timeout: 12000 }
    )
  }

  return (
    <>
      <div>
        <label>Pick hydrant location</label>
        <div className="muted" style={{ margin: '5px 0 9px' }}>
          Tap the exact hydrant location on the map, or use your current location.
        </div>
        <div className={`hydrant-picker-shell${fullScreen ? ' fullscreen' : ''}`}>
          <div className="hydrant-picker-toolbar">
            <button
              className="secondary hydrant-fullscreen-button"
              type="button"
              onClick={() => setFullScreen((value) => !value)}
            >
              {fullScreen ? '↙ Exit full screen' : '⛶ Full screen'}
            </button>
            {hydrantCount !== null ? (
              <span className="hydrant-count">🔥 {hydrantCount} existing hydrants</span>
            ) : null}
          </div>
          <div ref={mapNode} className="hydrant-picker-map" />
        </div>
        {mapError ? <div className="message" style={{ marginTop: 8 }}>{mapError}</div> : null}
        <button className="secondary" type="button" onClick={useMyLocation} style={{ marginTop: 10 }}>
          📍 Use my current location
        </button>
      </div>

      <div className="coordinate-grid">
        <div>
          <label htmlFor="hydrantLat">Latitude</label>
          <input id="hydrantLat" name="latitude" value={lat} readOnly required placeholder="Tap map" />
        </div>
        <div>
          <label htmlFor="hydrantLng">Longitude</label>
          <input id="hydrantLng" name="longitude" value={lng} readOnly required placeholder="Tap map" />
        </div>
      </div>

      <div>
        <label htmlFor="hydrantAddress">Address / location name</label>
        <input id="hydrantAddress" name="address" placeholder="Example: 123 Main St or beside alley" maxLength={160} />
      </div>

      <div>
        <label htmlFor="hydrantNote">Note (optional)</label>
        <input id="hydrantNote" name="note" placeholder="Example: New hydrant not shown by City data" maxLength={300} />
      </div>
    </>
  )
}
