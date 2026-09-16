'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

async function requireAdminWithUser() {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect('/login')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('is_admin,blocked')
    .eq('id', user.id)
    .single()

  if (profileError || !profile?.is_admin || profile.blocked) {
    redirect('/pending')
  }

  return { supabase, user }
}

function adminMessage(message: string): never {
  redirect('/admin?message=' + encodeURIComponent(message))
}

function textField(formData: FormData, name: string): string {
  const value = formData.get(name)
  if (value === null) return ''
  if (typeof value !== 'string') adminMessage('Invalid form field: ' + name)
  return value.trim()
}

function requiredId(formData: FormData, name: string): string {
  const id = textField(formData, name)
  if (!id || id.length > 128) adminMessage('Missing or invalid record ID. Refresh the page and try again.')
  return id
}

function coordinate(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value !== 'string' || !value.trim()) return NaN
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) return NaN
  return Number(value)
}

async function updateUserAccess(
  formData: FormData,
  changes: { approved: boolean; blocked?: boolean },
  message: string
) {
  const { supabase, user } = await requireAdminWithUser()
  const id = requiredId(formData, 'id')
  if (id === user.id) adminMessage('You cannot change your own access here.')

  // Enforce this in the update itself, not only in the Admin page buttons.
  const { data, error } = await supabase
    .from('profiles')
    .update(changes)
    .eq('id', id)
    .eq('is_admin', false)
    .select('id')

  if (error) {
    console.error('User access update failed:', error)
    adminMessage('Could not change user access. Please try again.')
  }
  if (!data?.length) adminMessage('No user changed. The account may be an admin, unavailable, or already removed.')
  revalidatePath('/admin')
  adminMessage(message)
}

export async function approveUser(formData: FormData) {
  await updateUserAccess(formData, { approved: true, blocked: false }, 'User approved.')
}

export async function revokeUser(formData: FormData) {
  await updateUserAccess(formData, { approved: false }, 'User access removed.')
}

export async function blockUser(formData: FormData) {
  await updateUserAccess(formData, { approved: false, blocked: true }, 'User access blocked.')
}

export async function unblockUser(formData: FormData) {
  await updateUserAccess(formData, { approved: false, blocked: false }, 'User unblocked and moved to Pending.')
}

function routeNameFromFilename(filename: string) {
  return filename
    .replace(/\.gpx$/i, '')
    .replace(/\(\d+\)$/g, '')
    .trim()
}

function parseGpxPoints(xml: string) {
  const tags =
    xml.replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '').match(/<(?:[A-Za-z0-9_-]+:)?(?:trkpt|rtept)\b[^>]*>/gi) || []

  const points: Array<{ lat: number; lng: number }> = []

  for (const tag of tags) {
    const latMatch = tag.match(/\slat\s*=\s*["']([^"']+)["']/i)
    const lonMatch = tag.match(/\slon\s*=\s*["']([^"']+)["']/i)

    if (!latMatch || !lonMatch) continue

    const lat = coordinate(latMatch[1])
    const lng = coordinate(lonMatch[1])

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
  const requestedName = textField(formData, 'routeName')
  const orderText = textField(formData, 'sortOrder')
  const sortOrder = orderText === '' ? 100 : Number(orderText)
  if (!Number.isInteger(sortOrder) || sortOrder < -2147483648 || sortOrder > 2147483647) {
    adminMessage('Order number must be a whole number between -2147483648 and 2147483647.')
  }

  if (!(file instanceof File)) {
    redirect('/admin?message=' + encodeURIComponent('Choose a GPX file.'))
  }

  if (!file.name.toLowerCase().endsWith('.gpx')) {
    redirect('/admin?message=' + encodeURIComponent('Only .gpx files are allowed.'))
  }

  if (file.size === 0) adminMessage('The GPX file is empty.')

  if (file.size > 2 * 1024 * 1024) {
    redirect('/admin?message=' + encodeURIComponent('GPX file must be under 2 MB.'))
  }

  const routeName = requestedName || routeNameFromFilename(file.name)
  if (routeName.length > 120) adminMessage('Route name must be 120 characters or fewer.')

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
        sort_order: sortOrder,
        uploaded_by: user.id,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'name',
      }
    )

  if (error) {
    console.error(error)
    adminMessage('The database could not save this change. Please try again.')
  }

  revalidatePath('/admin')
  redirect(
    '/admin?message=' +
      encodeURIComponent(
        `Route "${routeName}" uploaded. It will appear when the map next refreshes its route list.`
      )
  )
}

export async function deleteRoute(formData: FormData) {
  const { supabase } = await requireAdminWithUser()

  const id = requiredId(formData, 'routeId')

  if (!id) {
    redirect('/admin')
  }

  const { data: deleted, error } = await supabase
    .from('routes')
    .delete()
    .eq('id', id)
    .select('id')

  if (error) {
    console.error(error)
    adminMessage('The database could not save this change. Please try again.')
  }

  if (!deleted?.length) adminMessage('Nothing was deleted. The record may be unavailable or already removed.')

  revalidatePath('/admin')
  redirect('/admin?message=' + encodeURIComponent('Route deleted.'))
}


export async function addHydrant(formData: FormData) {
  const { supabase, user } = await requireAdminWithUser()

  const rawPoints = textField(formData, 'hydrantPoints')
  const address = textField(formData, 'address')
  const note = textField(formData, 'note')

  if (address.length > 160 || note.length > 300) {
    adminMessage('Address must be 160 characters or fewer and note 300 characters or fewer.')
  }
  if (rawPoints.length > 100000) adminMessage('Too many hydrant locations. Select up to 200 at a time.')

  let submittedPoints: Array<{ latitude: number; longitude: number }>
  if (rawPoints) {
    let parsed: unknown
    try {
      parsed = JSON.parse(rawPoints)
    } catch {
      adminMessage('Invalid hydrant selection. Please select the locations again.')
    }
    if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 200) {
      adminMessage('Select between 1 and 200 hydrant locations.')
    }
    submittedPoints = parsed.map((point: unknown) => {
      const record = point !== null && typeof point === 'object'
        ? point as Record<string, unknown> : {}
      return {
        latitude: coordinate(record.latitude),
        longitude: coordinate(record.longitude),
      }
    })
  } else {
    // Support older single-point forms only when no batch was supplied.
    submittedPoints = [{
      latitude: coordinate(textField(formData, 'latitude')),
      longitude: coordinate(textField(formData, 'longitude')),
    }]
  }

  const validPoints = submittedPoints.filter(({ latitude, longitude }) =>
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= 51.95 &&
    latitude <= 52.30 &&
    longitude >= -106.90 &&
    longitude <= -106.45
  )

  if (validPoints.length === 0 || validPoints.length !== submittedPoints.length) {
    redirect('/admin?message=' + encodeURIComponent('One or more hydrant locations are invalid. Please pick Saskatoon locations on the map.'))
  }

  // Remove exact duplicate taps from this one submission.
  const seen = new Set<string>()
  const uniquePoints = validPoints.filter(({ latitude, longitude }) => {
    const key = `${latitude.toFixed(6)},${longitude.toFixed(6)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const rows = uniquePoints.map(({ latitude, longitude }) => ({
    latitude,
    longitude,
    address: address || null,
    note: note || null,
    added_by: user.id,
  }))

  const { error } = await supabase
    .from('manual_hydrants')
    .insert(rows)

  if (error) {
    console.error(error)
    adminMessage('The database could not save this change. Please try again.')
  }

  revalidatePath('/admin')
  redirect('/admin?message=' + encodeURIComponent(
    rows.length === 1 ? 'Fire hydrant added to the map.' : `${rows.length} fire hydrants added to the map.`
  ))
}

export async function deleteHydrant(formData: FormData) {
  const { supabase } = await requireAdminWithUser()
  const id = requiredId(formData, 'hydrantId')

  if (!id) redirect('/admin')

  const { data: deleted, error } = await supabase
    .from('manual_hydrants')
    .delete()
    .eq('id', id)
    .select('id')

  if (error) {
    console.error(error)
    adminMessage('The database could not save this change. Please try again.')
  }

  if (!deleted?.length) adminMessage('Nothing was deleted. The record may be unavailable or already removed.')

  revalidatePath('/admin')
  redirect('/admin?message=' + encodeURIComponent('Manual fire hydrant deleted.'))
}
