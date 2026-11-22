import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase, STATUS_LABELS } from './lib.js'
import { money, useRealtime } from './utils.js'
import { LiveMap } from './Map.jsx'
import { playAlert } from './alert.js'
import { MyProfile, BusinessProfile, SubscriptionBox } from './Profile.jsx'
import { Select, TIME_OPTIONS, useConfirm, PillNav, SegNav } from './ui.jsx'
import { CouponsManager, LoyaltyManager } from './Promos.jsx'
import { TierTools } from './Tools.jsx'
import { ClipboardList, UtensilsCrossed, Wrench, UserCog } from 'lucide-react'
import './shop.css'

/* ================================================================== */
/* NEGOCIO                                                             */
/* ================================================================== */

export function BusinessDashboard({ business, setBusiness }) {
  const [tab, setTab] = useState('pedidos')
  const [account, setAccount] = useState('ajustes')
  const [tool, setTool] = useState(null)

  function openTool(id) {
    if (id === 'cupones' || id === 'habitual') setTool(id)
    else if (id === 'horario') {
      setAccount('ajustes')
      setTab('cuenta')
    } else if (id === 'agotados') setTab('menu')
  }

  function upgrade() {
    setAccount('perfil')
    setTab('cuenta')
  }

  return (
    <>
      <PillNav
        items={[
          { id: 'pedidos', label: 'Pedidos', Icon: ClipboardList },
          { id: 'menu', label: 'Menú', Icon: UtensilsCrossed },
          { id: 'herramientas', label: 'Herramientas', Icon: Wrench },
          { id: 'cuenta', label: 'Cuenta', Icon: UserCog },
        ]}
        value={tab}
        onChange={(id) => {
          setTool(null)
          setTab(id)
        }}
      />
      {tab === 'pedidos' && <BusinessOrders business={business} />}
      {tab === 'menu' && <MenuManager business={business} />}
      {tab === 'herramientas' && !tool && (
        <TierTools kind="negocio" tier={business.tier} onOpen={openTool} onUpgrade={upgrade} />
      )}
      {tab === 'herramientas' && tool === 'cupones' && (
        <CouponsManager business={business} onBack={() => setTool(null)} />
      )}
      {tab === 'herramientas' && tool === 'habitual' && (
        <LoyaltyManager business={business} onBack={() => setTool(null)} />
      )}
      {tab === 'cuenta' && (
        <>
          <SegNav
            items={[
              { id: 'ajustes', label: 'Ajustes' },
              { id: 'perfil', label: 'Mi perfil' },
            ]}
            value={account}
            onChange={setAccount}
          />
          {account === 'ajustes' && <BusinessSettings business={business} setBusiness={setBusiness} />}
          {account === 'perfil' && (
            <div className="stack">
              <MyProfile role="negocio" />
              <BusinessProfile business={business} setBusiness={setBusiness} />
              <SubscriptionBox kind="negocio" />
            </div>
          )}
        </>
      )}
    </>
  )
}

/* ---------- Pedidos del negocio ---------- */

function businessActions(o) {
  const a = []
  switch (o.status) {
    case 'enviado':
      a.push(['Aceptar pedido', 'confirmado'], ['Rechazar', 'cancelado', true])
      break
    case 'confirmado':
      a.push(['Empezar a preparar', 'en_fogones'], ['Cancelar', 'cancelado', true])
      break
    case 'en_fogones':
      a.push(['Listo para salir', 'listo_para_salir'], ['Cancelar', 'cancelado', true])
      break
    case 'listo_para_salir':
      if (o.delivery_mode === 'recogida') a.push(['Entregado al cliente', 'entregado'])
      if (o.delivery_mode === 'negocio') a.push(['Salió con el pedido', 'rumbo_a_ti'])
      break
    case 'rumbo_a_ti':
      if (o.delivery_mode === 'negocio')
        a.push(['Está llegando', 'a_la_vuelta'], ['Entregado', 'entregado'])
      break
    case 'a_la_vuelta':
      if (o.delivery_mode === 'negocio') a.push(['Entregado', 'entregado'])
      break
    default:
      break
  }
  return a
}

function deliveryText(o) {
  if (o.delivery_mode === 'recogida') return 'El cliente recoge en el local'
  if (o.delivery_mode === 'negocio') return `Entrega el negocio: ${o.delivery_address}`
  return `Entrega un repartidor: ${o.delivery_address}`
}

function BusinessOrders({ business }) {
  const [orders, setOrders] = useState(null)
  const [error, setError] = useState('')
  const [notes, setNotes] = useState({})
  const [busyId, setBusyId] = useState(null)
  const known = useRef(null)

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('orders')
      .select(
        'id, status, delivery_type, delivery_mode, delivery_address, delivery_lat, delivery_lng, notes, customer_name, customer_phone, subtotal, delivery_fee, discount, coupon_code, reward_note, total, courier_id, created_at, order_items(id, product_name, quantity, unit_price)'
      )
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (err) setError('No pudimos cargar los pedidos.')
    else {
      setError('')
      if (known.current && data.some((o) => o.status === 'enviado' && !known.current.has(o.id)))
        playAlert()
      known.current = new Set(data.map((o) => o.id))
      setOrders(data)
    }
  }, [business.id])

  useEffect(() => {
    load()
  }, [load])

  useRealtime(`negocio-pedidos-${business.id}`, 'orders', `business_id=eq.${business.id}`, load)

  async function setStatus(o, status) {
    setBusyId(o.id)
    const { error: err } = await supabase.rpc('set_order_status', {
      p_order: o.id,
      p_status: status,
    })
    setBusyId(null)
    if (err) setNotes({ ...notes, [o.id]: 'No se pudo cambiar el estado.' })
    else load()
  }

  async function findCourier(o) {
    setBusyId(o.id)
    const { data, error: err } = await supabase.rpc('offer_order_to_nearest', {
      p_order: o.id,
      p_radius_m: 3000,
      p_limit: 3,
    })
    setBusyId(null)
    let text
    if (err) text = 'No se pudo buscar repartidor.'
    else if (!data) text = 'No hay repartidores conectados cerca ahora. Inténtalo en un momento.'
    else text = `Enviado a ${data} repartidor${data === 1 ? '' : 'es'} cercano${data === 1 ? '' : 's'}.`
    setNotes({ ...notes, [o.id]: text })
  }

  const active = (orders || []).filter((o) => !['entregado', 'cancelado'].includes(o.status))
  const done = (orders || []).filter((o) => ['entregado', 'cancelado'].includes(o.status))

  const renderOrder = (o) => {
    const canOffer =
      o.delivery_mode === 'repartidor' &&
      !o.courier_id &&
      ['confirmado', 'en_fogones', 'listo_para_salir'].includes(o.status)
    return (
      <div className="card" key={o.id}>
        <div className="row">
          <h3>{o.customer_name || 'Cliente'}</h3>
          <span
            className={`badge ${o.status === 'cancelado' ? 'rechazado' : o.status === 'entregado' ? 'aprobado' : ''}`}
          >
            {STATUS_LABELS[o.status]}
          </span>
        </div>
        {o.customer_phone && <p className="meta">{o.customer_phone}</p>}
        <ul className="items-list">
          {o.order_items.map((i) => (
            <li key={i.id}>
              {i.quantity} × {i.product_name}
            </li>
          ))}
        </ul>
        {o.notes && <p className="meta">Nota: {o.notes}</p>}
        <p className="meta">{deliveryText(o)}</p>
        {Number(o.discount) > 0 && (
          <p className="meta discount-line">
            Descuento: -{money(o.discount)}
            {o.coupon_code ? ` (código ${o.coupon_code})` : ''}
          </p>
        )}
        {o.reward_note && <p className="meta discount-line">Cliente habitual: {o.reward_note}</p>}
        <p className="meta">
          Total: {money(o.total)}
          {o.delivery_fee > 0 ? ` (envío ${money(o.delivery_fee)})` : ''}
        </p>

        {o.delivery_mode === 'repartidor' && o.courier_id && o.status !== 'entregado' && o.status !== 'cancelado' && (
          <p className="meta" style={{ fontWeight: 700 }}>Repartidor asignado</p>
        )}
        {o.courier_id &&
          ['confirmado', 'en_fogones', 'listo_para_salir', 'rumbo_a_ti', 'a_la_vuelta'].includes(o.status) && (
            <div style={{ marginTop: 12 }}>
              <LiveMap
                business={business}
                dest={{ lat: o.delivery_lat, lng: o.delivery_lng }}
                courierId={o.courier_id}
              />
            </div>
          )}
        {o.status === 'cancelado' && <p className="cancelled">Este pedido fue cancelado.</p>}
        {notes[o.id] && <div className="notice" style={{ marginTop: 10, marginBottom: 0 }}>{notes[o.id]}</div>}

        <div className="order-actions">
          {businessActions(o).map(([label, status, danger]) => (
            <button
              key={status}
              className={`btn small ${danger ? 'danger' : ''}`}
              disabled={busyId === o.id}
              onClick={() => setStatus(o, status)}
            >
              {label}
            </button>
          ))}
          {canOffer && (
            <button
              className="btn small secondary"
              disabled={busyId === o.id}
              onClick={() => findCourier(o)}
            >
              Buscar repartidor cercano
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      {error && <div className="msg error">{error}</div>}
      {orders === null && !error && <p>Cargando pedidos...</p>}
      {orders && orders.length === 0 && (
        <div className="empty">
          <strong>Aún no tienes pedidos</strong>
          Publica tu menú y los pedidos aparecerán aquí al instante.
        </div>
      )}
      {active.length > 0 && <h3 className="section-title" style={{ marginTop: 0 }}>En curso</h3>}
      <div className="list">{active.map(renderOrder)}</div>
      {done.length > 0 && <h3 className="section-title">Anteriores</h3>}
      <div className="list">{done.map(renderOrder)}</div>
    </>
  )
}

/* ---------- Menú ---------- */

function ProductForm({ business, product, onDone, onCancel }) {
  const [f, setF] = useState({
    name: product?.name || '',
    price: product?.price ?? '',
    description: product?.description || '',
    has_delivery: product?.has_delivery || false,
    available: product?.available ?? true,
  })
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  async function save(e) {
    e.preventDefault()
    setMsg(null)
    const price = Number(f.price)
    if (!f.name.trim()) return setMsg('Escribe el nombre del producto.')
    if (f.price === '' || !(price >= 0)) return setMsg('Escribe un precio válido.')

    const row = {
      name: f.name.trim(),
      description: f.description.trim() || null,
      price,
      has_delivery: f.has_delivery,
      available: f.available,
    }
    setBusy(true)
    const { error } = product
      ? await supabase.from('products').update(row).eq('id', product.id)
      : await supabase.from('products').insert({ ...row, business_id: business.id })
    setBusy(false)
    if (error) setMsg('No pudimos guardar el producto. Inténtalo de nuevo.')
    else onDone()
  }

  return (
    <form className="card" onSubmit={save} style={{ marginBottom: 14 }}>
      <h3 style={{ marginBottom: 12 }}>{product ? 'Editar producto' : 'Nuevo producto'}</h3>
      <label className="field">
        <span>Nombre</span>
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </label>
      <label className="field">
        <span>Precio (CUP)</span>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          value={f.price}
          onChange={(e) => setF({ ...f, price: e.target.value })}
        />
      </label>
      <label className="field">
        <span>Descripción (opcional)</span>
        <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={f.has_delivery}
          onChange={(e) => setF({ ...f, has_delivery: e.target.checked })}
        />
        Yo entrego este producto (envío incluido)
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={f.available}
          onChange={(e) => setF({ ...f, available: e.target.checked })}
        />
        Disponible ahora
      </label>
      {msg && <div className="msg error">{msg}</div>}
      <div className="order-actions" style={{ marginTop: 0 }}>
        <button className="btn small" disabled={busy}>
          {busy ? 'Guardando...' : 'Guardar'}
        </button>
        <button type="button" className="btn small secondary" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function MenuManager({ business }) {
  const [confirm, confirmUI] = useConfirm()
  const [items, setItems] = useState(null)
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('products')
      .select('*')
      .eq('business_id', business.id)
      .order('created_at')
    if (err) setError('No pudimos cargar tu menú.')
    else {
      setError('')
      setItems(data)
    }
  }, [business.id])

  useEffect(() => {
    load()
  }, [load])

  const atLimit = business.tier === 'basico' && items && items.length >= 30

  async function toggleAvailable(p) {
    await supabase.from('products').update({ available: !p.available }).eq('id', p.id)
    load()
  }

  async function remove(p) {
    if (!(await confirm(`¿Eliminar "${p.name}"?`, 'Eliminar'))) return
    const { error: err } = await supabase.from('products').delete().eq('id', p.id)
    if (err) setError('No se puede eliminar un producto que ya tiene pedidos. Márcalo como agotado.')
    else load()
  }

  function done() {
    setEditing(null)
    load()
  }

  return (
    <>
      {confirmUI}
      {error && <div className="msg error">{error}</div>}

      {editing ? (
        <ProductForm
          business={business}
          product={editing === 'new' ? null : editing}
          onDone={done}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <>
          <button
            className="btn"
            style={{ marginBottom: 14 }}
            disabled={atLimit}
            onClick={() => setEditing('new')}
          >
            Agregar producto
          </button>
          {atLimit && (
            <div className="notice">
              Tu plan Básico permite hasta 30 productos. Con Pro tienes productos ilimitados.
            </div>
          )}
        </>
      )}

      {items === null && !error && <p>Cargando...</p>}
      {items && items.length === 0 && !editing && (
        <div className="empty">
          <strong>Tu menú está vacío</strong>
          Agrega tu primer producto para que los clientes puedan pedir.
        </div>
      )}

      <div className="list">
        {(items || []).map((p) => (
          <div className={`card ${p.available ? '' : 'soldout'}`} key={p.id}>
            <div className="row">
              <h3>{p.name}</h3>
              <b>{money(p.price)}</b>
            </div>
            {p.description && <p className="meta">{p.description}</p>}
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {!p.available && <span className="badge agotado">Agotado</span>}
              {p.has_delivery && <span className="badge propio">Envío incluido</span>}
            </div>
            <div className="order-actions">
              <button className="btn small secondary" onClick={() => setEditing(p)}>
                Editar
              </button>
              <button
                className={`btn small ${p.available ? 'secondary' : ''}`}
                onClick={() => toggleAvailable(p)}
              >
                {p.available ? 'Marcar agotado' : 'Volver a poner disponible'}
              </button>
              <button className="btn small danger" onClick={() => remove(p)}>
                Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

/* ---------- Ajustes del negocio ---------- */

const DAYS = [
  ['1', 'Lunes'],
  ['2', 'Martes'],
  ['3', 'Miércoles'],
  ['4', 'Jueves'],
  ['5', 'Viernes'],
  ['6', 'Sábado'],
  ['0', 'Domingo'],
]

function untilText(ts) {
  return new Date(ts).toLocaleString('es', {
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Havana',
  })
}

async function reloadOpenState(business, setBusiness) {
  const { data } = await supabase
    .from('businesses')
    .select('is_open, schedule, manual_override, manual_until')
    .eq('id', business.id)
    .maybeSingle()
  if (data) setBusiness({ ...business, ...data })
}

function ScheduleEditor({ business, setBusiness }) {
  const saved = business.schedule
  const [days, setDays] = useState(() => {
    const base = {}
    DAYS.forEach(([k]) => {
      const d = saved && saved[k]
      base[k] = d
        ? { on: true, open: d.open, close: d.close }
        : { on: !saved, open: '09:00', close: '21:00' }
    })
    return base
  })
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const patch = (k, change) => setDays((cur) => ({ ...cur, [k]: { ...cur[k], ...change } }))

  function copyMonday() {
    setDays((cur) => {
      const next = {}
      DAYS.forEach(([k]) => (next[k] = { ...cur['1'] }))
      return next
    })
  }

  async function save() {
    setMsg(null)
    const schedule = {}
    for (const [k] of DAYS) {
      const d = days[k]
      if (!d.on) continue
      if (d.open === d.close)
        return setMsg({ type: 'error', text: 'La hora de abrir y la de cerrar no pueden ser iguales.' })
      schedule[k] = { open: d.open, close: d.close }
    }
    if (Object.keys(schedule).length === 0)
      return setMsg({ type: 'error', text: 'Marca al menos un día de trabajo.' })
    setBusy(true)
    const { error } = await supabase.rpc('set_business_schedule', {
      p_business: business.id,
      p_schedule: schedule,
    })
    setBusy(false)
    if (error) return setMsg({ type: 'error', text: 'No pudimos guardar el horario.' })
    setMsg({ type: 'ok', text: 'Horario guardado. Ahora abres y cierras solo.' })
    reloadOpenState(business, setBusiness)
  }

  async function removeSchedule() {
    setMsg(null)
    setBusy(true)
    const { error } = await supabase.rpc('set_business_schedule', {
      p_business: business.id,
      p_schedule: null,
    })
    setBusy(false)
    if (error) return setMsg({ type: 'error', text: 'No pudimos quitar el horario.' })
    setMsg({ type: 'ok', text: 'Horario quitado. Abres y cierras tú con el botón.' })
    reloadOpenState(business, setBusiness)
  }

  return (
    <div className="card">
      <h3 className="section-title" style={{ marginTop: 0 }}>
        Horario de trabajo
      </h3>
      <p className="hint" style={{ marginBottom: 8 }}>
        Con horario, tu negocio aparece abierto o cerrado solo. El botón de arriba sirve para cerrar
        antes o abrir fuera de horario.
      </p>

      {DAYS.map(([k, name]) => {
        const d = days[k]
        return (
          <div className="sched-day" key={k}>
            <div className="sched-row">
              <b>{name}</b>
              <button
                type="button"
                className="switch"
                role="switch"
                aria-checked={d.on}
                onClick={() => patch(k, { on: !d.on })}
                style={{ width: 'auto' }}
              >
                <span className="dot" />
                {d.on ? 'Abre' : 'Cerrado'}
              </button>
            </div>
            {d.on && (
              <div className="sched-times">
                <Select
                  title={`${name}: abre`}
                  value={d.open}
                  onChange={(v) => patch(k, { open: v })}
                  options={TIME_OPTIONS}
                />
                <span>a</span>
                <Select
                  title={`${name}: cierra`}
                  value={d.close}
                  onChange={(v) => patch(k, { close: v })}
                  options={TIME_OPTIONS}
                />
              </div>
            )}
          </div>
        )
      })}

      {msg && (
        <div className={`msg ${msg.type}`} style={{ marginTop: 12 }}>
          {msg.text}
        </div>
      )}
      <div className="order-actions">
        <button type="button" className="btn small" disabled={busy} onClick={save}>
          {busy ? 'Guardando...' : 'Guardar horario'}
        </button>
        <button type="button" className="btn small secondary" onClick={copyMonday}>
          Copiar lunes a todos
        </button>
        {saved && (
          <button type="button" className="btn small secondary" disabled={busy} onClick={removeSchedule}>
            Quitar horario
          </button>
        )}
      </div>
    </div>
  )
}

function BusinessSettings({ business, setBusiness }) {
  const [fee, setFee] = useState(business.courier_fee ?? 0)
  const [msg, setMsg] = useState(null)
  const [openMsg, setOpenMsg] = useState(null)

  async function toggleOpen() {
    setOpenMsg(null)
    const next = !business.is_open
    const { data, error } = await supabase.rpc('set_business_open_now', {
      p_business: business.id,
      p_open: next,
    })
    if (error) return setOpenMsg({ type: 'error', text: 'No pudimos cambiar el estado.' })
    setBusiness({ ...business, is_open: next })
    if (business.schedule && data)
      setOpenMsg({
        type: 'ok',
        text: `Quedará ${next ? 'abierto' : 'cerrado'} hasta el ${untilText(data)}. Luego vuelve al horario.`,
      })
    reloadOpenState({ ...business, is_open: next }, setBusiness)
  }

  async function saveFee(e) {
    e.preventDefault()
    setMsg(null)
    const value = Number(fee)
    if (!(value >= 0)) return setMsg({ type: 'error', text: 'Escribe una tarifa válida.' })
    const { error } = await supabase.from('businesses').update({ courier_fee: value }).eq('id', business.id)
    if (error) setMsg({ type: 'error', text: 'No pudimos guardar la tarifa.' })
    else {
      setBusiness({ ...business, courier_fee: value })
      setMsg({ type: 'ok', text: 'Tarifa guardada.' })
    }
  }

  return (
    <div className="stack">
      <button className="switch" role="switch" aria-checked={business.is_open} onClick={toggleOpen}>
        <span className="dot" />
        {business.is_open ? 'Abierto: recibiendo pedidos' : 'Cerrado: no recibes pedidos'}
      </button>
      {business.schedule && <p className="hint">Horario automático activo.</p>}
      {openMsg && <div className={`msg ${openMsg.type}`}>{openMsg.text}</div>}

      <ScheduleEditor business={business} setBusiness={setBusiness} />

      <form className="card" onSubmit={saveFee}>
        <label className="field" style={{ marginBottom: 8 }}>
          <span>Tarifa de envío con repartidor (CUP)</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
          />
        </label>
        <p className="hint" style={{ marginBottom: 12 }}>
          La paga el cliente cuando su pedido lo entrega un repartidor. Si todos tus productos
          tienen envío incluido, no se cobra.
        </p>
        {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}
        <button className="btn small">Guardar tarifa</button>
      </form>
    </div>
  )
}

/* ================================================================== */
/* REPARTIDOR                                                          */
/* ================================================================== */

const ACTIVE = ['confirmado', 'en_fogones', 'listo_para_salir', 'rumbo_a_ti', 'a_la_vuelta']

export function CourierWork({ courier }) {
  const online = courier.is_online
  const [offers, setOffers] = useState([])
  const [jobs, setJobs] = useState([])
  const [msg, setMsg] = useState('')
  const [busyId, setBusyId] = useState(null)
  const knownOffers = useRef(null)

  const load = useCallback(async () => {
    const [o, j] = await Promise.all([
      supabase
        .from('order_offers')
        .select(
          'id, order:orders(id, status, delivery_address, delivery_fee, business:businesses(name, address))'
        )
        .eq('courier_id', courier.id)
        .eq('status', 'pendiente'),
      supabase
        .from('orders')
        .select(
          'id, status, delivery_address, delivery_lat, delivery_lng, delivery_fee, total, customer_name, customer_phone, business:businesses(name, address, phone, lat, lng)'
        )
        .eq('courier_id', courier.id)
        .in('status', ACTIVE)
        .order('created_at'),
    ])
    const list = (o.data || []).filter((x) => x.order)
    if (knownOffers.current && list.some((x) => !knownOffers.current.has(x.id))) playAlert()
    knownOffers.current = new Set(list.map((x) => x.id))
    setOffers(list)
    setJobs(j.data || [])
  }, [courier.id])

  useEffect(() => {
    load()
  }, [load])

  useRealtime(`repartidor-ofertas-${courier.id}`, 'order_offers', `courier_id=eq.${courier.id}`, load)
  useRealtime(`repartidor-pedidos-${courier.id}`, 'orders', `courier_id=eq.${courier.id}`, load)

  async function accept(offer) {
    setBusyId(offer.id)
    setMsg('')
    const { data, error } = await supabase.rpc('accept_order_offer', { p_offer: offer.id })
    setBusyId(null)
    if (error) setMsg('No pudimos aceptar el pedido. Inténtalo de nuevo.')
    else if (!data) setMsg('Otro repartidor tomó este pedido primero.')
    load()
  }

  async function setStatus(job, status) {
    setBusyId(job.id)
    const { error } = await supabase.rpc('set_order_status', { p_order: job.id, p_status: status })
    setBusyId(null)
    if (error) setMsg('No se pudo cambiar el estado.')
    else load()
  }

  function jobAction(job) {
    if (job.status === 'listo_para_salir') return ['Recogí el pedido', 'rumbo_a_ti']
    if (job.status === 'rumbo_a_ti') return ['Estoy llegando', 'a_la_vuelta']
    if (job.status === 'a_la_vuelta') return ['Pedido entregado', 'entregado']
    return null
  }

  return (
    <>
      {msg && <div className="notice">{msg}</div>}

      {jobs.length > 0 && <h3 className="section-title">Tus entregas</h3>}
      <div className="list">
        {jobs.map((job) => {
          const action = jobAction(job)
          return (
            <div className="card" key={job.id}>
              <div className="row">
                <h3>{job.business?.name}</h3>
                <span className="badge">{STATUS_LABELS[job.status]}</span>
              </div>
              <p className="meta">Recoges en: {job.business?.address}</p>
              {job.business?.phone && <p className="meta">Teléfono del negocio: {job.business.phone}</p>}
              <p className="meta">Entregas en: {job.delivery_address}</p>
              <p className="meta">
                Cliente: {job.customer_name || 'Cliente'}
                {job.customer_phone ? ` - ${job.customer_phone}` : ''}
              </p>
              <p className="meta">Envío: {money(job.delivery_fee)} - Total a cobrar: {money(job.total)}</p>
              <div style={{ marginTop: 12 }}>
                <LiveMap
                  business={job.business}
                  dest={{ lat: job.delivery_lat, lng: job.delivery_lng }}
                  courierId={courier.id}
                />
              </div>
              {action ? (
                <div className="order-actions">
                  <button className="btn" disabled={busyId === job.id} onClick={() => setStatus(job, action[1])}>
                    {action[0]}
                  </button>
                </div>
              ) : (
                <p className="hint" style={{ marginTop: 10 }}>
                  El negocio aún prepara el pedido. Te avisamos cuando esté listo.
                </p>
              )}
            </div>
          )
        })}
      </div>

      {online && <h3 className="section-title">Pedidos cerca de ti</h3>}
      {online && offers.length === 0 && (
        <div className="empty">
          <strong>Sin pedidos por ahora</strong>
          Cuando un negocio cercano necesite repartidor, aparecerá aquí.
        </div>
      )}
      {online && (
        <div className="list">
          {offers.map((offer) => (
            <div className="card" key={offer.id}>
              <h3>{offer.order.business?.name}</h3>
              <p className="meta">Recoges en: {offer.order.business?.address}</p>
              <p className="meta">Envío: {money(offer.order.delivery_fee)}</p>
              <div className="order-actions">
                <button className="btn" disabled={busyId === offer.id} onClick={() => accept(offer)}>
                  Aceptar pedido
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {!online && jobs.length === 0 && (
        <p className="hint">Conéctate para empezar a recibir pedidos cercanos.</p>
      )}
    </>
  )
}
