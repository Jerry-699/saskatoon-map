import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  const headers = { 'Cache-Control': 'private, no-store' }

  if (authError || !user) {
    return NextResponse.json({ ok: false, isAdmin: false }, { status: 401, headers })
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('approved,is_admin,blocked')
    .eq('id', user.id)
    .single()

  if (profileError || !profile || profile.blocked || (!profile.approved && !profile.is_admin)) {
    return NextResponse.json({ ok: false, isAdmin: false }, { status: 403, headers })
  }

  return NextResponse.json(
    { ok: true, isAdmin: profile.is_admin === true },
    { headers }
  )
}
