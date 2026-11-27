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
  Users,
  UserPlus,
} from 'lucide-react'
import { supabase } from './lib.js'
import { money } from './utils.js'
import { Select, SegNav, useConfirm } from './ui.jsx'
import { ScanButton } from './Scanner.jsx'

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
  if (s.workers && s.workers.length) L.push(`Trabajaron: ${s.workers.join(', ')}`)
  L.push('')
  L.push(`Efectivo al abrir: ${money(s.opening_cash)}`)
  L.push(`Ventas del mostrador: ${money(s.physical.total)} (${s.physical.count})`)
  L.push(`Pedidos de la app: ${money(s.online.total)} (${s.online.count})`)
  L.push(`VENTAS TOTALES: ${money(s.total_sales)} - ${s.tickets} tickets`)
  if (Number(s.profit) > 0) L.push(`Ganancia estimada: ${money(s.profit)}`)
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

      {s.workers && s.workers.length > 0 && (
        <p className="hint" style={{ margin: 0 }}>
          <Users size={14} /> Trabajaron: <b>{s.workers.join(', ')}</b>
        </p>
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
        <div className="st-kpi">
          <div className="st-kpi-top"><span>Ganancia estimada</span></div>
          <b>{Number(s.profit) > 0 ? money(s.profit) : '-'}</b>
          <span className="st-sub">productos con costo</span>
        </div>
      </div>

      {s.by_worker && s.by_worker.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Ventas por trabajador</h3>
          {s.by_worker.map((w) => (
            <div className="sum-line" key={w.worker}>
              <span>
                {w.worker} <small className="muted">({w.count})</small>
              </span>
              <b>{money(w.total)}</b>
            </div>
          ))}
        </div>
      )}

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
function SaleForm({ business, shiftId, workers = [], onDone, onCancel }) {
  const [products, setProducts] = useState([])
  const [cart, setCart] = useState({})
  const [quick, setQuick] = useState('')
  const [method, setMethod] = useState('efectivo')
  const [note, setNote] = useState('')
  const [worker, setWorker] = useState(workers.length === 1 ? workers[0] : '')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    supabase
      .from('products')
      .select('id, name, price, stock, available, barcode')
      .eq('business_id', business.id)
      .eq('available', true)
      .order('name')
      .then(({ data }) => setProducts(data || []))
  }, [business.id])

  const [scanMsg, setScanMsg] = useState('')
  const byCode = (code) => {
    const clean = String(code || '').trim()
    if (!clean) return
    const p = products.find((x) => x.barcode && x.barcode === clean)
    if (!p) return setScanMsg(`No hay un producto con el código ${clean}.`)
    setScanMsg(`Agregado: ${p.name}`)
    setQ('')
    setCart((cur) => {
      const next = (cur[p.id] || 0) + 1
      if (p.stock !== null && p.stock !== undefined && next > p.stock) return cur
      return { ...cur, [p.id]: next }
    })
  }

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
      p_worker: worker || null,
    })
    setBusy(false)
    if (error) return setMsg({ type: 'error', text: `No pudimos guardar la venta. ${error.message || ''}`.slice(0, 160) })
    onDone()
  }

  const shown = products.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()) || (p.barcode && String(p.barcode).includes(q.trim())))

  return (
    <div className="stack">
      <button type="button" className="link" onClick={onCancel}>
        <ArrowLeft size={18} /> Volver al turno
      </button>
      <h3 className="section-title" style={{ marginTop: 0 }}>Nueva venta</h3>

      <div className="coupon-row">
        <input
          className="plain-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              byCode(q)
            }
          }}
          placeholder="Buscar o escanear código"
          aria-label="Buscar producto"
        />
        <ScanButton onCode={byCode} />
      </div>
      {scanMsg && <div className="notice">{scanMsg}</div>}
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
      {workers.length > 0 && (
        <div className="field">
          <span>¿Quién vendió?</span>
          <Select
            title="Trabajador"
            value={worker}
            onChange={setWorker}
            options={[{ value: '', label: 'Sin indicar' }, ...workers.map((w) => ({ value: w, label: w }))]}
          />
        </div>
      )}
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
    if (error) return setMsg({ type: 'error', text: `No pudimos cerrar el turno. ${error.message || ''}`.slice(0, 200) })
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


/* ---------- trabajadores del turno ---------- */
function WorkersPicker({ business, value, onChange, teamId, onTeam }) {
  const [staff, setStaff] = useState([])
  const [teams, setTeams] = useState([])
  const [name, setName] = useState('')
  const [msg, setMsg] = useState(null)

  const load = useCallback(async () => {
    const [s, t] = await Promise.all([
      supabase.from('business_staff').select('id, name, team_id').eq('business_id', business.id).eq('active', true).order('name'),
      supabase.from('business_teams').select('id, name').eq('business_id', business.id).eq('active', true).order('sort'),
    ])
    setStaff(s.data || [])
    setTeams(t.data || [])
  }, [business.id])

  useEffect(() => {
    load()
  }, [load])

  const toggle = (n) => onChange(value.includes(n) ? value.filter((x) => x !== n) : [...value, n])

  function pickTeam(id) {
    onTeam(id)
    if (id) onChange(staff.filter((p) => p.team_id === id).map((p) => p.name))
  }

  async function add() {
    setMsg(null)
    const n = name.trim()
    if (!n) return
    const { error } = await supabase
      .from('business_staff')
      .insert({ business_id: business.id, name: n, team_id: teamId || null })
    if (error && error.code !== '23505')
      return setMsg(`No pudimos agregar a la persona. ${error.message || ''}`.slice(0, 160))
    setName('')
    if (!value.includes(n)) onChange([...value, n])
    load()
  }

  return (
    <div className="stack">
      {teams.length > 0 && onTeam && (
        <div className="field">
          <span>Equipo de este turno</span>
          <Select
            title="Equipo"
            value={teamId || ''}
            onChange={pickTeam}
            options={[{ value: '', label: 'Sin equipo (elegir personas)' }, ...teams.map((t) => ({ value: t.id, label: t.name }))]}
          />
        </div>
      )}
      <div className="field">
        <span>¿Quién trabaja en este turno?</span>
        {staff.length > 0 && (
          <div className="h-quick">
            {staff.map((p) => (
              <button type="button" key={p.id} aria-pressed={value.includes(p.name)} onClick={() => toggle(p.name)}>
                {p.name}
              </button>
            ))}
          </div>
        )}
        <div className="coupon-row">
          <input
            value={name}
            maxLength={40}
            placeholder={staff.length ? 'Agregar a otra persona' : 'Nombre del trabajador'}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="button" className="btn small secondary" onClick={add}>
            <UserPlus size={16} /> Agregar
          </button>
        </div>
        {msg && <div className="msg error">{msg}</div>}
      </div>
    </div>
  )
}

/* ---------- equipos y desempeño ---------- */
function Performance({ business }) {
  const [days, setDays] = useState('30')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setData(null)
    setError('')
    supabase.rpc('team_performance', { p_business: business.id, p_days: Number(days) }).then(({ data: d, error: err }) => {
      if (err) setError(`No pudimos cargar el desempeño. ${err.message || ''}`.slice(0, 160))
      else setData(d)
    })
  }, [business.id, days])

  const total = data ? Number(data.total) : 0
  return (
    <div className="stack">
      <SegNav
        items={[
          { id: '7', label: '7 días' },
          { id: '30', label: '30 días' },
          { id: '90', label: '90 días' },
        ]}
        value={days}
        onChange={setDays}
      />
      {error && <div className="msg error">{error}</div>}
      {!data && !error && <p>Cargando...</p>}
      {data && (
        <>
          <div className="shift-hero">
            <small>Ventas del mostrador en {days} días</small>
            <b>{money(total)}</b>
            <span>Cada venta se anota con quién la hizo</span>
          </div>

          <h3 className="section-title">Por persona</h3>
          {data.workers.length === 0 ? (
            <p className="hint">Cuando registres ventas indicando quién las hizo, verás aquí el desempeño de cada uno.</p>
          ) : (
            <div className="list">
              {data.workers.map((w, i) => (
                <div className="card" key={w.worker}>
                  <div className="row">
                    <h3 style={{ margin: 0 }}>
                      {i === 0 && Number(w.total) > 0 ? '🏆 ' : ''}
                      {w.worker}
                    </h3>
                    <b>{money(w.total)}</b>
                  </div>
                  <div className="perf-bar">
                    <div style={{ width: `${total > 0 ? Math.round((Number(w.total) / total) * 100) : 0}%` }} />
                  </div>
                  <p className="meta">
                    {w.sales} ventas · promedio {money(w.avg)} · {w.shifts} {Number(w.shifts) === 1 ? 'turno' : 'turnos'} ·{' '}
                    {total > 0 ? Math.round((Number(w.total) / total) * 100) : 0}% del total
                  </p>
                </div>
              ))}
            </div>
          )}

          <h3 className="section-title">Por equipo</h3>
          {data.teams.length === 0 ? (
            <p className="hint">Aún no hay turnos en este período.</p>
          ) : (
            <div className="list">
              {data.teams.map((t) => (
                <div className="card" key={t.team}>
                  <div className="row">
                    <h3 style={{ margin: 0 }}>{t.team}</h3>
                    <b>{money(t.total)}</b>
                  </div>
                  <p className="meta">
                    {t.shifts} {Number(t.shifts) === 1 ? 'turno' : 'turnos'} · {t.sales} ventas
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Teams({ business }) {
  const [confirm, confirmUI] = useConfirm()
  const [teams, setTeams] = useState(null)
  const [staff, setStaff] = useState([])
  const [teamName, setTeamName] = useState('')
  const [newMember, setNewMember] = useState({})
  const [msg, setMsg] = useState(null)

  const load = useCallback(async () => {
    const [t, s] = await Promise.all([
      supabase.from('business_teams').select('id, name, active, sort').eq('business_id', business.id).order('sort'),
      supabase.from('business_staff').select('id, name, active, team_id').eq('business_id', business.id).order('name'),
    ])
    if (t.error) setMsg(`No pudimos cargar los equipos. ${t.error.message || ''}`.slice(0, 160))
    setTeams(t.data || [])
    setStaff(s.data || [])
  }, [business.id])

  useEffect(() => {
    load()
  }, [load])

  async function addTeam(e) {
    e.preventDefault()
    setMsg(null)
    const n = teamName.trim()
    if (!n) return
    const sort = (teams || []).reduce((m, t) => Math.max(m, t.sort), 0) + 1
    const { error } = await supabase.from('business_teams').insert({ business_id: business.id, name: n, sort })
    if (error)
      return setMsg(
        error.code === '23505' ? 'Ya tienes un equipo con ese nombre.' : `No pudimos crear el equipo. ${error.message || ''}`.slice(0, 160)
      )
    setTeamName('')
    load()
  }

  async function removeTeam(t) {
    if (!(await confirm(`¿Eliminar el equipo "${t.name}"? Sus personas quedan sin equipo.`, 'Eliminar'))) return
    await supabase.from('business_teams').delete().eq('id', t.id)
    load()
  }

  async function addMember(teamId) {
    const n = (newMember[teamId || 'none'] || '').trim()
    if (!n) return
    setMsg(null)
    const { error } = await supabase.from('business_staff').insert({ business_id: business.id, name: n, team_id: teamId || null })
    if (error)
      return setMsg(
        error.code === '23505' ? 'Ya existe una persona con ese nombre.' : `No pudimos agregarla. ${error.message || ''}`.slice(0, 160)
      )
    setNewMember({ ...newMember, [teamId || 'none']: '' })
    load()
  }

  async function moveMember(p, teamId) {
    await supabase.from('business_staff').update({ team_id: teamId || null }).eq('id', p.id)
    load()
  }

  async function toggleMember(p) {
    await supabase.from('business_staff').update({ active: !p.active }).eq('id', p.id)
    load()
  }

  const options = [{ value: '', label: 'Sin equipo' }, ...(teams || []).map((t) => ({ value: t.id, label: t.name }))]

  const Member = ({ p }) => (
    <div className="member-row" key={p.id}>
      <span className={p.active ? '' : 'muted'}>{p.name}</span>
      <div className="member-actions">
        <Select title={`Equipo de ${p.name}`} value={p.team_id || ''} onChange={(v) => moveMember(p, v)} options={options} />
        <button type="button" className="btn small secondary" style={{ width: 'auto' }} onClick={() => toggleMember(p)}>
          {p.active ? 'Quitar' : 'Activar'}
        </button>
      </div>
    </div>
  )

  const AddMember = ({ teamId }) => (
    <div className="coupon-row" style={{ marginTop: 10 }}>
      <input
        value={newMember[teamId || 'none'] || ''}
        maxLength={40}
        placeholder="Nombre de la persona"
        onChange={(e) => setNewMember({ ...newMember, [teamId || 'none']: e.target.value })}
      />
      <button type="button" className="btn small" onClick={() => addMember(teamId)}>
        <UserPlus size={16} /> Agregar
      </button>
    </div>
  )

  const loose = staff.filter((p) => !p.team_id)

  return (
    <div className="stack">
      {confirmUI}
      <p className="hint">
        Crea los equipos o turnos que tiene tu negocio (por ejemplo "Mañana" y "Noche") y anota quién está en cada uno.
        Al abrir un turno solo eliges el equipo y las personas se cargan solas.
      </p>
      {msg && <div className="msg error">{msg}</div>}

      <form className="card" onSubmit={addTeam}>
        <label className="field">
          <span>Nuevo equipo o turno</span>
          <input value={teamName} onChange={(e) => setTeamName(e.target.value)} maxLength={30} placeholder="Por ejemplo: Turno de la mañana" />
        </label>
        <button className="btn small">Crear equipo</button>
      </form>

      {teams === null && <p>Cargando...</p>}
      <div className="list">
        {(teams || []).map((t) => (
          <div className="card" key={t.id}>
            <div className="row">
              <h3 style={{ margin: 0 }}>{t.name}</h3>
              <button type="button" className="btn small danger" style={{ width: 'auto' }} onClick={() => removeTeam(t)}>
                Eliminar
              </button>
            </div>
            {staff.filter((p) => p.team_id === t.id).map((p) => <Member key={p.id} p={p} />)}
            {staff.filter((p) => p.team_id === t.id).length === 0 && <p className="hint">Aún no hay personas en este equipo.</p>}
            <AddMember teamId={t.id} />
          </div>
        ))}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Personas sin equipo</h3>
        {loose.map((p) => <Member key={p.id} p={p} />)}
        {loose.length === 0 && <p className="hint">Todos tus trabajadores están en un equipo.</p>}
        <AddMember teamId={null} />
      </div>
    </div>
  )
}

function Team({ business }) {
  const [tab, setTab] = useState('equipos')
  return (
    <div className="stack">
      <SegNav
        items={[
          { id: 'equipos', label: 'Equipos' },
          { id: 'desempeno', label: 'Desempeño' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'equipos' ? <Teams business={business} /> : <Performance business={business} />}
    </div>
  )
}

/* ---------- pantalla del turno ---------- */
function Turno({ business }) {
  const [confirm, confirmUI] = useConfirm()
  const [live, setLive] = useState(undefined)
  const [view, setView] = useState('main')
  const [opening, setOpening] = useState('')
  const [workers, setWorkers] = useState([])
  const [teamId, setTeamId] = useState('')
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
    const { error } = await supabase.rpc('shift_open', {
      p_business: business.id,
      p_opening: Number(opening),
      p_workers: workers,
      p_team_id: teamId || null,
    })
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
        <WorkersPicker business={business} value={workers} onChange={setWorkers} teamId={teamId} onTeam={setTeamId} />
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
        workers={s.workers || []}
        onCancel={() => setView('main')}
        onDone={() => {
          setView('main')
          load()
        }}
      />
    )
  if (view === 'team')
    return <TeamEditor business={business} shiftId={live.id} current={s.workers || []} onDone={() => { setView('main'); load() }} />
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
          if (report) setClosedReport(report)
          else setMsg({ type: 'ok', text: 'Turno cerrado. Lo encuentras en la pestaña Historial.' })
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
        <button type="button" className="hero-link" onClick={() => setView('team')}>
          <Users size={15} /> {s.workers && s.workers.length ? s.workers.join(', ') : 'Indicar quién trabaja'}
        </button>
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


function TeamEditor({ business, shiftId, current, onDone }) {
  const [value, setValue] = useState(current)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  async function save() {
    setBusy(true)
    const { error } = await supabase.rpc('shift_set_workers', { p_shift: shiftId, p_workers: value })
    setBusy(false)
    if (error) return setMsg('No pudimos guardar el equipo.')
    onDone()
  }
  return (
    <div className="stack">
      <button type="button" className="link" onClick={onDone}>
        <ArrowLeft size={18} /> Volver al turno
      </button>
      <h3 className="section-title" style={{ marginTop: 0 }}>Equipo del turno</h3>
      <WorkersPicker business={business} value={value} onChange={setValue} />
      {msg && <div className="msg error">{msg}</div>}
      <button className="btn" disabled={busy} onClick={save}>
        {busy ? 'Guardando...' : 'Guardar'}
      </button>
    </div>
  )
}

/* ---------- historial ---------- */
function History({ business }) {
  const [list, setList] = useState(null)
  const [open, setOpen] = useState(null)

  const openRow = async (t) => {
    if (t.summary) return setOpen(t)
    const { data } = await supabase.rpc('shift_report', { p_shift: t.id })
    setOpen({ ...t, summary: data })
  }

  useEffect(() => {
    supabase.rpc('shifts_history', { p_business: business.id }).then(({ data, error }) => {
      if (!error && Array.isArray(data)) return setList(data)
      supabase
        .from('shifts')
        .select('id, opened_at, closed_at, summary')
        .eq('business_id', business.id)
        .eq('status', 'cerrado')
        .order('closed_at', { ascending: false })
        .limit(40)
        .then((r) => setList(r.data || []))
    })
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
            <button className="card hist-row" key={t.id} onClick={() => openRow(t)}>
              <div>
                <h3>{dateLong(t.opened_at)}</h3>
                <span className="meta">
                  {hour(t.opened_at)} a {hour(t.closed_at)} · {t.summary?.tickets ?? 0} tickets
                  {t.summary?.workers && t.summary.workers.length ? ` · ${t.summary.workers.join(', ')}` : ''}
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
          { id: 'equipo', label: 'Equipo' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'turno' && <Turno business={business} />}
      {tab === 'historial' && <History business={business} />}
      {tab === 'equipo' && <Team business={business} />}
    </div>
  )
}
