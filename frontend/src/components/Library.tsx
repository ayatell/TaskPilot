import { useEffect, useState } from 'react'
import { api, errorMessage } from '../api'
import { useI18n } from '../i18n'
import type { QuizQuestion, SavedItem } from '../types'
import QuizPlayer from './QuizPlayer'

function parseQuiz(content: string): QuizQuestion[] | null {
  try {
    const d = JSON.parse(content)
    if (Array.isArray(d?.questions) && d.questions.length > 0) return d.questions as QuizQuestion[]
  } catch { /* plain text item */ }
  return null
}

export default function Library() {
  const { t, lang } = useI18n()
  const [items, setItems] = useState<SavedItem[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [filter, setFilter] = useState<'all' | 'quiz' | 'summary'>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let ignore = false
    api
      .library()
      .then((data) => {
        if (!ignore) {
          setItems(data)
          if (data.length > 0) setSelectedId(data[0].id)
          setLoading(false)
        }
      })
      .catch((e) => {
        if (!ignore) {
          setError(errorMessage(e))
          setLoading(false)
        }
      })
    return () => {
      ignore = true
    }
  }, [])

  const remove = async (id: number) => {
    setBusy(true)
    setError('')
    try {
      await api.deleteItem(id)
      setItems((prev) => prev.filter((item) => item.id !== id))
      if (selectedId === id) setSelectedId(null)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const filtered = items.filter((item) => (filter === 'all' ? true : item.kind === filter))
  const selected = items.find((item) => item.id === selectedId)
  const quizQuestions = selected && selected.kind === 'quiz' ? parseQuiz(selected.content) : null

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
      <div className="card row justify-between">
        <h2>📚 {t('lib.title')}</h2>
        <div className="row gap-2">
          <button
            type="button"
            className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setFilter('all')}
          >
            {t('lib.all')} ({items.length})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${filter === 'quiz' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setFilter('quiz')}
          >
            {t('lib.quiz')} ({items.filter((i) => i.kind === 'quiz').length})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${filter === 'summary' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setFilter('summary')}
          >
            {t('lib.summary')} ({items.filter((i) => i.kind === 'summary').length})
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      {loading ? (
        <div className="card py-10 text-center">{t('common.loading')}</div>
      ) : items.length === 0 ? (
        <div className="empty-state py-16">
          <span className="text-4xl">📚</span>
          <p className="text-base font-semibold">{t('lib.title')}</p>
          <p className="max-w-md">{t('lib.empty')}</p>
        </div>
      ) : (
        <div className="grid flex-1 gap-4 lg:grid-cols-[22rem_1fr]">
          <div className="scroll-thin stack max-h-[calc(100vh-16rem)] gap-2 overflow-y-auto">
            {filtered.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                aria-pressed={selectedId === item.id}
                className={`card stack cursor-pointer p-3 text-left transition-colors ${
                  selectedId === item.id ? 'ring-2 ring-[var(--color-primary)]' : 'hover:bg-[var(--color-muted)]'
                }`}
              >
                <div className="row justify-between">
                  <span className={`badge ${item.kind === 'quiz' ? 'badge-primary' : 'badge-accent'}`}>
                    {t(`lib.kind.${item.kind}`)}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                    {new Date(item.created_at).toLocaleDateString(lang)}
                  </span>
                </div>
                <h4 className="line-clamp-2 text-sm font-semibold">{item.title}</h4>
              </button>
            ))}
            {filtered.length === 0 && <div className="empty-state">{t('lib.empty')}</div>}
          </div>

          <div className="card stack max-h-[calc(100vh-16rem)] flex-1 overflow-y-auto p-6">
            {selected ? (
              <>
                <div className="row justify-between border-b pb-3" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="stack gap-1">
                    <span className={`badge w-fit ${selected.kind === 'quiz' ? 'badge-primary' : 'badge-accent'}`}>
                      {t(`lib.kind.${selected.kind}`)}
                    </span>
                    <h3 className="text-lg font-bold">{selected.title}</h3>
                    <span className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                      {new Date(selected.created_at).toLocaleString(lang)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={busy}
                    onClick={() => void remove(selected.id)}
                  >
                    🗑️ {t('lib.delete')}
                  </button>
                </div>

                <div className="pt-4">
                  {quizQuestions ? (
                    <QuizPlayer key={selected.id} questions={quizQuestions} />
                  ) : (
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">{selected.content}</div>
                  )}
                </div>
              </>
            ) : (
              <div className="empty-state my-auto">
                <p>{t('lib.select')}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}