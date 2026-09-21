import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ features: [] }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('is_admin,blocked').eq('id', user.id).single()
  if (!profile?.is_admin || profile.blocked) return NextResponse.json({ features: [] }, { status: 403 })

  const { data, error } = await supabase.from('manual_hydrants')
    .select('id,latitude,longitude,address,note,created_at').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ features: [], error: error.message }, { status: 500 })
  const features = (data || []).map((h) => ({
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [Number(h.longitude), Number(h.latitude)] },
    properties: { _manual: true, _source: 'Admin working copy', manual_id: h.id, ADDRESS: h.address || '', NOTE: h.note || '', STATUS: 'Manual / admin added', HYDRANT_TYPE: 'Manual entry' },
  }))
  return NextResponse.json({ type: 'FeatureCollection', features, count: features.length }, { headers: { 'Cache-Control': 'private, no-store' } })
}
