import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const q = new URL(request.url).searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ error: 'Enter an address.' }, { status: 400 })
  const params = new URLSearchParams({
    q: `${q}, Saskatoon, Saskatchewan, Canada`, format: 'jsonv2', limit: '1',
    countrycodes: 'ca', bounded: '1', viewbox: '-106.90,52.30,-106.40,51.95', addressdetails: '1'
  })
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: { 'User-Agent': 'SaskatoonBlockFinder/1.0 (private navigation app)', 'Accept-Language': 'en' },
    cache: 'no-store'
  })
  if (!response.ok) return NextResponse.json({ error: 'Address search is temporarily unavailable.' }, { status: 502 })
  const results: any[] = await response.json()
  const first = results[0]
  if (!first) return NextResponse.json({ error: 'Address not found in Saskatoon.' }, { status: 404 })
  return NextResponse.json({ result: { name: first.display_name, lat: Number(first.lat), lng: Number(first.lon) } }, { headers: { 'Cache-Control': 'private, no-store' } })
}
