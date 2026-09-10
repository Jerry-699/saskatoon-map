import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
export const dynamic='force-dynamic'
export default async function Home(){const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect('/login');const {data:profile}=await supabase.from('profiles').select('approved,is_admin,blocked').eq('id',user.id).single();if(!profile)redirect('/pending');if(profile.is_admin)redirect('/admin');if(profile.blocked)redirect('/pending');if(profile.approved)redirect('/map');redirect('/pending')}
