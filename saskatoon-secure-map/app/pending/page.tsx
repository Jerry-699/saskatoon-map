import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
export const dynamic='force-dynamic'
export default async function Page(){
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect('/login');
  const {data:p}=await supabase.from('profiles').select('approved,is_admin,blocked').eq('id',user.id).single();
  if(p?.is_admin)redirect('/admin');
  if(p?.blocked){
    return <main className="shell"><div className="card"><h1>Access denied</h1><p>Your account has been blocked by the administrator and cannot open the map.</p><div className="row"><a className="button secondary" href="/logout">Sign out</a></div></div></main>
  }
  if(p?.approved)redirect('/map');
  return <main className="shell"><div className="card"><h1>Waiting for approval</h1><p>Your account is signed in but not approved yet. The administrator must approve it before the map opens.</p><div className="row"><a className="button secondary" href="/">Check again</a><a className="button secondary" href="/logout">Sign out</a></div></div></main>
}
