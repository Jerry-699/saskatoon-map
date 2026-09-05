import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const CITY_HYDRANT_QUERY =
  'https://services.arcgis.com/p3UBboyC0NH1uCie/ArcGIS/rest/services/Prod_SaskatoonWater/FeatureServer/5/query'

const CITY_BATCH_SIZE = 250

type GeoJsonFeature = {
  type: 'Feature'
  geometry: {
    type: string
    coordinates: unknown
  } | null
  properties?: Record<string, unknown>
}

async function arcgisRequest(params: URLSearchParams, format: 'json' | 'geojson') {
  // ArcGIS accepts form-encoded POST requests. Using POST avoids very long
  // URLs when hundreds of hydrant OBJECTIDs are requested through Vercel.
  const body = new URLSearchParams(params)
  body.set('f', format)

  const response = await fetch(CITY_HYDRANT_QUERY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: body.toString(),
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`City hydrant request failed (${response.status})`)
  }

  const json = await response.json()
  if (json?.error) {
    throw new Error(json.error.message || 'City hydrant query failed')
  }

  return json
}

async function loadAllCityHydrants(): Promise<GeoJsonFeature[]> {
  const idsJson = await arcgisRequest(
    new URLSearchParams({
      where: '1=1',
      returnIdsOnly: 'true',
    }),
    'json'
  )

  const objectIds: number[] = Array.isArray(idsJson?.objectIds)
    ? idsJson.objectIds.map(Number).filter(Number.isFinite)
    : []

  if (objectIds.length === 0) return []

  objectIds.sort((a, b) => a - b)
  const allFeatures: GeoJsonFeature[] = []

  for (let index = 0; index < objectIds.length; index += CITY_BATCH_SIZE) {
    const batch = objectIds.slice(index, index + CITY_BATCH_SIZE)
    const json = await arcgisRequest(
      new URLSearchParams({
        objectIds: batch.join(','),
        outFields: '*',
        returnGeometry: 'true',
        outSR: '4326',
      }),
      'geojson'
    )

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

  const candidatesPromise = supabase
    .from('hydrant_candidates')
    .select('id,latitude,longitude,address,note,created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  const responsesPromise = supabase
    .from('hydrant_candidate_responses')
    .select('candidate_id')
    .eq('user_id', user.id)

  const [cityResult, manualResult, candidateResult, responseResult] = await Promise.allSettled([
    loadAllCityHydrants(),
    manualHydrantsPromise,
    candidatesPromise,
    responsesPromise,
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

  let candidateFeatures: GeoJsonFeature[] = []
  let dismissedCandidateIds = new Set<string>()

  if (responseResult.status === 'fulfilled') {
    const { data: responses, error } = responseResult.value
    if (error) {
      console.error('Hydrant candidate responses could not be loaded:', error)
    } else {
      dismissedCandidateIds = new Set((responses || []).map((row) => String(row.candidate_id)))
    }
  } else {
    console.error('Hydrant candidate responses query failed:', responseResult.reason)
  }

  if (candidateResult.status === 'fulfilled') {
    const { data: candidates, error } = candidateResult.value
    if (error) {
      console.error('Hydrant candidates could not be loaded:', error)
    } else {
      candidateFeatures = (candidates || [])
        .filter((candidate) => !dismissedCandidateIds.has(String(candidate.id)))
        .map((candidate) => ({
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            coordinates: [Number(candidate.longitude), Number(candidate.latitude)],
          },
          properties: {
            _candidate: true,
            _manual: false,
            _source: 'Unverified candidate',
            candidate_id: candidate.id,
            ADDRESS: candidate.address || '',
            NOTE: candidate.note || '',
            STATUS: 'Needs confirmation',
            HYDRANT_TYPE: 'Candidate',
          },
        }))
    }
  } else {
    console.error('Hydrant candidates query failed:', candidateResult.reason)
  }

  const features = [...cityFeatures, ...manualFeatures, ...candidateFeatures]

  return NextResponse.json(
    {
      type: 'FeatureCollection',
      features,
      counts: {
        city: cityFeatures.length,
        manual: manualFeatures.length,
        candidates: candidateFeatures.length,
        total: features.length,
      },
      citySource: CITY_HYDRANT_QUERY.replace(/\/query$/, ''),
      cityLoadError: cityResult.status === 'rejected',
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
}
