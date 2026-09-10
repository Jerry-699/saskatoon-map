import Link from 'next/link'
import { updatePassword } from '@/app/actions'

export default async function UpdatePasswordPage({searchParams}:{searchParams:Promise<{message?:string}>}) {
  const p = await searchParams
  return <main className="shell"><div className="card">
    <h1>Create new password</h1>
    <p className="muted">Choose a new password for your account.</p>
    {p.message ? <div className="message">{p.message}</div> : null}
    <form action={updatePassword}>
      <div><label htmlFor="password">New password</label><input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required /></div>
      <div><label htmlFor="confirmPassword">Confirm new password</label><input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={10} required /></div>
      <button type="submit">Save new password</button>
    </form>
    <p className="muted"><Link href="/login">Back to sign in</Link></p>
  </div></main>
}
