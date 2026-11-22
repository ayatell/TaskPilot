import { useEffect, useState } from 'react'
import { getToken } from './api'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Workspace from './pages/Workspace'

export default function App() {
  const [authed, setAuthed] = useState(() => !!getToken())
  const [view, setView] = useState<'login' | 'signup'>('login')

  useEffect(() => {
    const onLogout = () => setAuthed(false)
    window.addEventListener('auth:logout', onLogout)
    return () => window.removeEventListener('auth:logout', onLogout)
  }, [])

  if (authed) return <Workspace onLogout={() => { setAuthed(false); setView('login') }} />
  return view === 'login'
    ? <Login onSuccess={() => setAuthed(true)} onSwitch={() => setView('signup')} />
    : <Signup onSuccess={() => setAuthed(true)} onSwitch={() => setView('login')} />
}