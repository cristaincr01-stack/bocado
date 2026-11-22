import { useEffect, useState, useCallback } from 'react'
import { MapPin } from 'lucide-react'
import { supabase } from './lib.js'
import { CustomerApp } from './Shop.jsx'
import { BusinessDashboard, CourierWork } from './Work.jsx'
import { VerifiedBadge } from './Verified.jsx'
import { MyProfile, CourierProfile, SubscriptionBox, PaymentsAdmin, PricingAdmin } from './Profile.jsx'

const VERIF = { pendiente: 'En revisión', aprobado: 'Verificado', rechazado: 'Rechazado' }
const TIER_LABEL = { basico: 'Básico', pro: 'Pro', premium: 'Premium' }
const BUSINESS_TIERS = ['basico', 'pro', 'premium']
const COURIER_TIERS = ['basico', 'pro', 'premium']
const CATEGORIES = [
  'Comida casera',
  'Comida rápida',
  'Pizzería',
  'Cafetería',
  'Dulcería y repostería',
  'Otra',
]
const VEHICLES = ['Moto', 'Bicicleta', 'Triciclo', 'A pie', 'Carro']

function Badge({ status, tier }) {
  if (status === 'aprobado' && tier) {
    return (
      <span className="badge aprobado" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <VerifiedBadge tier={tier} size={16} /> {VERIF[status]}
      </span>
    )
  }
  return <span className={`badge ${status}`}>{VERIF[status] || status}</span>
}

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Tu navegador no permite leer la ubicación.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () =>
        reject(
          new Error('No pudimos leer tu ubicación. Activa el permiso de ubicación del navegador.')
        ),
      { enableHighAccuracy: true, timeout: 15000 }
    )
  })
}


/* Solo deja pasar a las funciones si la suscripción está activa */
function SubscriptionGate({ kind, profileId, children }) {
  const [state, setState] = useState('loading')

  useEffect(() => {
    supabase
      .from('subscriptions')
      .select('status, ends_at')
      .eq('profile_id', profileId)
      .eq('kind', kind)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        const ok =
          data && data.status === 'activa' && data.ends_at && new Date(data.ends_at).getTime() > Date.now()
        setState(ok ? 'active' : 'inactive')
      })
  }, [kind, profileId])

  if (state === 'loading') return <p>Cargando...</p>
  if (state === 'active') return children
  return (
    <div className="stack">
      <div className="notice">
        Tu cuenta está verificada. Para usar las funciones, elige un plan y envía tu pago. Se activa
        cuando lo confirmemos.
      </div>
      <MyProfile />
      <SubscriptionBox kind={kind} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* CLIENTE                                                             */
/* ------------------------------------------------------------------ */

export function CustomerHome() {
  return <CustomerApp />
}

/* ------------------------------------------------------------------ */
/* NEGOCIO                                                             */
/* ------------------------------------------------------------------ */

export function BusinessPanel({ profile }) {
  const [business, setBusiness] = useState(undefined)
  const [form, setForm] = useState({
    name: '',
    category: CATEGORIES[0],
    address: '',
    phone: profile.phone || '',
    description: '',
  })
  const [pos, setPos] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  useEffect(() => {
    supabase
      .from('businesses')
      .select('*')
      .eq('owner_id', profile.id)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setBusiness(data || null))
  }, [profile.id])

  async function useMyLocation() {
    setMsg(null)
    try {
      setPos(await getPosition())
      setMsg({ type: 'ok', text: 'Ubicación guardada.' })
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    }
  }

  async function register(e) {
    e.preventDefault()
    setMsg(null)
    if (!form.name.trim() || !form.address.trim())
      return setMsg({ type: 'error', text: 'Completa el nombre y la dirección del negocio.' })
    if (!pos)
      return setMsg({
        type: 'error',
        text: 'Estando en tu negocio, toca "Usar mi ubicación" para que los repartidores sepan dónde recoger.',
      })

    setBusy(true)
    const { data, error } = await supabase
      .from('businesses')
      .insert({
        owner_id: profile.id,
        name: form.name.trim(),
        category: form.category,
        address: form.address.trim(),
        phone: form.phone.trim() || null,
        description: form.description.trim() || null,
        lat: pos.lat,
        lng: pos.lng,
      })
      .select()
      .single()
    setBusy(false)

    if (error) setMsg({ type: 'error', text: 'No pudimos registrar el negocio. Inténtalo de nuevo.' })
    else setBusiness(data)
  }

  async function toggleOpen() {
    const next = !business.is_open
    const { error } = await supabase.from('businesses').update({ is_open: next }).eq('id', business.id)
    if (!error) setBusiness({ ...business, is_open: next })
  }

  if (business === undefined) return <p>Cargando tu negocio...</p>

  if (business === null) {
    return (
      <form onSubmit={register}>
        <h3 className="section-title" style={{ marginTop: 0 }}>
          Registra tu negocio
        </h3>
        <label className="field">
          <span>Nombre del negocio</span>
          <input value={form.name} onChange={set('name')} />
        </label>
        <label className="field">
          <span>Categoría</span>
          <select value={form.category} onChange={set('category')}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Dirección</span>
          <input value={form.address} onChange={set('address')} />
        </label>
        <label className="field">
          <span>Teléfono del negocio</span>
          <input value={form.phone} onChange={set('phone')} inputMode="tel" />
        </label>
        <label className="field">
          <span>Descripción (opcional)</span>
          <textarea value={form.description} onChange={set('description')} />
        </label>

        <button type="button" className="btn secondary" onClick={useMyLocation}>
          <MapPin size={18} /> {pos ? 'Ubicación guardada' : 'Usar mi ubicación'}
        </button>
        <p className="hint" style={{ marginBottom: 14 }}>
          Hazlo estando en el local. Los repartidores cercanos se calculan desde aquí.
        </p>

        {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}
        <button className="btn" disabled={busy}>
          {busy ? 'Enviando...' : 'Enviar para verificación'}
        </button>
      </form>
    )
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="row">
          <h3>{business.name}</h3>
          <Badge status={business.verification_status} tier={business.tier} />
        </div>
        <p className="meta">{[business.category, business.address].filter(Boolean).join(' - ')}</p>
        <p className="meta">Nivel {TIER_LABEL[business.tier]}</p>
      </div>

      {business.verification_status === 'pendiente' && (
        <div className="msg ok">
          Estamos revisando tu negocio. Cuando lo verifiquemos podrás publicar tu menú y recibir
          pedidos.
        </div>
      )}
      {business.verification_status === 'rechazado' && (
        <div className="msg error">
          Tu solicitud no fue aprobada. Contáctanos para revisar los datos del negocio.
        </div>
      )}
      {business.verification_status === 'aprobado' && (
        <SubscriptionGate kind="negocio" profileId={profile.id}>
          <BusinessDashboard business={business} setBusiness={setBusiness} />
        </SubscriptionGate>
      )}
    </div>
  )
}


function CourierTabs({ courier, setCourier, msg, toggleOnline }) {
  const [tab, setTab] = useState('entregas')
  return (
    <>
      <div className="tabs">
        <button aria-pressed={tab === 'entregas'} onClick={() => setTab('entregas')}>
          Entregas
        </button>
        <button aria-pressed={tab === 'perfil'} onClick={() => setTab('perfil')}>
          Mi perfil
        </button>
      </div>
      {tab === 'entregas' && (
        <>
          <button
            className="switch"
            role="switch"
            aria-checked={courier.is_online}
            onClick={toggleOnline}
          >
            <span className="dot" />
            {courier.is_online ? 'Conectado: puedes recibir pedidos' : 'Desconectado'}
          </button>
          {courier.is_online && (
            <p className="hint">Mantén esta pantalla abierta para compartir tu ubicación.</p>
          )}
          {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}
          <CourierWork courier={courier} />
        </>
      )}
      {tab === 'perfil' && (
        <div className="stack">
          <MyProfile />
          <CourierProfile courier={courier} setCourier={setCourier} />
          <SubscriptionBox kind="repartidor" />
        </div>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* REPARTIDOR                                                          */
/* ------------------------------------------------------------------ */

export function CourierPanel({ profile }) {
  const [courier, setCourier] = useState(undefined)
  const [vehicle, setVehicle] = useState(VEHICLES[0])
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase
      .from('couriers')
      .select('*')
      .eq('id', profile.id)
      .maybeSingle()
      .then(({ data }) => setCourier(data || null))
  }, [profile.id])

  // Mientras esté conectado, enviamos su ubicación cada pocos segundos
  const online = courier?.is_online
  const courierId = courier?.id
  useEffect(() => {
    if (!online || !navigator.geolocation) return
    let last = 0
    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const now = Date.now()
        if (now - last < 8000) return
        last = now
        await supabase
          .from('couriers')
          .update({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            location_updated_at: new Date().toISOString(),
          })
          .eq('id', courierId)
      },
      () =>
        setMsg({
          type: 'error',
          text: 'No pudimos leer tu ubicación. Activa el permiso de ubicación del navegador.',
        }),
      { enableHighAccuracy: true, maximumAge: 5000 }
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [online, courierId])

  async function register(e) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const { data, error } = await supabase
      .from('couriers')
      .insert({ id: profile.id, vehicle })
      .select()
      .single()
    setBusy(false)
    if (error) setMsg({ type: 'error', text: 'No pudimos enviar tu solicitud. Inténtalo de nuevo.' })
    else setCourier(data)
  }

  async function toggleOnline() {
    setMsg(null)
    const next = !courier.is_online
    const patch = { is_online: next }
    if (next) {
      try {
        const p = await getPosition()
        patch.lat = p.lat
        patch.lng = p.lng
        patch.location_updated_at = new Date().toISOString()
      } catch (err) {
        return setMsg({ type: 'error', text: err.message })
      }
    }
    const { error } = await supabase.from('couriers').update(patch).eq('id', courier.id)
    if (error) setMsg({ type: 'error', text: 'No pudimos cambiar tu estado. Inténtalo de nuevo.' })
    else setCourier({ ...courier, ...patch })
  }

  if (courier === undefined) return <p>Cargando...</p>

  if (courier === null) {
    return (
      <form onSubmit={register}>
        <h3 className="section-title" style={{ marginTop: 0 }}>
          Solicita ser repartidor
        </h3>
        <label className="field">
          <span>¿En qué te mueves?</span>
          <select value={vehicle} onChange={(e) => setVehicle(e.target.value)}>
            {VEHICLES.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}
        <button className="btn" disabled={busy}>
          {busy ? 'Enviando...' : 'Enviar para verificación'}
        </button>
      </form>
    )
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="row">
          <h3>{courier.vehicle}</h3>
          <Badge status={courier.verification_status} tier={courier.tier} />
        </div>
        <p className="meta">Nivel {TIER_LABEL[courier.tier]}</p>
      </div>

      {courier.verification_status === 'pendiente' && (
        <div className="msg ok">
          Estamos revisando tu solicitud. Cuando te verifiquemos podrás conectarte y recibir
          pedidos.
        </div>
      )}
      {courier.verification_status === 'rechazado' && (
        <div className="msg error">
          Tu solicitud no fue aprobada. Contáctanos para revisar tus datos.
        </div>
      )}
      {courier.verification_status === 'aprobado' && (
        <SubscriptionGate kind="repartidor" profileId={profile.id}>
          <CourierTabs
            courier={courier}
            setCourier={setCourier}
            msg={msg}
            toggleOnline={toggleOnline}
          />
        </SubscriptionGate>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* ADMIN                                                               */
/* ------------------------------------------------------------------ */

function VerifyRow({ kind, item, tiers, onSaved }) {
  const [status, setStatus] = useState(item.verification_status)
  const [tier, setTier] = useState(item.tier)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const person = kind === 'negocio' ? item.owner : item.profile
  const title = kind === 'negocio' ? item.name : `${item.vehicle} - ${person?.full_name || 'Sin nombre'}`
  const detail =
    kind === 'negocio'
      ? [item.category, item.address].filter(Boolean).join(' - ')
      : 'Repartidor'

  async function save() {
    setBusy(true)
    setError('')
    const { error: err } = await supabase.rpc('admin_set_verification', {
      p_kind: kind,
      p_id: item.id,
      p_status: status,
      p_tier: tier,
    })
    setBusy(false)
    if (err) setError('No se pudo guardar el cambio.')
    else onSaved()
  }

  return (
    <div className="card">
      <div className="row">
        <h3>{title}</h3>
        <Badge status={item.verification_status} tier={item.tier} />
      </div>
      <p className="meta">{detail}</p>
      {person && (
        <p className="meta">
          {person.full_name}
          {person.phone ? ` - ${person.phone}` : ''}
        </p>
      )}
      <div className="inline-controls">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="pendiente">En revisión</option>
          <option value="aprobado">Aprobar</option>
          <option value="rechazado">Rechazar</option>
        </select>
        <select value={tier} onChange={(e) => setTier(e.target.value)}>
          {tiers.map((t) => (
            <option key={t} value={t}>
              Nivel {TIER_LABEL[t]}
            </option>
          ))}
        </select>
        <button className="btn small" onClick={save} disabled={busy}>
          {busy ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
      {error && <div className="msg error" style={{ marginTop: 10 }}>{error}</div>}
    </div>
  )
}

export function AdminPanel() {
  const [section, setSection] = useState('solicitudes')
  const [tab, setTab] = useState('pendiente')
  const [businesses, setBusinesses] = useState([])
  const [couriers, setCouriers] = useState([])
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [b, c] = await Promise.all([
      supabase
        .from('businesses')
        .select(
          'id, name, category, address, verification_status, tier, owner:profiles!owner_id(full_name, phone)'
        )
        .order('created_at', { ascending: false }),
      supabase
        .from('couriers')
        .select('id, vehicle, verification_status, tier, profile:profiles(full_name, phone)')
        .order('created_at', { ascending: false }),
    ])
    if (b.error || c.error) setError('No pudimos cargar las solicitudes.')
    else setError('')
    setBusinesses(b.data || [])
    setCouriers(c.data || [])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const bList = businesses.filter((x) => x.verification_status === tab)
  const cList = couriers.filter((x) => x.verification_status === tab)

  const count = (status) =>
    businesses.filter((x) => x.verification_status === status).length +
    couriers.filter((x) => x.verification_status === status).length

  return (
    <>
      <div className="tabs">
        <button aria-pressed={section === 'solicitudes'} onClick={() => setSection('solicitudes')}>
          Solicitudes
        </button>
        <button aria-pressed={section === 'pagos'} onClick={() => setSection('pagos')}>
          Pagos
        </button>
        <button aria-pressed={section === 'precios'} onClick={() => setSection('precios')}>
          Precios
        </button>
      </div>

      {section === 'pagos' && <PaymentsAdmin />}
      {section === 'precios' && <PricingAdmin />}
      {section === 'solicitudes' && (
        <>
      <div className="tabs">
        {['pendiente', 'aprobado', 'rechazado'].map((s) => (
          <button key={s} aria-pressed={tab === s} onClick={() => setTab(s)}>
            {VERIF[s]} ({count(s)})
          </button>
        ))}
      </div>

      {error && <div className="msg error">{error}</div>}

      {bList.length === 0 && cList.length === 0 && (
        <div className="empty">
          <strong>No hay solicitudes aquí</strong>
          Cuando alguien se registre aparecerá en esta lista.
        </div>
      )}

      {bList.length > 0 && <h3 className="section-title">Negocios</h3>}
      <div className="list">
        {bList.map((b) => (
          <VerifyRow key={b.id} kind="negocio" item={b} tiers={BUSINESS_TIERS} onSaved={load} />
        ))}
      </div>

      {cList.length > 0 && <h3 className="section-title">Repartidores</h3>}
      <div className="list">
        {cList.map((c) => (
          <VerifyRow key={c.id} kind="repartidor" item={c} tiers={COURIER_TIERS} onSaved={load} />
        ))}
      </div>
        </>
      )}
    </>
  )
}
