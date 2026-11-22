import { useState, type FormEvent } from 'react'
import { useI18n } from '../i18n'
import type { Task, TaskCreate } from '../types'
import { daysUntil, fmtHours } from '../utils'

type Props = {
  tasks: Task[]
  onAdd: (t: TaskCreate) => Promise<void>
  onDone: (id: number, actualMinutes: number) => Promise<void>
  onDelete: (id: number) => Promise<void>
}

export default function TodoSidebar({ tasks, onAdd, onDone, onDelete }: Props) {
  const { t } = useI18n()
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState(2)
  const [minutes, setMinutes] = useState(60)
  const [due, setDue] = useState('')
  const [doneId, setDoneId] = useState<number | null>(null)
  const [actual, setActual] = useState(60)

  // priority high to low, then earliest deadline first
  const open = tasks
    .filter((x) => x.status !== 'done')
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31'),
    )

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    await onAdd({
      title: title.trim(),
      priority,
      estimated_minutes: minutes,
      due_date: due || null,
    })
    setTitle('')
    setDue('')
    setAdding(false)
  }

  return (
    <aside className="card stack" aria-label={t('todo.title')}>
      <div className="card-title">
        <span>{t('todo.title')}</span>
        <button className="btn btn-primary btn-sm" onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
          + {t('todo.quickAdd')}
        </button>
      </div>

      {adding && (
        <form className="stack gap-3 rounded-lg border p-3" style={{ borderColor: 'var(--color-border)' }} onSubmit={submit}>
          <div className="field">
            <label className="label" htmlFor="qa-title">{t('todo.titleLabel')}</label>
            <input id="qa-title" className="input" value={title} maxLength={200} required autoFocus
              onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="field">
              <label className="label" htmlFor="qa-prio">{t('todo.priority')}</label>
              <select id="qa-prio" className="select" value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
                <option value={1}>{t('prio.1')}</option>
                <option value={2}>{t('prio.2')}</option>
                <option value={3}>{t('prio.3')}</option>
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="qa-min">{t('todo.minutes')}</label>
              <input id="qa-min" className="input" type="number" min={5} max={1440} step={5} value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))} />
            </div>
          </div>
          <div className="field">
            <label className="label" htmlFor="qa-due">{t('todo.due')}</label>
            <input id="qa-due" className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div className="row">
            <button className="btn btn-primary btn-sm">{t('todo.add')}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>
              {t('todo.cancel')}
            </button>
          </div>
        </form>
      )}

      {open.length === 0 ? (
        <div className="empty-state">{t('todo.empty')}</div>
      ) : (
        <ul className="task-list scroll-thin max-h-[55svh] overflow-y-auto">
          {open.map((x) => {
            const overdue = x.due_date !== null && daysUntil(x.due_date) < 0
            return (
              <li key={x.id} className={`task-item ${overdue ? 'is-overdue' : ''}`}>
                <div className="task-item-title">{x.title}</div>
                <div className="task-item-meta w-full">
                  <span className={`badge badge-prio-${x.priority}`}>{t(`prio.${x.priority}`)}</span>
                  <span>~{fmtHours(x.estimated_minutes)}</span>
                  {x.due_date && <span>{x.due_date}</span>}
                </div>

                {doneId === x.id ? (
                  <form className="row w-full gap-2" onSubmit={async (e) => {
                    e.preventDefault()
                    await onDone(x.id, actual)
                    setDoneId(null)
                  }}>
                    <label className="sr-only" htmlFor={`act-${x.id}`}>{t('todo.actual')}</label>
                    <input id={`act-${x.id}`} className="input w-24" type="number" min={1} max={1440} value={actual}
                      onChange={(e) => setActual(Number(e.target.value))} autoFocus />
                    <button className="btn btn-success btn-sm">{t('todo.confirm')}</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDoneId(null)}>
                      {t('todo.cancel')}
                    </button>
                  </form>
                ) : (
                  <div className="row w-full gap-2">
                    <button className="btn btn-success btn-sm"
                      onClick={() => { setDoneId(x.id); setActual(x.estimated_minutes) }}>
                      ✓ {t('todo.done')}
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => onDelete(x.id)}>
                      {t('todo.delete')}
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}