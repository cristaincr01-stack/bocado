import { useEffect, useMemo, useState } from 'react'
import { Lock, Star, TrendingUp, TrendingDown } from 'lucide-react'
import { supabase, STATUS_LABELS } from './lib.js'
import { money } from './utils.js'
import { useConfirm } from './ui.jsx'

const TZ = 'America/Havana'
const dayKey = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: TZ })
const dayName = (d) =>
  new Date(d).toLocaleDateString('es', { weekday: 'short', timeZone: TZ }).replace('.', '')

function short(n) {
  const v = Number(n)
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`
  return String(Math.round(v))
}

function SalesChart({ days }) {
  const max = Math.max(...days.map((d) => d.total), 1)
  const W = 320
  const H = 150
  const base = 118
  const slot = W / days.length
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Ventas de los últimos 7 días">
      <line x1="0" y1={base} x2={W} y2={base} stroke="currentColor" opacity="0.15" />
      {days.map((d, i) => {
        const h = d.total > 0 ? Math.max(6, (d.total / max) * 88) : 3
        const x = i * slot + slot * 0.2
        const w = slot * 0.6
        return (
          <g key={d.key}>
            <rect
              x={x}
              y={base - h}
              width={w}
              height={h}
              rx="6"
              className={d.today ? 'bar today' : 'bar'}
            />
            {d.total > 0 && (
              <text x={x + w / 2} y={base - h - 6} textAnchor="middle" className="chart-val">
                {short(d.total)}
              </text>
            )}
            <text x={x + w / 2} y={base + 18} textAnchor="middle" className="chart-day">
              {d.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export function StatsDashboard({ business, onUpgrade }) {
  const [orders, setOrders] = useState(null)
  const [reviews, setReviews] = useState([])
  const [error, setError] = useState('')
  const full = business.tier !== 'basico'

  useEffect(() => {
    const since = new Date(Date.now() - 31 * 86400000).toISOString()
    supabase
      .from('orders')
      .select(
        'id, status, total, created_at, customer_id, customer_name, order_items(product_name, quantity, unit_price)'
      )
      .eq('business_id', business.id)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1000)
      .then(({ data, error: err }) => {
        if (err) setError('No pudimos cargar tus estadísticas.')
        else setOrders(data)
      })
    supabase
      .from('reviews')
      .select('business_rating, comment, created_at')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => setReviews(data || []))
  }, [business.id])

  const view = useMemo(() => {
    if (!orders) return null
    const done = orders.filter((o) => o.status === 'entregado')
    const now = Date.now()
    const days = Array.from({ length: 7 }, (_, i) => {
      const t = now - (6 - i) * 86400000
      return { key: dayKey(t), label: dayName(t), total: 0, count: 0, today: i === 6 }
    })
    const byKey = Object.fromEntries(days.map((d) => [d.key, d]))
    const customers = new Set()
    done.forEach((o) => {
      const d = byKey[dayKey(o.created_at)]
      if (d) {
        d.total += Number(o.total || 0)
        d.count += 1
        if (o.customer_id) customers.add(o.customer_id)
      }
    })
    const today = days[6]
    const yesterday = days[5]
    const week = days.reduce((s, d) => s + d.total, 0)
    const weekCount = days.reduce((s, d) => s + d.count, 0)
    const delta =
      yesterday.total > 0 ? Math.round(((today.total - yesterday.total) / yesterday.total) * 100) : null

    const prod = {}
    done.forEach((o) =>
      o.order_items.forEach((i) => {
        const p = (prod[i.product_name] = prod[i.product_name] || { name: i.product_name, qty: 0, sales: 0 })
        p.qty += i.quantity
        p.sales += i.quantity * Number(i.unit_price || 0)
      })
    )
    const top = Object.values(prod)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5)

    return {
      days,
      today,
      delta,
      week,
      avg: weekCount ? week / weekCount : 0,
      customers: customers.size,
      top,
      recent: orders.slice(0, 6),
    }
  }, [orders])

  if (error) return <div className="msg error">{error}</div>
  if (!view) return <p>Cargando...</p>

  const avgRating = reviews.length
    ? reviews.reduce((s, r) => s + r.business_rating, 0) / reviews.length
    : null

  return (
    <div className="stack">
      <div className="kpis">
        <div className="kpi">
          <small>Ventas de hoy</small>
          <b>{money(view.today.total)}</b>
          {view.delta !== null && (
            <span className={`delta ${view.delta >= 0 ? 'up' : 'down'}`}>
              {view.delta >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              {view.delta >= 0 ? '+' : ''}
              {view.delta}% vs ayer
            </span>
          )}
        </div>
        <div className="kpi">
          <small>Pedidos hoy</small>
          <b>{view.today.count}</b>
        </div>
        <div className="kpi">
          <small>Ticket promedio</small>
          <b>{money(view.avg)}</b>
          <span className="delta">7 días</span>
        </div>
        <div className="kpi">
          <small>Clientes</small>
          <b>{view.customers}</b>
          <span className="delta">7 días</span>
        </div>
      </div>

      {!full ? (
        <div className="card locked-box">
          <Lock size={22} />
          <div>
            <h3>Estadísticas completas desde Pro</h3>
            <p className="meta">
              Gráfico de ventas de la semana, productos más vendidos, pedidos recientes y valoraciones.
            </p>
          </div>
          <button className="btn small" onClick={onUpgrade}>
            Ver planes
          </button>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="row">
              <h3>Ventas de la semana</h3>
              <b>{money(view.week)}</b>
            </div>
            <SalesChart days={view.days} />
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 6 }}>Lo más vendido</h3>
            {view.top.length === 0 ? (
              <p className="hint">Aún no hay pedidos entregados este mes.</p>
            ) : (
              view.top.map((p, i) => (
                <div className="adm-rank-row" key={p.name}>
                  <span className="pos">{i + 1}</span>
                  <span className="name">{p.name}</span>
                  <span className="val">
                    {p.qty} {p.qty === 1 ? 'vendido' : 'vendidos'}
                    <small>{money(p.sales)}</small>
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 6 }}>Pedidos recientes</h3>
            {view.recent.length === 0 ? (
              <p className="hint">Todavía no tienes pedidos.</p>
            ) : (
              view.recent.map((o) => (
                <div className="recent-row" key={o.id}>
                  <div>
                    <b>{o.customer_name || 'Cliente'}</b>
                    <small>
                      {o.order_items.map((i) => `${i.quantity} × ${i.product_name}`).join(', ')}
                    </small>
                  </div>
                  <div className="recent-end">
                    <span
                      className={`badge ${o.status === 'cancelado' ? 'rechazado' : o.status === 'entregado' ? 'aprobado' : ''}`}
                    >
                      {STATUS_LABELS[o.status]}
                    </span>
                    <b>{money(o.total)}</b>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="card">
            <div className="row">
              <h3>Valoraciones</h3>
              {avgRating && (
                <span className="rate">
                  <Star size={14} fill="currentColor" /> {avgRating.toFixed(1)} ({reviews.length})
                </span>
              )}
            </div>
            {reviews.filter((r) => r.comment).length === 0 ? (
              <p className="hint">Aquí verás lo que dicen tus clientes cuando valoren sus pedidos.</p>
            ) : (
              reviews
                .filter((r) => r.comment)
                .slice(0, 5)
                .map((r, i) => (
                  <p className="review-line" key={i}>
                    <span className="rate">
                      <Star size={12} fill="currentColor" /> {r.business_rating}
                    </span>{' '}
                    {r.comment}
                  </p>
                ))
            )}
          </div>
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Clientes bloqueados por el negocio                                  */
/* ------------------------------------------------------------------ */

export function BlockedCustomers({ business, onBack }) {
  const [confirm, confirmUI] = useConfirm()
  const [list, setList] = useState(null)

  const load = () =>
    supabase
      .from('business_customer_blocks')
      .select('customer_id, customer_name, reason, created_at')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setList(data || []))

  useEffect(() => {
    load()
  }, [business.id])

  async function unblock(b) {
    if (!(await confirm(`¿Desbloquear a ${b.customer_name || 'este cliente'}?`, 'Desbloquear'))) return
    await supabase
      .from('business_customer_blocks')
      .delete()
      .eq('business_id', business.id)
      .eq('customer_id', b.customer_id)
    load()
  }

  return (
    <div className="stack">
      {confirmUI}
      <button type="button" className="link" onClick={onBack}>
        Volver a herramientas
      </button>
      <h3 className="section-title" style={{ marginTop: 0 }}>
        Clientes bloqueados
      </h3>
      <p className="hint">
        Un cliente bloqueado no puede hacer pedidos en tu negocio. Lo bloqueas desde el pedido. No se le
        bloquea en otros negocios.
      </p>
      {list === null && <p>Cargando...</p>}
      {list && list.length === 0 && (
        <div className="empty">
          <strong>No has bloqueado a nadie</strong>
          Si un cliente hace pedidos falsos, bloquéalo desde su pedido.
        </div>
      )}
      <div className="list">
        {(list || []).map((b) => (
          <div className="card" key={b.customer_id}>
            <h3>{b.customer_name || 'Cliente'}</h3>
            <p className="meta">{b.reason || 'Bloqueado por el negocio'}</p>
            <div className="order-actions">
              <button className="btn small secondary" onClick={() => unblock(b)}>
                Desbloquear
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
