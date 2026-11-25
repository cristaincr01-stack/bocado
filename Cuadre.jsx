import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Plus,
  Minus,
  ShoppingCart,
  Receipt,
  ArrowUpFromLine,
  ArrowDownToLine,
  Lock,
  Share2,
  Banknote,
  Trash2,
} from 'lucide-react'
import { supabase } from './lib.js'
import { money } from './utils.js'
import { Select, SegNav, useConfirm } from './ui.jsx'

const TZ = 'America/Havana'
const METHODS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'otro', label: 'Otro' },
]
const DENOMS = [1000, 500, 200, 100, 50, 20, 10, 5, 3, 1]
const CONCEPTS = {
  gasto: ['Compra de insumos', 'Transporte', 'Salario', 'Gas o luz', 'Otro gasto'],
  retiro: ['Depósito al banco', 'Retiro del dueño', 'Cambio de billetes', 'Otro retiro'],
  aporte: ['Cambio para la caja', 'Aporte del dueño', 'Otro aporte'],
}
const KIND_LABEL = { gasto: 'Gasto', retiro: 'Retiro', aporte: 'Aporte' }

const hour = (ts) =>
  new Date(ts).toLocaleTimeString('es', { hour: 'numeric', minute: '2-digit', timeZone: TZ })
const dateLong = (ts) =>
  new Date(ts).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short', timeZone: TZ })

/* ---------- texto para compartir por WhatsApp ---------- */
function reportText(s, bizName) {
  const L = []
  L.push(`CIERRE DE TURNO - ${bizName}`)
  L.push(`${dateLong(s.opened_at)}, ${hour(s.opened_at)} a ${s.closed_at ? hour(s.closed_at) : 'ahora'}`)
  L.push('')
  L.push(`Efectivo al abrir: ${money(s.opening_cash)}`)
  L.push(`Ventas del mostrador: ${money(s.physical.total)} (${s.physical.count})`)
  L.push(`Pedidos de la app: ${money(s.online.total)} (${s.online.count})`)
  L.push(`VENTAS TOTALES: ${money(s.total_sales)} - ${s.tickets} tickets`)
  L.push('')
  for (const m of s.physical.by_method) L.push(`Mostrador ${m.method}: ${money(m.total)}`)
  for (const m of s.online.by_method) L.push(`App ${m.method}: ${money(m.total)}`)
  L.push('')
  L.push(`Gastos: ${money(s.movements.gastos)}`)
  L.push(`Retiros: ${money(s.movements.retiros)}`)
  L.push(`Aportes: ${money(s.movements.aportes)}`)
  L.push('')
  L.push(`Efectivo esperado: ${money(s.expected_cash)}`)
  if (s.counted_cash !== null && s.counted_cash !== undefined) {
    L.push(`Efectivo contado: ${money(s.counted_cash)}`)
    const d = Number(s.difference)
    L.push(d === 0 ? 'Caja cuadrada' : d > 0 ? `Sobrante: ${money(d)}` : `Faltante: ${money(Math.abs(d))}`)
    if (s.left_cash) L.push(`Queda en caja: ${money(s.left_cash)}`)
  }
  return L.join('\n')
}

async function share(text) {
  try {
    if (navigator.share) await navigator.share({ text })
    else await navigator.clipboard.writeText(text)
  } catch (e) {
    /* cerrado por el usuario */
  }
}

/* ---------- reporte de un turno ---------- */
function ShiftReport({ s, bizName }) {
  const diff = s.difference === null || s.difference === undefined ? null : Number(s.difference)
  return (
    <div className="stack">
      {diff !== null && (
        <div className={`shift-result ${diff === 0 ? 'ok' : diff > 0 ? 'plus' : 'minus'}`}>
          <small>{diff === 0 ? 'Caja cuadrada' : diff > 0 ? 'Sobrante' : 'Faltante'}</small>
          <b>{diff === 0 ? money(0) : money(Math.abs(diff))}</b>
          <span>
            Esperado {money(s.expected_cash)} · Contado {money(s.counted_cash)}
          </span>
        </div>
      )}

      <div className="st-grid">
        <div className="st-kpi">
          <div className="st-kpi-top"><span>Ventas totales</span></div>
          <b>{money(s.total_sales)}</b>
          <span className="st-sub">{s.tickets} tickets</span>
        </div>
        <div className="st-kpi">
          <div className="st-kpi-top"><span>Ticket promedio</span></div>
          <b>{money(s.avg_ticket)}</b>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Cuadre de efectivo</h3>
        <div className="sum-line"><span>Efectivo al abrir</span><b>{money(s.opening_cash)}</b></div>
        <div className="sum-line"><span>+ Ventas en efectivo (mostrador)</span><b>{money(s.physical.cash)}</b></div>
        <div className="sum-line"><span>+ Pedidos de la app en efectivo</span><b>{money(s.online.cash)}</b></div>
        <div className="sum-line"><span>+ Aportes</span><b>{money(s.movements.aportes)}</b></div>
        <div className="sum-line"><span>- Gastos</span><b>{money(s.movements.gastos)}</b></div>
        <div className="sum-line"><span>- Retiros</span><b>{money(s.movements.retiros)}</b></div>
        <div className="sum-line total"><span>Efectivo esperado</span><b>{money(s.expected_cash)}</b></div>
        {s.left_cash > 0 && (
          <div className="sum-line"><span>Se queda en caja</span><b>{money(s.left_cash)}</b></div>
        )}
        <p className="hint" style={{ marginTop: 8 }}>
          Los pedidos de la app se cuentan sin la tarifa del repartidor.
        </p>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Ventas por método</h3>
        {s.physical.by_method.length + s.online.by_method.length === 0 && <p className="hint">Sin ventas.</p>}
        {s.physical.by_method.map((m) => (
          <div className="sum-line" key={`p-${m.method}`}>
            <span>Mostrador · {m.method} <small className="muted">({m.count})</small></span>
            <b>{money(m.total)}</b>
          </div>
        ))}
        {s.online.by_method.map((m) => (
          <div className="sum-line" key={`o-${m.method}`}>
            <span>App · {m.method} <small className="muted">({m.count})</small></span>
            <b>{money(m.total)}</b>
          </div>
        ))}
      </div>

      {s.top.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Más vendidos</h3>
          {s.top.map((t) => (
            <div className="sum-line" key={t.name}>
              <span>{t.name}</span>
              <b>{t.qty}</b>
            </div>
          ))}
        </div>
      )}

      {s.movements.list.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Movimientos de caja</h3>
          {s.movements.list.map((m) => (
            <div className="sum-line" key={m.id}>
              <span>
                {KIND_LABEL[m.kind]} · {m.concept || 'Sin detalle'} <small className="muted">{hour(m.at)}</small>
              </span>
              <b>{money(m.amount)}</b>
            </div>
          ))}
        </div>
      )}

      {s.note && <p className="hint">Nota: {s.note}</p>}
      <button className="btn secondary" onClick={() => share(reportText(s, bizName))}>
        <Share2 size={18} /> Compartir reporte
      </button>
    </div>
  )
}

/* ---------- contador de billetes ---------- */
function CashCounter({ onUse }) {
  const [q, setQ] = useState({})
  const total = DENOMS.reduce((t, d) => t + d * (q[d] || 0), 0)
  const set = (d, n) => setQ({ ...q, [d]: Math.max(0, n) })
  return (
    <div className="card counter">
      <h3 style={{ marginTop: 0 }}>Contar billetes y monedas</h3>
      {DENOMS.map((d) => (
        <div className="counter-row" key={d}>
          <span>{d} CUP</span>
          <div className="qty">
            <button type="button" aria-label={`Quitar ${d}`} onClick={() => set(d, (q[d] || 0) - 1)}>
              <Minus size={16} />
            </button>
            <b>{q[d] || 0}</b>
            <button type="button" aria-label={`Agregar ${d}`} onClick={() => set(d, (q[d] || 0) + 1)}>
              <Plus size={16} />
            </button>
          </div>
          <small>{money(d * (q[d] || 0))}</small>
        </div>
      ))}
      <div className="sum-line total">
        <span>Total contado</span>
        <b>{money(total)}</b>
      </div>
      <button type="button" className="btn small" onClick={() => onUse(total)}>
        Usar este total
      </button>
    </div>
  )
}

/* ---------- nueva venta de mostrador ---------- */
function SaleForm({ business, shiftId, onDone, onCancel }) {
  const [products, setProducts] = useState([])
  const [cart, setCart] = useState({})
  const [quick, setQuick] = useState('')
  const [method, setMethod] = useState('efectivo')
  const [note, setNote] = useState('')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    supabase
      .from('products')
      .select('id, name, price, stock, available')
      .eq('business_id', business.id)
      .eq('available', true)
      .order('name')
      .then(({ data }) => setProducts(data || []))
  }, [business.id])

  const lines = Object.entries(cart).filter(([, n]) => n > 0)
  const total = useMemo(
    () =>
      lines.reduce((t, [id, n]) => t + n * Number((products.find((p) => p.id === id) || {}).price || 0), 0),
    [lines, products]
  )
  const amount = lines.length > 0 ? total : Number(quick || 0)

  const change = (p, d) => {
    const cur = cart[p.id] || 0
    const next = Math.max(0, cur + d)
    if (p.stock !== null && p.stock !== undefined && next > p.stock) return
    setCart({ ...cart, [p.id]: next })
  }

  async function save() {
    setMsg(null)
    if (!(amount > 0)) return setMsg({ type: 'error', text: 'Elige productos o escribe un monto.' })
    setBusy(true)
    const { error } = await supabase.rpc('shift_add_sale', {
      p_shift: shiftId,
      p_items: lines.map(([id, n]) => ({ product_id: id, qty: n })),
      p_amount: lines.length > 0 ? null : Number(quick),
      p_method: method,
      p_note: note.trim() || null,
    })
    setBusy(false)
    if (error) return setMsg({ type: 'error', text: 'No pudimos guardar la venta.' })
    onDone()
  }

  const shown = products.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <div className="stack">
      <button type="button" className="link" onClick={onCancel}>
        <ArrowLeft size={18} /> Volver al turno
      </button>
      <h3 className="section-title" style={{ marginTop: 0 }}>Nueva venta</h3>

      <input
        className="plain-input"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar producto"
        aria-label="Buscar producto"
      />
      <div className="list">
        {shown.map((p) => (
          <div className="card sale-row" key={p.id}>
            <div>
              <h3>{p.name}</h3>
              <span className="meta">
                {money(p.price)}
                {p.stock !== null && p.stock !== undefined ? ` · quedan ${p.stock}` : ''}
              </span>
            </div>
            <div className="qty">
              {(cart[p.id] || 0) > 0 && (
                <>
                  <button type="button" aria-label="Quitar uno" onClick={() => change(p, -1)}>
                    <Minus size={16} />
                  </button>
                  <b>{cart[p.id]}</b>
                </>
              )}
              <button type="button" className="add" aria-label="Agregar uno" onClick={() => change(p, 1)}>
                <Plus size={18} />
              </button>
            </div>
          </div>
        ))}
        {products.length === 0 && <p className="hint">Aún no tienes productos. Puedes registrar una venta rápida por monto.</p>}
      </div>

      {lines.length === 0 && (
        <label className="field">
          <span>O venta rápida por monto (CUP)</span>
          <input type="number" inputMode="decimal" min="0" value={quick} onChange={(e) => setQuick(e.target.value)} />
        </label>
      )}
      <div className="field">
        <span>Método de pago</span>
        <Select title="Método de pago" value={method} onChange={setMethod} options={METHODS} />
      </div>
      <label className="field">
        <span>Nota (opcional)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} />
      </label>

      {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}
      <div className="sticky-total">
        <div>
          <small>Total</small>
          <b>{money(amount)}</b>
        </div>
        <button className="btn" disabled={busy} onClick={save}>
          {busy ? 'Guardando...' : 'Cobrar'}
        </button>
      </div>
    </div>
  )
}

/* ---------- gasto / retiro / aporte ---------- */
function MoveForm({ kind, shiftId, onDone, onCancel }) {
  const [amount, setAmount] = useState('')
  const [concept, setConcept] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  async function save(e) {
    e.preventDefault()
    setMsg(null)
    if (!(Number(amount) > 0)) return setMsg({ type: 'error', text: 'Escribe el monto.' })
    setBusy(true)
    const { error } = await supabase.rpc('shift_add_movement', {
      p_shift: shiftId,
      p_kind: kind,
      p_amount: Number(amount),
      p_concept: concept.trim() || null,
    })
    setBusy(false)
    if (error) return setMsg({ type: 'error', text: 'No pudimos guardar el movimiento.' })
    onDone()
  }

  return (
    <form className="stack" onSubmit={save}>
      <button type="button" className="link" onClick={onCancel}>
        <ArrowLeft size={18} /> Volver al turno
      </button>
      <h3 className="section-title" style={{ marginTop: 0 }}>{KIND_LABEL[kind]} de caja</h3>
      <label className="field">
        <span>Monto (CUP)</span>
        <input type="number" inputMode="decimal" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
      </label>
      <div className="field">
        <span>Concepto</span>
        <div className="h-quick">
          {CONCEPTS[kind].map((c) => (
            <button type="button" key={c} aria-pressed={concept === c} onClick={() => setConcept(c)}>
              {c}
            </button>
          ))}
        </div>
        <input value={concept} onChange={(e) => setConcept(e.target.value)} maxLength={60} placeholder="O escribe otro" />
      </div>
      {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}
      <button className="btn" disabled={busy}>{busy ? 'Guardando...' : 'Guardar'}</button>
    </form>
  )
}

/* ---------- cerrar turno ---------- */
function CloseForm({ shift, bizName, onClosed, onCancel }) {
  const [confirm, confirmUI] = useConfirm()
  const s = shift.summary
  const [counted, setCounted] = useState('')
  const [left, setLeft] = useState('')
  const [note, setNote] = useState('')
  const [counter, setCounter] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const diff = counted === '' ? null : Number(counted) - Number(s.expected_cash)

  async function close() {
    setMsg(null)
    if (counted === '' || Number(counted) < 0) return setMsg({ type: 'error', text: 'Escribe el efectivo contado.' })
    const ok = await confirm('¿Cerrar el turno? Ya no podrás agregar ventas a este turno.', 'Cerrar turno')
    if (!ok) return
    setBusy(true)
    const { data, error } = await supabase.rpc('shift_close', {
      p_shift: shift.id,
      p_counted: Number(counted),
      p_left: left === '' ? 0 : Number(left),
      p_note: note.trim() || null,
    })
    setBusy(false)
    if (error) return setMsg({ type: 'error', text: 'No pudimos cerrar el turno.' })
    onClosed(data)
  }

  return (
    <div className="stack">
      {confirmUI}
      <button type="button" className="link" onClick={onCancel}>
        <ArrowLeft size={18} /> Volver al turno
      </button>
      <h3 className="section-title" style={{ marginTop: 0 }}>Cerrar turno</h3>
      <div className="shift-hero">
        <small>Efectivo que debería haber en caja</small>
        <b>{money(s.expected_cash)}</b>
      </div>

      <label className="field">
        <span>Efectivo contado (CUP)</span>
        <input type="number" inputMode="decimal" min="0" value={counted} onChange={(e) => setCounted(e.target.value)} />
      </label>
      <button type="button" className="btn small secondary" onClick={() => setCounter(!counter)}>
        <Banknote size={18} /> {counter ? 'Ocultar contador' : 'Contar billetes y monedas'}
      </button>
      {counter && (
        <CashCounter
          onUse={(t) => {
            setCounted(String(t))
            setCounter(false)
          }}
        />
      )}

      {diff !== null && (
        <div className={`shift-result ${diff === 0 ? 'ok' : diff > 0 ? 'plus' : 'minus'}`}>
          <small>{diff === 0 ? 'Caja cuadrada' : diff > 0 ? 'Sobrante' : 'Faltante'}</small>
          <b>{money(Math.abs(diff))}</b>
        </div>
      )}

      <label className="field">
        <span>Dejar en caja para el próximo turno (CUP)</span>
        <input type="number" inputMode="decimal" min="0" value={left} onChange={(e) => setLeft(e.target.value)} />
        <p className="hint">Se sugerirá como efectivo inicial del próximo turno.</p>
      </label>
      <label className="field">
        <span>Nota del cierre (opcional)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="Por ejemplo: faltó el cambio de 5 CUP" />
      </label>
      {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}
      <button className="btn" disabled={busy} onClick={close}>
        <Lock size={18} /> {busy ? 'Cerrando...' : 'Cerrar turno'}
      </button>
    </div>
  )
}

/* ---------- pantalla del turno ---------- */
function Turno({ business }) {
  const [confirm, confirmUI] = useConfirm()
  const [live, setLive] = useState(undefined)
  const [view, setView] = useState('main')
  const [opening, setOpening] = useState('')
  const [counter, setCounter] = useState(false)
  const [closedReport, setClosedReport] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('shift_live', { p_business: business.id })
    if (error) {
      setMsg({ type: 'error', text: 'No pudimos cargar el turno.' })
      return setLive(null)
    }
    setLive(data)
    if (!data) {
      const last = await supabase
        .from('shifts')
        .select('left_cash')
        .eq('business_id', business.id)
        .eq('status', 'cerrado')
        .order('closed_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (last.data && last.data.left_cash) setOpening((o) => o || String(last.data.left_cash))
    }
  }, [business.id])

  useEffect(() => {
    load()
  }, [load])

  async function openShift() {
    setMsg(null)
    if (opening === '' || Number(opening) < 0) return setMsg({ type: 'error', text: 'Escribe el efectivo con el que abres la caja (puede ser 0).' })
    setBusy(true)
    const { error } = await supabase.rpc('shift_open', { p_business: business.id, p_opening: Number(opening) })
    setBusy(false)
    if (error) return setMsg({ type: 'error', text: error.message && error.message.length < 100 ? error.message : 'No pudimos abrir el turno.' })
    setClosedReport(null)
    load()
  }

  async function voidItem(kind, id, text) {
    if (!(await confirm(text, 'Anular'))) return
    const { error } = await supabase.rpc('shift_void', { p_kind: kind, p_id: id })
    if (error) setMsg({ type: 'error', text: 'No pudimos anular.' })
    load()
  }

  if (live === undefined) return <p>Cargando...</p>

  if (closedReport)
    return (
      <div className="stack">
        <div className="notice">Turno cerrado. Este es tu reporte.</div>
        <ShiftReport s={closedReport} bizName={business.name} />
        <button className="btn" onClick={() => setClosedReport(null)}>
          Listo
        </button>
      </div>
    )

  if (!live)
    return (
      <div className="stack">
        {confirmUI}
        <div className="shift-hero">
          <small>No hay turno abierto</small>
          <b>Abre tu caja para empezar</b>
        </div>
        <p className="hint">
          Al abrir el turno llevamos tus ventas del mostrador y los pedidos de la app en un solo cuadre, hasta que lo cierres.
        </p>
        <label className="field">
          <span>Efectivo con el que abres la caja (CUP)</span>
          <input type="number" inputMode="decimal" min="0" value={opening} onChange={(e) => setOpening(e.target.value)} />
        </label>
        <button type="button" className="btn small secondary" onClick={() => setCounter(!counter)}>
          <Banknote size={18} /> {counter ? 'Ocultar contador' : 'Contar billetes y monedas'}
        </button>
        {counter && (
          <CashCounter
            onUse={(t) => {
              setOpening(String(t))
              setCounter(false)
            }}
          />
        )}
        {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}
        <button className="btn" disabled={busy} onClick={openShift}>
          {busy ? 'Abriendo...' : 'Abrir turno'}
        </button>
      </div>
    )

  const s = live.summary
  if (view === 'sale')
    return (
      <SaleForm
        business={business}
        shiftId={live.id}
        onCancel={() => setView('main')}
        onDone={() => {
          setView('main')
          load()
        }}
      />
    )
  if (['gasto', 'retiro', 'aporte'].includes(view))
    return (
      <MoveForm
        kind={view}
        shiftId={live.id}
        onCancel={() => setView('main')}
        onDone={() => {
          setView('main')
          load()
        }}
      />
    )
  if (view === 'close')
    return (
      <CloseForm
        shift={live}
        bizName={business.name}
        onCancel={() => setView('main')}
        onClosed={(report) => {
          setView('main')
          setClosedReport(report)
          load()
        }}
      />
    )

  return (
    <div className="stack">
      {confirmUI}
      <div className="shift-hero">
        <small>Turno abierto desde las {hour(s.opened_at)}</small>
        <b>{money(s.total_sales)}</b>
        <span>
          {s.tickets} tickets · Efectivo esperado {money(s.expected_cash)}
        </span>
      </div>

      <div className="shift-actions">
        <button onClick={() => setView('sale')}>
          <ShoppingCart size={22} /> Nueva venta
        </button>
        <button onClick={() => setView('gasto')}>
          <Receipt size={22} /> Gasto
        </button>
        <button onClick={() => setView('retiro')}>
          <ArrowUpFromLine size={22} /> Retiro
        </button>
        <button onClick={() => setView('aporte')}>
          <ArrowDownToLine size={22} /> Aporte
        </button>
      </div>

      {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Resumen del turno</h3>
        <div className="sum-line"><span>Efectivo al abrir</span><b>{money(s.opening_cash)}</b></div>
        <div className="sum-line"><span>Mostrador ({s.physical.count})</span><b>{money(s.physical.total)}</b></div>
        <div className="sum-line"><span>Pedidos de la app ({s.online.count})</span><b>{money(s.online.total)}</b></div>
        <div className="sum-line"><span>Gastos y retiros</span><b>-{money(Number(s.movements.gastos) + Number(s.movements.retiros))}</b></div>
        <div className="sum-line"><span>Aportes</span><b>{money(s.movements.aportes)}</b></div>
        <div className="sum-line total"><span>Efectivo esperado</span><b>{money(s.expected_cash)}</b></div>
      </div>

      {s.sales.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Ventas del mostrador</h3>
          {s.sales.map((v) => (
            <div className="entry-row" key={v.id}>
              <div>
                <b>{money(v.amount)}</b>
                <small>
                  {hour(v.at)} · {v.method}
                  {v.items && v.items.length > 0 ? ` · ${v.items.map((i) => `${i.qty} ${i.name}`).join(', ')}` : ''}
                  {v.note ? ` · ${v.note}` : ''}
                </small>
              </div>
              <button aria-label="Anular venta" onClick={() => voidItem('venta', v.id, '¿Anular esta venta? Los productos vuelven al inventario.')}>
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
      )}

      {s.movements.list.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Movimientos de caja</h3>
          {s.movements.list.map((m) => (
            <div className="entry-row" key={m.id}>
              <div>
                <b>
                  {m.kind === 'aporte' ? '+' : '-'}
                  {money(m.amount)}
                </b>
                <small>
                  {hour(m.at)} · {KIND_LABEL[m.kind]} · {m.concept || 'Sin detalle'}
                </small>
              </div>
              <button aria-label="Anular movimiento" onClick={() => voidItem('movimiento', m.id, '¿Anular este movimiento?')}>
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
      )}

      {s.top.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Más vendidos hoy</h3>
          {s.top.slice(0, 5).map((t) => (
            <div className="sum-line" key={t.name}>
              <span>{t.name}</span>
              <b>{t.qty}</b>
            </div>
          ))}
        </div>
      )}

      <button className="btn" onClick={() => setView('close')}>
        <Lock size={18} /> Cerrar turno
      </button>
    </div>
  )
}

/* ---------- historial ---------- */
function History({ business }) {
  const [list, setList] = useState(null)
  const [open, setOpen] = useState(null)

  useEffect(() => {
    supabase
      .from('shifts')
      .select('id, opened_at, closed_at, summary')
      .eq('business_id', business.id)
      .eq('status', 'cerrado')
      .order('closed_at', { ascending: false })
      .limit(40)
      .then(({ data }) => setList(data || []))
  }, [business.id])

  if (open)
    return (
      <div className="stack">
        <button type="button" className="link" onClick={() => setOpen(null)}>
          <ArrowLeft size={18} /> Historial
        </button>
        <h3 className="section-title" style={{ marginTop: 0 }}>
          {dateLong(open.opened_at)}
        </h3>
        <p className="hint">
          {hour(open.opened_at)} a {hour(open.closed_at)}
        </p>
        <ShiftReport s={open.summary} bizName={business.name} />
      </div>
    )

  return (
    <div className="stack">
      {list === null && <p>Cargando...</p>}
      {list && list.length === 0 && (
        <div className="empty">
          <strong>Aún no hay turnos cerrados</strong>
          Cuando cierres tu primer turno aparecerá aquí.
        </div>
      )}
      <div className="list">
        {(list || []).map((t) => {
          const d = t.summary && t.summary.difference !== null ? Number(t.summary.difference) : null
          return (
            <button className="card hist-row" key={t.id} onClick={() => setOpen(t)}>
              <div>
                <h3>{dateLong(t.opened_at)}</h3>
                <span className="meta">
                  {hour(t.opened_at)} a {hour(t.closed_at)} · {t.summary?.tickets ?? 0} tickets
                </span>
              </div>
              <div className="hist-side">
                <b>{money(t.summary?.total_sales || 0)}</b>
                {d !== null && (
                  <span className={`badge ${d === 0 ? 'aprobado' : 'rechazado'}`}>
                    {d === 0 ? 'Cuadrada' : d > 0 ? `+${money(d)}` : `-${money(Math.abs(d))}`}
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ---------- inventario ---------- */
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

  const low = (items || []).filter((p) => p.stock !== null && p.stock <= 3)

  return (
    <div className="stack">
      <p className="hint">
        Escribe cuántas unidades tienes de cada producto. Bajan solas cuando vendes (en la app o en el mostrador) y al llegar a cero el
        producto se marca como agotado. Déjalo vacío si no llevas control de ese producto.
      </p>
      {low.length > 0 && (
        <div className="notice">Quedan pocas unidades de: {low.map((p) => `${p.name} (${p.stock})`).join(', ')}.</div>
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
  const [tab, setTab] = useState('turno')
  return (
    <div className="stack">
      <button type="button" className="link" onClick={onBack}>
        <ArrowLeft size={18} /> Volver a herramientas
      </button>
      <h3 className="section-title" style={{ marginTop: 0 }}>
        Cuadre de caja
      </h3>
      <SegNav
        items={[
          { id: 'turno', label: 'Turno' },
          { id: 'historial', label: 'Historial' },
          { id: 'inventario', label: 'Inventario' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'turno' && <Turno business={business} />}
      {tab === 'historial' && <History business={business} />}
      {tab === 'inventario' && <Inventory business={business} />}
    </div>
  )
}
