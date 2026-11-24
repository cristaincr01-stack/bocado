import { useEffect, useState, useCallback } from 'react'
import { ArrowLeft, Plus, Minus, ShoppingBag, MapPin, CheckCircle2, Home, ClipboardList, User, Heart, Sparkles, Star } from 'lucide-react'
import { supabase, STATUS_LABELS } from './lib.js'
import { money, getPosition, useRealtime } from './utils.js'
import { LiveMap } from './Map.jsx'
import { VerifiedBadge } from './Verified.jsx'
import { MyProfile } from './Profile.jsx'
import { BottomNav, useGeoConsent } from './ui.jsx'
import { CourierInfo } from './CourierInfo.jsx'
import { HomeScreen, SurpriseScreen, ReviewSheet, SimilarBusinesses, loadVisibleBusinesses } from './Home.jsx'
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
  const [tab, setTab] = useState('inicio')
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

  useEffect(() => {
    let id = null
    try {
      id = new URLSearchParams(window.location.search).get('negocio')
    } catch (e) {
      id = null
    }
    if (!id) return
    loadVisibleBusinesses(true).then((list) => {
      const b = (list || []).find((x) => x.id === id)
      if (b) openBusiness(b)
      try {
        const url = new URL(window.location.href)
        url.searchParams.delete('negocio')
        window.history.replaceState({}, '', url.toString())
      } catch (e) {
        /* sin cambios */
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openBusiness(b) {
    setBusiness(b)
    setCart({})
    setCheckout(false)
    setNotice('')
    setTab('inicio')
  }

  function startCombo(r) {
    const next = {}
    r.lines.forEach((l) => (next[l.product.id] = { product: l.product, qty: l.qty }))
    setBusiness(r.business)
    setCart(next)
    setCheckout(true)
    setNotice('')
    setTab('inicio')
  }

  function reorder(biz, lines) {
    const next = {}
    lines.forEach((l) => (next[l.product.id] = { product: l.product, qty: l.qty }))
    setBusiness(biz)
    setCart(next)
    setCheckout(false)
    setNotice('')
    setTab('inicio')
  }

  function placed(extra) {
    setCart({})
    setCheckout(false)
    setBusiness(null)
    setTab('pedidos')
    setNotice(extra ? `Pedido enviado. ${extra}` : 'Pedido enviado. Aquí puedes seguirlo paso a paso.')
  }

  const inStore = tab === 'inicio' && business

  return (
    <div className={inStore ? '' : 'with-bottom-nav'}>
      {tab === 'inicio' && !business && (
        <HomeScreen onOpen={openBusiness} onSurprise={() => setTab('sorprende')} />
      )}
      {tab === 'inicio' && business && !checkout && (
        <BusinessMenu
          business={business}
          cart={cart}
          setCart={setCart}
          onBack={() => setBusiness(null)}
          onCheckout={() => setCheckout(true)}
        />
      )}
      {tab === 'inicio' && business && checkout && (
        <Checkout
          business={business}
          cart={cart}
          me={me}
          onBack={() => setCheckout(false)}
          onPlaced={placed}
        />
      )}
      {tab === 'sorprende' && <SurpriseScreen onCombo={startCombo} />}
      {tab === 'pedidos' && <MyOrders notice={notice} onOpenBusiness={openBusiness} onReorder={reorder} />}
      {tab === 'perfil' && <MyProfile />}

      {!inStore && (
        <BottomNav
          items={[
            { id: 'inicio', label: 'Inicio', Icon: Home },
            { id: 'sorprende', label: 'Sorpréndeme', Icon: Sparkles },
            { id: 'pedidos', label: 'Pedidos', Icon: ClipboardList },
            { id: 'perfil', label: 'Perfil', Icon: User },
          ]}
          value={tab}
          onChange={(id) => {
            setTab(id)
            setBusiness(null)
            setCheckout(false)
            if (id === 'pedidos') setNotice('')
          }}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */

function loyaltyReward(l) {
  if (!l) return ''
  if (l.kind === 'porcentaje') return `${Number(l.value)}% de descuento`
  if (l.kind === 'monto') return `${money(l.value)} de descuento`
  return l.text || 'un regalo'
}

function BusinessMenu({ business, cart, setCart, onBack, onCheckout }) {
  const [loyalty, setLoyalty] = useState(null)
  const [products, setProducts] = useState(null)
  const [cats, setCats] = useState([])
  const [catFilter, setCatFilter] = useState('todos')
  const [fav, setFav] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('menu_categories')
      .select('id, name, sort')
      .eq('business_id', business.id)
      .order('sort')
      .then(({ data }) => setCats(data || []))
    supabase
      .from('products')
      .select('*')
      .eq('business_id', business.id)
      .order('created_at')
      .then(({ data, error: err }) => {
        if (err) setError('No pudimos cargar el menú.')
        else setProducts(data.slice().sort((x, y) => Number(y.available) - Number(x.available)))
      })
    supabase.rpc('loyalty_status', { p_business: business.id }).then(({ data }) => setLoyalty(data || null))
    supabase
      .from('favorite_businesses')
      .select('business_id')
      .eq('business_id', business.id)
      .maybeSingle()
      .then(({ data }) => setFav(!!data))
  }, [business.id])

  async function toggleFav() {
    const next = !fav
    setFav(next)
    const { error: err } = next
      ? await supabase.from('favorite_businesses').insert({ business_id: business.id })
      : await supabase.from('favorite_businesses').delete().eq('business_id', business.id)
    if (err) setFav(!next)
  }

  const atStock = (p) => p.stock !== null && p.stock !== undefined && (cart[p.id]?.qty || 0) >= p.stock
  const add = (p) => {
    if (atStock(p)) return
    setCart({ ...cart, [p.id]: { product: p, qty: (cart[p.id]?.qty || 0) + 1 } })
  }

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
          <button
            type="button"
            className={`fav-btn ${fav ? 'on' : ''}`}
            aria-pressed={fav}
            aria-label={fav ? 'Quitar de favoritos' : 'Guardar en favoritos'}
            onClick={toggleFav}
          >
            <Heart size={22} fill={fav ? 'currentColor' : 'none'} />
          </button>
        </h2>
        <p>{[business.category, business.address].filter(Boolean).join(' - ')}</p>
      </div>

      {!business.is_open && (
        <div className="notice">Este negocio está cerrado ahora. Puedes ver el menú, pero no pedir.</div>
      )}
      {loyalty && (
        <div className="loyalty-banner">
          <Heart size={20} />
          <div>
            {loyalty.pending > 0 ? (
              <>
                <b>Tienes un premio disponible</b>
                <span>Úsalo en este pedido: {loyaltyReward(loyalty)}.</span>
              </>
            ) : (
              <>
                <b>Cliente habitual</b>
                <span>
                  Te faltan {Math.max(loyalty.every - loyalty.completed, 0)}{' '}
                  {loyalty.every - loyalty.completed === 1 ? 'pedido' : 'pedidos'} para ganar{' '}
                  {loyaltyReward(loyalty)}.
                </span>
              </>
            )}
          </div>
        </div>
      )}
      {error && <div className="msg error">{error}</div>}
      {products === null && !error && <p>Cargando menú...</p>}
      {products && products.length === 0 && (
        <div className="empty">
          <strong>Este negocio aún no publicó su menú</strong>
          Vuelve más tarde.
        </div>
      )}

      {cats.length > 0 && products && products.length > 0 && (
        <div className="menu-cats" role="tablist" aria-label="Categorías del menú">
          <button aria-pressed={catFilter === 'todos'} onClick={() => setCatFilter('todos')}>
            Todo
          </button>
          {cats
            .filter((c) => products.some((p) => p.category_id === c.id))
            .map((c) => (
              <button key={c.id} aria-pressed={catFilter === c.id} onClick={() => setCatFilter(c.id)}>
                {c.name}
              </button>
            ))}
          {products.some((p) => !p.category_id) && (
            <button aria-pressed={catFilter === 'otros'} onClick={() => setCatFilter('otros')}>
              Más productos
            </button>
          )}
        </div>
      )}

      <div className="list">
        {(products || [])
          .filter((p) =>
            catFilter === 'todos' ? true : catFilter === 'otros' ? !p.category_id : p.category_id === catFilter
          )
          .sort(
            (x, y) =>
              Number(y.available) - Number(x.available) ||
              (cats.findIndex((c) => c.id === x.category_id) + 1 || 999) -
                (cats.findIndex((c) => c.id === y.category_id) + 1 || 999)
          )
          .map((p) => (
          <div className={`card product ${p.available ? '' : 'soldout'}`} key={p.id}>
            <div className="info">
              <h3>{p.name}</h3>
              {p.description && <p className="meta">{p.description}</p>}
              <p className="price">{money(p.price)}</p>
              {p.has_delivery && <span className="badge propio">Envío incluido</span>}
              {!p.available && <span className="badge agotado">Agotado</span>}
              {p.available && p.stock !== null && p.stock !== undefined && p.stock <= 5 && (
                <span className="badge">{p.stock <= 3 ? 'Últimas unidades' : `Quedan ${p.stock}`}</span>
              )}
            </div>
            <div className="qty">
              {p.available && cart[p.id] && (
                <>
                  <button aria-label="Quitar uno" onClick={() => remove(p)}>
                    <Minus size={18} />
                  </button>
                  <b>{cart[p.id].qty}</b>
                </>
              )}
              {p.available && (
                <button
                  className="add"
                  aria-label="Agregar uno"
                  onClick={() => add(p)}
                  disabled={!business.is_open || atStock(p)}
                >
                  <Plus size={18} />
                </button>
              )}
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
  const [code, setCode] = useState('')
  const [applied, setApplied] = useState(null)
  const [couponMsg, setCouponMsg] = useState(null)
  const [loyalty, setLoyalty] = useState(null)
  const [useReward, setUseReward] = useState(false)

  useEffect(() => {
    supabase.rpc('loyalty_status', { p_business: business.id }).then(({ data }) => {
      setLoyalty(data || null)
      if (data && data.pending > 0) setUseReward(true)
    })
  }, [business.id])

  useEffect(() => {
    setApplied(null)
  }, [subtotal])

  useEffect(() => {
    setName((v) => v || me.name)
    setPhone((v) => v || me.phone)
  }, [me.name, me.phone])

  const courierFee = Number(business.courier_fee || 0)
  const fee = type === 'domicilio' && !allOwnDelivery ? courierFee : 0
  const couponDiscount = applied ? Number(applied.discount) : 0
  const afterCoupon = Math.max(subtotal - couponDiscount, 0)
  const rewardOn = useReward && loyalty && loyalty.pending > 0
  let rewardDiscount = 0
  if (rewardOn && loyalty.kind === 'porcentaje')
    rewardDiscount = Math.round(afterCoupon * Number(loyalty.value)) / 100
  if (rewardOn && loyalty.kind === 'monto') rewardDiscount = Math.min(Number(loyalty.value), afterCoupon)
  const discount = couponDiscount + rewardDiscount
  const total = Math.max(subtotal - discount, 0) + fee

  async function applyCoupon() {
    setCouponMsg(null)
    if (!code.trim()) return
    const { data, error } = await supabase.rpc('check_coupon', {
      p_business: business.id,
      p_code: code,
      p_subtotal: subtotal,
    })
    if (error) {
      setApplied(null)
      return setCouponMsg({
        type: 'error',
        text: error.message && error.message.length < 100 ? error.message : 'No se pudo aplicar el código.',
      })
    }
    setApplied({ code: code.trim().toUpperCase(), discount: data.discount })
    setCouponMsg({ type: 'ok', text: `Código aplicado: -${money(data.discount)}` })
  }

  const [askGeo, geoUI] = useGeoConsent()

  async function useMyLocation() {
    setMsg(null)
    if (!(await askGeo())) return
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
    const { data: placedData, error } = await supabase.rpc('place_order', {
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

    if (error) {
      setBusy(false)
      const text = error.message && error.message.length < 100 ? error.message : 'No pudimos enviar tu pedido. Inténtalo de nuevo.'
      return setMsg({ type: 'error', text })
    }

    let extra = ''
    if (applied || rewardOn) {
      let orderId = typeof placedData === 'string' ? placedData : placedData?.id || placedData?.[0]?.id || null
      if (!orderId) {
        const { data: u } = await supabase.auth.getUser()
        const { data: last } = await supabase
          .from('orders')
          .select('id')
          .eq('customer_id', u.user.id)
          .eq('business_id', business.id)
          .eq('status', 'enviado')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        orderId = last?.id || null
      }
      if (orderId) {
        const { error: dErr } = await supabase.rpc('apply_order_discounts', {
          p_order: orderId,
          p_code: applied ? applied.code : null,
          p_use_reward: !!rewardOn,
        })
        if (dErr) extra = 'No pudimos aplicar el descuento; consúltalo con el negocio.'
      }
    }
    setBusy(false)
    onPlaced(extra)
  }

  return (
    <form onSubmit={submit}>
      {geoUI}
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
        {discount > 0 && (
          <div className="sum-line discount-line">
            <span>Descuento</span>
            <span>-{money(discount)}</span>
          </div>
        )}
        <div className="sum-line total">
          <span>Total</span>
          <span>{money(total)}</span>
        </div>
      </div>

      <div className="coupon-box">
        <div className="coupon-row">
          <input
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase())
              setApplied(null)
              setCouponMsg(null)
            }}
            placeholder="Código de descuento"
            autoCapitalize="characters"
            aria-label="Código de descuento"
          />
          <button type="button" className="btn small secondary" onClick={applyCoupon}>
            Aplicar
          </button>
        </div>
        {couponMsg && <div className={`msg ${couponMsg.type}`}>{couponMsg.text}</div>}
        {loyalty && loyalty.pending > 0 && (
          <label className="check" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={useReward} onChange={(e) => setUseReward(e.target.checked)} />
            <span>Usar mi premio de cliente habitual: {loyaltyReward(loyalty)}</span>
          </label>
        )}
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

function MyOrders({ notice, onOpenBusiness, onReorder }) {
  const [reviewing, setReviewing] = useState(null)
  const [reviews, setReviews] = useState({})
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
          'id, status, delivery_type, delivery_mode, courier_id, delivery_lat, delivery_lng, total, discount, coupon_code, reward_note, cancelled_by, created_at, business:businesses(id, name, category, tier, lat, lng), order_items(id, product_name, quantity)'
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
    const rv = await supabase.from('reviews').select('order_id, business_rating').eq('customer_id', uid)
    if (rv.data) setReviews(Object.fromEntries(rv.data.map((r) => [r.order_id, r.business_rating])))
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

  async function reorder(o) {
    setError('')
    const list = await loadVisibleBusinesses(true)
    const biz = (list || []).find((b) => b.id === o.business?.id)
    if (!biz) return setError('Este negocio no está disponible ahora.')
    const { data: prods } = await supabase
      .from('products')
      .select('*')
      .eq('business_id', biz.id)
      .eq('available', true)
    const lines = o.order_items
      .map((i) => {
        const p = (prods || []).find((x) => x.name === i.product_name)
        if (!p) return null
        const qty = p.stock !== null && p.stock !== undefined ? Math.min(i.quantity, p.stock) : i.quantity
        return qty > 0 ? { product: p, qty } : null
      })
      .filter(Boolean)
    if (lines.length === 0) return setError('Esos productos ya no están disponibles.')
    onReorder(biz, lines)
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
        {Number(o.discount) > 0 && <p className="meta discount-line">Descuento: -{money(o.discount)}</p>}
        <p className="meta">Total: {money(o.total)}</p>

        <ul className="steps">
          {steps.map((st, i) => (
            <li key={st} className={`step ${i < idx ? 'done' : ''} ${i === idx ? 'now' : ''}`}>
              <span className="pip" />
              {STATUS_LABELS[st]}
            </li>
          ))}
        </ul>

        {o.courier_id && ['confirmado', 'en_fogones', 'listo_para_salir', 'rumbo_a_ti', 'a_la_vuelta'].includes(o.status) && (
          <div style={{ marginTop: 12 }}>
            <CourierInfo orderId={o.id} label="Tu repartidor" />
          </div>
        )}
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
        {Number(o.discount) > 0 && (
          <div className="sum-line discount-line">
            <span>Descuento{o.coupon_code ? ` (${o.coupon_code})` : ''}</span>
            <span>-{money(o.discount)}</span>
          </div>
        )}
        {o.reward_note && <p className="meta discount-line">Premio cliente habitual: {o.reward_note}</p>}
        <div className="sum-line total">
          <span>Total</span>
          <span className={delivered ? '' : 'struck'}>{money(o.total)}</span>
        </div>
        {!delivered && o.cancelled_by && o.cancelled_by !== uid && Date.now() - new Date(o.created_at).getTime() < 3 * 86400000 && (
          <div className="rejected-box">
            <b>El negocio no pudo aceptar tu pedido</b>
            <span>Estas opciones están abiertas ahora y se parecen:</span>
            <SimilarBusinesses
              exclude={o.business?.id}
              category={o.business?.category}
              onOpen={onOpenBusiness}
            />
          </div>
        )}
        {delivered && (
          <div className="order-actions">
            {reviews[o.id] ? (
              <span className="rate">
                <Star size={14} fill="currentColor" /> Valoraste con {reviews[o.id]}
              </span>
            ) : (
              <button className="btn small secondary" onClick={() => setReviewing(o)}>
                Valorar pedido
              </button>
            )}
            <button className="btn small" onClick={() => reorder(o)}>
              Pedir otra vez
            </button>
          </div>
        )}
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
            <small>Completados</small>
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

      {reviewing && (
        <ReviewSheet
          order={reviewing}
          onClose={() => setReviewing(null)}
          onDone={() => {
            setReviewing(null)
            load()
          }}
        />
      )}
    </>
  )
}
