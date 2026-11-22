import { useI18n } from '../i18n'
import type { Block, Task } from '../types'
import { addDays, fmtHours, fmtTime, iso } from '../utils'

type Props = {
  blocks: Block[]
  tasks: Task[]
  warnings: string[]
  hours: number
  busy: boolean
  onHoursChange: (h: number) => void
  onGenerate: () => void
  onRemoveBlock: (b: Block) => void
}

const DAY_START = 9 * 60 // blocks are stacked from 09:00

export default function CalendarView({ blocks, tasks, warnings, hours, busy, onHoursChange, onGenerate, onRemoveBlock }: Props) {
  const { t, lang } = useI18n()
  const today = new Date()
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i))
  const prioOf = (id: number) => tasks.find((x) => x.id === id)?.priority ?? 2

  return (
    <section className="stack" aria-label={t('cal.title')}>
      <div className="card row justify-between">
        <h2>{t('cal.title')}</h2>
        <div className="row gap-2">
          <label className="label" htmlFor="hours">{t('cal.hours')}</label>
          <input id="hours" className="input w-20" type="number" min={0.5} max={16} step={0.5} value={hours}
            onChange={(e) => onHoursChange(Number(e.target.value))} />
          <button className="btn btn-gradient" onClick={onGenerate} disabled={busy}>
            {busy && <span className="spinner" />} {t('cal.generate')}
          </button>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="alert alert-warning" role="status">
          <div>
            <strong>{t('cal.unscheduled')}</strong>
            <ul className="list-disc pl-5">
              {warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          </div>
        </div>
      )}

      <div className="scroll-thin grid auto-cols-[minmax(10rem,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2">
        {days.map((d) => {
          const key = iso(d)
          const dayBlocks = blocks.filter((b) => b.day === key)
          let cursor = DAY_START
          const total = dayBlocks.reduce((s, b) => s + b.minutes, 0)

          return (
            <div key={key} className="day-column">
              <div className="day-title">
                <span>{d.toLocaleDateString(lang, { weekday: 'short', day: 'numeric' })}</span>
                <span className="badge badge-primary">{fmtHours(total)}</span>
              </div>

              {dayBlocks.length === 0 && <div className="empty-state py-6">{t('cal.empty')}</div>}

              {dayBlocks.map((b, i) => {
                const start = cursor
                cursor += b.minutes
                return (
                  <div key={`${b.task_id}-${i}`}>
                    <div className="stat-label text-xs">{fmtTime(start)}</div>
                    <div className="plan-block" style={{ minHeight: Math.max(52, b.minutes * 0.7) }}>
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{b.title}</div>
                        <div className="plan-block-minutes">
                          {fmtHours(b.minutes)} · <span className={`badge badge-prio-${prioOf(b.task_id)}`}>{t(`prio.${prioOf(b.task_id)}`)}</span>
                        </div>
                      </div>
                      <button className="btn btn-ghost btn-sm" aria-label={t('cal.remove')} title={t('cal.remove')}
                        onClick={() => onRemoveBlock(b)}>
                        ✕
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </section>
  )
}