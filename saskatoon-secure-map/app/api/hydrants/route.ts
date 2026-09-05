import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const CITY_HYDRANT_QUERY =
  'https://services.arcgis.com/p3UBboyC0NH1uCie/ArcGIS/rest/services/Prod_SaskatoonWater/FeatureServer/5/query'

const CITY_BATCH_SIZE = 2000
const CITY_MAX_PAGES = 10

type GeoJsonFeature = {
  type: 'Feature'
  geometry: {
    type: string
    coordinates: unknown
  } | null
  properties?: Record<string, unknown>
}

type EsriFeature = {
  attributes?: Record<string, unknown>
  geometry?: { x?: number; y?: number } | null
}

async function arcgisPost(params: Record<string, string>) {
  const body = new URLSearchParams(params)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)

  try {
    const response = await fetch(CITY_HYDRANT_QUERY, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        Accept: 'application/json',
      },
      body: body.toString(),
      cache: 'no-store',
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`City hydrant request failed (${response.status})`)
    }

    const json = await response.json()
    if (json?.error) {
      throw new Error(json.error.message || 'City hydrant query failed')
    }
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
    geometry: {
      type: 'Point',
      coordinates: [x, y],
    },
    properties: {
      ...(feature.attributes || {}),
      _manual: false,
      _source: 'City of Saskatoon',
    },
  }
}

async function loadAllCityHydrants(): Promise<GeoJsonFeature[]> {
  /*
    Use ArcGIS' normal JSON format and server-side pagination instead of a
    very large GeoJSON/objectIds URL. This is much more reliable on Vercel
    and avoids URL-length / GeoJSON transfer-limit failures.
  */
  const allFeatures: GeoJsonFeature[] = []

  for (let page = 0; page < CITY_MAX_PAGES; page += 1) {
    const offset = page * CITY_BATCH_SIZE
    const json = await arcgisPost({
      where: '1=1',
      outFields: '*',
      returnGeometry: 'true',
      outSR: '4326',
      orderByFields: 'OBJECTID ASC',
      resultOffset: String(offset),
      resultRecordCount: String(CITY_BATCH_SIZE),
      f: 'json',
    })

    const pageFeatures: EsriFeature[] = Array.isArray(json?.features) ? json.features : []

    for (const feature of pageFeatures) {
      const converted = esriPointToGeoJson(feature)
      if (converted) allFeatures.push(converted)
    }

    const exceeded = json?.exceededTransferLimit === true
    if (!exceeded && pageFeatures.length < CITY_BATCH_SIZE) break
    if (pageFeatures.length === 0) break
  }

  if (allFeatures.length === 0) {
    throw new Error('City hydrant query returned no hydrants')
  }

  return allFeatures
}

export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { type: 'FeatureCollection', features: [] },
      { status: 401, headers: { 'Cache-Control': 'private, no-store' } }
    )
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('approved,is_admin,blocked')
    .eq('id', user.id)
    .single()

  if (!profile || profile.blocked || (!profile.approved && !profile.is_admin)) {
    return NextResponse.json(
      { type: 'FeatureCollection', features: [] },
      { status: 403, headers: { 'Cache-Control': 'private, no-store' } }
    )
  }

  const manualHydrantsPromise = supabase
    .from('manual_hydrants')
    .select('id,latitude,longitude,address,note,created_at')
    .order('created_at', { ascending: false })

  const [cityResult, manualResult] = await Promise.allSettled([
    loadAllCityHydrants(),
    manualHydrantsPromise,
  ])

  const cityFeatures =
    cityResult.status === 'fulfilled' ? cityResult.value : ([] as GeoJsonFeature[])

  if (cityResult.status === 'rejected') {
    console.error('City hydrants could not be loaded:', cityResult.reason)
  }

  let manualFeatures: GeoJsonFeature[] = []

  if (manualResult.status === 'fulfilled') {
    const { data: hydrants, error } = manualResult.value

    if (error) {
      console.error('Manual hydrants could not be loaded:', error)
    } else {
      manualFeatures = (hydrants || []).map((hydrant) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [Number(hydrant.longitude), Number(hydrant.latitude)],
        },
        properties: {
          _manual: true,
          _source: 'Admin added',
          manual_id: hydrant.id,
          ADDRESS: hydrant.address || '',
          NOTE: hydrant.note || '',
          STATUS: 'Manual / admin added',
          HYDRANT_TYPE: 'Manual entry',
        },
      }))
    }
  } else {
    console.error('Manual hydrants query failed:', manualResult.reason)
  }

  if (cityResult.status === 'rejected' && manualFeatures.length === 0) {
    return NextResponse.json(
      {
        type: 'FeatureCollection',
        features: [],
        error: 'Hydrant data could not be loaded right now.',
      },
      { status: 502, headers: { 'Cache-Control': 'private, no-store' } }
    )
  }

  const features = [...cityFeatures, ...manualFeatures]

  return NextResponse.json(
    {
      type: 'FeatureCollection',
      features,
      counts: {
        city: cityFeatures.length,
        manual: manualFeatures.length,
        total: features.length,
      },
      citySource: CITY_HYDRANT_QUERY.replace(/\/query$/, ''),
      cityLoadError: cityResult.status === 'rejected',
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
}
