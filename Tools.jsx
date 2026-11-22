import { Lock, Ticket, Heart, Clock, PackageX, TrendingUp, BarChart3, BellRing, Star, ClipboardList, Headset, Map as MapIcon, Route, Gauge, Medal } from 'lucide-react'

const RANK = { basico: 0, pro: 1, premium: 2 }
const NAME = { basico: 'Básico', pro: 'Pro', premium: 'Premium' }

/* status: 'listo' = ya funciona; 'pronto' = lo estamos construyendo */
const TOOLS = {
  negocio: [
    { id: 'cupones', min: 'basico', status: 'listo', Icon: Ticket, name: 'Códigos de descuento', text: 'Crea códigos para atraer clientes.', open: true },
    { id: 'habitual', min: 'basico', status: 'listo', Icon: Heart, name: 'Cliente habitual', text: 'Premia a quien te pide seguido.', open: true },
    { id: 'horario', min: 'basico', status: 'listo', Icon: Clock, name: 'Horario automático', text: 'Abres y cierras solo según tu horario.', open: true },
    { id: 'agotados', min: 'basico', status: 'listo', Icon: PackageX, name: 'Marcar productos agotados', text: 'Un toque y el cliente lo ve agotado.', open: true },
    { id: 'posicion', min: 'pro', status: 'listo', Icon: TrendingUp, name: 'Mejor posición en la lista', text: 'Apareces antes que los negocios Básico.' },
    { id: 'estadisticas', min: 'pro', status: 'pronto', Icon: BarChart3, name: 'Estadísticas de ventas', text: 'Ventas por día y productos más pedidos.' },
    { id: 'cercanos', min: 'pro', status: 'pronto', Icon: BellRing, name: 'Aviso a clientes cercanos', text: 'Te mostramos a quien está cerca de tu negocio.' },
    { id: 'destacados', min: 'premium', status: 'listo', Icon: Star, name: 'Sección Destacados', text: 'Apareces arriba, en la sección de destacados.' },
    { id: 'cuadre', min: 'premium', status: 'pronto', Icon: ClipboardList, name: 'Cuadre de ventas e inventario', text: 'Controla lo que vendes y lo que te queda.' },
    { id: 'soporte', min: 'premium', status: 'pronto', Icon: Headset, name: 'Soporte prioritario', text: 'Te atendemos primero.' },
  ],
  repartidor: [
    { id: 'mapa', min: 'basico', status: 'listo', Icon: MapIcon, name: 'Mapa y ruta', text: 'Ves el destino de cada entrega.' },
    { id: 'dia', min: 'basico', status: 'pronto', Icon: Route, name: 'Historial y ganancias del día', text: 'Cuánto llevas ganado hoy.' },
    { id: 'radio5', min: 'pro', status: 'pronto', Icon: Gauge, name: 'Radio de 5 km', text: 'Recibes ofertas de más lejos.' },
    { id: 'antes', min: 'pro', status: 'pronto', Icon: TrendingUp, name: 'Ofertas antes que los Básico', text: 'Te llegan primero.' },
    { id: 'semana', min: 'pro', status: 'pronto', Icon: BarChart3, name: 'Ganancias por semana y mes', text: 'Tu resumen de ingresos.' },
    { id: 'radio8', min: 'premium', status: 'pronto', Icon: Gauge, name: 'Radio de 8 km', text: 'El mayor alcance de ofertas.' },
    { id: 'prioridad', min: 'premium', status: 'pronto', Icon: Medal, name: 'Primera prioridad en ofertas', text: 'Eres el primero en recibir cada oferta.' },
    { id: 'rendimiento', min: 'premium', status: 'pronto', Icon: BarChart3, name: 'Estadísticas de rendimiento', text: 'Entregas, tiempos y calificación.' },
    { id: 'soporte', min: 'premium', status: 'pronto', Icon: Headset, name: 'Soporte prioritario', text: 'Te atendemos primero.' },
  ],
}

export function TierTools({ kind, tier, onOpen, onUpgrade }) {
  const mine = RANK[tier] ?? 0
  return (
    <div className="stack">
      <p className="hint">
        Tu nivel es <b>{NAME[tier] || 'Básico'}</b>. Estas son las herramientas de cada nivel.
      </p>
      {['basico', 'pro', 'premium'].map((level) => {
        const group = TOOLS[kind].filter((t) => t.min === level)
        if (group.length === 0) return null
        const locked = RANK[level] > mine
        return (
          <div key={level}>
            <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {locked && <Lock size={16} />}
              {level === 'basico' ? 'Incluido desde Básico' : `Desde ${NAME[level]}`}
            </h3>
            <div className="list">
              {group.map((t) => (
                <div className={`card tool ${locked ? 'locked' : ''}`} key={t.id}>
                  <div className="tool-icon">
                    <t.Icon size={22} />
                  </div>
                  <div className="tool-body">
                    <h3>{t.name}</h3>
                    <p className="meta">{t.text}</p>
                  </div>
                  <div className="tool-side">
                    {locked ? (
                      <button className="btn small secondary" onClick={onUpgrade}>
                        Ver planes
                      </button>
                    ) : t.status === 'pronto' ? (
                      <span className="badge">Próximamente</span>
                    ) : t.open && onOpen ? (
                      <button className="btn small" onClick={() => onOpen(t.id)}>
                        Abrir
                      </button>
                    ) : (
                      <span className="badge aprobado">Activa</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
