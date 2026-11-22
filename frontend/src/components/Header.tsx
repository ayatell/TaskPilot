import { setToken } from '../api'
import { useI18n } from '../i18n'
import { useTheme } from '../theme'
import type { Task } from '../types'
import { daysUntil } from '../utils'
import ConcentrationChip from './ConcentrationChip'

type Props = {
  tasks: Task[]
  concentration: boolean
  onToggleConcentration: () => void
  onLogout: () => void
}

export default function Header({ tasks, concentration, onToggleConcentration, onLogout }: Props) {
  const { t, lang, setLang } = useI18n()
  const { theme, toggle } = useTheme()

  // open tasks that have a deadline
  const dated = tasks.filter((x) => x.status !== 'done' && x.due_date)
  const lateCount = dated.filter((x) => daysUntil(x.due_date!) < 0).length

  // nearest deadline, today or later
  const next = dated
    .filter((x) => daysUntil(x.due_date!) >= 0)
    .sort((a, b) => daysUntil(a.due_date!) - daysUntil(b.due_date!))[0]

  let countdown = t('header.noDeadline')
  let countdownClass = 'badge-no_deadline'
  if (next) {
    const n = daysUntil(next.due_date!)
    countdown = (n === 0 ? t('header.today') : t('header.days', { n })) + ' · ' + next.title
    countdownClass = n === 0 ? 'badge-overdue' : n <= 3 ? 'badge-due_soon' : 'badge-due_this_week'
  }

  const logout = () => {
    setToken(null)
    onLogout()
  }

  return (
    <header className="navbar">
      <span className="navbar-brand">🧭 {t('app.name')}</span>

      <div className="row min-w-0 gap-2">
        <span className="stat-label hidden sm:inline">{t('header.countdown')}:</span>
        <span className={`badge ${countdownClass} max-w-56 truncate sm:max-w-xs`} title={countdown}>
          ⏳ {countdown}
        </span>
        {lateCount > 0 && (
          <span className="badge badge-overdue">
            ⚠️ {t('header.late')} ({lateCount})
          </span>
        )}
      </div>

      <div className="navbar-actions flex-wrap justify-end">
        {concentration && <ConcentrationChip />}
        <button
          type="button"
          className={`btn btn-sm ${concentration ? 'btn-primary' : 'btn-outline'}`}
          aria-pressed={concentration}
          onClick={onToggleConcentration}
        >
          🎯 {t('header.concentration')}: {concentration ? t('header.on') : t('header.off')}
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          aria-label={lang === 'fr' ? 'Switch to English' : 'Passer en français'}
          onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}
        >
          {lang === 'fr' ? 'EN' : 'FR'}
        </button>
        <button
          type="button"
          className="theme-toggle"
          onClick={toggle}
          aria-label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>
          {t('auth.logout')}
        </button>
      </div>
    </header>
  )
}