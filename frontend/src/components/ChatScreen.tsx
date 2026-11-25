import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'

import { api, errorMessage } from '../api'
import { useI18n } from '../i18n'

import type {
  ConversationMessage,
  DocumentOut,
  RankedTask,
  TaskCreate,
  QuizQuestion,
} from '../types'

import QuizPlayer from './QuizPlayer'

const MAX_BYTES = 10 * 1024 * 1024
const MIN_QUIZ_COUNT = 3
const MAX_QUIZ_COUNT = 50 // must match QuizRequest (le=50) in schemas.py

// "summary", "summarize", "résumé", "résume", "synthèse"...
const SUMMARY_INTENT = /summar|r[ée]sum|synth[èe]se/i

type Kind = 'quiz' | 'summary'

type Msg = {
  id: number
  role: 'user' | 'assistant'
  text: string
  actions?: TaskCreate[]
  ranking?: RankedTask[] | null
  confirmed?: boolean
  saved?: boolean
  quiz?: {
    title: string
    questions: QuizQuestion[]
  }
  openSummaries?: boolean
}

type Props = {
  activeConversationId: number | null
  onConversationCreated: (id: number) => void
  onConfirm: (tasks: TaskCreate[]) => Promise<void>
  onOpenSummaries: () => void
}

type StoredMetadata = {
  actions?: {
    type: string
    task: TaskCreate
  }[]
  ranking?: RankedTask[] | null
  quiz?: {
    title: string
    questions: QuizQuestion[]
  }
  open_summaries?: boolean
}

function convertMessage(message: ConversationMessage): Msg {
  const metadata = (message.metadata_json ?? {}) as StoredMetadata

  return {
    id: message.id,
    role: message.role === 'user' ? 'user' : 'assistant',
    text: message.content,
    actions: metadata.actions
      ?.filter((action) => action.type === 'create_task')
      .map((action) => action.task),
    ranking: metadata.ranking ?? null,
    quiz: metadata.quiz,
    openSummaries: metadata.open_summaries === true,
  }
}

export default function ChatScreen({
  activeConversationId,
  onConversationCreated,
  onConfirm,
  onOpenSummaries,
}: Props) {
  const { t } = useI18n()

  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [docs, setDocs] = useState<DocumentOut[]>([])

  const [quizCount, setQuizCount] = useState(5)
  const [showQuizSetup, setShowQuizSetup] = useState(false)

  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)

  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const fileRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const nextId = useRef(1)
  const requestId = useRef(0)

  const activeConversationRef = useRef<number | null>(activeConversationId)

  const createdConversationId = useRef<number | null>(null)

  // Keep refs synchronized with the selected conversation.
  useEffect(() => {
    activeConversationRef.current = activeConversationId
  }, [activeConversationId])

  // Load the user's documents.
  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const documents = await api.documents()

        if (!cancelled) {
          setDocs(documents)
        }
      } catch {
        // Chat can still work without documents.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  // Load messages whenever the selected conversation changes.
  useEffect(() => {
    setError('')
    setInfo('')
    setText('')
    setShowQuizSetup(false)

    if (activeConversationId === null) {
      ++requestId.current
      setMsgs([])
      setBusy(false)
      return
    }

    // Conversation just created by this component: keep local messages.
    if (createdConversationId.current === activeConversationId) {
      createdConversationId.current = null
      return
    }

    const currentRequest = ++requestId.current

    setMsgs([])
    setBusy(true)

    void (async () => {
      try {
        const history = await api.conversationMessages(activeConversationId)

        if (requestId.current !== currentRequest) return

        const restoredMessages = history.map(convertMessage)

        setMsgs(restoredMessages)

        nextId.current =
          Math.max(0, ...restoredMessages.map((m) => m.id)) + 1
      } catch (err) {
        if (requestId.current === currentRequest) {
          setError(errorMessage(err))
        }
      } finally {
        if (requestId.current === currentRequest) {
          setBusy(false)
        }
      }
    })()

    return () => {
      if (requestId.current === currentRequest) {
        requestId.current++
      }
    }
  }, [activeConversationId])

  // Scroll to the latest message.
  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: 'smooth',
    })
  }, [msgs, busy])

  const titleFor = (kind: Kind) => {
    const names = docs
      .slice(0, 2)
      .map((document) => document.filename)
      .join(', ')

    return `${t(`lib.kind.${kind}`)} · ${names || new Date().toLocaleDateString()
      }`.slice(0, 200)
  }

  // Save an assistant reply to the Library.
  const saveReply = async (msgId: number, kind: Kind, content: string) => {
    try {
      await api.saveItem(kind, titleFor(kind), content)

      setMsgs((all) =>
        all.map((message) =>
          message.id === msgId ? { ...message, saved: true } : message,
        ),
      )

      setInfo(t('lib.saved'))
      window.setTimeout(() => setInfo(''), 3000)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  // Send a message to the currently selected conversation.
  const sendMessage = async (message: string, kind?: Kind) => {
    if (!message.trim() || busy) return

    const targetConversationId = activeConversationRef.current
    const currentRequestId = requestId.current
    const temporaryId = -nextId.current++

    setBusy(true)
    setError('')
    setInfo('')
    setText('')

    setMsgs((all) => [
      ...all,
      {
        id: temporaryId,
        role: 'user',
        text: message,
      },
    ])

    try {
      const response = await api.chat(message, targetConversationId)

      if (
        requestId.current !== currentRequestId ||
        activeConversationRef.current !== targetConversationId
      ) {
        return
      }

      if (targetConversationId === null) {
        createdConversationId.current = response.conversation_id
        activeConversationRef.current = response.conversation_id
        onConversationCreated(response.conversation_id)
      }

      const assistantMessage: Msg = {
        id: nextId.current++,
        role: 'assistant',
        text: response.reply,
        actions: response.actions.map((action) => action.task),
        ranking: response.ranking,
      }

      setMsgs((all) => [
        ...all.filter((item) => item.id !== temporaryId),
        {
          id: nextId.current++,
          role: 'user',
          text: message,
        },
        assistantMessage,
      ])

      if (kind && response.reply.trim()) {
        await saveReply(assistantMessage.id, kind, response.reply)
      }
    } catch (err) {
      if (requestId.current === currentRequestId) {
        setError(errorMessage(err))

        setMsgs((all) => all.filter((item) => item.id !== temporaryId))
      }
    } finally {
      if (requestId.current === currentRequestId) {
        setBusy(false)
      }
    }
  }

  // Generate and save a quiz.
  const startQuiz = async () => {
    if (busy) return

    if (docs.length === 0) {
      setError(t('start.needDoc'))
      return
    }

    const questionCount = Math.min(
      MAX_QUIZ_COUNT,
      Math.max(MIN_QUIZ_COUNT, Math.round(quizCount)),
    )

    setQuizCount(questionCount)
    setShowQuizSetup(false)

    setBusy(true)
    setError('')
    setInfo('')

    const targetConversationId = activeConversationRef.current
    const currentRequestId = requestId.current
    const promptId = -nextId.current++

    setMsgs((all) => [
      ...all,
      {
        id: promptId,
        role: 'user',
        text: t('chat.quizPrompt'),
      },
    ])

    try {
      const quiz = await api.generateQuiz(questionCount)

      if (
        requestId.current !== currentRequestId ||
        activeConversationRef.current !== targetConversationId
      ) {
        return
      }

      await api.saveItem('quiz', quiz.title.slice(0, 200), JSON.stringify(quiz))

      if (
        requestId.current !== currentRequestId ||
        activeConversationRef.current !== targetConversationId
      ) {
        return
      }

      setMsgs((all) => [
        ...all,
        {
          id: nextId.current++,
          role: 'assistant',
          text: t('quiz.ready'),
          quiz,
        },
      ])

      setInfo(t('lib.saved'))
      window.setTimeout(() => setInfo(''), 3000)
    } catch (err) {
      if (requestId.current === currentRequestId) {
        setError(errorMessage(err))

        setMsgs((all) => all.filter((item) => item.id !== promptId))
      }
    } finally {
      if (requestId.current === currentRequestId) {
        setBusy(false)
      }
    }
  }

  // Generate and save a summary, then persist its confirmation.
  // userText is set when the summary was requested by typing a prompt.
  const startSummary = async (userText?: string) => {
    if (busy) return

    if (docs.length === 0) {
      setError(t('start.needDoc'))
      return
    }

    setBusy(true)
    setError('')
    setInfo('')

    const currentRequestId = requestId.current
    let conversationId = activeConversationRef.current
    let stage = 'conversation creation'

    const confirmation =
      'The summary is now present in the summary room, go check and good luck !'

    // Show the typed prompt right away.
    if (userText) {
      setMsgs((all) => [
        ...all,
        { id: -nextId.current++, role: 'user', text: userText },
      ])
    }

    // True only if the user moved to another conversation meanwhile.
    const userLeft = () => {
      const left =
        requestId.current !== currentRequestId ||
        activeConversationRef.current !== conversationId
      if (left) {
        console.warn('[summary] stopped: user left the conversation', {
          stage,
          requestIdNow: requestId.current,
          requestIdAtStart: currentRequestId,
          activeNow: activeConversationRef.current,
          conversationId,
        })
      }
      return left
    }

    try {
      // 1. Create a conversation if necessary.
      if (conversationId === null) {
        const conversation = await api.createConversation()
        console.info('[summary] conversation created', conversation)

        conversationId = conversation.id
        createdConversationId.current = conversationId
        activeConversationRef.current = conversationId
        onConversationCreated(conversationId)
      }

      // 1b. Persist the typed prompt (non blocking).
      if (userText) {
        stage = 'saving your message'
        try {
          await api.createConversationMessage(
            conversationId,
            userText.slice(0, 4000),
            undefined,
            'user',
          )
        } catch (err) {
          console.warn('[summary] user message not stored', err)
        }
      }

      // 2. Generate the summary.
      stage = 'summary generation'
      const summary = await api.generateSummary(docs.map((d) => d.id))
      console.info('[summary] generated', summary.title)

      // 3. Save it in the Library.
      stage = 'saving summary to the Library'
      await api.saveItem('summary', summary.title.slice(0, 200), summary.content)
      console.info('[summary] saved in library')

      // 4. Persist the confirmation message.
      stage = 'saving confirmation message'
      let confirmationMsg: Msg

      try {
        const saved = await api.createConversationMessage(
          conversationId,
          confirmation,
          { open_summaries: true },
        )
        console.info('[summary] confirmation saved', saved)

        confirmationMsg = {
          ...convertMessage(saved),
          role: 'assistant',
          openSummaries: true, // do not depend on the metadata round-trip
        }
      } catch (err) {
        console.error('[summary] confirmation could not be stored', err)
        confirmationMsg = {
          id: nextId.current++,
          role: 'assistant',
          text: confirmation,
          openSummaries: true,
        }
        setError(
          `The summary was saved, but its confirmation could not be stored: ${errorMessage(err)}`,
        )
      }

      // 5. Display it, unless the user switched conversation.
      if (userLeft()) return

      setMsgs((all) => [...all, confirmationMsg])
      setInfo(t('lib.saved'))
    } catch (err) {
      console.error(`[summary] error at stage: ${stage}`, err)
      setError(`Error during ${stage}: ${errorMessage(err)}`)
    } finally {
      if (requestId.current === currentRequestId) {
        setBusy(false)
      }
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const message = text.trim()
    if (!message) return

    // Same flow as the "A summary" button, but only if there is a document.
    if (SUMMARY_INTENT.test(message) && docs.length > 0) {
      setText('')
      void startSummary(message)
      return
    }

    void sendMessage(message)
  }

  // Open the quiz setup screen or start another action.
  const start = (kind: Kind | 'todo') => {
    setError('')

    if (kind === 'todo') {
      setText(t('start.todoPrefill'))
      inputRef.current?.focus()
      return
    }

    if (docs.length === 0) {
      setError(t('start.needDoc'))
      return
    }

    if (kind === 'quiz') {
      setShowQuizSetup(true)
      return
    }

    void startSummary()
  }

  // Confirm proposed tasks.
  const confirm = async (message: Msg) => {
    if (!message.actions?.length || busy) return

    setBusy(true)
    setError('')

    try {
      await onConfirm(message.actions)

      setMsgs((all) =>
        all.map((item) =>
          item.id === message.id ? { ...item, confirmed: true } : item,
        ),
      )
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const dismiss = (id: number) => {
    setMsgs((all) =>
      all.map((message) =>
        message.id === id ? { ...message, actions: [] } : message,
      ),
    )
  }

  // Upload a document.
  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) return

    if (file.size > MAX_BYTES) {
      setError(t('chat.tooBig'))
      return
    }

    setUploading(true)
    setError('')

    try {
      const document = await api.uploadDocument(file)

      setDocs((all) => [document, ...all])
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  // Uploaded document labels.
  const docChips = (docs.length > 0 || uploading) && (
    <div
      className="row justify-center gap-2 text-xs"
      aria-label={t('chat.docs')}
    >
      {uploading && (
        <span className="badge badge-accent">
          <span className="spinner" /> {t('chat.uploading')}
        </span>
      )}

      {docs.slice(0, 4).map((document) => (
        <span
          key={document.id}
          className="badge badge-primary max-w-48 truncate"
          title={document.filename}
        >
          📄 {document.filename}
        </span>
      ))}

      {docs.length > 4 && <span className="badge">+{docs.length - 4}</span>}
    </div>
  )

  // Chat input bar.
  const inputBar = (
    <form className="chat-input-bar w-full" onSubmit={submit}>
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.txt,.md,application/pdf,text/plain"
        className="hidden"
        onChange={onFile}
        tabIndex={-1}
        aria-hidden="true"
      />

      <button
        type="button"
        className="btn btn-outline btn-icon text-lg"
        disabled={uploading}
        aria-label={t('chat.attach')}
        title={t('chat.attach')}
        onClick={() => fileRef.current?.click()}
      >
        {uploading ? <span className="spinner" /> : '+'}
      </button>

      <label className="sr-only" htmlFor="chat-input">
        {t('chat.label')}
      </label>

      <input
        ref={inputRef}
        id="chat-input"
        className="input min-w-0 flex-1"
        value={text}
        maxLength={4000}
        placeholder={t('chat.placeholder')}
        onChange={(event) => setText(event.target.value)}
      />

      <button
        type="submit"
        className="btn btn-gradient"
        disabled={busy || !text.trim()}
      >
        {busy ? (
          <>
            <span className="spinner" /> {t('chat.sending')}
          </>
        ) : (
          t('chat.send')
        )}
      </button>
    </form>
  )

  // Error and success messages.
  const alerts = (
    <>
      {error && (
        <div className="alert alert-error w-full" role="alert">
          {error}
        </div>
      )}

      {info && (
        <div className="alert alert-success w-full" role="status">
          {info}
        </div>
      )}
    </>
  )

  // Dedicated quiz configuration screen.
  if (showQuizSetup) {
    return (
      <div className="mx-auto flex min-h-[calc(100svh-8rem)] w-full max-w-2xl flex-col items-center justify-center gap-6 px-4 py-8 text-center">
        <span className="text-5xl animate-float">🧠</span>

        <div className="stack gap-2">
          <h1 className="text-gradient text-3xl sm:text-4xl">
            Quiz Generator
          </h1>

          <p className="stat-label text-base">
            Choose how many questions you want in your quiz.
          </p>
        </div>

        <div className="card w-full max-w-sm stack gap-4 p-5">
          <label htmlFor="quiz-count" className="font-semibold">
            Number of questions
          </label>

          <input
            id="quiz-count"
            type="number"
            className="input w-full text-center text-xl"
            min={MIN_QUIZ_COUNT}
            max={MAX_QUIZ_COUNT}
            step={1}
            value={quizCount}
            disabled={busy}
            onChange={(event) => {
              const value = Number(event.target.value)

              if (!Number.isFinite(value)) {
                setQuizCount(MIN_QUIZ_COUNT)
                return
              }

              setQuizCount(
                Math.min(
                  MAX_QUIZ_COUNT,
                  Math.max(MIN_QUIZ_COUNT, Math.round(value)),
                ),
              )
            }}
          />

          <p className="stat-label text-sm">
            Minimum: {MIN_QUIZ_COUNT} questions · Maximum: {MAX_QUIZ_COUNT}{' '}
            questions
          </p>

          <button
            type="button"
            className="btn btn-gradient w-full"
            disabled={busy || docs.length === 0}
            onClick={() => void startQuiz()}
          >
            {busy ? (
              <>
                <span className="spinner" />
                Generating quiz...
              </>
            ) : (
              '🚀 Generate quiz'
            )}
          </button>

          <button
            type="button"
            className="btn btn-ghost w-full"
            disabled={busy}
            onClick={() => {
              setShowQuizSetup(false)
              setError('')
            }}
          >
            ← Back to chat
          </button>
        </div>

        {alerts}
        {docChips}
      </div>
    )
  }

  // Empty conversation screen.
  if (msgs.length === 0) {
    return (
      <div className="mx-auto flex min-h-[calc(100svh-8rem)] w-full max-w-2xl flex-col items-center justify-center gap-6 px-4 py-8 text-center">
        <span className="text-5xl animate-float">🧭</span>

        <div className="stack gap-1">
          <h1 className="text-gradient text-3xl sm:text-4xl">
            {t('start.question')}
          </h1>

          <p className="stat-label text-base">{t('start.sub')}</p>
        </div>

        <div className="row justify-center gap-3">
          <button
            className="btn btn-outline"
            type="button"
            disabled={busy}
            onClick={() => start('quiz')}
          >
            🧠 {t('start.quiz')}
          </button>

          <button
            className="btn btn-outline"
            type="button"
            disabled={busy}
            onClick={() => start('summary')}
          >
            📝 {t('start.summary')}
          </button>

          <button
            className="btn btn-outline"
            type="button"
            disabled={busy}
            onClick={() => start('todo')}
          >
            ✅ {t('start.todo')}
          </button>
        </div>

        {busy && (
          <div className="stat-label">
            <span className="spinner" /> {t('chat.sending')}
          </div>
        )}

        {alerts}
        {inputBar}
        {docChips}
      </div>
    )
  }

  // Active conversation screen.
  return (
    <div className="mx-auto flex h-[calc(100svh-8rem)] w-full max-w-4xl flex-col gap-3 px-4 py-4 sm:px-6">
      <div className="chat-messages scroll-thin" aria-live="polite">
        {msgs.map((message) => (
          <div key={message.id} className="flex flex-col gap-2">
            <div
              className={`bubble ${message.role === 'user' ? 'bubble-user' : 'bubble-assistant'
                }`}
            >
              {message.text}
            </div>

            {message.openSummaries && (
              <div className="ml-2 mt-2">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={onOpenSummaries}
                >
                  📝 Open Summary room
                </button>
              </div>
            )}

            {message.quiz && (
              <div className="card">
                <QuizPlayer questions={message.quiz.questions} />
              </div>
            )}

            {message.role === 'assistant' &&
              !message.actions?.length &&
              !message.ranking?.length &&
              !message.saved &&
              !message.openSummaries &&
              !message.quiz &&
              message.text.length > 80 && (
                <div className="row gap-2">
                  <button
                    className="btn btn-ghost btn-sm"
                    type="button"
                    onClick={() =>
                      void saveReply(message.id, 'quiz', message.text)
                    }
                  >
                    💾 {t('lib.saveQuiz')}
                  </button>

                  <button
                    className="btn btn-ghost btn-sm"
                    type="button"
                    onClick={() =>
                      void saveReply(message.id, 'summary', message.text)
                    }
                  >
                    💾 {t('lib.saveSummary')}
                  </button>
                </div>
              )}

            {message.ranking && message.ranking.length > 0 && (
              <div className="card p-3">
                <div className="card-title">{t('chat.ranking')}</div>

                <ol className="stack gap-1 text-sm">
                  {message.ranking.map((item, index) => (
                    <li key={item.task_id} className="row gap-2">
                      <span>{index + 1}.</span>

                      <span className="font-semibold">{item.title}</span>

                      <span className={`badge badge-${item.quadrant}`}>
                        {t(`quadrant.${item.quadrant}`)}
                      </span>

                      <span className={`badge badge-${item.reason}`}>
                        {item.due_date ?? ''}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {message.actions && message.actions.length > 0 && (
              <div className="action-card stack gap-2">
                <div className="card-title w-full">
                  {t('chat.proposed')} ({message.actions.length})
                </div>

                <ul className="w-full text-sm">
                  {message.actions.map((action, index) => (
                    <li key={index}>
                      • {action.title}
                      {action.due_date ? ` (${action.due_date})` : ''}
                      {' · '}
                      {action.estimated_minutes ?? 60} min
                    </li>
                  ))}
                </ul>

                {message.confirmed ? (
                  <span className="badge badge-done">
                    ✓ {t('chat.confirmed')}
                  </span>
                ) : (
                  <div className="row">
                    <button
                      className="btn btn-gradient btn-sm"
                      type="button"
                      disabled={busy}
                      onClick={() => void confirm(message)}
                    >
                      {t('chat.confirmPlan')}
                    </button>

                    <button
                      className="btn btn-ghost btn-sm"
                      type="button"
                      onClick={() => dismiss(message.id)}
                    >
                      {t('chat.dismiss')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {busy && (
          <div
            className="bubble bubble-assistant"
            aria-label={t('chat.sending')}
          >
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        )}

        <div ref={endRef} />
      </div>

      {alerts}
      {docChips}
      {inputBar}
    </div>
  )
}