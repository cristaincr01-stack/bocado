import { useEffect, useState, useCallback } from 'react'
import { MapPin } from 'lucide-react'
import { supabase } from './lib.js'
import { getPosition } from './utils.js'
import { VerifiedBadge } from './Verified.jsx'
import { Select, FilePick, SegNav } from './ui.jsx'

const TIER_NAME = { basico: 'Básico', pro: 'Pro', premium: 'Premium' }
const TIERS = ['basico', 'pro', 'premium']

const CATEGORIES = [
  'Comida casera',
  'Comida rápida',
  'Pizzería',
  'Cafetería',
  'Dulcería y repostería',
  'Otra',
]
const VEHICLES = ['Moto', 'Bicicleta', 'Triciclo', 'A pie', 'Carro']

const FEATURES = {
  negocio: {
    basico: [
      'Menú y pedidos',
      'Horario automático',
      'Aviso de pedido nuevo',
      'Mapa del repartidor',
      'Cupones de descuento',
      'Cliente habitual (premios)',
      'Marcar productos agotados',
      'Hasta 30 productos',
    ],
    pro: [
      'Todo lo Básico',
      'Productos ilimitados',
      'Estadísticas de ventas',
      'Mejor posición en la lista',
      'Aviso a clientes cercanos (próximamente)',
    ],
    premium: [
      'Todo lo Pro',
      'Cuadre de ventas e inventario (próximamente)',
      'Sección Destacados',
      'Soporte prioritario',
    ],
  },
  repartidor: {
    basico: ['Ofertas a 3 km', 'Mapa y ruta', 'Historial y ganancias del día'],
    pro: [
      'Todo lo Básico',
      'Ofertas antes que los Básico',
      'Radio de 5 km',
      'Ganancias por semana y mes',
    ],
    premium: [
      'Todo lo Pro',
      'Primera prioridad en ofertas',
      'Radio de 8 km',
      'Estadísticas de rendimiento',
      'Soporte prioritario',
    ],
  },
}

const METHOD_LABEL = {
  transfermovil_enzona: 'Transfermóvil / EnZona',
  qvapay: 'Qvapay',
  usdt: 'USDT (Trust Wallet)',
}

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })
}

function priceText(plan) {
  if (!plan) return 'Precio por definir'
  const parts = []
  if (plan.price_cup != null) parts.push(`${Number(plan.price_cup)} CUP`)
  if (plan.price_usd != null) parts.push(`${Number(plan.price_usd)} USD`)
  return parts.length ? parts.join(' · ') : 'Precio por definir'
}

/* ------------------------------------------------------------------ */
/* Mis datos (todas las cuentas)                                       */
/* ------------------------------------------------------------------ */

export function MyProfile({ role = 'cliente' }) {
  const [uid, setUid] = useState(null)
  const [form, setForm] = useState({ full_name: '', phone: '' })
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const id = data.user?.id
      if (!id) return
      setUid(id)
      const { data: p } = await supabase
        .from('profiles')
        .select('full_name, phone')
        .eq('id', id)
        .maybeSingle()
      if (p) setForm({ full_name: p.full_name || '', phone: p.phone || '' })
    })
  }, [])

  async function save(e) {
    e.preventDefault()
    setMsg(null)
    if (!form.full_name.trim()) return setMsg({ type: 'error', text: 'Escribe tu nombre.' })
    if (!form.phone.trim()) return setMsg({ type: 'error', text: 'Escribe tu teléfono.' })
    setBusy(true)
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: form.full_name.trim(), phone: form.phone.trim() })
      .eq('id', uid)
    setBusy(false)
    if (error) setMsg({ type: 'error', text: 'No pudimos guardar tus datos.' })
    else setMsg({ type: 'ok', text: 'Datos guardados.' })
  }

  return (
    <form className="card" onSubmit={save}>
      <h3 className="section-title" style={{ marginTop: 0 }}>
        {role === 'negocio' ? 'Datos del propietario' : 'Mis datos'}
      </h3>
      <label className="field">
        <span>
          {role === 'negocio'
            ? 'Nombre del propietario'
            : role === 'repartidor'
              ? 'Nombre completo'
              : 'Nombre y apellidos'}
        </span>
        <input
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          autoComplete="name"
        />
        {role === 'negocio' && (
          <p className="hint">Solo lo ve el administrador. Tus clientes ven el nombre de tu negocio.</p>
        )}
        {role === 'repartidor' && <p className="hint">Solo lo ve el administrador.</p>}
      </label>
      <label className="field">
        <span>Teléfono</span>
        <input
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          inputMode="tel"
          autoComplete="tel"
        />
      </label>
      {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}
      <button className="btn small" disabled={busy || !uid}>
        {busy ? 'Guardando...' : 'Guardar mis datos'}
      </button>
    </form>
  )
}

/* ------------------------------------------------------------------ */
/* Datos del negocio                                                   */
/* ------------------------------------------------------------------ */

export function BusinessProfile({ business, setBusiness }) {
  const [f, setF] = useState({
    name: business.name || '',
    category: business.category || CATEGORIES[0],
    address: business.address || '',
    phone: business.phone || '',
    description: business.description || '',
  })
  const [pos, setPos] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const set = (key) => (e) => setF({ ...f, [key]: e.target.value })

  async function useMyLocation() {
    setMsg(null)
    try {
      setPos(await getPosition())
      setMsg({ type: 'ok', text: 'Ubicación nueva lista. Toca "Guardar datos del negocio".' })
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    }
  }

  async function save(e) {
    e.preventDefault()
    setMsg(null)
    if (!f.name.trim() || !f.address.trim())
      return setMsg({ type: 'error', text: 'Completa el nombre y la dirección.' })
    const patch = {
      name: f.name.trim(),
      category: f.category,
      address: f.address.trim(),
      phone: f.phone.trim() || null,
      description: f.description.trim() || null,
    }
    if (pos) {
      patch.lat = pos.lat
      patch.lng = pos.lng
    }
    setBusy(true)
    const { error } = await supabase.from('businesses').update(patch).eq('id', business.id)
    setBusy(false)
    if (error) setMsg({ type: 'error', text: 'No pudimos guardar los cambios.' })
    else {
      setBusiness({ ...business, ...patch })
      setPos(null)
      setMsg({ type: 'ok', text: 'Datos del negocio guardados.' })
    }
  }

  return (
    <form className="card" onSubmit={save}>
      <h3 className="section-title" style={{ marginTop: 0 }}>
        Datos del negocio
      </h3>
      <label className="field">
        <span>Nombre del negocio</span>
        <input value={f.name} onChange={set('name')} />
      </label>
      <div className="field">
        <span>Categoría</span>
        <Select
          title="Categoría"
          value={f.category}
          onChange={(v) => setF({ ...f, category: v })}
          options={CATEGORIES}
        />
      </div>
      <label className="field">
        <span>Dirección</span>
        <input value={f.address} onChange={set('address')} />
      </label>
      <label className="field">
        <span>Teléfono del negocio</span>
        <input value={f.phone} onChange={set('phone')} inputMode="tel" />
      </label>
      <label className="field">
        <span>Descripción</span>
        <textarea value={f.description} onChange={set('description')} />
      </label>

      <button type="button" className="btn secondary" onClick={useMyLocation}>
        <MapPin size={18} /> {pos ? 'Ubicación nueva lista' : 'Actualizar ubicación del local'}
      </button>
      <p className="hint" style={{ marginBottom: 14 }}>
        Hazlo estando en el local. Desde ahí se calculan los repartidores cercanos.
      </p>

      {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}
      <button className="btn small" disabled={busy}>
        {busy ? 'Guardando...' : 'Guardar datos del negocio'}
      </button>
    </form>
  )
}

/* ------------------------------------------------------------------ */
/* Datos del repartidor                                                */
/* ------------------------------------------------------------------ */

export function CourierProfile({ courier, setCourier }) {
  const [vehicle, setVehicle] = useState(courier.vehicle || VEHICLES[0])
  const [publicName, setPublicName] = useState(courier.display_name || '')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  async function save(e) {
    e.preventDefault()
    setMsg(null)
    if (!publicName.trim()) return setMsg({ type: 'error', text: 'Escribe tu nombre público.' })
    setBusy(true)
    const display_name = publicName.trim()
    const { error } = await supabase.from('couriers').update({ vehicle, display_name }).eq('id', courier.id)
    setBusy(false)
    if (error) setMsg({ type: 'error', text: 'No pudimos guardar los cambios.' })
    else {
      setCourier({ ...courier, vehicle, display_name })
      setMsg({ type: 'ok', text: 'Datos guardados.' })
    }
  }

  return (
    <form className="card" onSubmit={save}>
      <h3 className="section-title" style={{ marginTop: 0 }}>
        Mi perfil de repartidor
      </h3>
      <label className="field">
        <span>Nombre público</span>
        <input value={publicName} onChange={(e) => setPublicName(e.target.value)} />
        <p className="hint">Es el que ven clientes y negocios.</p>
      </label>
      <div className="field">
        <span>¿En qué te mueves?</span>
        <Select title="¿En qué te mueves?" value={vehicle} onChange={setVehicle} options={VEHICLES} />
      </div>
      {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}
      <button className="btn small" disabled={busy}>
        {busy ? 'Guardando...' : 'Guardar mis datos'}
      </button>
    </form>
  )
}

/* ------------------------------------------------------------------ */
/* Suscripción (negocio y repartidor)                                  */
/* ------------------------------------------------------------------ */

export function SubscriptionBox({ kind }) {
  const [uid, setUid] = useState(null)
  const [sub, setSub] = useState(null)
  const [last, setLast] = useState(null)
  const [plans, setPlans] = useState([])
  const [methods, setMethods] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [tier, setTier] = useState('basico')
  const [method, setMethod] = useState('')
  const [reference, setReference] = useState('')
  const [file, setFile] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser()
    const id = u.user?.id
    if (!id) return
    setUid(id)
    const [s, p, m, l] = await Promise.all([
      supabase
        .from('subscriptions')
        .select('tier, status, ends_at')
        .eq('profile_id', id)
        .eq('kind', kind)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('plans').select('tier, name, price_cup, price_usd').eq('kind', kind),
      supabase
        .from('payment_methods')
        .select('code, label, currency, details')
        .eq('active', true)
        .order('sort'),
      supabase
        .from('subscription_payments')
        .select('status, tier, admin_note, created_at')
        .eq('profile_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    setSub(s.data || null)
    setPlans((p.data || []).slice().sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier)))
    setMethods(m.data || [])
    setLast(l.data || null)
    setMethod((cur) => cur || (m.data && m.data[0] ? m.data[0].code : ''))
    setLoaded(true)
  }, [kind])

  useEffect(() => {
    load()
  }, [load])

  const active =
    sub && sub.status === 'activa' && sub.ends_at && new Date(sub.ends_at).getTime() > Date.now()
  const pending = last && last.status === 'pendiente'
  const planOf = (t) => plans.find((x) => x.tier === t)
  const chosen = methods.find((x) => x.code === method)
  const chosenPlan = planOf(tier)
  const amount =
    chosen && chosenPlan
      ? chosen.currency === 'USD'
        ? chosenPlan.price_usd
        : chosenPlan.price_cup
      : null

  async function submit(e) {
    e.preventDefault()
    setMsg(null)
    if (!chosen) return setMsg({ type: 'error', text: 'Elige cómo vas a pagar.' })
    if (amount == null)
      return setMsg({
        type: 'error',
        text: 'Este plan todavía no tiene precio en esa moneda. Elige otro método o vuelve más tarde.',
      })
    if (!reference.trim() && !file)
      return setMsg({
        type: 'error',
        text: 'Escribe el número de la transacción o sube la captura del pago.',
      })

    setBusy(true)
    let path = null
    if (file) {
      const ext =
        (file.name.split('.').pop() || 'jpg')
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
          .slice(0, 5) || 'jpg'
      path = `${uid}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('payment-proofs')
        .upload(path, file, { contentType: file.type || undefined })
      if (upErr) {
        setBusy(false)
        return setMsg({ type: 'error', text: 'No pudimos subir la captura. Inténtalo de nuevo.' })
      }
    }
    const { error } = await supabase.rpc('request_subscription', {
      p_tier: tier,
      p_method: method,
      p_reference: reference,
      p_proof_path: path,
    })
    setBusy(false)
    if (error) {
      const text =
        error.message && error.message.length < 100
          ? error.message
          : 'No pudimos enviar tu pago. Inténtalo de nuevo.'
      setMsg({ type: 'error', text })
    } else {
      setReference('')
      setFile(null)
      setMsg({ type: 'ok', text: 'Pago enviado. Lo revisaremos y activaremos tu plan.' })
      load()
    }
  }

  if (!loaded) return <p>Cargando suscripción...</p>

  return (
    <div className="card">
      <h3 className="section-title" style={{ marginTop: 0 }}>
        Mi suscripción
      </h3>

      {active ? (
        <div className="msg ok" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <VerifiedBadge tier={sub.tier} size={20} />
          <span>
            Plan {TIER_NAME[sub.tier]} activo hasta el {fmtDate(sub.ends_at)}
          </span>
        </div>
      ) : (
        <div className="notice">Todavía no tienes un plan activo. Elige uno y envía tu pago.</div>
      )}

      {pending && (
        <div className="notice">
          Tu pago del plan {TIER_NAME[last.tier]} está en revisión. Cuando lo confirmemos se activa
          tu plan.
        </div>
      )}
      {last && last.status === 'rechazado' && (
        <div className="msg error">
          Tu último pago fue rechazado.{last.admin_note ? ` Motivo: ${last.admin_note}` : ''}
        </div>
      )}

      {!pending && (
        <form onSubmit={submit} style={{ marginTop: 14 }}>
          <p className="meta" style={{ marginBottom: 8 }}>
            {active ? 'Renovar o cambiar de plan' : 'Elige tu plan'}
          </p>
          <div className="list">
            {TIERS.map((t) => (
              <button
                type="button"
                key={t}
                className="card"
                aria-pressed={tier === t}
                onClick={() => setTier(t)}
                style={{
                  textAlign: 'left',
                  cursor: 'pointer',
                  font: 'inherit',
                  color: 'inherit',
                  border: tier === t ? '2px solid #ff6b35' : '2px solid transparent',
                }}
              >
                <div className="row">
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <VerifiedBadge tier={t} size={18} /> {TIER_NAME[t]}
                  </h3>
                  <b>{priceText(planOf(t))}</b>
                </div>
                <ul className="items-list">
                  {FEATURES[kind][t].map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </button>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            Cada plan dura 30 días desde que confirmamos el pago.
          </p>

          <div className="field" style={{ marginTop: 14 }}>
            <span>Método de pago</span>
            <Select
              title="Método de pago"
              value={method}
              onChange={setMethod}
              options={methods.map((m) => ({
                value: m.code,
                label: METHOD_LABEL[m.code] || m.label,
                hint: m.currency,
              }))}
            />
          </div>

          {chosen && (
            <div className="notice" style={{ whiteSpace: 'pre-wrap' }}>
              {amount != null ? `Monto a pagar: ${Number(amount)} ${chosen.currency}\n` : ''}
              {chosen.details || 'Los datos de este método todavía no están disponibles.'}
            </div>
          )}

          <label className="field">
            <span>Número o referencia de la transacción</span>
            <input value={reference} onChange={(e) => setReference(e.target.value)} />
          </label>
          <div className="field">
            <span>Captura del pago</span>
            <FilePick file={file} onChange={setFile} text="Subir captura del pago" />
          </div>

          {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}
          <button className="btn" disabled={busy}>
            {busy ? 'Enviando...' : 'Enviar pago para confirmación'}
          </button>
        </form>
      )}
      {pending && msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Administrador: revisar pagos                                        */
/* ------------------------------------------------------------------ */

export function PaymentsAdmin() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('pendiente')
  const [proofs, setProofs] = useState({})
  const [notes, setNotes] = useState({})
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('subscription_payments')
      .select(
        'id, kind, tier, method, amount, currency, reference, proof_path, status, admin_note, created_at, profile:profiles(full_name, phone)'
      )
      .order('created_at', { ascending: false })
      .limit(100)
    if (err) setError('No pudimos cargar los pagos.')
    else {
      setError('')
      setRows(data)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function review(row, approve) {
    setBusyId(row.id)
    const { error: err } = await supabase.rpc('admin_review_payment', {
      p_payment: row.id,
      p_approve: approve,
      p_note: (notes[row.id] || '').trim() || null,
    })
    setBusyId(null)
    if (err) setError('No se pudo guardar la revisión.')
    else load()
  }

  async function showProof(row) {
    const { data } = await supabase.storage.from('payment-proofs').createSignedUrl(row.proof_path, 600)
    if (data && data.signedUrl) setProofs({ ...proofs, [row.id]: data.signedUrl })
    else setError('No pudimos abrir la captura.')
  }

  const list = (rows || []).filter((r) => r.status === tab)
  const count = (s) => (rows || []).filter((r) => r.status === s).length
  const LABELS = { pendiente: 'Por revisar', confirmado: 'Confirmados', rechazado: 'Rechazados' }

  return (
    <>
      <SegNav
        items={['pendiente', 'confirmado', 'rechazado'].map((s) => ({ id: s, label: `${LABELS[s]} (${count(s)})` }))}
        value={tab}
        onChange={setTab}
      />

      {error && <div className="msg error">{error}</div>}
      {rows === null && !error && <p>Cargando pagos...</p>}
      {rows && list.length === 0 && (
        <div className="empty">
          <strong>No hay pagos aquí</strong>
          Cuando alguien envíe un pago aparecerá en esta lista.
        </div>
      )}

      <div className="list">
        {list.map((r) => (
          <div className="card" key={r.id}>
            <div className="row">
              <h3>{r.profile?.full_name || 'Sin nombre'}</h3>
              <span className="badge">
                {r.kind === 'negocio' ? 'Negocio' : 'Repartidor'} · {TIER_NAME[r.tier]}
              </span>
            </div>
            {r.profile?.phone && <p className="meta">{r.profile.phone}</p>}
            <p className="meta">
              {METHOD_LABEL[r.method] || r.method}
              {r.amount != null ? ` - ${Number(r.amount)} ${r.currency}` : ''}
            </p>
            {r.reference && <p className="meta">Referencia: {r.reference}</p>}
            <p className="meta">{new Date(r.created_at).toLocaleString('es')}</p>
            {r.admin_note && <p className="meta">Nota: {r.admin_note}</p>}

            {r.proof_path && !proofs[r.id] && (
              <div className="order-actions">
                <button type="button" className="btn small secondary" onClick={() => showProof(r)}>
                  Ver captura
                </button>
              </div>
            )}
            {proofs[r.id] && (
              <img
                src={proofs[r.id]}
                alt="Captura del pago"
                style={{ width: '100%', borderRadius: 12, marginTop: 10 }}
              />
            )}

            {r.status === 'pendiente' && (
              <>
                <label className="field" style={{ marginTop: 10 }}>
                  <span>Nota (opcional)</span>
                  <input
                    value={notes[r.id] || ''}
                    onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                  />
                </label>
                <div className="order-actions">
                  <button className="btn small" disabled={busyId === r.id} onClick={() => review(r, true)}>
                    Confirmar pago
                  </button>
                  <button
                    className="btn small danger"
                    disabled={busyId === r.id}
                    onClick={() => review(r, false)}
                  >
                    Rechazar
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Administrador: precios de planes y datos de cobro                   */
/* ------------------------------------------------------------------ */

export function PricingAdmin() {
  const [plans, setPlans] = useState(null)
  const [methods, setMethods] = useState(null)
  const [edits, setEdits] = useState({})
  const [msg, setMsg] = useState(null)
  const [busyKey, setBusyKey] = useState(null)

  const load = useCallback(async () => {
    const [p, m] = await Promise.all([
      supabase.from('plans').select('kind, tier, price_cup, price_usd').order('kind').order('tier'),
      supabase.from('payment_methods').select('code, label, currency, details, active, sort').order('sort'),
    ])
    if (p.error || m.error) setMsg({ type: 'error', text: 'No pudimos cargar los precios.' })
    setPlans((p.data || []).slice().sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier)))
    setMethods(m.data || [])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const setEdit = (key, field, value) =>
    setEdits((cur) => ({ ...cur, [key]: { ...(cur[key] || {}), [field]: value } }))

  const val = (key, field, original) =>
    edits[key] && edits[key][field] !== undefined ? edits[key][field] : original ?? ''

  const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v))

  async function savePlan(p) {
    const key = `${p.kind}-${p.tier}`
    const cup = num(val(key, 'price_cup', p.price_cup))
    const usd = num(val(key, 'price_usd', p.price_usd))
    if ((cup !== null && !(cup >= 0)) || (usd !== null && !(usd >= 0)))
      return setMsg({ type: 'error', text: 'Escribe precios válidos.' })
    setBusyKey(key)
    setMsg(null)
    const { error } = await supabase.rpc('admin_set_plan_price', {
      p_kind: p.kind,
      p_tier: p.tier,
      p_price_cup: cup,
      p_price_usd: usd,
    })
    setBusyKey(null)
    if (error) setMsg({ type: 'error', text: 'No se pudo guardar el precio.' })
    else {
      setMsg({ type: 'ok', text: `Precio guardado: ${p.kind} ${TIER_NAME[p.tier]}.` })
      setEdits((cur) => ({ ...cur, [key]: undefined }))
      load()
    }
  }

  async function saveMethod(m) {
    const key = `m-${m.code}`
    setBusyKey(key)
    setMsg(null)
    const { error } = await supabase.rpc('admin_set_payment_method', {
      p_code: m.code,
      p_details: String(val(key, 'details', m.details)).trim() || null,
      p_active: val(key, 'active', m.active) === true,
    })
    setBusyKey(null)
    if (error) setMsg({ type: 'error', text: 'No se pudo guardar el método de pago.' })
    else {
      setMsg({ type: 'ok', text: `${METHOD_LABEL[m.code] || m.label} guardado.` })
      setEdits((cur) => ({ ...cur, [key]: undefined }))
      load()
    }
  }

  if (plans === null || methods === null) return <p>Cargando...</p>

  const groups = [
    ['negocio', 'Planes de negocios'],
    ['repartidor', 'Planes de repartidores'],
  ]

  return (
    <div className="stack">
      {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}

      {groups.map(([kind, title]) => (
        <div key={kind}>
          <h3 className="section-title">{title}</h3>
          <div className="list">
            {plans
              .filter((p) => p.kind === kind)
              .map((p) => {
                const key = `${p.kind}-${p.tier}`
                return (
                  <div className="card" key={key}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <VerifiedBadge tier={p.tier} size={18} /> {TIER_NAME[p.tier]}
                    </h3>
                    <label className="field">
                      <span>Precio en CUP</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        value={val(key, 'price_cup', p.price_cup)}
                        onChange={(e) => setEdit(key, 'price_cup', e.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span>Precio en USD</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        value={val(key, 'price_usd', p.price_usd)}
                        onChange={(e) => setEdit(key, 'price_usd', e.target.value)}
                      />
                    </label>
                    <button className="btn small" disabled={busyKey === key} onClick={() => savePlan(p)}>
                      {busyKey === key ? 'Guardando...' : 'Guardar precio'}
                    </button>
                  </div>
                )
              })}
          </div>
        </div>
      ))}

      <h3 className="section-title">Métodos de pago</h3>
      <p className="hint">
        Lo que escribas aquí lo ven los usuarios cuando van a pagar: tarjeta, usuario o dirección.
      </p>
      <div className="list">
        {methods.map((m) => {
          const key = `m-${m.code}`
          return (
            <div className="card" key={m.code}>
              <h3>
                {METHOD_LABEL[m.code] || m.label} ({m.currency})
              </h3>
              <label className="field">
                <span>Datos para cobrar</span>
                <textarea
                  rows={4}
                  value={val(key, 'details', m.details)}
                  onChange={(e) => setEdit(key, 'details', e.target.value)}
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <input
                  type="checkbox"
                  checked={val(key, 'active', m.active) === true}
                  onChange={(e) => setEdit(key, 'active', e.target.checked)}
                />
                <span>Disponible para pagar</span>
              </label>
              <button className="btn small" disabled={busyKey === key} onClick={() => saveMethod(m)}>
                {busyKey === key ? 'Guardando...' : 'Guardar método'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
