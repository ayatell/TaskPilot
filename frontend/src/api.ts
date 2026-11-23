import type {
  ChatResponse,
  DocumentOut,
  Plan,
  Task,
  TaskCreate,
  SavedItem,
  QuizData,
  Conversation,
  ConversationOut,
  MessageOut,
  SummaryData,
} from './types'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const KEY = 'token'

export const getToken = (): string | null => {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export const setToken = (token: string | null) => {
  try {
    if (token) localStorage.setItem(KEY, token)
    else localStorage.removeItem(KEY)
  } catch {
    /* storage unavailable */
  }
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers)
  const token = getToken()

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  // Let the browser set Content-Type for FormData and URLSearchParams.
  if (typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  let res: Response

  try {
    res = await fetch(BASE + path, {
      ...init,
      headers,
    })
  } catch {
    throw new ApiError(0, 'Server unreachable')
  }

  if (res.status === 401 && path !== '/auth/login') {
    setToken(null)
    window.dispatchEvent(new Event('auth:logout'))
  }

  if (!res.ok) {
    let detail = res.statusText

    try {
      const body = await res.json()
      detail =
        typeof body.detail === 'string'
          ? body.detail
          : JSON.stringify(body.detail)
    } catch {
      /* response is not JSON */
    }

    throw new ApiError(res.status, detail)
  }

  if (res.status === 204) {
    return undefined as T
  }

  return res.json() as Promise<T>
}

const json = (body: unknown) => JSON.stringify(body)

export const api = {
  // ---------- AUTH ----------

  register: (email: string, password: string, lang: 'fr' | 'en' = 'fr') =>
    request('/auth/register', {
      method: 'POST',
      body: json({ email, password, lang }),
    }),

  async login(email: string, password: string) {
    const form = new URLSearchParams({
      username: email,
      password,
    })

    const data = await request<{ access_token: string }>('/auth/login', {
      method: 'POST',
      body: form,
    })

    setToken(data.access_token)
    return data
  },

  // ---------- TASKS ----------

  tasks: () => request<Task[]>('/tasks'),

  createTask: (task: TaskCreate) =>
    request<Task>('/tasks', {
      method: 'POST',
      body: json(task),
    }),

  createTasksBulk: (tasks: TaskCreate[]) =>
    request<Task[]>('/tasks/bulk', {
      method: 'POST',
      body: json({ tasks }),
    }),

  markDone: (id: number, actualMinutes: number) =>
    request<Task>(`/tasks/${id}`, {
      method: 'PATCH',
      body: json({
        status: 'done',
        actual_minutes: actualMinutes,
      }),
    }),

  deleteTask: (id: number) =>
    request<void>(`/tasks/${id}`, {
      method: 'DELETE',
    }),

  // ---------- PLANNING ----------

  plan: (availability: Record<string, number>) =>
    request<Plan>('/planning/generate', {
      method: 'POST',
      body: json({ availability }),
    }),

  // ---------- CHAT ----------

  chat: (message: string, conversationId?: number | null) =>
    request<ChatResponse>('/chat', {
      method: 'POST',
      body: json({
        message,
        conversation_id: conversationId ?? null,
      }),
    }),

  // ---------- CONVERSATIONS ----------

  conversations: () => request<Conversation[]>('/conversations'),

  createConversation: (title = 'New conversation') =>
    request<Conversation>('/conversations', {
      method: 'POST',
      body: json({ title }),
    }),

  conversationMessages: (id: number) =>
    request<MessageOut[]>(`/conversations/${id}/messages`),

  // role defaults to "assistant"; use "user" to store a typed prompt.
  // (the backend MessageCreate schema must accept "user")
  createConversationMessage: (
    id: number,
    content: string,
    metadata?: Record<string, unknown>,
    role: 'user' | 'assistant' = 'assistant',
  ) =>
    request<MessageOut>(`/conversations/${id}/messages`, {
      method: 'POST',
      body: json({
        role,
        content,
        metadata_json: metadata ?? null,
      }),
    }),

  renameConversation: (id: number, title: string) =>
    request<ConversationOut>(`/conversations/${id}`, {
      method: 'PATCH',
      body: json({ title }),
    }),

  updateConversation: (id: number, data: { title?: string }) =>
    request<Conversation>(`/conversations/${id}`, {
      method: 'PATCH',
      body: json(data),
    }),

  deleteConversation: (id: number) =>
    request<void>(`/conversations/${id}`, {
      method: 'DELETE',
    }),

  // ---------- DOCUMENTS ----------

  documents: () => request<DocumentOut[]>('/documents'),

  uploadDocument: (file: File) => {
    const form = new FormData()
    form.append('file', file)

    return request<DocumentOut>('/documents', {
      method: 'POST',
      body: form,
    })
  },

  // ---------- LIBRARY ----------

  library: () => request<SavedItem[]>('/library'),

  saveItem: (kind: 'quiz' | 'summary', title: string, content: string) =>
    request<SavedItem>('/library', {
      method: 'POST',
      body: json({ kind, title, content }),
    }),

  deleteItem: (id: number) =>
    request<void>(`/library/${id}`, {
      method: 'DELETE',
    }),

  // ---------- QUIZZES ----------

  generateQuiz: (
    count = 5,
    opts: { documentIds?: number[]; fromTasks?: boolean } = {},
  ) =>
    request<QuizData>('/quiz/generate', {
      method: 'POST',
      body: json({
        count,
        document_ids: opts.documentIds ?? null,
        from_tasks: opts.fromTasks ?? false,
      }),
    }),

  // ---------- SUMMARIES ----------

  generateSummary: (documentIds?: number[]) =>
    request<SummaryData>('/summaries/generate', {
      method: 'POST',
      body: json({ document_ids: documentIds ?? null }),
    }),
}

export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : String(e)