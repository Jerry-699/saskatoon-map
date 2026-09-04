import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type Point = { lat: number; lng: number }

async function authorized() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }

  const { data: profile } = await supabase
    .from('profiles')
    .select('approved,is_admin,blocked')
    .eq('id', user.id)
    .single()

  if (!profile || profile.blocked || (!profile.approved && !profile.is_admin)) {
    return { error: NextResponse.json({ error: 'Not approved' }, { status: 403 }) }
  }

  return { supabase, user }
}

function cleanSegments(value: unknown): Point[][] {
  if (!Array.isArray(value)) return []
  let total = 0
  const segments: Point[][] = []

  for (const rawSegment of value.slice(0, 500)) {
    if (!Array.isArray(rawSegment)) continue
    const segment: Point[] = []
    for (const rawPoint of rawSegment) {
      if (total >= 30000) break
      const point = rawPoint as any
      const lat = Number(point?.lat)
      const lng = Number(point?.lng)
      if (
        Number.isFinite(lat) && Number.isFinite(lng) &&
        lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
      ) {
        segment.push({ lat, lng })
        total += 1
      }
    }
    if (segment.length) segments.push(segment)
    if (total >= 30000) break
  }

  return segments
}

export async function GET() {
  const auth = await authorized()
  if ('error' in auth) return auth.error
  const { supabase, user } = auth

  const { data, error } = await supabase
    .from('drive_drafts')
    .select('state,mode,segments,selected_route_value,paused,saved_at')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message, draft: null, userId: user.id }, { status: 500 })
  }

  const draft = data ? {
    state: data.state,
    mode: data.mode,
    segments: data.segments,
    selectedRouteValue: data.selected_route_value || '',
    paused: !!data.paused,
    savedAt: new Date(data.saved_at).getTime()
  } : null

  return NextResponse.json(
    { userId: user.id, draft },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
}

export async function PUT(request: Request) {
  const auth = await authorized()
  if ('error' in auth) return auth.error
  const { supabase, user } = auth
  const body = await request.json().catch(() => null)

  const state = body?.state === 'completed' ? 'completed' : 'recording'
  const mode = ['casual', 'route', 'newroute'].includes(body?.mode) ? body.mode : 'newroute'
  const segments = cleanSegments(body?.segments)
  const pointCount = segments.reduce((count, segment) => count + segment.length, 0)

  if (pointCount < 1) {
    return NextResponse.json({ error: 'No route points to save.' }, { status: 400 })
  }

  const selectedRouteValue = String(body?.selectedRouteValue || '').slice(0, 180)
  const paused = !!body?.paused
  const savedAt = new Date(Number(body?.savedAt) || Date.now()).toISOString()

  const { error } = await supabase
    .from('drive_drafts')
    .upsert({
      user_id: user.id,
      state,
      mode,
      segments,
      selected_route_value: selectedRouteValue,
      paused,
      saved_at: savedAt,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  const auth = await authorized()
  if ('error' in auth) return auth.error
  const { supabase, user } = auth

  const { error } = await supabase
    .from('drive_drafts')
    .delete()
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
