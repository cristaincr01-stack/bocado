import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib.js'
import { money } from './utils.js'
import { Select, useConfirm } from './ui.jsx'

const EXPIRY = [
  { value: '0', label: 'Sin vencimiento' },
  { value: '7', label: 'Vence en 7 días' },
  { value: '15', label: 'Vence en 15 días' },
  { value: '30', label: 'Vence en 30 días' },
  { value: '60', label: 'Vence en 60 días' },
]

function couponText(c) {
  const off = c.kind === 'porcentaje' ? `${Number(c.value)}% de descuento` : `${money(c.value)} de descuento`
  const min = Number(c.min_order) > 0 ? ` - pedido mínimo ${money(c.min_order)}` : ''
  return off + min
}

/* ------------------------------------------------------------------ */
/* Códigos de descuento (todos los niveles)                            */
/* ------------------------------------------------------------------ */

export function CouponsManager({ business, onBack }) {
  const [confirm, confirmUI] = useConfirm()
  const [list, setList] = useState(null)
  const [adding, setAdding] = useState(false)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({
    code: '',
    kind: 'porcentaje',
    value: '',
    min_order: '',
    max_uses: '',
    expiry: '0',
    once: true,
  })

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('coupons')
      .select('*')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })
    if (error) setMsg({ type: 'error', text: 'No pudimos cargar tus códigos.' })
    else setList(data)
  }, [business.id])

  useEffect(() => {
    load()
  }, [load])

  async function create(e) {
    e.preventDefault()
    setMsg(null)
    const code = f.code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
    const value = Number(f.value)
    if (code.length < 3) return setMsg({ type: 'error', text: 'El código necesita al menos 3 letras o números.' })
    if (!(value > 0)) return setMsg({ type: 'error', text: 'Escribe el valor del descuento.' })
    if (f.kind === 'porcentaje' && value > 100)
      return setMsg({ type: 'error', text: 'El porcentaje no puede pasar de 100.' })
    setBusy(true)
    const { error } = await supabase.from('coupons').insert({
      business_id: business.id,
      code,
      kind: f.kind,
      value,
      min_order: f.min_order ? Number(f.min_order) : 0,
      max_uses: f.max_uses ? Number(f.max_uses) : null,
      expires_at: f.expiry === '0' ? null : new Date(Date.now() + Number(f.expiry) * 86400000).toISOString(),
      once_per_customer: f.once,
    })
    setBusy(false)
    if (error)
      return setMsg({
        type: 'error',
        text: error.code === '23505' ? 'Ya tienes un código con ese nombre.' : 'No pudimos crear el código.',
      })
    setF({ code: '', kind: 'porcentaje', value: '', min_order: '', max_uses: '', expiry: '0', once: true })
    setAdding(false)
    setMsg({ type: 'ok', text: `Código ${code} creado.` })
    load()
  }

  async function toggle(c) {
    await supabase.from('coupons').update({ active: !c.active }).eq('id', c.id)
    load()
  }

  async function remove(c) {
    if (!(await confirm(`¿Eliminar el código ${c.code}?`, 'Eliminar'))) return
    await supabase.from('coupons').delete().eq('id', c.id)
    load()
  }

  const expired = (c) => c.expires_at && new Date(c.expires_at).getTime() < Date.now()

  return (
    <div className="stack">
      {confirmUI}
      <button type="button" className="link" onClick={onBack}>
        Volver a herramientas
      </button>
      <h3 className="section-title" style={{ marginTop: 0 }}>
        Códigos de descuento
      </h3>
      <p className="hint">
        Tus clientes escriben el código al hacer el pedido. Tú decides cuánto descuentas, hasta cuándo y
        cuántas veces se puede usar.
      </p>
      {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}

      {!adding ? (
        <button className="btn" onClick={() => setAdding(true)}>
          Crear código
        </button>
      ) : (
        <form className="card" onSubmit={create}>
          <label className="field">
            <span>Código</span>
            <input
              value={f.code}
              onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })}
              placeholder="Por ejemplo: BIENVENIDO10"
              autoCapitalize="characters"
            />
          </label>
          <div className="field">
            <span>Tipo de descuento</span>
            <Select
              title="Tipo de descuento"
              value={f.kind}
              onChange={(v) => setF({ ...f, kind: v })}
              options={[
                { value: 'porcentaje', label: 'Porcentaje (%)' },
                { value: 'monto', label: 'Monto fijo (CUP)' },
              ]}
            />
          </div>
          <label className="field">
            <span>{f.kind === 'porcentaje' ? 'Porcentaje a descontar' : 'Monto a descontar (CUP)'}</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={f.value}
              onChange={(e) => setF({ ...f, value: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Pedido mínimo en CUP (opcional)</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={f.min_order}
              onChange={(e) => setF({ ...f, min_order: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Usos máximos en total (opcional)</span>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              value={f.max_uses}
              onChange={(e) => setF({ ...f, max_uses: e.target.value })}
            />
          </label>
          <div className="field">
            <span>Vencimiento</span>
            <Select title="Vencimiento" value={f.expiry} onChange={(v) => setF({ ...f, expiry: v })} options={EXPIRY} />
          </div>
          <label className="check">
            <input type="checkbox" checked={f.once} onChange={(e) => setF({ ...f, once: e.target.checked })} />
            <span>Un solo uso por cliente</span>
          </label>
          <div className="order-actions">
            <button className="btn small" disabled={busy}>
              {busy ? 'Guardando...' : 'Guardar código'}
            </button>
            <button type="button" className="btn small secondary" onClick={() => setAdding(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {list === null && <p>Cargando...</p>}
      {list && list.length === 0 && !adding && (
        <div className="empty">
          <strong>Aún no tienes códigos</strong>
          Crea el primero para atraer clientes nuevos.
        </div>
      )}
      <div className="list">
        {(list || []).map((c) => (
          <div className="card" key={c.id}>
            <div className="row">
              <h3>{c.code}</h3>
              <span className={`badge ${c.active && !expired(c) ? 'aprobado' : ''}`}>
                {expired(c) ? 'Vencido' : c.active ? 'Activo' : 'Pausado'}
              </span>
            </div>
            <p className="meta">{couponText(c)}</p>
            <p className="meta">
              Usado {c.uses}
              {c.max_uses ? ` de ${c.max_uses}` : ''} {c.uses === 1 ? 'vez' : 'veces'}
              {c.once_per_customer ? ' - un uso por cliente' : ''}
            </p>
            <div className="order-actions">
              <button className="btn small secondary" onClick={() => toggle(c)}>
                {c.active ? 'Pausar' : 'Activar'}
              </button>
              <button className="btn small danger" onClick={() => remove(c)}>
                Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Cliente habitual (todos los niveles)                                */
/* ------------------------------------------------------------------ */

const EVERY = [3, 5, 8, 10, 15, 20].map((n) => ({ value: String(n), label: `Cada ${n} pedidos` }))

export function LoyaltyManager({ business, onBack }) {
  const [prog, setProg] = useState(null)
  const [regulars, setRegulars] = useState([])
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ active: false, every: '10', kind: 'porcentaje', value: '', text: '' })

  useEffect(() => {
    supabase
      .from('loyalty_programs')
      .select('*')
      .eq('business_id', business.id)
      .maybeSingle()
      .then(({ data }) => {
        setProg(data || false)
        if (data)
          setF({
            active: data.active,
            every: String(data.every_orders),
            kind: data.reward_kind,
            value: data.reward_value ? String(Number(data.reward_value)) : '',
            text: data.reward_text || '',
          })
      })
    supabase.rpc('business_regulars', { p_business: business.id }).then(({ data }) => setRegulars(data || []))
  }, [business.id])

  async function save(e) {
    e.preventDefault()
    setMsg(null)
    const value = Number(f.value || 0)
    if (f.kind !== 'regalo' && !(value > 0))
      return setMsg({ type: 'error', text: 'Escribe el valor del premio.' })
    if (f.kind === 'porcentaje' && value > 100)
      return setMsg({ type: 'error', text: 'El porcentaje no puede pasar de 100.' })
    if (f.kind === 'regalo' && !f.text.trim())
      return setMsg({ type: 'error', text: 'Escribe cuál es el regalo.' })
    setBusy(true)
    const { error } = await supabase.from('loyalty_programs').upsert({
      business_id: business.id,
      active: f.active,
      every_orders: Number(f.every),
      reward_kind: f.kind,
      reward_value: f.kind === 'regalo' ? 0 : value,
      reward_text: f.kind === 'regalo' ? f.text.trim() : null,
      updated_at: new Date().toISOString(),
    })
    setBusy(false)
    if (error) setMsg({ type: 'error', text: 'No pudimos guardar el programa.' })
    else {
      setProg(true)
      setMsg({ type: 'ok', text: f.active ? 'Programa guardado y activo.' : 'Programa guardado (apagado).' })
    }
  }

  if (prog === null) return <p>Cargando...</p>

  return (
    <div className="stack">
      <button type="button" className="link" onClick={onBack}>
        Volver a herramientas
      </button>
      <h3 className="section-title" style={{ marginTop: 0 }}>
        Cliente habitual
      </h3>
      <p className="hint">
        Premia a quienes te piden seguido. Cuando un cliente completa la cantidad de pedidos que elijas, gana
        un premio para su próximo pedido. Los pedidos se cuentan desde que lo activas.
      </p>

      <form className="card" onSubmit={save}>
        <button
          type="button"
          className="switch"
          role="switch"
          aria-checked={f.active}
          onClick={() => setF({ ...f, active: !f.active })}
        >
          <span className="dot" />
          {f.active ? 'Programa activo' : 'Programa apagado'}
        </button>

        <div className="field" style={{ marginTop: 14 }}>
          <span>¿Cada cuántos pedidos?</span>
          <Select title="Pedidos para el premio" value={f.every} onChange={(v) => setF({ ...f, every: v })} options={EVERY} />
        </div>
        <div className="field">
          <span>Premio</span>
          <Select
            title="Premio"
            value={f.kind}
            onChange={(v) => setF({ ...f, kind: v })}
            options={[
              { value: 'porcentaje', label: 'Descuento en porcentaje (%)' },
              { value: 'monto', label: 'Descuento de monto fijo (CUP)' },
              { value: 'regalo', label: 'Un regalo' },
            ]}
          />
        </div>
        {f.kind !== 'regalo' ? (
          <label className="field">
            <span>{f.kind === 'porcentaje' ? 'Porcentaje a descontar' : 'Monto a descontar (CUP)'}</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={f.value}
              onChange={(e) => setF({ ...f, value: e.target.value })}
            />
          </label>
        ) : (
          <label className="field">
            <span>¿Qué regalas?</span>
            <input
              value={f.text}
              onChange={(e) => setF({ ...f, text: e.target.value })}
              placeholder="Por ejemplo: un refresco gratis"
            />
          </label>
        )}

        {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}
        <button className="btn small" disabled={busy}>
          {busy ? 'Guardando...' : 'Guardar programa'}
        </button>
      </form>

      <h3 className="section-title">Tus clientes más habituales</h3>
      {regulars.length === 0 ? (
        <p className="hint">Cuando tus clientes completen pedidos, aquí verás quiénes compran más.</p>
      ) : (
        <div className="card adm-rank">
          {regulars.map((r, i) => (
            <div className="adm-rank-row" key={i}>
              <span className="pos">{i + 1}</span>
              <span className="name">{r.name}</span>
              <span className="val">
                {r.done} {r.done === 1 ? 'pedido' : 'pedidos'}
                {r.pending > 0 && <small>Premio disponible</small>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Enlace y código QR del negocio (todos los niveles)                  */
/* ------------------------------------------------------------------ */

export function ShareBusiness({ business, onBack }) {
  const [msg, setMsg] = useState(null)
  const base = `${window.location.origin}${window.location.pathname}`
  const link = `${base}?negocio=${business.id}`
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=10&data=${encodeURIComponent(link)}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setMsg({ type: 'ok', text: 'Enlace copiado.' })
    } catch (e) {
      setMsg({ type: 'error', text: 'No pudimos copiarlo. Mantén presionado el enlace para copiarlo.' })
    }
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: business.name, text: `Haz tu pedido en ${business.name} por Bocado`, url: link })
      } catch (e) {
        /* el usuario cerró el menú de compartir */
      }
    } else copy()
  }

  return (
    <div className="stack">
      <button type="button" className="link" onClick={onBack}>
        Volver a herramientas
      </button>
      <h3 className="section-title" style={{ marginTop: 0 }}>
        Enlace y código QR
      </h3>
      <p className="hint">
        Pon este enlace en tu estado de WhatsApp, Instagram o Facebook, o imprime el QR en tu local. Tus clientes
        entran directo a tu menú.
      </p>
      <div className="card" style={{ textAlign: 'center' }}>
        <img className="qr-img" src={qr} alt={`Código QR de ${business.name}`} width="260" height="260" />
        <p className="hint">Mantén presionada la imagen para guardarla.</p>
        <p className="share-link">{link}</p>
        {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}
        <div className="order-actions" style={{ justifyContent: 'center' }}>
          <button className="btn small" onClick={share}>
            Compartir
          </button>
          <button className="btn small secondary" onClick={copy}>
            Copiar enlace
          </button>
        </div>
      </div>
      {business.is_open === false && (
        <p className="hint">Tu negocio solo aparece para los clientes cuando tiene un plan activo y está aprobado.</p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Soporte prioritario (Premium)                                       */
/* ------------------------------------------------------------------ */

export function PrioritySupport({ onBack }) {
  const [state, setState] = useState({ loading: true, phone: null, error: false })

  useEffect(() => {
    supabase.rpc('get_priority_support').then(({ data, error }) => {
      setState({ loading: false, phone: error ? null : data, error: !!error })
    })
  }, [])

  const digits = (state.phone || '').replace(/\D/g, '')

  return (
    <div className="stack">
      <button type="button" className="link" onClick={onBack}>
        Volver a herramientas
      </button>
      <h3 className="section-title" style={{ marginTop: 0 }}>
        Soporte prioritario
      </h3>
      {state.loading && <p>Cargando...</p>}
      {!state.loading && digits && (
        <div className="card">
          <p>Escríbenos por WhatsApp. Los planes Premium se atienden primero.</p>
          <a
            className="btn"
            href={`https://wa.me/${digits}?text=${encodeURIComponent('Hola, soy Premium en Bocado y necesito ayuda.')}`}
            target="_blank"
            rel="noreferrer"
          >
            Escribir a soporte
          </a>
        </div>
      )}
      {!state.loading && !digits && (
        <div className="notice">
          {state.error
            ? 'El soporte prioritario es para cuentas Premium con plan activo.'
            : 'Todavía no se configuró el número de soporte. Inténtalo más tarde.'}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Aviso a clientes cercanos (todos los niveles)                       */
/* ------------------------------------------------------------------ */

const RADIUS = [500, 1000, 2000, 3000, 5000].map((m) => ({
  value: String(m),
  label: m < 1000 ? `${m} metros` : `${m / 1000} km`,
}))
const DURATION = [
  { value: '3', label: '3 horas' },
  { value: '8', label: '8 horas' },
  { value: '24', label: '1 día' },
  { value: '72', label: '3 días' },
  { value: '168', label: '7 días' },
]

export function NearbyManager({ business, onBack }) {
  const [confirm, confirmUI] = useConfirm()
  const [list, setList] = useState(null)
  const [coupons, setCoupons] = useState([])
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ message: '', radius: '1000', hours: '24', code: '' })

  const load = useCallback(async () => {
    const [p, c] = await Promise.all([
      supabase.from('nearby_promos').select('*').eq('business_id', business.id).order('created_at', { ascending: false }).limit(20),
      supabase.from('coupons').select('code').eq('business_id', business.id).eq('active', true),
    ])
    if (p.error) setMsg({ type: 'error', text: 'No pudimos cargar tus avisos.' })
    else setList(p.data)
    setCoupons(c.data || [])
  }, [business.id])

  useEffect(() => {
    load()
  }, [load])

  async function create(e) {
    e.preventDefault()
    setMsg(null)
    const message = f.message.trim()
    if (message.length < 3) return setMsg({ type: 'error', text: 'Escribe el mensaje del aviso.' })
    if (!business.lat || !business.lng)
      return setMsg({ type: 'error', text: 'Tu negocio necesita ubicación en el mapa. Agrégala en Mi perfil.' })
    setBusy(true)
    const { error } = await supabase.from('nearby_promos').insert({
      business_id: business.id,
      message,
      coupon_code: f.code || null,
      radius_m: Number(f.radius),
      expires_at: new Date(Date.now() + Number(f.hours) * 3600000).toISOString(),
    })
    setBusy(false)
    if (error)
      return setMsg({
        type: 'error',
        text: error.message && error.message.length < 100 ? error.message : 'No pudimos crear el aviso.',
      })
    setF({ message: '', radius: '1000', hours: '24', code: '' })
    setMsg({ type: 'ok', text: 'Aviso publicado. Lo verán los clientes que estén cerca con la app abierta.' })
    load()
  }

  async function toggle(p) {
    await supabase.from('nearby_promos').update({ active: !p.active }).eq('id', p.id)
    load()
  }

  async function remove(p) {
    if (!(await confirm('¿Eliminar este aviso?', 'Eliminar'))) return
    await supabase.from('nearby_promos').delete().eq('id', p.id)
    load()
  }

  const live = (p) => p.active && new Date(p.expires_at).getTime() > Date.now()

  return (
    <div className="stack">
      {confirmUI}
      <button type="button" className="link" onClick={onBack}>
        Volver a herramientas
      </button>
      <h3 className="section-title" style={{ marginTop: 0 }}>
        Aviso a clientes cercanos
      </h3>
      <p className="hint">
        Publica una oferta y la verán los clientes que estén dentro del radio que elijas mientras tienen Bocado
        abierto. No guardamos la ubicación de los clientes. Puedes tener hasta 3 avisos activos a la vez.
      </p>
      {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}

      <form className="card" onSubmit={create}>
        <label className="field">
          <span>Mensaje ({f.message.length}/140)</span>
          <textarea
            value={f.message}
            maxLength={140}
            rows={3}
            placeholder="Por ejemplo: 2x1 en pizzas hasta las 6 pm"
            onChange={(e) => setF({ ...f, message: e.target.value })}
          />
        </label>
        <div className="field">
          <span>¿Hasta qué distancia?</span>
          <Select title="Distancia" value={f.radius} onChange={(v) => setF({ ...f, radius: v })} options={RADIUS} />
        </div>
        <div className="field">
          <span>¿Cuánto tiempo dura?</span>
          <Select title="Duración" value={f.hours} onChange={(v) => setF({ ...f, hours: v })} options={DURATION} />
        </div>
        {coupons.length > 0 && (
          <div className="field">
            <span>Código de descuento (opcional)</span>
            <Select
              title="Código"
              value={f.code}
              onChange={(v) => setF({ ...f, code: v })}
              options={[{ value: '', label: 'Sin código' }, ...coupons.map((c) => ({ value: c.code, label: c.code }))]}
            />
          </div>
        )}
        <button className="btn" disabled={busy}>
          {busy ? 'Publicando...' : 'Publicar aviso'}
        </button>
      </form>

      {list && list.length === 0 && (
        <div className="empty">
          <strong>Aún no tienes avisos</strong>
          Crea el primero arriba.
        </div>
      )}
      <div className="list">
        {(list || []).map((p) => (
          <div className="card" key={p.id}>
            <div className="row">
              <h3 style={{ fontSize: 16 }}>{p.message}</h3>
              <span className={`badge ${live(p) ? 'aprobado' : ''}`}>
                {live(p) ? 'Activo' : p.active ? 'Vencido' : 'Pausado'}
              </span>
            </div>
            <p className="meta">
              Radio {p.radius_m < 1000 ? `${p.radius_m} m` : `${p.radius_m / 1000} km`}
              {p.coupon_code ? ` - código ${p.coupon_code}` : ''}
            </p>
            <div className="order-actions">
              <button className="btn small secondary" onClick={() => toggle(p)}>
                {p.active ? 'Pausar' : 'Activar'}
              </button>
              <button className="btn small danger" onClick={() => remove(p)}>
                Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
