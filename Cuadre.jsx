import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { supabase } from './lib.js'
import { money } from './utils.js'
import { Select, SegNav } from './ui.jsx'

const TZ = 'America/Havana'

function dayOptions() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - i * 86400000)
    const value = d.toLocaleDateString('en-CA', { timeZone: TZ })
    const label =
      i === 0
        ? 'Hoy'
        : i === 1
          ? 'Ayer'
          : d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short', timeZone: TZ })
    return { value, label: label.charAt(0).toUpperCase() + label.slice(1) }
  })
}

function DayClose({ business }) {
  const options = dayOptions()
  const [day, setDay] = useState(options[0].value)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setData(null)
    setError('')
    supabase.rpc('business_day_close', { p_business: business.id, p_day: day }).then(({ data: d, error: err }) => {
      if (err) setError('No pudimos cargar el cierre del día.')
      else setData(d)
    })
  }, [business.id, day])

  return (
    <div className="stack">
      <div className="field">
        <span>Día</span>
        <Select title="Elegir día" value={day} onChange={setDay} options={options} />
      </div>
      {error && <div className="msg error">{error}</div>}
      {!data && !error && <p>Cargando...</p>}
      {data && (
        <>
          <div className="st-grid">
            <div className="st-kpi">
              <div className="st-kpi-top"><span>Ventas entregadas</span></div>
              <b>{money(data.delivered_total)}</b>
              <span className="st-sub">{data.delivered} pedidos</span>
            </div>
            <div className="st-kpi">
              <div className="st-kpi-top"><span>Cancelados</span></div>
              <b>{data.cancelled}</b>
              <span className="st-sub">{data.in_progress} en curso</span>
            </div>
            <div className="st-kpi">
              <div className="st-kpi-top"><span>Descuentos dados</span></div>
              <b>{money(data.discounts)}</b>
            </div>
            <div className="st-kpi">
              <div className="st-kpi-top"><span>Envíos cobrados</span></div>
              <b>{money(data.delivery_fees)}</b>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Cobros por método de pago</h3>
            {(data.by_payment || []).length === 0 ? (
              <p className="hint">No hubo pedidos entregados este día.</p>
            ) : (
              data.by_payment.map((m) => (
                <div className="sum-line" key={m.method}>
                  <span>
                    {m.method} <small className="muted">({m.orders})</small>
                  </span>
                  <b>{money(m.total)}</b>
                </div>
              ))
            )}
            <p className="hint" style={{ marginTop: 10 }}>
              Compara estos totales con el dinero que recibiste para cuadrar la caja.
            </p>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Productos vendidos</h3>
            {(data.items || []).length === 0 ? (
              <p className="hint">Sin ventas este día.</p>
            ) : (
              data.items.map((i) => (
                <div className="sum-line" key={i.name}>
                  <span>
                    {i.qty} × {i.name}
                  </span>
                  <b>{money(i.total)}</b>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Inventory({ business }) {
  const [items, setItems] = useState(null)
  const [values, setValues] = useState({})
  const [msg, setMsg] = useState(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, stock, available')
      .eq('business_id', business.id)
      .order('name')
    if (error) return setMsg({ type: 'error', text: 'No pudimos cargar tu inventario.' })
    setItems(data)
    setValues(Object.fromEntries(data.map((p) => [p.id, p.stock === null ? '' : String(p.stock)])))
  }, [business.id])

  useEffect(() => {
    load()
  }, [load])

  async function save(p) {
    setMsg(null)
    const raw = values[p.id]
    const stock = raw === '' ? null : Math.max(0, Math.floor(Number(raw)))
    if (raw !== '' && Number.isNaN(stock)) return setMsg({ type: 'error', text: 'Escribe un número válido.' })
    const change = { stock }
    if (stock === 0) change.available = false
    if (stock !== null && stock > 0 && p.stock === 0) change.available = true
    const { error } = await supabase.from('products').update(change).eq('id', p.id)
    if (error) return setMsg({ type: 'error', text: 'No pudimos guardar la cantidad.' })
    setMsg({ type: 'ok', text: `${p.name}: guardado.` })
    load()
  }

  const controlled = (items || []).filter((p) => p.stock !== null)
  const low = controlled.filter((p) => p.stock <= 3)

  return (
    <div className="stack">
      <p className="hint">
        Escribe cuántas unidades tienes de cada producto. Bajan solas cuando vendes, y cuando llegan a cero el
        producto se marca como agotado. Déjalo vacío si no llevas control de ese producto.
      </p>
      {low.length > 0 && (
        <div className="notice">
          Quedan pocas unidades de: {low.map((p) => `${p.name} (${p.stock})`).join(', ')}.
        </div>
      )}
      {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}
      {items === null && <p>Cargando...</p>}
      {items && items.length === 0 && (
        <div className="empty">
          <strong>Aún no tienes productos</strong>
          Agrégalos en la pestaña Menú.
        </div>
      )}
      <div className="list">
        {(items || []).map((p) => (
          <div className="card inv-row" key={p.id}>
            <div className="inv-name">
              <h3>{p.name}</h3>
              <span className="meta">{p.stock === null ? 'Sin control' : `Quedan ${p.stock}`}</span>
            </div>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={values[p.id] ?? ''}
              placeholder="Sin control"
              onChange={(e) => setValues({ ...values, [p.id]: e.target.value })}
              aria-label={`Cantidad de ${p.name}`}
            />
            <button className="btn small" onClick={() => save(p)}>
              Guardar
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Cuadre({ business, onBack }) {
  const [tab, setTab] = useState('dia')
  return (
    <div className="stack">
      <button type="button" className="link" onClick={onBack}>
        <ArrowLeft size={18} /> Volver a herramientas
      </button>
      <h3 className="section-title" style={{ marginTop: 0 }}>
        Cuadre de ventas e inventario
      </h3>
      <SegNav
        items={[
          { id: 'dia', label: 'Cierre del día' },
          { id: 'inventario', label: 'Inventario' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'dia' ? <DayClose business={business} /> : <Inventory business={business} />}
    </div>
  )
}
