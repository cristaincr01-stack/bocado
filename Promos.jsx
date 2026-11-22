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
