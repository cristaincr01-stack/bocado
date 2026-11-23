import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search, MapPin, Star, Sparkles, Clock, Bike, RefreshCw, ShoppingBag } from 'lucide-react'
import { supabase } from './lib.js'
import { money, getPosition } from './utils.js'
import { VerifiedBadge } from './Verified.jsx'
import { Select, Sheet, Stars, useGeoConsent } from './ui.jsx'
import { buildCombos } from './combo.js'

const CATEGORIES = ['Comida casera', 'Comida rápida', 'Pizzería', 'Cafetería', 'Dulcería y repostería', 'Otra']

/* ---------- utilidades ---------- */

export function distanceKm(a, b) {
  if (!a || !b || a.lat == null || b.lat == null || a.lng == null || b.lng == null) return null
  const rad = (x) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function distText(km) {
  if (km == null) return ''
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`
  return `${km.toFixed(1)} km`
}

let visibleCache = { at: 0, data: null }

export async function loadVisibleBusinesses(force = false) {
  if (!force && visibleCache.data && Date.now() - visibleCache.at < 20000) return visibleCache.data
  const { data, error } = await supabase.rpc('visible_businesses')
  let result = data
  if (error || !data) {
    const fb = await supabase
      .from('businesses')
      .select('id, name, category, address, is_open, courier_fee, tier, lat, lng')
      .eq('verification_status', 'aprobado')
    result = fb.data || []
  }
  visibleCache = { at: Date.now(), data: result }
  return result
}

function Rating({ b }) {
  if (!b.rating_count) return <span className="rate new">Nuevo</span>
  return (
    <span className="rate">
      <Star size={13} fill="currentColor" /> {Number(b.rating_avg).toFixed(1)} ({b.rating_count})
    </span>
  )
}

function BizCard({ b, onOpen, km, tile }) {
  const initial = (b.name || '?').trim().charAt(0).toUpperCase()
  return (
    <button className={`biz ${tile ? 'tile' : ''} ${b.is_open ? '' : 'closed'}`} onClick={() => onOpen(b)}>
      <div className="biz-cover">
        <span>{initial}</span>
      </div>
      <div className="biz-body">
        <div className="biz-head">
          <h3>
            {b.name} <VerifiedBadge tier={b.tier} size={16} />
          </h3>
          <em className={`biz-state ${b.is_open ? 'open' : ''}`}>{b.is_open ? 'Abierto' : 'Cerrado'}</em>
        </div>
        <p className="meta">{[b.category, km != null ? distText(km) : ''].filter(Boolean).join(' - ')}</p>
        <p className="meta biz-line">
          <Rating b={b} />
          <span>
            <Bike size={13} /> {Number(b.courier_fee) > 0 ? money(b.courier_fee) : 'Sin costo'}
          </span>
        </p>
      </div>
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Tarjeta destacada (rectangular) y carrusel                          */
/* ------------------------------------------------------------------ */

function FeaturedCard({ b, km, onOpen }) {
  const initial = (b.name || '?').trim().charAt(0).toUpperCase()
  return (
    <div
      className="feat"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(b)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(b)}
    >
      <div className="feat-top">
        <span className="feat-tag">
          <Sparkles size={14} /> Destacado
        </span>
        <Rating b={b} />
      </div>

      <div className="feat-main">
        <div className="feat-logo">{initial}</div>
        <div className="feat-info">
          <div className="feat-name">
            <h3>{b.name}</h3>
            <VerifiedBadge tier={b.tier} size={18} />
            <em className={`biz-state ${b.is_open ? 'open' : ''}`}>{b.is_open ? 'Abierto' : 'Cerrado'}</em>
          </div>
          <p className="feat-meta">
            <MapPin size={14} />
            {[b.category, b.address, km != null ? distText(km) : ''].filter(Boolean).join(' - ')}
          </p>
        </div>
      </div>

      <div className="feat-bottom">
        <div className="feat-fee">
          <small>Envío</small>
          <b>{Number(b.courier_fee) > 0 ? money(b.courier_fee) : 'Sin costo'}</b>
        </div>
        <div className="feat-actions">
          <button type="button" className="feat-cta" onClick={() => onOpen(b)}>
            Ver menú
          </button>
          <button type="button" className="feat-icon" aria-label="Pedir" onClick={() => onOpen(b)}>
            <ShoppingBag size={20} />
          </button>
        </div>
      </div>
    </div>
  )
}

function FeaturedCarousel({ items, km, onOpen }) {
  const ref = useRef(null)
  const [index, setIndex] = useState(0)

  function onScroll() {
    const el = ref.current
    if (!el || !el.firstChild) return
    const w = el.firstChild.offsetWidth + 12
    setIndex(Math.min(items.length - 1, Math.max(0, Math.round(el.scrollLeft / w))))
  }

  return (
    <>
      <div className="feat-scroll" ref={ref} onScroll={onScroll}>
        {items.map((b) => (
          <FeaturedCard key={b.id} b={b} km={km(b)} onOpen={onOpen} />
        ))}
      </div>
      {items.length > 1 && (
        <div className="feat-dots" aria-hidden="true">
          {items.map((b, k) => (
            <span key={b.id} className={k === index ? 'on' : ''} />
          ))}
        </div>
      )}
    </>
  )
}

/* Negocios abiertos parecidos (para recomendar cuando uno rechaza un pedido) */
export function SimilarBusinesses({ exclude, category, onOpen, limit = 3 }) {
  const [list, setList] = useState(null)

  useEffect(() => {
    let alive = true
    loadVisibleBusinesses(true).then((all) => {
      if (!alive) return
      const rank = { premium: 2, pro: 1, basico: 0 }
      setList(
        all
          .filter((b) => b.id !== exclude && b.is_open)
          .sort(
            (x, y) =>
              Number(y.category === category) - Number(x.category === category) ||
              Number(y.rating_avg || 0) - Number(x.rating_avg || 0) ||
              (rank[y.tier] || 0) - (rank[x.tier] || 0) ||
              x.name.localeCompare(y.name)
          )
          .slice(0, limit)
      )
    })
    return () => {
      alive = false
    }
  }, [exclude, category, limit])

  if (list === null) return <p className="hint">Buscando alternativas...</p>
  if (list.length === 0)
    return <p className="hint">Ahora mismo no hay otros negocios abiertos. Vuelve a intentarlo en un rato.</p>
  return (
    <div className="list">
      {list.map((b) => (
        <BizCard key={b.id} b={b} onOpen={onOpen} />
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Inicio                                                              */
/* ------------------------------------------------------------------ */

export function HomeScreen({ onOpen, onSurprise }) {
  const [items, setItems] = useState(null)
  const [query, setQuery] = useState('')
  const [chip, setChip] = useState('todos')
  const [pos, setPos] = useState(null)
  const [geoMsg, setGeoMsg] = useState('')
  const [askGeo, geoUI] = useGeoConsent()

  useEffect(() => {
    loadVisibleBusinesses().then(setItems)
  }, [])

  const locate = useCallback(
    async (silent) => {
      setGeoMsg('')
      if (!silent && !(await askGeo())) return
      try {
        setPos(await getPosition())
      } catch (e) {
        if (!silent) setGeoMsg('No pudimos leer tu ubicación. Activa el permiso en tu teléfono.')
      }
    },
    [askGeo]
  )

  useEffect(() => {
    try {
      if (window.localStorage.getItem('bocado_geo_ok') === '1') locate(true)
    } catch (e) {
      /* sin almacenamiento */
    }
  }, [locate])

  const rank = { premium: 2, pro: 1, basico: 0 }
  const withDist = useMemo(
    () =>
      (items || []).map((b) => ({
        ...b,
        km: pos ? distanceKm(pos, { lat: Number(b.lat), lng: Number(b.lng) }) : null,
      })),
    [items, pos]
  )

  const filtered = withDist
    .filter((b) => {
      if (chip === 'abiertos' && !b.is_open) return false
      if (chip !== 'todos' && chip !== 'abiertos' && b.category !== chip) return false
      const q = query.trim().toLowerCase()
      return !q || `${b.name} ${b.category || ''}`.toLowerCase().includes(q)
    })
    .sort(
      (x, y) =>
        Number(y.is_open) - Number(x.is_open) ||
        (rank[y.tier] || 0) - (rank[x.tier] || 0) ||
        (x.km ?? 999) - (y.km ?? 999) ||
        x.name.localeCompare(y.name)
    )

  const browsing = chip === 'todos' && !query.trim()
  const nearby = withDist
    .filter((b) => b.is_open && b.km != null && b.km <= 3)
    .sort((x, y) => x.km - y.km)
    .slice(0, 8)
  const featured = withDist.filter((b) => b.tier === 'premium' && b.is_open)
  const alertBiz = withDist
    .filter((b) => b.is_open && ['pro', 'premium'].includes(b.tier) && b.km != null && b.km <= 0.4)
    .sort((x, y) => x.km - y.km)[0]

  const chips = [
    ['todos', 'Todos'],
    ['abiertos', 'Abiertos ahora'],
    ...CATEGORIES.map((c) => [c, c]),
  ]

  return (
    <>
      {geoUI}
      <div className="search">
        <Search size={20} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar negocios o comida"
          aria-label="Buscar"
        />
      </div>

      <div className="chips" role="tablist">
        {chips.map(([id, label]) => (
          <button key={id} aria-pressed={chip === id} onClick={() => setChip(id)}>
            {label}
          </button>
        ))}
      </div>

      {alertBiz && (
        <button className="near-alert" onClick={() => onOpen(alertBiz)}>
          <MapPin size={20} />
          <span>
            <b>Estás cerca de {alertBiz.name}</b>
            <small>A {distText(alertBiz.km)}. Toca para ver su menú.</small>
          </span>
        </button>
      )}

      {browsing && (
        <button className="promo" onClick={onSurprise}>
          <div>
            <b>Sorpréndeme</b>
            <span>Dinos cuánto tienes y armamos tu combo.</span>
          </div>
          <Sparkles size={34} />
        </button>
      )}

      {browsing && !pos && (
        <button className="geo-chip" onClick={() => locate(false)}>
          <MapPin size={18} /> Ver negocios cerca de mí
        </button>
      )}
      {geoMsg && <div className="msg error">{geoMsg}</div>}

      {items === null && <p>Cargando...</p>}
      {items && items.length === 0 && (
        <div className="empty">
          <strong>Aún no hay negocios en tu zona</strong>
          Estamos sumando los primeros. Vuelve pronto.
        </div>
      )}

      {browsing && nearby.length > 0 && (
        <>
          <h3 className="section-title">Cerca de ti</h3>
          <div className="hscroll">
            {nearby.map((b) => (
              <BizCard key={b.id} b={b} km={b.km} onOpen={onOpen} tile />
            ))}
          </div>
        </>
      )}

      {browsing && featured.length > 0 && (
        <>
          <h3 className="section-title">Destacados</h3>
          <FeaturedCarousel items={featured} km={(b) => b.km} onOpen={onOpen} />
        </>
      )}

      {items && items.length > 0 && (
        <>
          <h3 className="section-title">{browsing ? 'Todos los negocios' : 'Resultados'}</h3>
          {filtered.length === 0 && (
            <div className="empty">
              <strong>No encontramos nada</strong>
              Prueba con otra búsqueda o categoría.
            </div>
          )}
          <div className="list">
            {filtered.map((b) => (
              <BizCard key={b.id} b={b} km={b.km} onOpen={onOpen} />
            ))}
          </div>
        </>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Sorpréndeme                                                         */
/* ------------------------------------------------------------------ */

const PEOPLE = [
  { value: '1', label: 'Para 1 persona' },
  { value: '2', label: 'Para 2 personas' },
  { value: '3', label: 'Para 3 personas' },
  { value: '4', label: 'Para 4 personas' },
]

export function SurpriseScreen({ onCombo }) {
  const [budget, setBudget] = useState('')
  const [people, setPeople] = useState('1')
  const [products, setProducts] = useState(null)
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function load() {
    const list = (await loadVisibleBusinesses()).filter((b) => b.is_open)
    if (list.length === 0) return []
    const byId = Object.fromEntries(list.map((b) => [b.id, b]))
    const { data, error } = await supabase
      .from('products')
      .select('id, name, price, has_delivery, business_id')
      .eq('available', true)
      .in('business_id', list.map((b) => b.id))
      .limit(800)
    if (error) throw error
    return data.map((p) => ({ ...p, business: byId[p.business_id] }))
  }

  async function run(again) {
    setMsg('')
    const amount = Number(budget)
    if (!(amount > 0)) return setMsg('Escribe cuánto quieres gastar.')
    setBusy(true)
    try {
      let list = products
      if (!list || !again) {
        list = await load()
        setProducts(list)
      }
      const found = buildCombos(list, amount, Number(people))
      setResults(found)
      if (found.length === 0)
        setMsg('Con ese presupuesto no encontramos un combo abierto ahora. Prueba con un poco más.')
    } catch (e) {
      setMsg('No pudimos armar los combos. Inténtalo de nuevo.')
    }
    setBusy(false)
  }

  return (
    <>
      <div className="surprise-head">
        <Sparkles size={26} />
        <div>
          <h2>Sorpréndeme</h2>
          <p>Dinos cuánto quieres gastar y armamos el mejor combo con lo que hay abierto ahora.</p>
        </div>
      </div>

      <label className="field">
        <span>Tu presupuesto (CUP)</span>
        <input
          type="number"
          inputMode="numeric"
          min="0"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          placeholder="Por ejemplo: 800"
        />
      </label>
      <div className="chips" style={{ marginTop: -6 }}>
        {[300, 500, 800, 1200, 2000].map((n) => (
          <button key={n} aria-pressed={Number(budget) === n} onClick={() => setBudget(String(n))}>
            {money(n)}
          </button>
        ))}
      </div>
      <div className="field">
        <span>¿Para cuántos?</span>
        <Select title="¿Para cuántos?" value={people} onChange={setPeople} options={PEOPLE} />
      </div>
      <p className="hint" style={{ marginBottom: 14 }}>
        El presupuesto incluye el envío. Siempre armamos el combo que más te rinde.
      </p>

      {msg && <div className="msg error">{msg}</div>}
      <button className="btn" disabled={busy} onClick={() => run(false)}>
        {busy ? 'Buscando...' : 'Armar mi combo'}
      </button>

      {results && results.length > 0 && (
        <>
          <div className="row" style={{ marginTop: 22 }}>
            <h3 className="section-title" style={{ margin: 0 }}>
              Tus combos
            </h3>
            <button className="link" onClick={() => run(true)}>
              <RefreshCw size={16} /> Otras opciones
            </button>
          </div>
          <div className="list" style={{ marginTop: 12 }}>
            {results.map((r, i) => (
              <div className="card combo" key={`${r.business.id}-${i}`}>
                <div className="row">
                  <h3>
                    {r.business.name} <VerifiedBadge tier={r.business.tier} size={16} />
                  </h3>
                  {i === 0 && <span className="badge aprobado">Mejor opción</span>}
                </div>
                <ul className="items-list">
                  {r.lines.map((l) => (
                    <li key={l.product.id}>
                      {l.qty} × {l.product.name}
                    </li>
                  ))}
                </ul>
                <div className="sum-line">
                  <span>Productos</span>
                  <span>{money(r.subtotal)}</span>
                </div>
                {r.fee > 0 && (
                  <div className="sum-line">
                    <span>Envío</span>
                    <span>{money(r.fee)}</span>
                  </div>
                )}
                <div className="sum-line total">
                  <span>Total</span>
                  <span>{money(r.total)}</span>
                </div>
                {r.left > 0 && <p className="hint">Te sobran {money(r.left)}.</p>}
                <button className="btn" style={{ marginTop: 10 }} onClick={() => onCombo(r)}>
                  Pedir este combo
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Valorar un pedido entregado                                         */
/* ------------------------------------------------------------------ */

export function ReviewSheet({ order, onClose, onDone }) {
  const [biz, setBiz] = useState(0)
  const [courier, setCourier] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function send() {
    if (!biz) return setMsg('Elige cuántas estrellas le das al negocio.')
    setBusy(true)
    const { error } = await supabase.rpc('submit_review', {
      p_order: order.id,
      p_business_rating: biz,
      p_courier_rating: order.courier_id && courier ? courier : null,
      p_comment: comment.trim() || null,
    })
    setBusy(false)
    if (error) return setMsg('No pudimos enviar tu valoración.')
    onDone()
  }

  return (
    <Sheet title="Valora tu pedido" onClose={onClose}>
      <p className="meta" style={{ margin: '0 4px 8px' }}>
        {order.business?.name || 'Negocio'}
      </p>
      <Stars value={biz} onChange={setBiz} />
      {order.courier_id && (
        <>
          <p className="meta" style={{ margin: '16px 4px 6px' }}>
            Tu repartidor
          </p>
          <Stars value={courier} onChange={setCourier} />
        </>
      )}
      <label className="field" style={{ marginTop: 16 }}>
        <span>Comentario (opcional)</span>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      {msg && <div className="msg error">{msg}</div>}
      <button className="btn" disabled={busy} onClick={send}>
        {busy ? 'Enviando...' : 'Enviar valoración'}
      </button>
    </Sheet>
  )
}
