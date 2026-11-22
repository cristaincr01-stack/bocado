import { useEffect, useState, useCallback } from 'react'
import { MapPin, LayoutDashboard, ClipboardCheck, Wallet, Tag, Lock, Store, Bike, Users, PackageCheck, User, Wrench } from 'lucide-react'
import { TierTools } from './Tools.jsx'
import { supabase } from './lib.js'
import { CustomerApp } from './Shop.jsx'
import { BusinessDashboard, CourierWork } from './Work.jsx'
import { VerifiedBadge } from './Verified.jsx'
import { Select, PillNav, SegNav } from './ui.jsx'
import { money } from './utils.js'
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
      <MyProfile role={kind} />
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

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const n = data.user?.user_metadata?.business_name
      if (n) setForm((f) => (f.name ? f : { ...f, name: n }))
    })
  }, [])

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
        <div className="field">
          <span>Categoría</span>
          <Select
            title="Categoría"
            value={form.category}
            onChange={(v) => setForm({ ...form, category: v })}
            options={CATEGORIES}
          />
        </div>
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
      <PillNav
        items={[
          { id: 'entregas', label: 'Entregas', Icon: Bike },
          { id: 'herramientas', label: 'Herramientas', Icon: Wrench },
          { id: 'perfil', label: 'Mi perfil', Icon: User },
        ]}
        value={tab}
        onChange={setTab}
      />
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
      {tab === 'herramientas' && (
        <TierTools kind="repartidor" tier={courier.tier} onUpgrade={() => setTab('perfil')} />
      )}
      {tab === 'perfil' && (
        <div className="stack">
          <MyProfile role="repartidor" />
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
    const { data: u } = await supabase.auth.getUser()
    const display_name = u.user?.user_metadata?.public_name || null
    const { data, error } = await supabase
      .from('couriers')
      .insert({ id: profile.id, vehicle, display_name })
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
        <div className="field">
          <span>¿En qué te mueves?</span>
          <Select title="¿En qué te mueves?" value={vehicle} onChange={setVehicle} options={VEHICLES} />
        </div>
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

function VerifyRow({ kind, item, tiers, onSaved, done }) {
  const [status, setStatus] = useState(item.verification_status)
  const [tier, setTier] = useState(item.tier)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const person = kind === 'negocio' ? item.owner : item.profile
  const title = kind === 'negocio' ? item.name : item.display_name || person?.full_name || 'Repartidor'
  const detail =
    kind === 'negocio'
      ? [item.category, item.address].filter(Boolean).join(' - ')
      : `Repartidor - ${item.vehicle || 'sin vehículo'}`
  const doneText = done === undefined ? null : `${done} ${done === 1 ? 'pedido entregado' : 'pedidos entregados'}`
  const initial = (title || '?').trim().charAt(0).toUpperCase()

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
      <div className="adm-head">
        <div className="adm-avatar">{initial}</div>
        <div className="grow">
          <h3>{title}</h3>
          <p className="meta" style={{ margin: 0 }}>
            {detail}
          </p>
          {doneText && item.verification_status === 'aprobado' && (
            <p className="meta" style={{ margin: 0, fontWeight: 700 }}>
              {doneText}
            </p>
          )}
        </div>
        <Badge status={item.verification_status} tier={item.tier} />
      </div>

      {person && (
        <div className="adm-owner">
          <Lock size={16} />
          <div>
            <small>{kind === 'negocio' ? 'Propietario (privado)' : 'Nombre completo (privado)'}</small>
            {person.full_name || 'Sin nombre'}
            {person.phone ? ` - ${person.phone}` : ''}
          </div>
        </div>
      )}

      <div className="adm-controls">
        <Select
          title="Estado"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'pendiente', label: 'En revisión' },
            { value: 'aprobado', label: 'Aprobar' },
            { value: 'rechazado', label: 'Rechazar' },
          ]}
        />
        <Select
          title="Nivel"
          value={tier}
          onChange={setTier}
          options={tiers.map((t) => ({ value: t, label: `Nivel ${TIER_LABEL[t]}` }))}
        />
        <button className="btn small" onClick={save} disabled={busy}>
          {busy ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
      {error && <div className="msg error" style={{ marginTop: 10 }}>{error}</div>}
    </div>
  )
}

const ADMIN_SECTIONS = [
  ['resumen', 'Resumen', LayoutDashboard],
  ['solicitudes', 'Solicitudes', ClipboardCheck],
  ['pagos', 'Pagos', Wallet],
  ['precios', 'Precios', Tag],
]

export function AdminPanel() {
  const [section, setSection] = useState('resumen')
  const [tab, setTab] = useState('pendiente')
  const [businesses, setBusinesses] = useState([])
  const [couriers, setCouriers] = useState([])
  const [pendingPayments, setPendingPayments] = useState(0)
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [b, c, pay, st] = await Promise.all([
      supabase
        .from('businesses')
        .select(
          'id, name, category, address, verification_status, tier, owner:profiles!owner_id(full_name, phone)'
        )
        .order('created_at', { ascending: false }),
      supabase
        .from('couriers')
        .select('id, vehicle, display_name, verification_status, tier, profile:profiles(full_name, phone)')
        .order('created_at', { ascending: false }),
      supabase
        .from('subscription_payments')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pendiente'),
      supabase.rpc('admin_stats'),
    ])
    if (b.error || c.error) setError('No pudimos cargar las solicitudes.')
    else setError('')
    setBusinesses(b.data || [])
    setCouriers(c.data || [])
    setPendingPayments(pay.count || 0)
    setStats(st.error ? null : st.data)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const bList = businesses.filter((x) => x.verification_status === tab)
  const cList = couriers.filter((x) => x.verification_status === tab)

  const count = (status) =>
    businesses.filter((x) => x.verification_status === status).length +
    couriers.filter((x) => x.verification_status === status).length

  const pending = count('pendiente')
  const activeBusinesses = businesses.filter((x) => x.verification_status === 'aprobado').length
  const activeCouriers = couriers.filter((x) => x.verification_status === 'aprobado').length

  const doneBiz = Object.fromEntries(((stats && stats.by_business) || []).map((x) => [x.id, x.done]))
  const doneCou = Object.fromEntries(((stats && stats.by_courier) || []).map((x) => [x.id, x.done]))
  const topBiz = ((stats && stats.by_business) || []).filter((x) => x.done > 0).slice(0, 5)
  const topCou = ((stats && stats.by_courier) || []).filter((x) => x.done > 0).slice(0, 5)

  const badgeFor = (id) => (id === 'solicitudes' ? pending : id === 'pagos' ? pendingPayments : 0)

  function go(id, nextTab) {
    if (nextTab) setTab(nextTab)
    setSection(id)
    if (id === 'solicitudes' || id === 'resumen') load()
  }

  return (
    <>
      <PillNav
        items={ADMIN_SECTIONS.map(([id, label, Icon]) => ({ id, label, Icon, badge: badgeFor(id) }))}
        value={section}
        onChange={(id) => go(id)}
      />

      {error && <div className="msg error">{error}</div>}

      {section === 'resumen' && (
        <>
          <div className="adm-stats">
            <button
              className={`adm-stat ${pending > 0 ? 'alert' : ''}`}
              onClick={() => go('solicitudes', 'pendiente')}
            >
              <ClipboardCheck size={22} />
              <b>{pending}</b>
              <span>Solicitudes por revisar</span>
            </button>
            <button
              className={`adm-stat ${pendingPayments > 0 ? 'alert' : ''}`}
              onClick={() => go('pagos')}
            >
              <Wallet size={22} />
              <b>{pendingPayments}</b>
              <span>Pagos por confirmar</span>
            </button>
            <div className="adm-stat static">
              <Users size={22} />
              <b>{stats ? stats.customers : '-'}</b>
              <span>Clientes registrados</span>
            </div>
            <div className="adm-stat static">
              <PackageCheck size={22} />
              <b>{stats ? stats.orders_done : '-'}</b>
              <span>Pedidos completados</span>
            </div>
            <button className="adm-stat" onClick={() => go('solicitudes', 'aprobado')}>
              <Store size={22} />
              <b>{activeBusinesses}</b>
              <span>Negocios verificados</span>
            </button>
            <button className="adm-stat" onClick={() => go('solicitudes', 'aprobado')}>
              <Bike size={22} />
              <b>{activeCouriers}</b>
              <span>Repartidores verificados</span>
            </button>
          </div>

          <h3 className="section-title">Mejores negocios</h3>
          {topBiz.length === 0 ? (
            <p className="hint">Aún no hay pedidos entregados.</p>
          ) : (
            <div className="card adm-rank">
              {topBiz.map((x, i) => (
                <div className="adm-rank-row" key={x.id}>
                  <span className="pos">{i + 1}</span>
                  <span className="name">{x.name}</span>
                  <span className="val">
                    {x.done} {x.done === 1 ? 'pedido' : 'pedidos'}
                    <small>{money(x.sales)}</small>
                  </span>
                </div>
              ))}
            </div>
          )}

          <h3 className="section-title">Mejores repartidores</h3>
          {topCou.length === 0 ? (
            <p className="hint">Aún no hay entregas completadas.</p>
          ) : (
            <div className="card adm-rank">
              {topCou.map((x, i) => (
                <div className="adm-rank-row" key={x.id}>
                  <span className="pos">{i + 1}</span>
                  <span className="name">{x.name}</span>
                  <span className="val">
                    {x.done} {x.done === 1 ? 'entrega' : 'entregas'}
                  </span>
                </div>
              ))}
            </div>
          )}

          <button className="adm-stat" style={{ width: '100%', marginTop: 18 }} onClick={() => go('precios')}>
            <Tag size={22} />
            <span>Cambiar precios de los planes y datos de cobro</span>
          </button>
        </>
      )}

      {section === 'solicitudes' && (
        <>
          <SegNav
            items={['pendiente', 'aprobado', 'rechazado'].map((s) => ({ id: s, label: `${VERIF[s]} (${count(s)})` }))}
            value={tab}
            onChange={setTab}
          />

          {bList.length === 0 && cList.length === 0 && (
            <div className="empty">
              <strong>No hay solicitudes aquí</strong>
              Cuando alguien se registre aparecerá en esta lista.
            </div>
          )}

          {bList.length > 0 && <h3 className="section-title">Negocios</h3>}
          <div className="list">
            {bList.map((b) => (
              <VerifyRow
                key={b.id}
                kind="negocio"
                item={b}
                tiers={BUSINESS_TIERS}
                onSaved={load}
                done={stats ? doneBiz[b.id] || 0 : undefined}
              />
            ))}
          </div>

          {cList.length > 0 && <h3 className="section-title">Repartidores</h3>}
          <div className="list">
            {cList.map((c) => (
              <VerifyRow
                key={c.id}
                kind="repartidor"
                item={c}
                tiers={COURIER_TIERS}
                onSaved={load}
                done={stats ? doneCou[c.id] || 0 : undefined}
              />
            ))}
          </div>
        </>
      )}

      {section === 'pagos' && <PaymentsAdmin />}
      {section === 'precios' && <PricingAdmin />}
    </>
  )
}
