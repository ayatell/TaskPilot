import { useState, type FormEvent } from 'react'
import { api, ApiError, errorMessage } from '../api'
import { useI18n, type Lang } from '../i18n'
import { useTheme } from '../theme'

function strength(p: string): 0 | 1 | 2 {
  let score = 0
  if (p.length >= 8) score++
  if (p.length >= 12) score++
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++
  if (/\d/.test(p)) score++
  if (/[^A-Za-z0-9]/.test(p)) score++
  return score >= 4 ? 2 : score >= 3 ? 1 : 0
}

export default function Signup({ onSuccess, onSwitch }: { onSuccess: () => void; onSwitch: () => void }) {
  const { t, lang, setLang } = useI18n()
  const { theme, toggle } = useTheme()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [accountLang, setAccountLang] = useState<Lang>(lang)
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const mismatch = confirm.length > 0 && password !== confirm
  const level = strength(password)
  const levelKey = (['auth.weak', 'auth.medium', 'auth.strong'] as const)[level]

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      setError(t('auth.mismatch'))
      return
    }
    setBusy(true)
    setError('')
    try {
      await api.register(email.trim(), password, accountLang)
      await api.login(email.trim(), password) // auto-login
      setLang(accountLang)
      onSuccess()
    } catch (err) {
      // 409 = email already registered; 422 = validation error from the backend
      setError(err instanceof ApiError && err.status === 409 ? err.message : errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card stack" onSubmit={submit} noValidate={false}>
        <div className="row justify-between">
          <div>
            <h1 className="text-gradient">{t('app.name')}</h1>
            <p className="stat-label">{t('auth.signupTitle')}</p>
          </div>
          <div className="row gap-2">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}>
              {lang === 'fr' ? 'EN' : 'FR'}
            </button>
            <button type="button" className="theme-toggle" onClick={toggle} aria-label="Toggle theme">
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="su-email">{t('auth.email')}</label>
          <input id="su-email" className="input" type="email" required autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        <div className="field">
          <label className="label" htmlFor="su-pass">{t('auth.password')}</label>
          <div className="row gap-2 flex-nowrap">
            <input id="su-pass" className="input" type={show ? 'text' : 'password'} required
              minLength={8} maxLength={72} autoComplete="new-password" aria-describedby="su-hint"
              value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className="btn btn-outline btn-sm shrink-0" onClick={() => setShow((v) => !v)}
              aria-pressed={show}>
              {show ? t('auth.hide') : t('auth.show')}
            </button>
          </div>
          <div id="su-hint" className="row justify-between text-xs">
            <span className="stat-label">{t('auth.hint')}</span>
            {password && (
              <span className={`badge ${level === 0 ? 'badge-do_now' : level === 1 ? 'badge-due_soon' : 'badge-done'}`}>
                {t(levelKey)}
              </span>
            )}
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="su-confirm">{t('auth.confirm')}</label>
          <input id="su-confirm" className="input" type={show ? 'text' : 'password'} required
            maxLength={72} autoComplete="new-password" aria-invalid={mismatch}
            value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          {mismatch && <span className="field-error" role="alert">{t('auth.mismatch')}</span>}
        </div>

        <div className="field">
          <label className="label" htmlFor="su-lang">{t('auth.language')}</label>
          <select id="su-lang" className="select" value={accountLang}
            onChange={(e) => setAccountLang(e.target.value as Lang)}>
            <option value="fr">Français</option>
            <option value="en">English</option>
          </select>
        </div>

        {error && <div className="alert alert-error" role="alert">{error}</div>}

        <button className="btn btn-gradient btn-block" disabled={busy || mismatch}>
          {busy && <span className="spinner" />} {t('auth.register')}
        </button>
        <button type="button" className="btn btn-ghost btn-block" onClick={onSwitch}>
          {t('auth.toLogin')}
        </button>
      </form>
    </div>
  )
}