import { useEffect, useMemo, useState } from 'react'
import { Lock, Star, Bike, TrendingUp, Wallet } from 'lucide-react'
import { supabase } from './lib.js'
import { money } from './utils.js'
import { SegNav } from './ui.jsx'

const RANK = { basico: 0, pro: 1, premium: 2 }
const TZ = 'America/Havana'

const dayKey = (ts) => new Date(ts).toLocaleDateString('en-CA', { timeZone: TZ })
const dayTitle = (key) => {
  const today = dayKey(Date.now())
  const yest = dayKey(Date.now() - 86400000)
  if (key === today) return 'Hoy'
  if (key === yest) return 'Ayer'
  const t = new Date(`${key}T12:00:00`).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function Locked({ level, onUpgrade }) {
  return (
    <div className="card tool locked">
      <div className="tool-icon">
        <Lock size={22} />
      </div>
      <div className="tool-body">
        <h3>Disponible desde {level}</h3>
        <p className="meta">Mejora tu plan para ver esta sección.</p>
      </div>
      <div className="tool-side">
        <button className="btn small secondary" onClick={onUpgrade}>
          Ver planes
        </button>
      </div>
    </div>
  )
}

export function CourierEarnings({ courier, onUpgrade }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [period, setPeriod] = useState('hoy')
  const rank = RANK[courier.tier] ?? 0

  useEffect(() => {
    supabase.rpc('courier_stats').then(({ data: d, error: err }) => {
      if (err) setError('No pudimos cargar tus ganancias.')
      else setData(d)
    })
  }, [])

  const groups = useMemo(() => {
    const map = new Map()
    for (const h of (data && data.history) || []) {
      const k = dayKey(h.at)
      if (!map.has(k)) map.set(k, { key: k, total: 0, items: [] })
      const g = map.get(k)
      g.total += Number(h.fee || 0)
      g.items.push(h)
    }
    return [...map.values()]
  }, [data])

  if (error) return <div className="msg error">{error}</div>
  if (!data) return <p>Cargando...</p>

  const lockedPeriod = period !== 'hoy' && rank < 1
  const cur = period === 'hoy' ? data.today : period === 'semana' ? data.week : data.month
  const label = period === 'hoy' ? 'Ganado hoy' : period === 'semana' ? 'Ganado en 7 días' : 'Ganado en 30 días'
  const avg = Number(cur.n) > 0 ? Number(cur.earn) / Number(cur.n) : 0

  const daily = data.daily || []
  const max = Math.max(1, ...daily.map((x) => Number(x.earn)))
  const best = daily.reduce((b, x) => (Number(x.earn) > Number(b.earn) ? x : b), daily[0] || { earn: 0 })
  const dayShort = (iso) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString('es', { weekday: 'short' }).replace('.', '')
  const hour = (ts) => new Date(ts).toLocaleTimeString('es', { hour: 'numeric', minute: '2-digit', timeZone: TZ })

  return (
    <div className="stack">
      <SegNav
        items={[
          { id: 'hoy', label: 'Hoy' },
          { id: 'semana', label: '7 días' },
          { id: 'mes', label: '30 días' },
        ]}
        value={period}
        onChange={setPeriod}
      />

      {lockedPeriod ? (
        <Locked level="Pro" onUpgrade={onUpgrade} />
      ) : (
        <div className="earn-hero">
          <small>{label}</small>
          <b>{money(cur.earn)}</b>
          <div className="earn-pills">
            <span>
              <Bike size={15} /> {cur.n} {Number(cur.n) === 1 ? 'entrega' : 'entregas'}
            </span>
            <span>
              <Wallet size={15} /> {money(avg)} por entrega
            </span>
          </div>
        </div>
      )}

      {!lockedPeriod && period !== 'hoy' && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Últimos 7 días</h3>
          {Number(data.week.earn) === 0 ? (
            <p className="hint">Cuando completes entregas verás aquí tu semana.</p>
          ) : (
            <div className="st-chart" role="img" aria-label="Ganancias por día">
              {daily.map((x) => (
                <div className="st-col" key={x.day}>
                  <div className="st-bar-wrap">
                    <div
                      className="st-bar"
                      style={{ height: `${Math.max(4, (Number(x.earn) / max) * 100)}%` }}
                      title={`${x.day}: ${money(x.earn)}`}
                    />
                  </div>
                  <small>{dayShort(x.day)}</small>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <TrendingUp size={18} /> Rendimiento
        </h3>
        {rank < 2 ? (
          <Locked level="Premium" onUpgrade={onUpgrade} />
        ) : (
          <div className="perf-grid">
            <div>
              <small>Calificación</small>
              <b>
                {Number(data.rating_count) > 0 ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Star size={16} fill="currentColor" /> {data.rating_avg}
                  </span>
                ) : (
                  'Sin datos'
                )}
              </b>
              <span>{data.rating_count} valoraciones</span>
            </div>
            <div>
              <small>Entregas totales</small>
              <b>{data.total_n}</b>
              <span>desde que empezaste</span>
            </div>
            <div>
              <small>Promedio por entrega</small>
              <b>{money(data.avg_fee)}</b>
              <span>histórico</span>
            </div>
            <div>
              <small>Mejor día (7 días)</small>
              <b>{Number(best.earn) > 0 ? dayShort(best.day) : '-'}</b>
              <span>{Number(best.earn) > 0 ? money(best.earn) : ''}</span>
            </div>
          </div>
        )}
      </div>

      <h3 className="section-title">Historial de entregas</h3>
      {groups.length === 0 ? (
        <p className="hint">Aún no tienes entregas completadas.</p>
      ) : (
        groups.map((g) => (
          <div className="card" key={g.key}>
            <div className="day-head">
              <b>{dayTitle(g.key)}</b>
              <span>{money(g.total)}</span>
            </div>
            {g.items.map((h, i) => (
              <div className="sum-line" key={i}>
                <span>
                  {h.business} <small className="muted">{hour(h.at)}</small>
                </span>
                <b>{money(h.fee)}</b>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  )
}
