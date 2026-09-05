import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
export const dynamic='force-dynamic'
export async function GET(){const s=await createClient();const {data:{user}}=await s.auth.getUser();if(!user)return NextResponse.json({ok:false},{status:401,headers:{'Cache-Control':'private, no-store'}});const {data:p}=await s.from('profiles').select('approved,is_admin,blocked').eq('id',user.id).single();if(!p||p.blocked||(!p.approved&&!p.is_admin))return NextResponse.json({ok:false},{status:403,headers:{'Cache-Control':'private, no-store'}});return NextResponse.json({ok:true},{headers:{'Cache-Control':'private, no-store'}})}
