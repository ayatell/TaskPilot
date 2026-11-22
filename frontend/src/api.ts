import type { ChatResponse, DocumentOut, Plan, Task, TaskCreate, SavedItem, QuizData } from './types'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const KEY = 'token'

export const getToken = (): string | null => {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export const setToken = (t: string | null) => {
  try {
    if (t) localStorage.setItem(KEY, t)
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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  // JSON only for string bodies. For FormData and URLSearchParams the browser
  // sets the right Content-Type itself (multipart boundary, urlencoded).
  if (typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  let res: Response
  try {
    res = await fetch(BASE + path, { ...init, headers })
  } catch {
    throw new ApiError(0, 'Server unreachable')
  }

  // expired or invalid token: log out (but not for a failed login attempt)
  if (res.status === 401 && path !== '/auth/login') {
    setToken(null)
    window.dispatchEvent(new Event('auth:logout'))
  }

  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, detail)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

const json = (body: unknown) => JSON.stringify(body)

export const api = {
  // ---------- auth ----------
  register: (email: string, password: string, lang: 'fr' | 'en' = 'fr') =>
    request('/auth/register', { method: 'POST', body: json({ email, password, lang }) }),

  async login(email: string, password: string) {
    // /auth/login is form-encoded, and the email goes in the "username" field
    const form = new URLSearchParams({ username: email, password })
    const data = await request<{ access_token: string }>('/auth/login', {
      method: 'POST',
      body: form,
    })
    setToken(data.access_token)
    return data
  },

  // ---------- tasks ----------
  tasks: () => request<Task[]>('/tasks'),

  createTask: (task: TaskCreate) =>
    request<Task>('/tasks', { method: 'POST', body: json(task) }),

  createTasksBulk: (tasks: TaskCreate[]) =>
    request<Task[]>('/tasks/bulk', { method: 'POST', body: json({ tasks }) }),

  markDone: (id: number, actualMinutes: number) =>
    request<Task>(`/tasks/${id}`, {
      method: 'PATCH',
      body: json({ status: 'done', actual_minutes: actualMinutes }),
    }),

  deleteTask: (id: number) => request<void>(`/tasks/${id}`, { method: 'DELETE' }),

  // ---------- planning ----------
  plan: (availability: Record<string, number>) =>
    request<Plan>('/planning/generate', { method: 'POST', body: json({ availability }) }),

  // ---------- chat ----------
  chat: (message: string, conversationId?: number | null) =>
    request<ChatResponse>('/chat', {
      method: 'POST',
      body: json({ message, conversation_id: conversationId ?? null }),
    }),

  // ---------- documents ----------
  documents: () => request<DocumentOut[]>('/documents'),

  uploadDocument: (file: File) => {
    const form = new FormData()
    form.append('file', file) // the field name must be "file"
    return request<DocumentOut>('/documents', { method: 'POST', body: form })
  },

  library: () => request<SavedItem[]>('/library'),
  saveItem: (kind: 'quiz' | 'summary', title: string, content: string) =>
    request<SavedItem>('/library', { method: 'POST', body: json({ kind, title, content }) }),
  deleteItem: (id: number) => request<void>(`/library/${id}`, { method: 'DELETE' }),

  generateQuiz: (count = 5, documentId?: number) =>
  request<QuizData>('/quiz/generate', {
      method: 'POST',
      body: json({ count, document_id: documentId ?? null }),
    }),
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e))
