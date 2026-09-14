import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

async function authorized() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  const { data: profile } = await supabase.from('profiles').select('approved,is_admin,blocked').eq('id', user.id).single()
  if (!profile || profile.blocked || (!profile.approved && !profile.is_admin)) {
    return { error: NextResponse.json({ error: 'Not approved' }, { status: 403 }) }
  }
  return { supabase, user }
}

export async function GET() {
  const auth = await authorized()
  if ('error' in auth) return auth.error
  const { supabase, user } = auth
  const { data, error } = await supabase
    .from('driven_routes')
    .select('id,name,points,created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message, routes: [] }, { status: 500 })
  return NextResponse.json({ routes: data || [] }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(request: Request) {
  const auth = await authorized()
  if ('error' in auth) return auth.error
  const { supabase, user } = auth
  const body = await request.json().catch(() => null)
  const name = String(body?.name || '').trim().slice(0, 120)
  const points = Array.isArray(body?.points) ? body.points : []
  if (!name || points.length < 2 || points.length > 30000) {
    return NextResponse.json({ error: 'Invalid route.' }, { status: 400 })
  }
  const clean = points
    .map((p: any) => ({ lat: Number(p?.lat), lng: Number(p?.lng) }))
    .filter((p: any) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat >= -90 && p.lat <= 90 && p.lng >= -180 && p.lng <= 180)
  if (clean.length < 2) return NextResponse.json({ error: 'Invalid route points.' }, { status: 400 })
  const { data, error } = await supabase
    .from('driven_routes')
    .insert({ user_id: user.id, name, points: clean })
    .select('id,name,points,created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ route: data })
}

export async function DELETE(request: Request) {
  const auth = await authorized()
  if ('error' in auth) return auth.error
  const { supabase, user } = auth
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing route id.' }, { status: 400 })
  const { error } = await supabase.from('driven_routes').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
