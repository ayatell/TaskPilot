import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { api, errorMessage } from '../api'
import { useI18n } from '../i18n'
import type { DocumentOut, RankedTask, TaskCreate, QuizQuestion } from '../types'
import QuizPlayer from './QuizPlayer'


const MAX_BYTES = 10 * 1024 * 1024
type Kind = 'quiz' | 'summary'

type Msg = {
  id: number
  role: 'user' | 'assistant'
  text: string
  actions?: TaskCreate[]
  ranking?: RankedTask[] | null
  confirmed?: boolean
  saved?: boolean
  quiz?: { title: string; questions: QuizQuestion[] }
}

type Props = { onConfirm: (tasks: TaskCreate[]) => Promise<void> }

export default function ChatScreen({ onConfirm }: Props) {
  const { t } = useI18n()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [convId, setConvId] = useState<number | null>(null)
  const [docs, setDocs] = useState<DocumentOut[]>([])
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const nextId = useRef(1)

  useEffect(() => {
    void (async () => {
      try { setDocs(await api.documents()) } catch { /* chat works without the list */ }
    })()
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, busy])

  const titleFor = (kind: Kind) => {
    const names = docs.slice(0, 2).map((d) => d.filename).join(', ')
    return `${t(`lib.kind.${kind}`)} · ${names || new Date().toLocaleDateString()}`.slice(0, 200)
  }

  const saveReply = async (msgId: number, kind: Kind, content: string) => {
    try {
      await api.saveItem(kind, titleFor(kind), content)
      setMsgs((all) => all.map((m) => (m.id === msgId ? { ...m, saved: true } : m)))
      setInfo(t('lib.saved'))
      setTimeout(() => setInfo(''), 3000)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const sendMessage = async (message: string, kind?: Kind) => {
    if (!message || busy) return
    setBusy(true)
    setError('')
    setMsgs((m) => [...m, { id: nextId.current++, role: 'user', text: message }])
    setText('')
    try {
      const r = await api.chat(message, convId)
      setConvId(r.conversation_id)
      const id = nextId.current++
      setMsgs((m) => [
        ...m,
        { id, role: 'assistant', text: r.reply, actions: r.actions.map((a) => a.task), ranking: r.ranking },
      ])
      if (kind && r.reply.trim()) await saveReply(id, kind, r.reply) // auto-save for the starter buttons
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void sendMessage(text.trim())
  }

    const startQuiz = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    setMsgs((m) => [...m, { id: nextId.current++, role: 'user', text: t('chat.quizPrompt') }])
    try {
      const quiz = await api.generateQuiz(5)
      await api.saveItem('quiz', quiz.title.slice(0, 200), JSON.stringify(quiz)) // replayable from the library
      setMsgs((m) => [...m, { id: nextId.current++, role: 'assistant', text: t('quiz.ready'), quiz }])
      setInfo(t('lib.saved'))
      setTimeout(() => setInfo(''), 3000)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  // starters: quiz and summary need at least one document
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
      void startQuiz()
      return
    }
    void sendMessage(t('chat.summaryPrompt'), 'summary')
  }

  const confirm = async (msg: Msg) => {
    if (!msg.actions?.length) return
    setBusy(true)
    setError('')
    try {
      await onConfirm(msg.actions)
      setMsgs((all) => all.map((m) => (m.id === msg.id ? { ...m, confirmed: true } : m)))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const dismiss = (id: number) =>
    setMsgs((all) => all.map((m) => (m.id === id ? { ...m, actions: [] } : m)))

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > MAX_BYTES) {
      setError(t('chat.tooBig'))
      return
    }
    setUploading(true)
    setError('')
    try {
      const doc = await api.uploadDocument(file)
      setDocs((d) => [doc, ...d])
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  const docChips = (docs.length > 0 || uploading) && (
    <div className="row justify-center gap-2 text-xs" aria-label={t('chat.docs')}>
      {uploading && <span className="badge badge-accent"><span className="spinner" /> {t('chat.uploading')}</span>}
      {docs.slice(0, 4).map((d) => (
        <span key={d.id} className="badge badge-primary max-w-48 truncate" title={d.filename}>📄 {d.filename}</span>
      ))}
      {docs.length > 4 && <span className="badge">+{docs.length - 4}</span>}
    </div>
  )

  const inputBar = (
    <form className="chat-input-bar w-full" onSubmit={submit}>
      <input ref={fileRef} type="file" accept=".pdf,.txt,.md,application/pdf,text/plain"
        className="hidden" onChange={onFile} tabIndex={-1} aria-hidden="true" />
      <button type="button" className="btn btn-outline btn-icon text-lg" disabled={uploading}
        aria-label={t('chat.attach')} title={t('chat.attach')} onClick={() => fileRef.current?.click()}>
        {uploading ? <span className="spinner" /> : '+'}
      </button>
      <label className="sr-only" htmlFor="chat-input">{t('chat.label')}</label>
      <input ref={inputRef} id="chat-input" className="input min-w-0 flex-1" value={text} maxLength={4000}
        placeholder={t('chat.placeholder')} onChange={(e) => setText(e.target.value)} />
      <button className="btn btn-gradient" disabled={busy || !text.trim()}>
        {busy ? <><span className="spinner" /> {t('chat.sending')}</> : t('chat.send')}
      </button>
    </form>
  )

  const alerts = (
    <>
      {error && <div className="alert alert-error w-full" role="alert">{error}</div>}
      {info && <div className="alert alert-success w-full" role="status">{info}</div>}
    </>
  )

  /* ---------- EMPTY STATE: centered question + prompt bar ---------- */
  if (msgs.length === 0) {
    return (
      <div className="mx-auto flex min-h-[calc(100svh-8rem)] w-full max-w-2xl flex-col items-center justify-center gap-6 px-4 py-8 text-center">
        <span className="text-5xl animate-float">🧭</span>
        <div className="stack gap-1">
          <h1 className="text-gradient text-3xl sm:text-4xl">{t('start.question')}</h1>
          <p className="stat-label text-base">{t('start.sub')}</p>
        </div>

        <div className="row justify-center gap-3">
          <button className="btn btn-outline" onClick={() => start('quiz')}>🧠 {t('start.quiz')}</button>
          <button className="btn btn-outline" onClick={() => start('summary')}>📝 {t('start.summary')}</button>
          <button className="btn btn-outline" onClick={() => start('todo')}>✅ {t('start.todo')}</button>
        </div>

        {alerts}
        {inputBar}
        {docChips}
      </div>
    )
  }

  /* ---------- CONVERSATION ---------- */
  return (
    <div className="mx-auto flex h-[calc(100svh-8rem)] w-full max-w-4xl flex-col gap-3 px-4 py-4 sm:px-6">
      <div className="chat-messages scroll-thin" aria-live="polite">
        {msgs.map((m) => (
          <div key={m.id} className="flex flex-col gap-2">
            <div className={`bubble ${m.quiz && (<div className="card"><QuizPlayer questions={m.quiz.questions} /></div>)}`}>{m.text}</div>

            {m.role === 'assistant' && !m.actions?.length && !m.ranking?.length && !m.saved && m.text.length > 80 && (
              <div className="row gap-2">
                <button className="btn btn-ghost btn-sm" onClick={() => void saveReply(m.id, 'quiz', m.text)}>
                  💾 {t('lib.saveQuiz')}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => void saveReply(m.id, 'summary', m.text)}>
                  💾 {t('lib.saveSummary')}
                </button>
              </div>
            )}

            {m.ranking && m.ranking.length > 0 && (
              <div className="card p-3">
                <div className="card-title">{t('chat.ranking')}</div>
                <ol className="stack gap-1 text-sm">
                  {m.ranking.map((r, i) => (
                    <li key={r.task_id} className="row gap-2">
                      <span>{i + 1}.</span>
                      <span className="font-semibold">{r.title}</span>
                      <span className={`badge badge-${r.quadrant}`}>{t(`quadrant.${r.quadrant}`)}</span>
                      <span className={`badge badge-${r.reason}`}>{r.due_date ?? ''}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {m.actions && m.actions.length > 0 && (
              <div className="action-card stack gap-2">
                <div className="card-title w-full">{t('chat.proposed')} ({m.actions.length})</div>
                <ul className="w-full text-sm">
                  {m.actions.map((a, i) => (
                    <li key={i}>
                      • {a.title}
                      {a.due_date ? ` (${a.due_date})` : ''} · {a.estimated_minutes ?? 60} min
                    </li>
                  ))}
                </ul>
                {m.confirmed ? (
                  <span className="badge badge-done">✓ {t('chat.confirmed')}</span>
                ) : (
                  <div className="row">
                    <button className="btn btn-gradient btn-sm" disabled={busy} onClick={() => void confirm(m)}>
                      {t('chat.confirmPlan')}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => dismiss(m.id)}>
                      {t('chat.dismiss')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {busy && (
          <div className="bubble bubble-assistant" aria-label={t('chat.sending')}>
            <span className="typing-dot" /> <span className="typing-dot" /> <span className="typing-dot" />
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