
import { useCallback, useEffect, useState } from 'react'

import { api, errorMessage } from '../api'

import CalendarView from '../components/CalendarView'
import ChatScreen from '../components/ChatScreen'
import ConversationSidebar from '../components/ConversationSidebar'
import Header from '../components/Header'
import Library from '../components/Library'
import TodoSidebar from '../components/TodoSidebar'
import QuizPage from '../components/QuizPage'
import SummariesPage from '../components/SummariesPage'

import { useI18n } from '../i18n'

import type {
  Block,
  Conversation,
  Task,
  TaskCreate,
} from '../types'

import { addDays, iso } from '../utils'

type Tab = 'chat' | 'calendar' | 'quiz' | 'summaries' | 'library'

export default function Workspace({
  onLogout,
}: {
  onLogout: () => void
}) {
  const { t } = useI18n()

  const [tab, setTab] = useState<Tab>('chat')

  const [tasks, setTasks] = useState<Task[]>([])
  const [blocks, setBlocks] = useState<Block[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState('')

  const [hours, setHours] = useState(3)
  const [concentration, setConcentration] = useState(false)

  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] =
    useState<number | null>(null)

  const [chatKey, setChatKey] = useState(0)
  const [conversationsLoading, setConversationsLoading] =
    useState(true)

  const wrap = async (fn: () => Promise<void>) => {
    setError('')

    try {
      await fn()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  // ---------------------------------------------
  // TASKS
  // ---------------------------------------------

  const loadTasks = useCallback(async () => {
    const data = await api.tasks()
    setTasks(data)
  }, [])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const data = await api.tasks()

        if (!cancelled) {
          setTasks(data)
        }
      } catch (e) {
        if (!cancelled) {
          setError(errorMessage(e))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  // ---------------------------------------------
  // CONVERSATIONS
  // ---------------------------------------------

  const loadConversations = useCallback(async () => {
    const data = await api.conversations()
    setConversations(data)
    return data
  }, [])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const data = await api.conversations()

        if (!cancelled) {
          setConversations(data)

          if (data.length > 0) {
            setActiveConversationId(data[0].id)
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(errorMessage(e))
        }
      } finally {
        if (!cancelled) {
          setConversationsLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  const openConversation = (id: number) => {
    if (id === activeConversationId) {
      setTab('chat')
      return
    }

    setActiveConversationId(id)
    setChatKey((current) => current + 1)
    setTab('chat')
  }

  const createNewConversation = async () => {
    await wrap(async () => {
      const conversation = await api.createConversation(
        'New conversation',
      )

      setConversations((current) => [
        conversation,
        ...current.filter((item) => item.id !== conversation.id),
      ])

      setActiveConversationId(conversation.id)
      setChatKey((current) => current + 1)
      setTab('chat')
    })
  }

  const handleConversationCreated = useCallback(
    (id: number) => {
      setActiveConversationId(id)

      void loadConversations().catch((e) => {
        setError(errorMessage(e))
      })
    },
    [loadConversations],
  )

  const renameConversation = (id: number, title: string) =>
    wrap(async () => {
      await api.updateConversation(id, { title })
      await loadConversations()
    })

  const deleteConversation = (id: number) =>
    wrap(async () => {
      await api.deleteConversation(id)

      const remaining = conversations.filter(
        (conversation) => conversation.id !== id,
      )

      setConversations(remaining)

      if (activeConversationId === id) {
        const nextConversation = remaining[0] ?? null

        setActiveConversationId(nextConversation?.id ?? null)
        setChatKey((current) => current + 1)
        setTab('chat')
      }
    })

  // ---------------------------------------------
  // CALENDAR / PLANNING
  // ---------------------------------------------

  const generate = useCallback(async () => {
    setBusy(true)
    setError('')

    try {
      const availability: Record<string, number> = {}

      for (let i = 0; i < 7; i++) {
        availability[iso(addDays(new Date(), i))] =
          Math.round(hours * 60)
      }

      const plan = await api.plan(availability)

      setBlocks(plan.blocks)
      setWarnings(plan.warnings)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }, [hours])

  // ---------------------------------------------
  // TASK ACTIONS
  // ---------------------------------------------

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
      await api.markDone(id, actual)
      await loadTasks()

      setBlocks((current) =>
        current.filter((block) => block.task_id !== id),
      )
    })

  const removeTask = (id: number) =>
    wrap(async () => {
      await api.deleteTask(id)
      await loadTasks()

      setBlocks((current) =>
        current.filter((block) => block.task_id !== id),
      )
    })

  const removeBlock = (block: Block) => {
    setBlocks((current) =>
      current.filter((item) => item !== block),
    )
  }

  // ---------------------------------------------
  // NAVIGATION
  // ---------------------------------------------

  const openSummaries = useCallback(() => {
    setTab('summaries')
  }, [])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'chat', label: `💬 ${t('nav.chat')}` },
    { id: 'calendar', label: `📅 ${t('nav.calendar')}` },
    { id: 'quiz', label: `🧠 ${t('nav.quiz')}` },
    { id: 'summaries', label: `📝 ${t('nav.summaries')}` },
    { id: 'library', label: `📚 ${t('nav.library')}` },
  ]

  // ---------------------------------------------
  // RENDER
  // ---------------------------------------------

  return (
    <div className="app-shell min-h-screen flex flex-col">
      <Header
        tasks={tasks}
        concentration={concentration}
        onToggleConcentration={() =>
          setConcentration((value) => !value)
        }
        onLogout={onLogout}
      />

      <nav
        className="border-b px-4 py-2 sm:px-6"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-card)',
        }}
        aria-label="Views"
      >
        <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`btn btn-sm shrink-0 ${tab === item.id ? 'btn-primary' : 'btn-ghost'
                }`}
              aria-current={tab === item.id ? 'page' : undefined}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      {error && (
        <div className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6">
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        </div>
      )}

      {tab === 'chat' && (
        <div className="flex-1">
          <div className="mx-auto flex h-full w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row">
            <div
              className="w-full shrink-0 rounded-xl border p-3 lg:w-72"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-card)',
              }}
            >
              {conversationsLoading ? (
                <p className="py-4 text-center text-sm opacity-60">
                  Loading conversations...
                </p>
              ) : (
                <ConversationSidebar
                  conversations={conversations}
                  activeId={activeConversationId}
                  onSelect={openConversation}
                  onCreate={createNewConversation}
                  onDelete={deleteConversation}
                  onRename={renameConversation}
                />
              )}
            </div>

            <main className="min-w-0 flex-1">
              <ChatScreen
                key={chatKey}
                activeConversationId={activeConversationId}
                onConversationCreated={handleConversationCreated}
                onConfirm={confirmTasks}
                onOpenSummaries={openSummaries}
              />
            </main>
          </div>
        </div>
      )}

      {tab === 'calendar' && (
        loading ? (
          <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
            <div className="card py-10 text-center">
              {t('common.loading')}
            </div>
          </div>
        ) : (
          <main className="mx-auto grid w-full max-w-7xl flex-1 gap-4 px-4 py-6 sm:px-6 lg:grid-cols-[20rem_1fr]">
            <TodoSidebar
              tasks={tasks}
              onAdd={addTask}
              onDone={markDone}
              onDelete={removeTask}
            />

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
        )
      )}

      {tab === 'quiz' && (
        <div className="flex-1">
          <QuizPage />
        </div>
      )}

      {tab === 'summaries' && (
        <div className="flex-1">
          <SummariesPage />
        </div>
      )}

      {tab === 'library' && (
        <div className="flex-1">
          <Library />
        </div>
      )}
    </div>
  )
}
