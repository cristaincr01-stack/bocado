import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, PackagePlus, PackageMinus, Trash2, SlidersHorizontal, AlertTriangle } from 'lucide-react'
import { supabase } from './lib.js'
import { money } from './utils.js'
import { SegNav } from './ui.jsx'

const KINDS = {
  entrada: { label: 'Entrada', Icon: PackagePlus, hint: 'Llegó mercancía' },
  salida: { label: 'Salida', Icon: PackageMinus, hint: 'Salió sin venta' },
  merma: { label: 'Merma', Icon: Trash2, hint: 'Se dañó o venció' },
  ajuste: { label: 'Ajuste', Icon: SlidersHorizontal, hint: 'Corregir la cantidad real' },
}

const when = (ts) =>
  new Date(ts).toLocaleString('es', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Havana' })

function MoveForm({ product, kind, onDone, onCancel }) {
  const [qty, setQty] = useState('')
  const [cost, setCost] = useState(product.cost ?? '')
  const [note, setNote] = useState('')
  const [fromCash, setFromCash] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const K = KINDS[kind]

  async function save(e) {
    e.preventDefault()
    setMsg(null)
    const n = Math.floor(Number(qty))
    if (kind === 'ajuste' ? !(n >= 0) || qty === '' : !(n > 0)) return setMsg('Escribe una cantidad válida.')
    setBusy(true)
    const { error } = await supabase.rpc('stock_move', {
      p_product: product.id,
      p_kind: kind,
      p_qty: n,
      p_unit_cost: kind === 'entrada' && cost !== '' ? Number(cost) : null,
      p_note: note.trim() || null,
      p_from_cash: kind === 'entrada' && fromCash,
    })
    setBusy(false)
    if (error) return setMsg(error.message && error.message.length < 120 ? error.message : 'No pudimos guardar el movimiento.')
    onDone()
  }

  return (
    <form className="stack" onSubmit={save}>
      <button type="button" className="link" onClick={onCancel}>
        <ArrowLeft size={18} /> {product.name}
      </button>
      <h3 className="section-title" style={{ marginTop: 0 }}>
        {K.label} · {product.name}
      </h3>
      <p className="hint">
        {K.hint}. Ahora hay {product.stock === null ? 'sin control de cantidad' : `${product.stock} ${product.unit || 'u'}`}.
      </p>
      <label className="field">
        <span>{kind === 'ajuste' ? 'Cantidad real que hay ahora' : 'Cantidad'}</span>
        <input type="number" inputMode="numeric" min="0" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
      </label>
      {kind === 'entrada' && (
        <>
          <label className="field">
            <span>Costo por unidad (CUP)</span>
            <input type="number" inputMode="decimal" min="0" value={cost} onChange={(e) => setCost(e.target.value)} />
            <p className="hint">Con el costo calculamos tu ganancia. Si compras a distintos precios, sacamos el promedio.</p>
          </label>
          <label className="check">
            <input type="checkbox" checked={fromCash} onChange={(e) => setFromCash(e.target.checked)} />
            Pagué esta compra con dinero de la caja (se anota como gasto del turno abierto)
          </label>
        </>
      )}
      <label className="field">
        <span>Nota (opcional)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} />
      </label>
      {msg && <div className="msg error">{msg}</div>}
      <button className="btn" disabled={busy}>
        {busy ? 'Guardando...' : 'Guardar movimiento'}
      </button>
    </form>
  )
}

function Products({ business }) {
  const [items, setItems] = useState(null)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null)
  const [kind, setKind] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('products')
      .select('id, name, price, stock, cost, min_stock, unit, available')
      .eq('business_id', business.id)
      .order('name')
    if (err) setError('No pudimos cargar tu inventario.')
    else {
      setError('')
      setItems(data)
      setSel((cur) => (cur ? data.find((p) => p.id === cur.id) || null : null))
    }
  }, [business.id])

  useEffect(() => {
    load()
  }, [load])

  const stats = useMemo(() => {
    const list = items || []
    const tracked = list.filter((p) => p.stock !== null)
    return {
      value: tracked.reduce((t, p) => t + Number(p.stock) * Number(p.cost || 0), 0),
      low: tracked.filter((p) => p.stock <= Number(p.min_stock || 0) && Number(p.min_stock || 0) > 0 || p.stock === 0),
      tracked: tracked.length,
    }
  }, [items])

  if (sel && kind)
    return (
      <MoveForm
        product={sel}
        kind={kind}
        onCancel={() => setKind(null)}
        onDone={() => {
          setKind(null)
          load()
        }}
      />
    )

  if (sel) {
    const margin = sel.cost ? Math.round(((Number(sel.price) - Number(sel.cost)) / Number(sel.price)) * 100) : null
    return (
      <div className="stack">
        <button type="button" className="link" onClick={() => setSel(null)}>
          <ArrowLeft size={18} /> Inventario
        </button>
        <div className="shift-hero">
          <small>{sel.name}</small>
          <b>{sel.stock === null ? 'Sin control' : `${sel.stock} ${sel.unit || 'u'}`}</b>
          <span>
            Precio {money(sel.price)}
            {sel.cost ? ` · Costo ${money(sel.cost)}` : ''}
            {margin !== null ? ` · Margen ${margin}%` : ''}
          </span>
        </div>
        <div className="shift-actions">
          {Object.entries(KINDS).map(([k, { label, Icon }]) => (
            <button key={k} onClick={() => setKind(k)}>
              <Icon size={22} /> {label}
            </button>
          ))}
        </div>
        <p className="hint">
          El costo, el mínimo y la unidad se cambian al editar el producto en la pestaña Menú.
        </p>
      </div>
    )
  }

  const shown = (items || []).filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <div className="stack">
      {error && <div className="msg error">{error}</div>}
      <div className="st-grid">
        <div className="st-kpi">
          <div className="st-kpi-top"><span>Valor del inventario</span></div>
          <b>{money(stats.value)}</b>
          <span className="st-sub">{stats.tracked} productos con control</span>
        </div>
        <div className="st-kpi">
          <div className="st-kpi-top"><span>Por reponer</span></div>
          <b>{stats.low.length}</b>
          <span className="st-sub">en o bajo el mínimo</span>
        </div>
      </div>
      {stats.low.length > 0 && (
        <div className="notice" style={{ display: 'flex', gap: 8 }}>
          <AlertTriangle size={18} /> Reponer: {stats.low.map((p) => `${p.name} (${p.stock})`).join(', ')}
        </div>
      )}
      <input className="plain-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto" aria-label="Buscar producto" />
      {items === null && <p>Cargando...</p>}
      {items && items.length === 0 && (
        <div className="empty">
          <strong>Aún no tienes productos</strong>
          Agrégalos en la pestaña Menú.
        </div>
      )}
      <div className="list">
        {shown.map((p) => {
          const low = p.stock !== null && (p.stock === 0 || (Number(p.min_stock) > 0 && p.stock <= Number(p.min_stock)))
          return (
            <button className="card inv-item" key={p.id} onClick={() => setSel(p)}>
              <div>
                <h3>{p.name}</h3>
                <span className="meta">
                  {p.cost ? `Costo ${money(p.cost)} · ` : ''}Precio {money(p.price)}
                </span>
              </div>
              <div className="inv-side">
                <b>{p.stock === null ? '-' : `${p.stock} ${p.unit || 'u'}`}</b>
                {low && <span className="badge rechazado">Reponer</span>}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Moves({ business }) {
  const [list, setList] = useState(null)
  useEffect(() => {
    supabase
      .from('stock_moves')
      .select('id, kind, qty, unit_cost, note, created_at, stock_after, product:products(name, unit)')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })
      .limit(60)
      .then(({ data }) => setList(data || []))
  }, [business.id])

  return (
    <div className="stack">
      {list === null && <p>Cargando...</p>}
      {list && list.length === 0 && (
        <div className="empty">
          <strong>Aún no hay movimientos</strong>
          Registra una entrada, salida, merma o ajuste desde un producto.
        </div>
      )}
      <div className="list">
        {(list || []).map((m) => (
          <div className="card" key={m.id}>
            <div className="row">
              <h3 style={{ fontSize: 16 }}>
                {KINDS[m.kind]?.label} · {m.product?.name}
              </h3>
              <b>{m.kind === 'ajuste' ? `= ${m.qty}` : `${m.kind === 'entrada' ? '+' : '-'}${m.qty}`}</b>
            </div>
            <p className="meta">
              {when(m.created_at)}
              {m.unit_cost ? ` · costo ${money(m.unit_cost)}` : ''} · quedan {m.stock_after}
              {m.note ? ` · ${m.note}` : ''}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

export function InventoryTool({ business, onBack }) {
  const [tab, setTab] = useState('productos')
  return (
    <div className="stack">
      <button type="button" className="link" onClick={onBack}>
        <ArrowLeft size={18} /> Volver a herramientas
      </button>
      <h3 className="section-title" style={{ marginTop: 0 }}>Inventario</h3>
      <SegNav
        items={[
          { id: 'productos', label: 'Productos' },
          { id: 'movimientos', label: 'Movimientos' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'productos' ? <Products business={business} /> : <Moves business={business} />}
    </div>
  )
}
