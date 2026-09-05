import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

async function requireApprovedUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }), supabase, user: null }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('approved,is_admin,blocked')
    .eq('id', user.id)
    .single()

  if (!profile || profile.blocked || (!profile.approved && !profile.is_admin)) {
    return { error: NextResponse.json({ error: 'Access denied.' }, { status: 403 }), supabase, user: null }
  }

  return { error: null, supabase, user }
}

export async function POST(request: Request) {
  const auth = await requireApprovedUser()
  if (auth.error || !auth.user) return auth.error

  let body: { id?: string; action?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const id = String(body.id || '')
  const action = String(body.action || '')

  if (!id || !['yes', 'no'].includes(action)) {
    return NextResponse.json({ error: 'Invalid confirmation.' }, { status: 400 })
  }

  if (action === 'yes') {
    const { data, error } = await auth.supabase.rpc('confirm_hydrant_candidate', {
      candidate: id,
    })

    if (error) {
      console.error('Hydrant confirmation failed:', error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true, result: data })
  }

  const { data, error } = await auth.supabase.rpc('reject_hydrant_candidate', {
    candidate: id,
  })

  if (error) {
    console.error('Hydrant rejection failed:', error)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, result: data })
}
