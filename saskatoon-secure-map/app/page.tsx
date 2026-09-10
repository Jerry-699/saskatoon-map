export const dynamic='force-dynamic'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import MapClient from '@/components/MapClient'
export default async function Home(){const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect('/login');const {data:profile}=await supabase.from('profiles').select('status,role').eq('id',user.id).single();if(!profile||profile.status!=='approved')redirect('/login?error='+encodeURIComponent(profile?.status==='blocked'?'Your account is blocked.':'Your account is waiting for admin approval.'));return <MapClient isAdmin={profile.role==='admin'} userId={user.id}/>}
