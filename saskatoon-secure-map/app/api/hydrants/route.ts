import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const CITY_HYDRANT_QUERY =
  'https://services.arcgis.com/p3UBboyC0NH1uCie/ArcGIS/rest/services/Prod_SaskatoonWater/FeatureServer/5/query'

const CITY_FETCH_REVALIDATE_SECONDS = 15 * 60
const CITY_BATCH_SIZE = 1000

type GeoJsonFeature = {
  type: 'Feature'
  geometry: {
    type: string
    coordinates: unknown
  } | null
  properties?: Record<string, unknown>
}

async function loadAllCityHydrants(): Promise<GeoJsonFeature[]> {
  /*
    First ask ArcGIS for every hydrant OBJECTID. This avoids the normal
    FeatureServer transfer limit that can silently truncate a city-wide query.
    Then fetch the actual hydrants in manageable batches.
  */
  const idsParams = new URLSearchParams({
    where: '1=1',
    returnIdsOnly: 'true',
    f: 'json',
  })

  const idsResponse = await fetch(`${CITY_HYDRANT_QUERY}?${idsParams.toString()}`, {
    next: { revalidate: CITY_FETCH_REVALIDATE_SECONDS },
  })

  if (!idsResponse.ok) {
    throw new Error(`City hydrant ID request failed (${idsResponse.status})`)
  }

  const idsJson = await idsResponse.json()
  if (idsJson?.error) {
    throw new Error(idsJson.error.message || 'City hydrant ID query failed')
  }

  const objectIds: number[] = Array.isArray(idsJson?.objectIds)
    ? idsJson.objectIds.map(Number).filter(Number.isFinite)
    : []

  if (objectIds.length === 0) {
    return []
  }

  objectIds.sort((a, b) => a - b)

  const allFeatures: GeoJsonFeature[] = []

  for (let index = 0; index < objectIds.length; index += CITY_BATCH_SIZE) {
    const batch = objectIds.slice(index, index + CITY_BATCH_SIZE)
    const params = new URLSearchParams({
      objectIds: batch.join(','),
      outFields: '*',
      returnGeometry: 'true',
      outSR: '4326',
      f: 'geojson',
    })

    const response = await fetch(`${CITY_HYDRANT_QUERY}?${params.toString()}`, {
      next: { revalidate: CITY_FETCH_REVALIDATE_SECONDS },
    })

    if (!response.ok) {
      throw new Error(`City hydrant batch request failed (${response.status})`)
    }

    const json = await response.json()
    if (json?.error) {
      throw new Error(json.error.message || 'City hydrant batch query failed')
    }

    if (Array.isArray(json?.features)) {
      for (const feature of json.features as GeoJsonFeature[]) {
        allFeatures.push({
          ...feature,
          properties: {
            ...(feature.properties || {}),
            _manual: false,
            _source: 'City of Saskatoon',
          },
        })
      }
    }
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
