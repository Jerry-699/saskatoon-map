export const dynamic='force-dynamic'
import {redirect} from 'next/navigation'
import {createClient} from '@/lib/supabase/server'
import AdminClient from '@/components/AdminClient'
export default async function Admin(){const s=await createClient();const {data:{user}}=await s.auth.getUser();if(!user)redirect('/login');const {data:p}=await s.from('profiles').select('status,role').eq('id',user.id).single();if(!p||p.status!=='approved'||p.role!=='admin')redirect('/');return <AdminClient/>}
