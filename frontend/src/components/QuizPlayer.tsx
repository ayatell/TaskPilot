import { useState } from 'react'
import { useI18n } from '../i18n'
import type { QuizQuestion } from '../types'

export default function QuizPlayer({ questions }: { questions: QuizQuestion[] }) {
  const { t } = useI18n()
  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [answers, setAnswers] = useState<number[]>([])
  const [finished, setFinished] = useState(false)

  const total = questions.length
  const score = answers.filter((a, i) => a === questions[i].answer).length

  const choose = (i: number) => {
    if (picked !== null) return // one answer per question
    setPicked(i)
    setAnswers((a) => [...a, i])
  }

  const next = () => {
    if (index + 1 < total) {
      setIndex(index + 1)
      setPicked(null)
    } else {
      setFinished(true)
    }
  }

  const restart = () => {
    setIndex(0)
    setPicked(null)
    setAnswers([])
    setFinished(false)
  }

  /* ---------- final score ---------- */
  if (finished) {
    const pct = Math.round((score / total) * 100)
    const message = pct >= 80 ? t('quiz.great') : pct >= 50 ? t('quiz.good') : t('quiz.keep')
    return (
      <div className="stack">
        <div className="stat items-center text-center">
          <span className="stat-label">{t('quiz.score')}</span>
          <span className="stat-value text-5xl">{score} / {total}</span>
          <span className="stat-label">{pct}% · {message}</span>
        </div>
        <progress className="progress" value={score} max={total} />

        <div className="card-title">{t('quiz.review')}</div>
        <ol className="stack gap-3 text-sm">
          {questions.map((q, i) => {
            const ok = answers[i] === q.answer
            return (
              <li key={i} className="stack gap-1">
                <div className="font-semibold">{i + 1}. {q.question}</div>
                <div className={`badge ${ok ? 'badge-done' : 'badge-do_now'} w-fit`}>
                  {ok ? '✓' : '✗'} {t('quiz.yourAnswer')}: {q.options[answers[i]]}
                </div>
                {!ok && (
                  <div className="badge badge-done w-fit">
                    ✓ {t('quiz.goodAnswer')}: {q.options[q.answer]}
                  </div>
                )}
                {q.explanation && <div className="stat-label">{q.explanation}</div>}
              </li>
            )
          })}
        </ol>

        <button className="btn btn-gradient w-fit" onClick={restart}>↻ {t('quiz.retry')}</button>
      </div>
    )
  }

  /* ---------- question ---------- */
  const q = questions[index]
  const answered = picked !== null
  const isRight = picked === q.answer

  return (
    <div className="stack">
      <div className="row justify-between">
        <span className="badge badge-primary">{t('quiz.question', { n: index + 1, total })}</span>
        <span className="stat-label">{score} ✓</span>
      </div>
      <progress className="progress" value={index + (answered ? 1 : 0)} max={total} />

      <h3>{q.question}</h3>

      <div className="stack gap-2" role="group" aria-label={q.question}>
        {q.options.map((opt, i) => {
          let cls = 'btn-outline'
          if (answered && i === q.answer) cls = 'btn-success'
          else if (answered && i === picked) cls = 'btn-danger'
          return (
            <button
              key={i}
              type="button"
              className={`btn ${cls} h-auto w-full justify-start whitespace-normal py-3 text-left ${answered && cls === 'btn-outline' ? 'opacity-60' : ''}`}
              aria-pressed={picked === i}
              onClick={() => choose(i)}
            >
              <span className="font-bold">{String.fromCharCode(65 + i)}.</span> {opt}
            </button>
          )
        })}
      </div>

      {answered && (
        <div className={`alert ${isRight ? 'alert-success' : 'alert-error'}`} role="status">
          <div>
            <strong>{isRight ? t('quiz.correct') : t('quiz.wrong')}</strong>
            {q.explanation && <div>{q.explanation}</div>}
          </div>
        </div>
      )}

      {answered && (
        <button className="btn btn-gradient w-fit" onClick={next}>
          {index + 1 < total ? t('quiz.next') : t('quiz.finish')}
        </button>
      )}
    </div>
  )
}