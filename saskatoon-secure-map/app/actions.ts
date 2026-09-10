'use server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export async function login(formData:FormData){const supabase=await createClient();const email=String(formData.get('email')||'');const password=String(formData.get('password')||'');const {error}=await supabase.auth.signInWithPassword({email,password});if(error)redirect('/login?error='+encodeURIComponent(error.message));redirect('/')}
export async function signup(formData:FormData){const supabase=await createClient();const email=String(formData.get('email')||'');const password=String(formData.get('password')||'');const {error}=await supabase.auth.signUp({email,password});if(error)redirect('/login?error='+encodeURIComponent(error.message));redirect('/login?message='+encodeURIComponent('Account created. Wait for admin approval.'))}
export async function forgotPassword(formData:FormData){const supabase=await createClient();const email=String(formData.get('email')||'');const h=await headers();const origin=h.get('origin')||`${h.get('x-forwarded-proto')||'https'}://${h.get('x-forwarded-host')||h.get('host')}`;const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${origin}/auth/callback?next=/reset-password`});if(error)redirect('/forgot-password?error='+encodeURIComponent(error.message));redirect('/forgot-password?message='+encodeURIComponent('Password reset email sent.'))}
export async function resetPassword(formData:FormData){const supabase=await createClient();const password=String(formData.get('password')||'');const {error}=await supabase.auth.updateUser({password});if(error)redirect('/reset-password?error='+encodeURIComponent(error.message));await supabase.auth.signOut();redirect('/login?message='+encodeURIComponent('Password reset. Please sign in again.'))}
export async function signout(){const supabase=await createClient();await supabase.auth.signOut();redirect('/login')}
