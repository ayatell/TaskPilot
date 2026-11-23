
import { useCallback, useEffect, useState } from 'react'
import { api, errorMessage } from '../api'
import type { QuizData, QuizQuestion, SavedItem } from '../types'

type QuizResult = {
  score: number
  total: number
  answers: number[]
}

function parseQuiz(content: string): QuizData | null {
  try {
    const parsed = JSON.parse(content) as QuizData

    if (
      !parsed ||
      typeof parsed.title !== 'string' ||
      !Array.isArray(parsed.questions) ||
      parsed.questions.length === 0
    ) {
      return null
    }

    const validQuestions = parsed.questions.every(
      (question: QuizQuestion) =>
        typeof question.question === 'string' &&
        Array.isArray(question.options) &&
        question.options.length >= 2 &&
        question.options.every(
          (option) => typeof option === 'string',
        ) &&
        typeof question.answer === 'number' &&
        Number.isInteger(question.answer) &&
        question.answer >= 0 &&
        question.answer < question.options.length,
    )

    return validQuestions ? parsed : null
  } catch {
    return null
  }
}

export default function QuizPage() {
  const [quizzes, setQuizzes] = useState<SavedItem[]>([])
  const [selectedQuiz, setSelectedQuiz] = useState<SavedItem | null>(null)
  const [quizData, setQuizData] = useState<QuizData | null>(null)

  const [answers, setAnswers] = useState<number[]>([])
  const [result, setResult] = useState<QuizResult | null>(null)

  const [questionCount, setQuestionCount] = useState(5)
  const [generating, setGenerating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const loadQuizzes = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const items = await api.library()
      setQuizzes(items.filter((item) => item.kind === 'quiz'))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadQuizzes()
  }, [loadQuizzes])

  const openQuiz = (item: SavedItem) => {
    const parsed = parseQuiz(item.content)

    if (!parsed) {
      setError('This quiz has an invalid format and cannot be opened.')
      return
    }

    setError('')
    setInfo('')
    setSelectedQuiz(item)
    setQuizData(parsed)
    setAnswers(Array(parsed.questions.length).fill(-1))
    setResult(null)
  }

  // Generate a new quiz and save it to the Library.
  const generateQuiz = async () => {
    if (generating) return

    setGenerating(true)
    setError('')
    setInfo('')

    try {
      const generated = await api.generateQuiz(questionCount)

      const validated = parseQuiz(JSON.stringify(generated))

      if (!validated) {
        throw new Error(
          'The generated quiz has an invalid format. Please try again.',
        )
      }

      const savedItem = await api.saveItem(
        'quiz',
        validated.title.slice(0, 200),
        JSON.stringify(validated),
      )

      // Open the generated quiz immediately.
      setSelectedQuiz(savedItem)
      setQuizData(validated)
      setAnswers(Array(validated.questions.length).fill(-1))
      setResult(null)

      // Update the saved quiz list without leaving the page.
      const items = await api.library()
      setQuizzes(items.filter((item) => item.kind === 'quiz'))

      setInfo('Your new quiz has been generated and saved.')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setGenerating(false)
    }
  }

  const selectAnswer = (
    questionIndex: number,
    optionIndex: number,
  ) => {
    if (result) return

    setAnswers((current) => {
      const updated = [...current]
      updated[questionIndex] = optionIndex
      return updated
    })
  }

  const submitQuiz = () => {
    if (!quizData) return

    const score = quizData.questions.reduce(
      (total, question, index) =>
        total + (answers[index] === question.answer ? 1 : 0),
      0,
    )

    setResult({
      score,
      total: quizData.questions.length,
      answers: [...answers],
    })
  }

  const restartQuiz = () => {
    if (!quizData) return

    setAnswers(Array(quizData.questions.length).fill(-1))
    setResult(null)
  }

  const closeQuiz = () => {
    setSelectedQuiz(null)
    setQuizData(null)
    setAnswers([])
    setResult(null)
    setError('')
    setInfo('')
  }

  const deleteQuiz = async (id: number) => {
    const confirmed = window.confirm(
      'Delete this quiz permanently?',
    )

    if (!confirmed) return

    try {
      await api.deleteItem(id)

      if (selectedQuiz?.id === id) {
        closeQuiz()
      }

      await loadQuizzes()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        <div className="card p-8 text-center">
          Loading your quizzes...
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      {/* Page heading */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">My quizzes</h1>
          <p className="mt-1 text-sm opacity-60">
            Generate quizzes, test your knowledge, and review your progress.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => void loadQuizzes()}
          disabled={generating}
        >
          Refresh
        </button>
      </div>

      {/* Error and success messages */}
      {error && (
        <div className="alert alert-error mb-5" role="alert">
          {error}
        </div>
      )}

      {info && (
        <div className="alert alert-success mb-5" role="status">
          {info}
        </div>
      )}

      {/* Quiz generator */}
      {!selectedQuiz && (
        <section className="card mb-6 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">
                🧠 Create a new quiz
              </h2>
              <p className="mt-1 text-sm opacity-60">
                Generate questions using your available study material.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label
                htmlFor="quiz-question-count"
                className="text-sm font-medium"
              >
                Number of questions
              </label>

              <input
                id="quiz-question-count"
                className="input w-24"
                value={questionCount}
                onChange={(event) =>
                  setQuestionCount(Number(event.target.value))
                }
                disabled={generating}
              >
              </input>

              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void generateQuiz()}
                disabled={generating}
              >
                {generating ? (
                  <>
                    <span className="spinner" />
                    Generating...
                  </>
                ) : (
                  <>✨ Generate quiz</>
                )}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Saved quizzes or active quiz */}
      {!selectedQuiz || !quizData ? (
        quizzes.length === 0 ? (
          <div className="card p-8 text-center">
            <div className="mb-3 text-4xl">📝</div>

            <h2 className="text-lg font-semibold">
              No saved quizzes yet
            </h2>

            <p className="mt-2 text-sm opacity-60">
              Generate your first quiz using the button above.
              Your saved quizzes will appear here.
            </p>
          </div>
        ) : (
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Your saved quizzes
              </h2>

              <span className="badge">
                {quizzes.length} quiz{quizzes.length === 1 ? '' : 'zes'}
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {quizzes.map((quiz) => {
                const parsed = parseQuiz(quiz.content)

                return (
                  <article className="card p-5" key={quiz.id}>
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold">
                          {parsed?.title || quiz.title}
                        </h3>

                        <p className="mt-1 text-xs opacity-60">
                          Saved on{' '}
                          {new Date(
                            quiz.created_at,
                          ).toLocaleDateString()}
                        </p>
                      </div>

                      <span className="text-2xl">🧠</span>
                    </div>

                    <p className="mb-4 text-sm opacity-70">
                      {parsed
                        ? `${parsed.questions.length} questions`
                        : 'Quiz format not recognized'}
                    </p>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm flex-1"
                        disabled={!parsed}
                        onClick={() => openQuiz(quiz)}
                      >
                        Start quiz
                      </button>

                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => void deleteQuiz(quiz.id)}
                        aria-label={`Delete ${quiz.title}`}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        )
      ) : (
        /* Interactive quiz */
        <section className="card p-5 sm:p-7">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs opacity-60">
                {result
                  ? `${quizData.questions.length} / ${quizData.questions.length} answered`
                  : `${answers.filter((answer) => answer !== -1).length} / ${quizData.questions.length} answered`}
              </p>

              <h2 className="mt-1 text-xl font-bold">
                {quizData.title}
              </h2>
            </div>

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={closeQuiz}
            >
              ← Back to quizzes
            </button>
          </div>

          {/* Progress bar */}
          <div className="mb-6 h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{
                width: `${
                  (answers.filter((answer) => answer !== -1).length /
                    quizData.questions.length) *
                  100
                }%`,
              }}
            />
          </div>

          {/* Questions */}
          <div className="space-y-7">
            {quizData.questions.map((question, questionIndex) => (
              <div
                key={questionIndex}
                className="border-b pb-6 last:border-0"
              >
                <h3 className="mb-4 font-semibold">
                  {questionIndex + 1}. {question.question}
                </h3>

                <div className="grid gap-2">
                  {question.options.map((option, optionIndex) => {
                    const isSelected =
                      answers[questionIndex] === optionIndex

                    const isCorrect =
                      question.answer === optionIndex

                    const showCorrection = result !== null

                    let optionClass =
                      'w-full rounded-lg border p-3 text-left text-sm transition'

                    if (showCorrection && isCorrect) {
                      optionClass +=
                        ' border-green-500 bg-green-50 text-green-800'
                    } else if (
                      showCorrection &&
                      isSelected &&
                      !isCorrect
                    ) {
                      optionClass +=
                        ' border-red-500 bg-red-50 text-red-800'
                    } else if (isSelected) {
                      optionClass +=
                        ' border-primary bg-primary/10'
                    } else {
                      optionClass += ' hover:bg-slate-50'
                    }

                    return (
                      <button
                        key={optionIndex}
                        type="button"
                        className={optionClass}
                        disabled={result !== null}
                        onClick={() =>
                          selectAnswer(questionIndex, optionIndex)
                        }
                      >
                        <span className="mr-2 font-semibold">
                          {String.fromCharCode(65 + optionIndex)}.
                        </span>

                        {option}

                        {showCorrection && isCorrect && (
                          <span className="float-right">✓</span>
                        )}
                      </button>
                    )
                  })}
                </div>

                {result && question.explanation && (
                  <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
                    <strong>Explanation:</strong>{' '}
                    {question.explanation}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Results */}
          {result ? (
            <div className="mt-6 rounded-xl border p-5 text-center">
              <h3 className="text-xl font-bold">
                Your score: {result.score} / {result.total}
              </h3>

              <p className="mt-2 text-sm opacity-70">
                {Math.round(
                  (result.score / result.total) * 100,
                )}% correct
              </p>

              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={restartQuiz}
                >
                  Try again
                </button>

                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={closeQuiz}
                >
                  Back to quizzes
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm opacity-60">
                Answer all questions before submitting.
              </p>

              <button
                type="button"
                className="btn btn-primary"
                disabled={answers.some((answer) => answer === -1)}
                onClick={submitQuiz}
              >
                Submit answers
              </button>
            </div>
          )}
        </section>
      )}
    </main>
  )
}
