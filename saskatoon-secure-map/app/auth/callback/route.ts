import {NextRequest,NextResponse} from 'next/server'
import {createClient} from '@/lib/supabase/server'
export async function GET(req:NextRequest){const code=req.nextUrl.searchParams.get('code');const next=req.nextUrl.searchParams.get('next')||'/';if(code){const s=await createClient();await s.auth.exchangeCodeForSession(code)}return NextResponse.redirect(new URL(next,req.url))}
