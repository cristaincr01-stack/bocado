import { useEffect, useState, useCallback } from 'react'
import { ArrowLeft, Plus, Minus, ShoppingBag, MapPin } from 'lucide-react'
import { supabase, STATUS_LABELS } from './lib.js'
import { money, getPosition, useRealtime } from './utils.js'
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
      .select('id, name, category, address, is_open, courier_fee')
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
              <h3>{b.name}</h3>
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
        <h2 style={{ fontSize: 24 }}>{business.name}</h2>
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

function MyOrders({ notice }) {
  const [uid, setUid] = useState(null)
  const [orders, setOrders] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id || ''))
  }, [])

  const load = useCallback(async () => {
    if (!uid) return
    const { data, error: err } = await supabase
      .from('orders')
      .select(
        'id, status, delivery_type, delivery_mode, total, created_at, business:businesses(name), order_items(id, product_name, quantity)'
      )
      .eq('customer_id', uid)
      .order('created_at', { ascending: false })
      .limit(30)
    if (err) setError('No pudimos cargar tus pedidos.')
    else {
      setError('')
      setOrders(data)
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

  return (
    <>
      {notice && <div className="notice">{notice}</div>}
      {error && <div className="msg error">{error}</div>}
      {orders === null && !error && <p>Cargando...</p>}
      {orders && orders.length === 0 && (
        <div className="empty">
          <strong>Todavía no has hecho pedidos</strong>
          Elige un negocio y arma tu primer pedido.
        </div>
      )}
      <div className="list">
        {(orders || []).map((o) => {
          const steps = o.delivery_type === 'recogida' ? STEPS_PICKUP : STEPS_DELIVERY
          const idx = steps.indexOf(o.status)
          return (
            <div className="card" key={o.id}>
              <div className="row">
                <h3>{o.business?.name || 'Negocio'}</h3>
                <span className={`badge ${o.status === 'cancelado' ? 'rechazado' : o.status === 'entregado' ? 'aprobado' : ''}`}>
                  {STATUS_LABELS[o.status]}
                </span>
              </div>
              <ul className="items-list">
                {o.order_items.map((i) => (
                  <li key={i.id}>
                    {i.quantity} × {i.product_name}
                  </li>
                ))}
              </ul>
              <p className="meta">Total: {money(o.total)}</p>

              {o.status === 'cancelado' ? (
                <p className="cancelled">Este pedido fue cancelado.</p>
              ) : (
                <ul className="steps">
                  {steps.map((s, i) => (
                    <li
                      key={s}
                      className={`step ${i < idx || o.status === 'entregado' ? 'done' : ''} ${i === idx && o.status !== 'entregado' ? 'now' : ''}`}
                    >
                      <span className="pip" />
                      {STATUS_LABELS[s]}
                    </li>
                  ))}
                </ul>
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
        })}
      </div>
    </>
  )
}
