export type Task = {
  id: number
  title: string
  description: string | null
  subject: string | null
  priority: number
  status: 'todo' | 'doing' | 'done'
  due_date: string | null
  estimated_minutes: number
  actual_minutes: number | null
}

export type TaskCreate = {
  title: string
  description?: string | null
  subject?: string | null
  priority?: number
  due_date?: string | null
  estimated_minutes?: number
}

export type Block = { task_id: number; title: string; day: string; minutes: number }
export type Plan = { blocks: Block[]; unscheduled: number[]; warnings: string[] }

export type ProposedAction = { type: 'create_task'; task: TaskCreate }

export type RankedTask = {
  task_id: number
  title: string
  due_date: string | null
  priority: number
  score: number
  quadrant: 'do_now' | 'schedule' | 'quick' | 'later'
  reason: string
}

export type ChatResponse = {
  conversation_id: number
  reply: string
  actions: ProposedAction[]
  ranking: RankedTask[] | null
}

export type DocumentOut = { id: number; filename: string; created_at: string }

export type SavedItem = {
  id: number
  kind: 'quiz' | 'summary'
  title: string
  content: string
  created_at: string
}

export type QuizQuestion = {
  question: string
  options: string[]
  answer: number
  explanation: string
}
export type QuizData = { title: string; questions: QuizQuestion[] }