import { useEffect, useState } from 'react'
import { ShoppingBag, Store, Bike, LogOut } from 'lucide-react'
import { supabase, APP_NAME, CITY } from './lib.js'
import { CustomerHome, BusinessPanel, CourierPanel, AdminPanel } from './Panels.jsx'

const ROLES = [
  { id: 'cliente', label: 'Quiero pedir', Icon: ShoppingBag },
  { id: 'negocio', label: 'Tengo un negocio', Icon: Store },
  { id: 'repartidor', label: 'Quiero repartir', Icon: Bike },
]

const ROLE_NAMES = {
  cliente: 'Cliente',
  negocio: 'Negocio',
  repartidor: 'Repartidor',
  admin: 'Administrador',
}

function translateError(message = '') {
  const m = message.toLowerCase()
  if (m.includes('invalid login')) return 'Correo o contraseña incorrectos.'
  if (m.includes('already registered') || m.includes('already been registered'))
    return 'Ese correo ya tiene una cuenta. Prueba entrando.'
  if (m.includes('email not confirmed')) return 'Primero confirma tu correo y luego entra.'
  if (m.includes('rate limit')) return 'Demasiados intentos. Espera unos minutos y prueba de nuevo.'
  if (m.includes('password')) return 'La contraseña debe tener al menos 6 caracteres.'
  if (m.includes('email')) return 'Revisa que el correo esté bien escrito.'
  if (m.includes('failed to fetch') || m.includes('network'))
    return 'No hay conexión. Revisa tu internet e inténtalo de nuevo.'
  return 'No pudimos completar la acción. Inténtalo de nuevo.'
}

function AuthScreen() {
  const [mode, setMode] = useState('entrar')
  const [role, setRole] = useState('cliente')
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setMsg(null)

    if (mode === 'crear') {
      if (!form.name.trim()) return setMsg({ type: 'error', text: 'Escribe tu nombre.' })
      if (role !== 'cliente' && !form.phone.trim())
        return setMsg({ type: 'error', text: 'Escribe tu teléfono para que podamos contactarte.' })
      if (form.password.length < 6)
        return setMsg({ type: 'error', text: 'La contraseña debe tener al menos 6 caracteres.' })
    }

    setBusy(true)
    try {
      if (mode === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({
          email: form.email.trim(),
          password: form.password,
        })
        if (error) throw error
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: form.email.trim(),
          password: form.password,
          options: {
            data: { full_name: form.name.trim(), phone: form.phone.trim(), role },
          },
        })
        if (error) throw error
        if (!data.session) {
          setMsg({
            type: 'ok',
            text: 'Cuenta creada. Revisa tu correo para confirmarla y luego entra.',
          })
        }
      }
    } catch (err) {
      setMsg({ type: 'error', text: translateError(err.message) })
    }
    setBusy(false)
  }

  return (
    <div className="auth-page">
      <div className="hero">
        <h1>{APP_NAME}</h1>
        <p>Pide comida en {CITY} y mira tu pedido llegar en el mapa.</p>
      </div>

      <div className="sheet">
        <div className="auth">
          <div className="segmented">
            <button type="button" aria-pressed={mode === 'entrar'} onClick={() => setMode('entrar')}>
              Entrar
            </button>
            <button type="button" aria-pressed={mode === 'crear'} onClick={() => setMode('crear')}>
              Crear cuenta
            </button>
          </div>

          <form onSubmit={submit}>
            {mode === 'crear' && (
              <>
                <p className="question">¿Cómo vas a usar {APP_NAME}?</p>
                <div className="doors">
                  {ROLES.map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      className="door"
                      aria-pressed={role === id}
                      onClick={() => setRole(id)}
                    >
                      <Icon size={26} />
                      {label}
                    </button>
                  ))}
                </div>

                <label className="field">
                  <span>Nombre</span>
                  <input value={form.name} onChange={set('name')} autoComplete="name" />
                </label>
                <label className="field">
                  <span>Teléfono{role === 'cliente' ? ' (opcional)' : ''}</span>
                  <input
                    value={form.phone}
                    onChange={set('phone')}
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="5X XXX XXX"
                  />
                </label>
              </>
            )}

            <label className="field">
              <span>Correo</span>
              <input
                type="email"
                value={form.email}
                onChange={set('email')}
                autoComplete="email"
                required
              />
            </label>
            <label className="field">
              <span>Contraseña</span>
              <input
                type="password"
                value={form.password}
                onChange={set('password')}
                autoComplete={mode === 'entrar' ? 'current-password' : 'new-password'}
                required
              />
            </label>

            {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}

            <button className="btn" disabled={busy}>
              {busy ? 'Un momento...' : mode === 'entrar' ? 'Entrar' : 'Crear mi cuenta'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

async function loadProfile(userId) {
  for (let i = 0; i < 3; i++) {
    const { data } = await supabase
      .from('profiles')
      .select('id, role, full_name, phone')
      .eq('id', userId)
      .maybeSingle()
    if (data) return data
    await new Promise((r) => setTimeout(r, 600))
  }
  return null
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [loadingProfile, setLoadingProfile] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const userId = session?.user?.id

  useEffect(() => {
    if (!userId) {
      setProfile(null)
      return
    }
    let cancelled = false
    setLoadingProfile(true)
    loadProfile(userId).then((p) => {
      if (!cancelled) {
        setProfile(p)
        setLoadingProfile(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  if (session === undefined) return <div className="splash">{APP_NAME}</div>
  if (!session) return <AuthScreen />

  const firstName = profile?.full_name?.split(' ')[0] || ''

  return (
    <div className="shell">
      <header className="topbar">
        <span className="wordmark">{APP_NAME}</span>
        <button className="ghost" onClick={() => supabase.auth.signOut()}>
          <LogOut size={16} /> Salir
        </button>
      </header>

      <main className="content">
        {loadingProfile && <p>Cargando tu cuenta...</p>}

        {!loadingProfile && !profile && (
          <div className="msg error">
            No pudimos cargar tu cuenta. Sal e inténtalo de nuevo en un momento.
          </div>
        )}

        {profile && (
          <>
            <div className="greeting">
              <h2>Hola{firstName ? `, ${firstName}` : ''}</h2>
              <p>Cuenta de {ROLE_NAMES[profile.role].toLowerCase()}</p>
            </div>

            {profile.role === 'cliente' && <CustomerHome />}
            {profile.role === 'negocio' && <BusinessPanel profile={profile} />}
            {profile.role === 'repartidor' && <CourierPanel profile={profile} />}
            {profile.role === 'admin' && <AdminPanel />}
          </>
        )}
      </main>
    </div>
  )
}
