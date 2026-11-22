import { useEffect, useState, useCallback } from 'react'
import { ArrowLeft, Plus, Minus, ShoppingBag, MapPin, CheckCircle2 } from 'lucide-react'
import { supabase, STATUS_LABELS } from './lib.js'
import { money, getPosition, useRealtime } from './utils.js'
import { LiveMap } from './Map.jsx'
import { VerifiedBadge } from './Verified.jsx'
import { MyProfile } from './Profile.jsx'
import './shop.css'

const STEPS_PICKUP = ['enviado', 'confirmado', 'en_fogones', 'listo_para_salir', 'entregado']
const STEPS_DELIVERY = [
  'enviado',
  'confirmado',
  'en_fogones',
  'listo_para_salir',
  'rumbo_a_ti',
  'a_la_vuelta',
  'entregado',
]

/* ------------------------------------------------------------------ */

export function CustomerApp() {
  const [tab, setTab] = useState('negocios')
  const [business, setBusiness] = useState(null)
  const [cart, setCart] = useState({})
  const [checkout, setCheckout] = useState(false)
  const [me, setMe] = useState({ name: '', phone: '' })
  const [notice, setNotice] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const id = data.user?.id
      if (!id) return
      const { data: p } = await supabase
        .from('profiles')
        .select('full_name, phone')
        .eq('id', id)
        .maybeSingle()
      if (p) setMe({ name: p.full_name || '', phone: p.phone || '' })
    })
  }, [])

  function openBusiness(b) {
    setBusiness(b)
    setCart({})
    setCheckout(false)
    setNotice('')
  }

  function placed() {
    setCart({})
    setCheckout(false)
    setBusiness(null)
    setTab('pedidos')
    setNotice('Pedido enviado. Aquí puedes seguirlo paso a paso.')
  }

  return (
    <>
      <div className="tabs">
        <button aria-pressed={tab === 'negocios'} onClick={() => setTab('negocios')}>
          Negocios
        </button>
        <button
          aria-pressed={tab === 'pedidos'}
          onClick={() => {
            setTab('pedidos')
            setNotice('')
          }}
        >
          Mis pedidos
        </button>
        <button aria-pressed={tab === 'perfil'} onClick={() => setTab('perfil')}>
          Mi perfil
        </button>
      </div>

      {tab === 'negocios' && !business && <BusinessList onOpen={openBusiness} />}
      {tab === 'negocios' && business && !checkout && (
        <BusinessMenu
          business={business}
          cart={cart}
          setCart={setCart}
          onBack={() => setBusiness(null)}
          onCheckout={() => setCheckout(true)}
        />
      )}
      {tab === 'negocios' && business && checkout && (
        <Checkout
          business={business}
          cart={cart}
          me={me}
          onBack={() => setCheckout(false)}
          onPlaced={placed}
        />
      )}
      {tab === 'pedidos' && <MyOrders notice={notice} />}
      {tab === 'perfil' && <MyProfile />}
    </>
  )
}

/* ------------------------------------------------------------------ */

function BusinessList({ onOpen }) {
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('businesses')
      .select('id, name, category, address, is_open, courier_fee, tier')
      .eq('verification_status', 'aprobado')
      .order('name')
      .then(({ data, error: err }) => {
        if (err) setError('No pudimos cargar los negocios. Inténtalo de nuevo.')
        else setItems(data)
      })
  }, [])

  return (
    <>
      {error && <div className="msg error">{error}</div>}
      {items === null && !error && <p>Cargando...</p>}
      {items && items.length === 0 && (
        <div className="empty">
          <strong>Aún no hay negocios en tu zona</strong>
          Estamos sumando los primeros. Vuelve pronto.
        </div>
      )}
      <div className="list">
        {(items || []).map((b) => (
          <button
            key={b.id}
            className="card"
            style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }}
            onClick={() => onOpen(b)}
          >
            <div className="row">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {b.name} <VerifiedBadge tier={b.tier} size={18} />
              </h3>
              <span className={`badge ${b.is_open ? 'aprobado' : ''}`}>
                {b.is_open ? 'Abierto' : 'Cerrado'}
              </span>
            </div>
            <p className="meta">{[b.category, b.address].filter(Boolean).join(' - ')}</p>
          </button>
        ))}
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ */

function BusinessMenu({ business, cart, setCart, onBack, onCheckout }) {
  const [products, setProducts] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('products')
      .select('*')
      .eq('business_id', business.id)
      .eq('available', true)
      .order('created_at')
      .then(({ data, error: err }) => {
        if (err) setError('No pudimos cargar el menú.')
        else setProducts(data)
      })
  }, [business.id])

  const add = (p) =>
    setCart({ ...cart, [p.id]: { product: p, qty: (cart[p.id]?.qty || 0) + 1 } })

  const remove = (p) => {
    const qty = (cart[p.id]?.qty || 0) - 1
    const next = { ...cart }
    if (qty <= 0) delete next[p.id]
    else next[p.id] = { product: p, qty }
    setCart(next)
  }

  const lines = Object.values(cart)
  const count = lines.reduce((s, l) => s + l.qty, 0)
  const subtotal = lines.reduce((s, l) => s + l.qty * Number(l.product.price), 0)

  return (
    <>
      <button className="link" onClick={onBack}>
        <ArrowLeft size={18} /> Negocios
      </button>
      <div className="greeting" style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
          {business.name} <VerifiedBadge tier={business.tier} size={22} />
        </h2>
        <p>{[business.category, business.address].filter(Boolean).join(' - ')}</p>
      </div>

      {!business.is_open && (
        <div className="notice">Este negocio está cerrado ahora. Puedes ver el menú, pero no pedir.</div>
      )}
      {error && <div className="msg error">{error}</div>}
      {products === null && !error && <p>Cargando menú...</p>}
      {products && products.length === 0 && (
        <div className="empty">
          <strong>Este negocio aún no publicó su menú</strong>
          Vuelve más tarde.
        </div>
      )}

      <div className="list">
        {(products || []).map((p) => (
          <div className="card product" key={p.id}>
            <div className="info">
              <h3>{p.name}</h3>
              {p.description && <p className="meta">{p.description}</p>}
              <p className="price">{money(p.price)}</p>
              {p.has_delivery && <span className="badge propio">Envío incluido</span>}
            </div>
            <div className="qty">
              {cart[p.id] && (
                <>
                  <button aria-label="Quitar uno" onClick={() => remove(p)}>
                    <Minus size={18} />
                  </button>
                  <b>{cart[p.id].qty}</b>
                </>
              )}
              <button
                className="add"
                aria-label="Agregar uno"
                onClick={() => add(p)}
                disabled={!business.is_open}
              >
                <Plus size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {count > 0 && (
        <div className="cartbar">
          <button className="btn" onClick={onCheckout}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <ShoppingBag size={18} /> Ver pedido ({count})
            </span>
            <span>{money(subtotal)}</span>
          </button>
        </div>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */

function Checkout({ business, cart, me, onBack, onPlaced }) {
  const lines = Object.values(cart)
  const subtotal = lines.reduce((s, l) => s + l.qty * Number(l.product.price), 0)
  const allOwnDelivery = lines.every((l) => l.product.has_delivery)

  const [type, setType] = useState('domicilio')
  const [name, setName] = useState(me.name)
  const [phone, setPhone] = useState(me.phone)
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [pos, setPos] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setName((v) => v || me.name)
    setPhone((v) => v || me.phone)
  }, [me.name, me.phone])

  const courierFee = Number(business.courier_fee || 0)
  const fee = type === 'domicilio' && !allOwnDelivery ? courierFee : 0
  const total = subtotal + fee

  async function useMyLocation() {
    setMsg(null)
    try {
      setPos(await getPosition())
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    }
  }

  async function submit(e) {
    e.preventDefault()
    setMsg(null)
    if (type === 'domicilio' && !address.trim())
      return setMsg({ type: 'error', text: 'Escribe la dirección de entrega.' })
    if (!phone.trim())
      return setMsg({ type: 'error', text: 'Escribe un teléfono para que te puedan contactar.' })

    setBusy(true)
    const { error } = await supabase.rpc('place_order', {
      p_business: business.id,
      p_type: type,
      p_address: address,
      p_notes: notes,
      p_name: name,
      p_phone: phone,
      p_items: lines.map((l) => ({ product_id: l.product.id, quantity: l.qty })),
      p_lat: type === 'domicilio' && pos ? pos.lat : null,
      p_lng: type === 'domicilio' && pos ? pos.lng : null,
    })
    setBusy(false)

    if (error) {
      const text = error.message && error.message.length < 100 ? error.message : 'No pudimos enviar tu pedido. Inténtalo de nuevo.'
      setMsg({ type: 'error', text })
    } else {
      onPlaced()
    }
  }

  return (
    <form onSubmit={submit}>
      <button type="button" className="link" onClick={onBack}>
        <ArrowLeft size={18} /> Volver al menú
      </button>
      <h3 className="section-title" style={{ marginTop: 0 }}>
        Tu pedido en {business.name}
      </h3>

      <div className="card" style={{ marginBottom: 16 }}>
        {lines.map((l) => (
          <div className="sum-line" key={l.product.id}>
            <span>
              {l.qty} × {l.product.name}
            </span>
            <span>{money(l.qty * Number(l.product.price))}</span>
          </div>
        ))}
        <div className="sum-line">
          <span>Productos</span>
          <span>{money(subtotal)}</span>
        </div>
        <div className="sum-line">
          <span>Envío</span>
          <span>
            {type === 'recogida'
              ? 'Recoges tú'
              : allOwnDelivery
                ? 'Lo entrega el negocio'
                : courierFee > 0
                  ? money(courierFee)
                  : 'Sin costo'}
          </span>
        </div>
        <div className="sum-line total">
          <span>Total</span>
          <span>{money(total)}</span>
        </div>
      </div>

      <div className="segmented">
        <button type="button" aria-pressed={type === 'domicilio'} onClick={() => setType('domicilio')}>
          A domicilio
        </button>
        <button type="button" aria-pressed={type === 'recogida'} onClick={() => setType('recogida')}>
          Recojo yo
        </button>
      </div>

      <label className="field">
        <span>Tu nombre</span>
        <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </label>
      <label className="field">
        <span>Teléfono</span>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" />
      </label>

      {type === 'domicilio' && (
        <>
          <label className="field">
            <span>Dirección de entrega</span>
            <input value={address} onChange={(e) => setAddress(e.target.value)} />
          </label>
          <button type="button" className="btn secondary" onClick={useMyLocation}>
            <MapPin size={18} /> {pos ? 'Ubicación guardada' : 'Usar mi ubicación'}
          </button>
          <p className="hint" style={{ marginBottom: 14 }}>
            Opcional. Sirve para que tu repartidor te vea en el mapa cuando lo activemos.
          </p>
        </>
      )}

      <label className="field">
        <span>Notas para el negocio (opcional)</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      <p className="hint" style={{ marginBottom: 14 }}>
        Pagas al recibir tu pedido.
      </p>

      {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}
      <button className="btn" disabled={busy}>
        {busy ? 'Enviando...' : `Hacer pedido - ${money(total)}`}
      </button>
    </form>
  )
}

/* ------------------------------------------------------------------ */

function sumTotals(rows) {
  return rows.reduce((t, o) => t + Number(o.total || 0), 0)
}

function MyOrders({ notice }) {
  const [uid, setUid] = useState(null)
  const [orders, setOrders] = useState(null)
  const [spent, setSpent] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id || ''))
  }, [])

  const load = useCallback(async () => {
    if (!uid) return
    const [list, done] = await Promise.all([
      supabase
        .from('orders')
        .select(
          'id, status, delivery_type, delivery_mode, courier_id, delivery_lat, delivery_lng, total, created_at, business:businesses(name, tier, lat, lng), order_items(id, product_name, quantity)'
        )
        .eq('customer_id', uid)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase.from('orders').select('total, created_at').eq('customer_id', uid).eq('status', 'entregado'),
    ])
    if (list.error) setError('No pudimos cargar tus pedidos.')
    else {
      setError('')
      setOrders(list.data)
    }
    if (done.data) {
      const now = new Date()
      const month = done.data.filter((o) => {
        const d = new Date(o.created_at)
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      })
      setSpent({ count: done.data.length, total: sumTotals(done.data), month: sumTotals(month) })
    }
  }, [uid])

  useEffect(() => {
    load()
  }, [load])

  useRealtime('mis-pedidos', 'orders', uid ? `customer_id=eq.${uid}` : null, load)

  async function cancel(id) {
    const { error: err } = await supabase.rpc('set_order_status', {
      p_order: id,
      p_status: 'cancelado',
    })
    if (err) setError('No se pudo cancelar el pedido.')
    else load()
  }

  const dateText = (ts) =>
    new Date(ts).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })

  const inProgress = (orders || []).filter((o) => !['entregado', 'cancelado'].includes(o.status))
  const history = (orders || []).filter((o) => ['entregado', 'cancelado'].includes(o.status))

  const renderActive = (o) => {
    const steps = o.delivery_type === 'recogida' ? STEPS_PICKUP : STEPS_DELIVERY
    const idx = steps.indexOf(o.status)
    return (
      <div className="card" key={o.id}>
        <div className="row">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {o.business?.name || 'Negocio'}
            {o.business?.tier && <VerifiedBadge tier={o.business.tier} size={16} />}
          </h3>
          <span className="badge">{STATUS_LABELS[o.status]}</span>
        </div>
        <ul className="items-list">
          {o.order_items.map((i) => (
            <li key={i.id}>
              {i.quantity} × {i.product_name}
            </li>
          ))}
        </ul>
        <p className="meta">Total: {money(o.total)}</p>

        <ul className="steps">
          {steps.map((st, i) => (
            <li key={st} className={`step ${i < idx ? 'done' : ''} ${i === idx ? 'now' : ''}`}>
              <span className="pip" />
              {STATUS_LABELS[st]}
            </li>
          ))}
        </ul>

        {o.courier_id && ['listo_para_salir', 'rumbo_a_ti', 'a_la_vuelta'].includes(o.status) && (
          <div style={{ marginTop: 12 }}>
            <LiveMap
              business={o.business}
              dest={{ lat: o.delivery_lat, lng: o.delivery_lng }}
              courierId={o.courier_id}
            />
          </div>
        )}

        {o.status === 'enviado' && (
          <div className="order-actions">
            <button className="btn secondary small" onClick={() => cancel(o.id)}>
              Cancelar pedido
            </button>
          </div>
        )}
      </div>
    )
  }

  const renderHistory = (o) => {
    const delivered = o.status === 'entregado'
    return (
      <div className="card done-card" key={o.id}>
        <div className="row">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {o.business?.name || 'Negocio'}
            {o.business?.tier && <VerifiedBadge tier={o.business.tier} size={16} />}
          </h3>
          <span className={`badge ${delivered ? 'aprobado' : 'rechazado'}`}>
            {delivered ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <CheckCircle2 size={14} /> Entregado
              </span>
            ) : (
              'Cancelado'
            )}
          </span>
        </div>
        <p className="meta">
          {dateText(o.created_at)} · {o.delivery_type === 'recogida' ? 'Recogida en el local' : 'A domicilio'}
        </p>
        <p className="done-items">
          {o.order_items.map((i) => `${i.quantity} × ${i.product_name}`).join(', ')}
        </p>
        <div className="sum-line total">
          <span>Total</span>
          <span className={delivered ? '' : 'struck'}>{money(o.total)}</span>
        </div>
      </div>
    )
  }

  return (
    <>
      {notice && <div className="notice">{notice}</div>}
      {error && <div className="msg error">{error}</div>}

      {spent && spent.count > 0 && (
        <div className="spend">
          <div>
            <small>Gastado en total</small>
            <b>{money(spent.total)}</b>
          </div>
          <div>
            <small>Este mes</small>
            <b>{money(spent.month)}</b>
          </div>
          <div>
            <small>Pedidos completados</small>
            <b>{spent.count}</b>
          </div>
        </div>
      )}

      {orders === null && !error && <p>Cargando...</p>}
      {orders && orders.length === 0 && (
        <div className="empty">
          <strong>Todavía no has hecho pedidos</strong>
          Elige un negocio y arma tu primer pedido.
        </div>
      )}

      {inProgress.length > 0 && <h3 className="section-title" style={{ marginTop: 0 }}>En curso</h3>}
      <div className="list">{inProgress.map(renderActive)}</div>

      {history.length > 0 && <h3 className="section-title">Historial</h3>}
      <div className="list">{history.map(renderHistory)}</div>
    </>
  )
}
