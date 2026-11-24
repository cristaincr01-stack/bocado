import { useEffect, useState } from 'react'
import { Lock, Star } from 'lucide-react'
import { supabase } from './lib.js'
import { money } from './utils.js'

const RANK = { basico: 0, pro: 1, premium: 2 }

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

function Kpi({ label, value, sub }) {
  return (
    <div className="st-kpi">
      <div className="st-kpi-top">
        <span>{label}</span>
      </div>
      <b>{value}</b>
      {sub && <span className="st-sub">{sub}</span>}
    </div>
  )
}

export function CourierEarnings({ courier, onUpgrade }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const rank = RANK[courier.tier] ?? 0

  useEffect(() => {
    supabase.rpc('courier_stats').then(({ data: d, error: err }) => {
      if (err) setError('No pudimos cargar tus ganancias.')
      else setData(d)
    })
  }, [])

  if (error) return <div className="msg error">{error}</div>
  if (!data) return <p>Cargando...</p>

  const daily = data.daily || []
  const max = Math.max(1, ...daily.map((x) => Number(x.earn)))
  const best = daily.reduce((b, x) => (Number(x.earn) > Number(b.earn) ? x : b), daily[0] || { earn: 0 })
  const dayName = (iso) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString('es', { weekday: 'short' }).replace('.', '')
  const when = (ts) =>
    new Date(ts).toLocaleDateString('es', { day: 'numeric', month: 'short', timeZone: 'America/Havana' })

  return (
    <div className="stack">
      <h3 className="section-title" style={{ marginTop: 0 }}>
        Hoy
      </h3>
      <div className="st-grid">
        <Kpi label="Ganado hoy" value={money(data.today.earn)} />
        <Kpi label="Entregas hoy" value={data.today.n} />
      </div>

      <h3 className="section-title">Semana y mes</h3>
      {rank < 1 ? (
        <Locked level="Pro" onUpgrade={onUpgrade} />
      ) : (
        <>
          <div className="st-grid">
            <Kpi label="Últimos 7 días" value={money(data.week.earn)} sub={`${data.week.n} entregas`} />
            <Kpi label="Últimos 30 días" value={money(data.month.earn)} sub={`${data.month.n} entregas`} />
          </div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Ganancias por día</h3>
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
                    <small>{dayName(x.day)}</small>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <h3 className="section-title">Rendimiento</h3>
      {rank < 2 ? (
        <Locked level="Premium" onUpgrade={onUpgrade} />
      ) : (
        <div className="st-grid">
          <Kpi
            label="Calificación"
            value={
              Number(data.rating_count) > 0 ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Star size={18} fill="currentColor" /> {data.rating_avg}
                </span>
              ) : (
                'Sin datos'
              )
            }
            sub={`${data.rating_count} valoraciones`}
          />
          <Kpi label="Entregas totales" value={data.total_n} />
          <Kpi label="Promedio por entrega" value={money(data.avg_fee)} />
          <Kpi
            label="Mejor día (7 días)"
            value={Number(best.earn) > 0 ? dayName(best.day) : '-'}
            sub={Number(best.earn) > 0 ? money(best.earn) : ''}
          />
        </div>
      )}

      <h3 className="section-title">Historial reciente</h3>
      {(data.history || []).length === 0 ? (
        <p className="hint">Aún no tienes entregas completadas.</p>
      ) : (
        <div className="card">
          {data.history.map((h, i) => (
            <div className="sum-line" key={i}>
              <span>
                {h.business} <small className="muted">{when(h.at)}</small>
              </span>
              <b>{money(h.fee)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
