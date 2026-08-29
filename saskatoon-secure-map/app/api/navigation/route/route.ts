import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
export const dynamic = 'force-dynamic'

type OsrmStep = {
  name?: string
  distance?: number
  maneuver?: {
    type?: string
    modifier?: string
    exit?: number
    location?: [number, number]
  }
}

function cleanStreet(name?: string) {
  return String(name || '').trim()
}

function instructionFor(step: OsrmStep) {
  const type = step.maneuver?.type || 'continue'
  const modifier = String(step.maneuver?.modifier || '').replace(/_/g, ' ')
  const street = cleanStreet(step.name)
  const onto = street ? ` onto ${street}` : ''

  if (type === 'depart') {
    if (modifier) return `Head ${modifier}${street ? ` on ${street}` : ''}`
    return street ? `Start on ${street}` : 'Start driving'
  }
  if (type === 'arrive') return 'You have arrived at your destination'
  if (type === 'turn') return `Turn ${modifier || 'ahead'}${onto}`
  if (type === 'new name') return `Continue${onto}`
  if (type === 'continue') return `Continue ${modifier || 'straight'}${onto}`
  if (type === 'merge') return `Merge ${modifier || ''}${onto}`.replace(/\s+/g, ' ').trim()
  if (type === 'on ramp') return `Take the ramp ${modifier || ''}${onto}`.replace(/\s+/g, ' ').trim()
  if (type === 'off ramp') return `Take the exit ${modifier || ''}${onto}`.replace(/\s+/g, ' ').trim()
  if (type === 'fork') return `Keep ${modifier || 'ahead'}${onto}`
  if (type === 'end of road') return `At the end of the road, turn ${modifier || 'ahead'}${onto}`
  if (type === 'roundabout' || type === 'rotary' || type === 'roundabout turn') {
    const exit = step.maneuver?.exit
    return exit ? `At the roundabout, take exit ${exit}${onto}` : `Enter the roundabout${onto}`
  }
  return street ? `Continue on ${street}` : 'Continue straight'
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const p = new URL(request.url).searchParams
  const startLng = Number(p.get('startLng')), startLat = Number(p.get('startLat'))
  const endLng = Number(p.get('endLng')), endLat = Number(p.get('endLat'))
  if (![startLng, startLat, endLng, endLat].every(Number.isFinite)) {
    return NextResponse.json({ error: 'Invalid coordinates.' }, { status: 400 })
  }

  const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson&steps=true`
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { 'User-Agent': 'SaskatoonBlockFinder/1.0' },
  })
  if (!response.ok) {
    return NextResponse.json({ error: 'Driving directions are temporarily unavailable.' }, { status: 502 })
  }

  const data: any = await response.json()
  const r = data?.routes?.[0]
  const coords = r?.geometry?.coordinates
  if (!r || !Array.isArray(coords)) {
    return NextResponse.json({ error: 'No driving route found.' }, { status: 404 })
  }

  const points = coords.map((c: number[]) => ({ lng: c[0], lat: c[1] }))
  const rawSteps: OsrmStep[] = (r.legs || []).flatMap((leg: any) => leg.steps || [])
  const steps = rawSteps
    .filter(step => Array.isArray(step.maneuver?.location) && step.maneuver!.location!.length >= 2)
    .map(step => ({
      location: { lng: step.maneuver!.location![0], lat: step.maneuver!.location![1] },
      distance: Number(step.distance || 0),
      type: step.maneuver?.type || 'continue',
      modifier: step.maneuver?.modifier || '',
      street: cleanStreet(step.name),
      instruction: instructionFor(step),
    }))

  return NextResponse.json(
    { points, steps, distance: r.distance, duration: r.duration },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
