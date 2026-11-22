import { useCallback, useEffect, useState } from 'react'
import { api, errorMessage } from '../api'
import CalendarView from '../components/CalendarView'
import ChatScreen from '../components/ChatScreen'
import Header from '../components/Header'
import Library from '../components/Library'
import TodoSidebar from '../components/TodoSidebar'
import { useI18n } from '../i18n'
import type { Block, Task, TaskCreate } from '../types'
import { addDays, iso } from '../utils'

type Tab = 'chat' | 'calendar' | 'library'

export default function Workspace({ onLogout }: { onLogout: () => void }) {
  const { t } = useI18n()
  const [tab, setTab] = useState<Tab>('chat') // starts on the full-screen chat
  const [tasks, setTasks] = useState<Task[]>([])
  const [blocks, setBlocks] = useState<Block[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [hours, setHours] = useState(3)
  const [concentration, setConcentration] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadTasks = useCallback(async () => {
    setTasks(await api.tasks())
  }, [])

  const generate = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const availability: Record<string, number> = {}
      for (let i = 0; i < 7; i++) availability[iso(addDays(new Date(), i))] = Math.round(hours * 60)
      const plan = await api.plan(availability)
      setBlocks(plan.blocks)
      setWarnings(plan.warnings)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }, [hours])

  useEffect(() => {
    void (async () => {
      try {
        await loadTasks()
      } catch (e) {
        setError(errorMessage(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [loadTasks])

  const wrap = async (fn: () => Promise<void>) => {
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  // Called by the chat when the student confirms the proposed tasks.
  // If something throws, the chat shows the error and we stay on the chat tab.
  const confirmTasks = async (proposedTasks: TaskCreate[]) => {
    await api.createTasksBulk(proposedTasks)
    await loadTasks()
    await generate()
    setTab('calendar')
  }

  const addTask = (task: TaskCreate) =>
    wrap(async () => {
      await api.createTask(task)
      await loadTasks()
    })

  const markDone = (id: number, actual: number) =>
    wrap(async () => {
      await api.markDone(id, actual) // also feeds the bandit
      await loadTasks()
      setBlocks((b) => b.filter((x) => x.task_id !== id))
    })

  const removeTask = (id: number) =>
    wrap(async () => {
      await api.deleteTask(id)
      await loadTasks()
      setBlocks((b) => b.filter((x) => x.task_id !== id))
    })

  const removeBlock = (blk: Block) => setBlocks((all) => all.filter((x) => x !== blk))

  const tabs: { id: Tab; label: string }[] = [
    { id: 'chat', label: `💬 ${t('nav.chat')}` },
    { id: 'calendar', label: `📅 ${t('nav.calendar')}` },
    { id: 'library', label: `📚 ${t('nav.library')}` },
  ]

  return (
    <div className="app-shell">
      <Header
        tasks={tasks}
        concentration={concentration}
        onToggleConcentration={() => setConcentration((v) => !v)}
        onLogout={onLogout}
      />

      <nav
        className="border-b px-4 py-2 sm:px-6"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}
        aria-label="Views"
      >
        <div className="mx-auto flex max-w-7xl items-center gap-2">
          {tabs.map((x) => (
            <button
              key={x.id}
              type="button"
              className={`btn btn-sm ${tab === x.id ? 'btn-primary' : 'btn-ghost'}`}
              aria-current={tab === x.id ? 'page' : undefined}
              onClick={() => setTab(x.id)}
            >
              {x.label}
            </button>
          ))}
        </div>
      </nav>

      {error && (
        <div className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6">
          <div className="alert alert-error" role="alert">{error}</div>
        </div>
      )}

      {/* Chat stays mounted (only hidden) so the conversation survives tab changes */}
      <div className={tab === 'chat' ? 'flex-1' : 'hidden'}>
        <ChatScreen onConfirm={confirmTasks} />
      </div>

      {tab === 'library' && (
        <div className="flex-1">
          <Library />
        </div>
      )}

      {tab === 'calendar' &&
        (loading ? (
          <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
            <div className="card py-10 text-center">{t('common.loading')}</div>
          </div>
        ) : (
          <main className="mx-auto grid w-full max-w-7xl flex-1 gap-4 px-4 py-6 sm:px-6 lg:grid-cols-[20rem_1fr]">
            <TodoSidebar tasks={tasks} onAdd={addTask} onDone={markDone} onDelete={removeTask} />
            <CalendarView
              blocks={blocks}
              tasks={tasks}
              warnings={warnings}
              hours={hours}
              busy={busy}
              onHoursChange={setHours}
              onGenerate={generate}
              onRemoveBlock={removeBlock}
            />
          </main>
        ))}
    </div>
  )
}