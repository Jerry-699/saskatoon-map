'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

async function requireAdminWithUser() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) {
    redirect('/pending')
  }

  return { supabase, user }
}

async function requireAdmin() {
  const { supabase } = await requireAdminWithUser()
  return supabase
}

export async function approveUser(formData: FormData) {
  const id = String(formData.get('id') || '')
  const supabase = await requireAdmin()

  await supabase
    .from('profiles')
    .update({ approved: true })
    .eq('id', id)

  revalidatePath('/admin')
}

export async function revokeUser(formData: FormData) {
  const id = String(formData.get('id') || '')
  const supabase = await requireAdmin()

  await supabase
    .from('profiles')
    .update({ approved: false })
    .eq('id', id)

  revalidatePath('/admin')
}

function routeNameFromFilename(filename: string) {
  return filename
    .replace(/\.gpx$/i, '')
    .replace(/\(\d+\)$/g, '')
    .trim()
}

function parseGpxPoints(xml: string) {
  const tags =
    xml.match(/<(?:[A-Za-z0-9_-]+:)?(?:trkpt|rtept)\b[^>]*>/gi) || []

  const points: Array<{ lat: number; lng: number }> = []

  for (const tag of tags) {
    const latMatch = tag.match(/\blat\s*=\s*["']([^"']+)["']/i)
    const lonMatch = tag.match(/\blon\s*=\s*["']([^"']+)["']/i)

    if (!latMatch || !lonMatch) continue

    const lat = Number(latMatch[1])
    const lng = Number(lonMatch[1])

    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    ) {
      points.push({ lat, lng })
    }
  }

  return points
}

export async function uploadRoute(formData: FormData) {
  const { supabase, user } = await requireAdminWithUser()

  const file = formData.get('gpxFile')
  const requestedName = String(formData.get('routeName') || '').trim()
  const sortOrder = Number(formData.get('sortOrder') || 100)

  if (!(file instanceof File)) {
    redirect('/admin?message=' + encodeURIComponent('Choose a GPX file.'))
  }

  if (!file.name.toLowerCase().endsWith('.gpx')) {
    redirect('/admin?message=' + encodeURIComponent('Only .gpx files are allowed.'))
  }

  if (file.size > 2 * 1024 * 1024) {
    redirect('/admin?message=' + encodeURIComponent('GPX file must be under 2 MB.'))
  }

  const routeName =
    (requestedName || routeNameFromFilename(file.name)).slice(0, 120)

  if (!routeName) {
    redirect('/admin?message=' + encodeURIComponent('Enter a route name.'))
  }

  const xml = await file.text()
  const points = parseGpxPoints(xml)

  if (points.length < 2) {
    redirect(
      '/admin?message=' +
        encodeURIComponent('No usable GPX track points were found.')
    )
  }

  const { error } = await supabase
    .from('routes')
    .upsert(
      {
        name: routeName,
        points,
        sort_order: Number.isFinite(sortOrder) ? sortOrder : 100,
        uploaded_by: user.id,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'name',
      }
    )

  if (error) {
    console.error(error)
    redirect('/admin?message=' + encodeURIComponent(error.message))
  }

  revalidatePath('/admin')
  redirect(
    '/admin?message=' +
      encodeURIComponent(
        `Route "${routeName}" uploaded. It will appear on the map immediately.`
      )
  )
}

export async function deleteRoute(formData: FormData) {
  const { supabase } = await requireAdminWithUser()

  const id = String(formData.get('routeId') || '')

  if (!id) {
    redirect('/admin')
  }

  const { error } = await supabase
    .from('routes')
    .delete()
    .eq('id', id)

  if (error) {
    console.error(error)
    redirect('/admin?message=' + encodeURIComponent(error.message))
  }

  revalidatePath('/admin')
  redirect('/admin?message=' + encodeURIComponent('Route deleted.'))
}
