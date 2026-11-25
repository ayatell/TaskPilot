
import { useState } from 'react'
import { useI18n } from '../i18n'
import type { QuizQuestion } from '../types'

type Props = {
  questions: QuizQuestion[]
}

export default function QuizPlayer({ questions }: Props) {
  const { t } = useI18n()

  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<(number | null)[]>([])
  const [finished, setFinished] = useState(false)

  const total = questions.length

  const score = answers.reduce<number>(
    (sum, answer, i) =>
      sum + (answer === questions[i]?.answer ? 1 : 0),
    0
  )

  if (total === 0) {
    return (
      <div className="alert alert-error">
        No questions are available in this quiz.
      </div>
    )
  }

  const currentQuestion = questions[index]
  const picked = answers[index] ?? null
  const answered = picked !== null
  const correct = picked === currentQuestion.answer

  const choose = (optionIndex: number) => {
    if (answered || finished) return

    setAnswers((previous) => {
      const updated = [...previous]
      updated[index] = optionIndex
      return updated
    })
  }

  const next = () => {
    if (!answered) return

    if (index + 1 < total) {
      setIndex((previous) => previous + 1)
    } else {
      setFinished(true)
    }
  }

  const restart = () => {
    setIndex(0)
    setAnswers([])
    setFinished(false)
  }

  if (finished) {
    const percentage = total > 0 ? Math.round((score / total) * 100) : 0

    const feedback =
      percentage >= 80
        ? t('quiz.great')
        : percentage >= 50
          ? t('quiz.good')
          : t('quiz.keep')

    return (
      <div className="stack gap-4">
        <div className="card text-center p-5">
          <div className="stat-label">{t('quiz.score')}</div>

          <div className="stat-value text-5xl">
            {score}/{total}
          </div>

          <div className="stat-label">
            {percentage}% · {feedback}
          </div>

          <progress
            className="progress"
            value={score ?? 0}
            max={total}
          />
        </div>

        <h3 className="card-title">{t('quiz.review')}</h3>

        <ol className="stack gap-4">
          {questions.map((question, i) => {
            const answer = answers[i]
            const isCorrect = answer === question.answer

            return (
              <li key={i} className="card p-3 stack gap-2">
                <strong>
                  {i + 1}. {question.question}
                </strong>

                <div className={`badge ${isCorrect ? 'badge-done' : 'badge-do_now'}`}>
                  {isCorrect ? '✓' : '✗'} {t('quiz.yourAnswer')}:{' '}
                  {answer === null
                    ? 'Not answered'
                    : question.options[answer]}
                </div>

                {!isCorrect && (
                  <div className="badge badge-done w-fit">
                    ✓ {t('quiz.goodAnswer')}:{' '}
                    {question.options[question.answer]}
                  </div>
                )}

                {question.explanation && (
                  <p className="text-sm opacity-80">
                    {question.explanation}
                  </p>
                )}
              </li>
            )
          })}
        </ol>

        <button
          type="button"
          className="btn btn-gradient w-fit"
          onClick={restart}
        >
          ↻ {t('quiz.retry')}
        </button>
      </div>
    )
  }

  return (
    <div className="stack gap-4">
      <div className="row justify-between">
        <span className="badge badge-primary">
          {t('quiz.question', {
            n: index + 1,
            total,
          })}
        </span>

        <span className="stat-label">
          {score} ✓
        </span>
      </div>

      <progress
        className="progress"
        value={index + (answered ? 1 : 0)}
        max={total}
      />

      <h3 className="text-lg font-semibold">
        {currentQuestion.question}
      </h3>

      <div
        className="stack gap-2"
        role="group"
        aria-label={currentQuestion.question}
      >
        {currentQuestion.options.map((option, i) => {
          let style = 'btn-outline'

          if (answered && i === currentQuestion.answer) {
            style = 'btn-success'
          } else if (answered && i === picked) {
            style = 'btn-danger'
          }

          return (
            <button
              key={i}
              type="button"
              disabled={answered}
              aria-pressed={picked === i}
              className={`btn ${style} h-auto w-full justify-start whitespace-normal py-3 text-left`}
              onClick={() => choose(i)}
            >
              <span className="font-bold">
                {String.fromCharCode(65 + i)}.
              </span>

              <span>{option}</span>
            </button>
          )
        })}
      </div>

      {answered && (
        <div
          className={`alert ${correct ? 'alert-success' : 'alert-error'}`}
          role="status"
        >
          <div>
            <strong>
              {correct ? t('quiz.correct') : t('quiz.wrong')}
            </strong>

            {currentQuestion.explanation && (
              <p>{currentQuestion.explanation}</p>
            )}
          </div>
        </div>
      )}

      {answered && (
        <button
          type="button"
          className="btn btn-gradient w-fit"
          onClick={next}
        >
          {index + 1 < total
            ? t('quiz.next')
            : t('quiz.finish')}
        </button>
      )}
    </div>
  )
}
