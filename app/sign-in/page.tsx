'use client';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
export default function SignIn() {
  const [email, setEmail] = useState(''), [otp, setOtp] = useState('');
  const [sent, setSent] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = sent ? await authClient.signIn.emailOtp({ email, otp }) : await authClient.emailOtp.sendVerificationOtp({ email, type: 'sign-in' });
      if (result.error) throw new Error(result.error.message || 'Unable to sign in. Please try again.');
      if (sent) {
        const requested = new URLSearchParams(window.location.search).get('next');
        const allowed = ['/admin', '/workspace?mode=live', '/announcements', '/assistant'];
        window.location.assign(requested && allowed.includes(requested) ? requested : '/workspace?mode=live');
      } else setSent(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to sign in.'); }
    finally { setBusy(false); }
  }
  return <div className="public-shell"><header className="public-header"><a className="brand" href="/">STANAIC</a><a className="quiet-link" href="https://stanaic.org/" target="_blank" rel="noopener noreferrer">Official website ↗</a></header><main className="login-panel"><p className="eyebrow">VERIFIED ACCOUNT ACCESS</p><h1>Sign in to STANAIC</h1><p>{sent ? 'Enter the one-time code sent to your email.' : 'Verify your email to open your learner workspace. Staff tools remain restricted to approved accounts.'}</p><form onSubmit={submit}><label className="field"><span>Email address</span><input type="email" autoComplete="email" required value={email} disabled={sent} onChange={e => setEmail(e.target.value.trim())}/></label>{sent && <label className="field"><span>Verification code</span><input autoFocus required inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={e => setOtp(e.target.value)} maxLength={12}/></label>}{error && <div role="alert" className="alert">{error}</div>}<button className="button primary" disabled={busy}>{busy ? 'Please wait…' : sent ? 'Verify & sign in' : 'Send sign-in code'}</button>{sent && <button type="button" className="button secondary" disabled={busy} onClick={() => { setSent(false); setOtp(''); }}>Use another email / request a new code</button>}</form><p className="fine">New joiner? Open the personal link in your onboarding invitation.</p></main></div>;
}
