import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const CITY_HYDRANT_QUERY =
  'https://services.arcgis.com/p3UBboyC0NH1uCie/ArcGIS/rest/services/Prod_SaskatoonWater/FeatureServer/5/query'

// Layer 5 advertises Max Record Count = 1000. We first ask ArcGIS for every
// OBJECTID (returnIdsOnly is not subject to the feature transfer limit), then
// fetch those exact IDs in conservative batches. This prevents silent gaps.
const CITY_BATCH_SIZE = 500

type GeoJsonFeature = {
  type: 'Feature'
  geometry: { type: string; coordinates: unknown } | null
  properties?: Record<string, unknown>
}

type EsriFeature = {
  attributes?: Record<string, unknown>
  geometry?: { x?: number; y?: number } | null
}

async function arcgisPost(params: Record<string, string>) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)
  try {
    const response = await fetch(CITY_HYDRANT_QUERY, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        Accept: 'application/json',
      },
      body: new URLSearchParams(params).toString(),
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`City hydrant request failed (${response.status})`)
    const json = await response.json()
    if (json?.error) throw new Error(json.error.message || 'City hydrant query failed')
    return json
  } finally {
    clearTimeout(timer)
  }
}

function esriPointToGeoJson(feature: EsriFeature): GeoJsonFeature | null {
  const x = Number(feature.geometry?.x)
  const y = Number(feature.geometry?.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [x, y] },
    properties: {
      ...(feature.attributes || {}),
      _manual: false,
      _source: 'City of Saskatoon',
    },
  }
}

async function loadAllCityHydrants(): Promise<GeoJsonFeature[]> {
  const idJson = await arcgisPost({
    where: '1=1',
    returnIdsOnly: 'true',
    f: 'json',
  })

  const ids = Array.from(
    new Set((Array.isArray(idJson?.objectIds) ? idJson.objectIds : []).map((id: unknown) => Number(id)))
  ).filter(Number.isFinite).sort((a, b) => a - b)

  if (!ids.length) throw new Error('City hydrant ID query returned no hydrants')

  const byId = new Map<number, GeoJsonFeature>()

  for (let i = 0; i < ids.length; i += CITY_BATCH_SIZE) {
    const batch = ids.slice(i, i + CITY_BATCH_SIZE)
    const json = await arcgisPost({
      objectIds: batch.join(','),
      outFields: '*',
      returnGeometry: 'true',
      outSR: '4326',
      f: 'json',
    })

    const features: EsriFeature[] = Array.isArray(json?.features) ? json.features : []
    for (const feature of features) {
      const converted = esriPointToGeoJson(feature)
      const objectId = Number(feature.attributes?.OBJECTID)
      if (converted && Number.isFinite(objectId)) byId.set(objectId, converted)
    }
  }

  // If ArcGIS returned fewer feature records than the ID list, fail instead of
  // presenting an incomplete hydrant map as if it were complete.
  if (byId.size !== ids.length) {
    throw new Error(`Incomplete City hydrant load (${byId.size}/${ids.length})`)
  }

  return Array.from(byId.values())
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ type: 'FeatureCollection', features: [] }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('approved,is_admin,blocked')
    .eq('id', user.id)
    .single()

  if (!profile || profile.blocked || (!profile.approved && !profile.is_admin)) {
    return NextResponse.json({ type: 'FeatureCollection', features: [] }, { status: 403, headers: { 'Cache-Control': 'private, no-store' } })
  }

  const manualPromise = supabase
    .from('manual_hydrants')
    .select('id,latitude,longitude,address,note,created_at')
    .order('created_at', { ascending: false })

  const [cityResult, manualResult] = await Promise.allSettled([loadAllCityHydrants(), manualPromise])
  const cityFeatures = cityResult.status === 'fulfilled' ? cityResult.value : []
  if (cityResult.status === 'rejected') console.error('City hydrants could not be loaded:', cityResult.reason)

  let manualFeatures: GeoJsonFeature[] = []
  if (manualResult.status === 'fulfilled') {
    const { data, error } = manualResult.value
    if (error) console.error('Manual hydrants could not be loaded:', error)
    else manualFeatures = (data || []).map((h) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point', coordinates: [Number(h.longitude), Number(h.latitude)] },
      properties: {
        _manual: true,
        _source: 'Admin added',
        manual_id: h.id,
        ADDRESS: h.address || '',
        NOTE: h.note || '',
        STATUS: 'Manual / admin added',
        HYDRANT_TYPE: 'Manual entry',
      },
    }))
  }

  if (cityResult.status === 'rejected' && manualFeatures.length === 0) {
    return NextResponse.json({ type: 'FeatureCollection', features: [], error: 'Hydrant data could not be loaded right now.' }, { status: 502, headers: { 'Cache-Control': 'private, no-store' } })
  }

  const features = [...cityFeatures, ...manualFeatures]
  return NextResponse.json({
    type: 'FeatureCollection',
    features,
    counts: { city: cityFeatures.length, manual: manualFeatures.length, total: features.length },
    citySource: CITY_HYDRANT_QUERY.replace(/\/query$/, ''),
    cityLoadError: cityResult.status === 'rejected',
    refreshedAt: new Date().toISOString(),
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
}
