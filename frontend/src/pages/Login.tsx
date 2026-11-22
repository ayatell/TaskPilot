import { useState, type FormEvent } from 'react'
import { api, errorMessage } from '../api'
import { useI18n } from '../i18n'
import { useTheme } from '../theme'

type Props = {
    onSuccess: () => void
    onSwitch?: () => void
}

export default function Login({ onSuccess, onSwitch }: Props) {
    const { t, lang, setLang } = useI18n()
    const { theme, toggle } = useTheme()
    const [mode, setMode] = useState<'login' | 'register'>('login')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)

    const submit = async (e: FormEvent) => {
        e.preventDefault()
        setBusy(true)
        setError('')
        try {
            if (mode === 'register') await api.register(email.trim(), password, lang)
            await api.login(email.trim(), password) // auto-login after registration
            onSuccess()
        } catch (err) {
            setError(errorMessage(err))
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="auth-wrap">
            <form className="auth-card stack" onSubmit={submit}>
                <div className="row justify-between">
                    <h1 className="text-gradient">{t('app.name')}</h1>
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
                    <label className="label" htmlFor="email">{t('auth.email')}</label>
                    <input id="email" className="input" type="email" required autoComplete="email"
                        value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="field">
                    <label className="label" htmlFor="password">{t('auth.password')}</label>
                    <input id="password" className="input" type="password" required minLength={8} maxLength={72}
                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                        value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>

                {error && <div className="alert alert-error" role="alert">{error}</div>}

                <button className="btn btn-gradient btn-block" disabled={busy}>
                    {busy && <span className="spinner" />}
                    {mode === 'login' ? t('auth.login') : t('auth.register')}
                </button>
                <button type="button" className="btn btn-ghost btn-block"
                    onClick={() => {
                        if (onSwitch) {
                            onSwitch()
                        } else {
                            setMode(mode === 'login' ? 'register' : 'login')
                            setError('')
                        }
                    }}>
                    {mode === 'login' ? t('auth.toRegister') : t('auth.toLogin')}
                </button>
            </form>
        </div>
    )
}