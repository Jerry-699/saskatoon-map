'use server'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
function go(path:string,message:string):never{redirect(`${path}?message=${encodeURIComponent(message)}`)}
export async function login(formData:FormData){const email=String(formData.get('email')||'').trim().toLowerCase();const password=String(formData.get('password')||'');if(!email||!password)go('/login','Enter your email and password.');const supabase=await createClient();const {error}=await supabase.auth.signInWithPassword({email,password});if(error)go('/login',error.message);redirect('/')}
export async function signup(formData:FormData){const fullName=String(formData.get('fullName')||'').trim();const email=String(formData.get('email')||'').trim().toLowerCase();const password=String(formData.get('password')||'');if(!fullName||!email||!password)go('/signup','Fill in every field.');if(password.length<10)go('/signup','Use a password with at least 10 characters.');const supabase=await createClient();const h=await headers();const origin=h.get('origin')||process.env.NEXT_PUBLIC_SITE_URL||'http://localhost:3000';const {data,error}=await supabase.auth.signUp({email,password,options:{data:{full_name:fullName},emailRedirectTo:`${origin}/auth/callback`}});if(error)go('/signup',error.message);if(!data.session)redirect('/check-email');redirect('/pending')}


export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get('email') || '').trim().toLowerCase()
  if (!email) go('/forgot-password', 'Enter your email address.')

  const supabase = await createClient()
  const h = await headers()
  const origin = h.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/update-password`,
  })

  if (error) go('/forgot-password', error.message)
  go('/forgot-password', 'If an account exists for that email, a password reset link has been sent. Check your inbox and spam folder.')
}

export async function updatePassword(formData: FormData) {
  const password = String(formData.get('password') || '')
  const confirmPassword = String(formData.get('confirmPassword') || '')

  if (!password || !confirmPassword) go('/update-password', 'Enter the new password twice.')
  if (password.length < 10) go('/update-password', 'Use a password with at least 10 characters.')
  if (password !== confirmPassword) go('/update-password', 'The passwords do not match.')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) go('/forgot-password', 'Your reset link expired or is invalid. Please request a new one.')

  const { error } = await supabase.auth.updateUser({ password })
  if (error) go('/update-password', error.message)

  // Supabase keeps the password-recovery session alive after updateUser().
  // End it explicitly so the user returns to a clean signed-out state.
  const { error: signOutError } = await supabase.auth.signOut()
  if (signOutError) go('/update-password', 'Password changed, but the reset session could not be closed. Please try signing out and back in.')

  redirect('/login?message=' + encodeURIComponent('Password changed. Sign in with your new password.'))
}
