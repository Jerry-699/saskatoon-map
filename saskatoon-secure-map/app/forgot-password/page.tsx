import Link from 'next/link'
import { requestPasswordReset } from '@/app/actions'

export default async function ForgotPasswordPage({searchParams}:{searchParams:Promise<{message?:string}>}) {
  const p = await searchParams
  return <main className="shell"><div className="card">
    <h1>Forgot password</h1>
    <p className="muted">Enter the email used for your account. We’ll send you a secure link to choose a new password.</p>
    {p.message ? <div className="message">{p.message}</div> : null}
    <form action={requestPasswordReset}>
      <div><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required /></div>
      <button type="submit">Send reset link</button>
    </form>
    <p className="muted"><Link href="/login">Back to sign in</Link></p>
  </div></main>
}
