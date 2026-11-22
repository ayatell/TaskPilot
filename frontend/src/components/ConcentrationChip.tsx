import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'

// Mounted only while the monitor is ON, so its state resets each time it is enabled.
export default function ConcentrationChip() {
  const { t } = useI18n()
  const [seconds, setSeconds] = useState(0)
  const [away, setAway] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) setSeconds((s) => s + 1) // only counts while the tab is visible
    }, 1000)
    const onVisibility = () => {
      if (document.hidden) setAway((a) => a + 1)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')

  return (
    <div className="row gap-2 text-xs" aria-live="off">
      <span className="badge badge-primary">{t('focus.time')} {mm}:{ss}</span>
      <span className={`badge ${away > 0 ? 'badge-do_now' : 'badge-done'}`}>
        {t('focus.distractions')} {away}
      </span>
    </div>
  )
}