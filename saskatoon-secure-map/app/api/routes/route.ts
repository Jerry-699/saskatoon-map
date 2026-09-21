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
      { routes: [] },
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
      { routes: [] },
      { status: 403, headers: { 'Cache-Control': 'private, no-store' } }
    )
  }

  const { data: routes, error } = await supabase
    .from('routes')
    .select('id,name,points,updated_at')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    console.error(error)
    return NextResponse.json(
      { routes: [] },
      { status: 500, headers: { 'Cache-Control': 'private, no-store' } }
    )
  }

  return NextResponse.json(
    { routes: routes || [] },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
}
