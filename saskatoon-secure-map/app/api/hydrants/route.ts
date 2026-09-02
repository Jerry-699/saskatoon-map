import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

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

  const { data: hydrants, error } = await supabase
    .from('manual_hydrants')
    .select('id,latitude,longitude,address,note,created_at')
    .order('created_at', { ascending: false })

  if (error) {
    console.error(error)
    return NextResponse.json(
      { type: 'FeatureCollection', features: [] },
      { status: 500, headers: { 'Cache-Control': 'private, no-store' } }
    )
  }

  const features = (hydrants || []).map((hydrant) => ({
    type: 'Feature' as const,
    geometry: {
      type: 'Point' as const,
      coordinates: [Number(hydrant.longitude), Number(hydrant.latitude)],
    },
    properties: {
      _manual: true,
      manual_id: hydrant.id,
      ADDRESS: hydrant.address || '',
      NOTE: hydrant.note || '',
      STATUS: 'Manual / admin added',
      HYDRANT_TYPE: 'Manual entry',
    },
  }))

  return NextResponse.json(
    { type: 'FeatureCollection', features },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
}
