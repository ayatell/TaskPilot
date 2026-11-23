import { useCallback, useEffect, useState } from 'react'
import { api, errorMessage } from '../api'
import type { SavedItem } from '../types'

export default function SummariesPage() {
  const [summaries, setSummaries] = useState<SavedItem[]>([])
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [selectedSummary, setSelectedSummary] = useState<SavedItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadSummaries = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const items = await api.library()
      setSummaries(items.filter((item) => item.kind === 'summary'))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSummaries()
  }, [loadSummaries])

  const saveSummary = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!title.trim() || !content.trim()) {
      setError('Please enter a title and summary content.')
      return
    }

    setSaving(true)
    setError('')
    setSuccess('')

    try {
      await api.saveItem('summary', title.trim(), content.trim())
      setTitle('')
      setContent('')
      setSuccess('Your summary has been saved.')
      await loadSummaries()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const deleteSummary = async (id: number) => {
    const confirmed = window.confirm('Delete this summary permanently?')
    if (!confirmed) return

    setError('')

    try {
      await api.deleteItem(id)

      if (selectedSummary?.id === id) {
        setSelectedSummary(null)
      }

      await loadSummaries()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        <div className="card p-8 text-center">Loading your summaries...</div>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">My summaries</h1>
        <p className="mt-1 text-sm opacity-60">
          Keep your course notes and revision summaries organized.
        </p>
      </div>

      {error && (
        <div className="alert alert-error mb-4" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="alert mb-4" role="status">
          {success}
        </div>
      )}

      {selectedSummary ? (
        <section className="card p-5 sm:p-7">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs opacity-60">
                Saved on{' '}
                {new Date(selectedSummary.created_at).toLocaleDateString()}
              </p>
              <h2 className="mt-1 text-xl font-bold">
                {selectedSummary.title}
              </h2>
            </div>

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setSelectedSummary(null)}
            >
              Back to summaries
            </button>
          </div>

          <div className="whitespace-pre-wrap break-words text-sm leading-7">
            {selectedSummary.content}
          </div>
        </section>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[1fr_1fr]">
          <section className="card p-5">
            <h2 className="mb-4 text-lg font-semibold">Create a summary</h2>

            <form onSubmit={saveSummary} className="space-y-4">
              <div>
                <label
                  htmlFor="summary-title"
                  className="mb-1 block text-sm font-medium"
                >
                  Summary title
                </label>
                <input
                  id="summary-title"
                  className="input input-bordered w-full"
                  type="text"
                  placeholder="e.g. Database normalization"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={200}
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="summary-content"
                  className="mb-1 block text-sm font-medium"
                >
                  Summary content
                </label>
                <textarea
                  id="summary-content"
                  className="textarea textarea-bordered min-h-64 w-full"
                  placeholder="Paste or write your course summary here..."
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  rows={10}
                  required
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary w-full"
                disabled={saving || !title.trim() || !content.trim()}
              >
                {saving ? 'Saving...' : 'Save summary'}
              </button>
            </form>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Saved summaries</h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => void loadSummaries()}
              >
                Refresh
              </button>
            </div>

            {summaries.length === 0 ? (
              <div className="card p-6 text-center">
                <div className="mb-2 text-3xl">📝</div>
                <p className="font-medium">No summaries yet</p>
                <p className="mt-1 text-sm opacity-60">
                  Your saved summaries will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {summaries.map((summary) => (
                  <article className="card p-4" key={summary.id}>
                    <button
                      type="button"
                      className="block w-full text-left"
                      onClick={() => setSelectedSummary(summary)}
                    >
                      <h3 className="font-semibold">{summary.title}</h3>
                      <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm opacity-70">
                        {summary.content}
                      </p>
                      <p className="mt-3 text-xs opacity-50">
                        {new Date(summary.created_at).toLocaleDateString()}
                      </p>
                    </button>

                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        onClick={() => void deleteSummary(summary.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  )
}
