import { Lock, Ticket, Heart, Clock, PackageX, TrendingUp, BarChart3, BellRing, Star, ClipboardList, Headset, Map as MapIcon, Route, Gauge, Medal, ShieldBan, Layers, QrCode } from 'lucide-react'

const RANK = { basico: 0, pro: 1, premium: 2 }
const NAME = { basico: 'Básico', pro: 'Pro', premium: 'Premium' }

/* status: 'listo' = ya funciona; 'pronto' = lo estamos construyendo */
const TOOLS = {
  negocio: [
    { id: 'cupones', min: 'basico', status: 'listo', Icon: Ticket, name: 'Códigos de descuento', text: 'Crea códigos para atraer clientes.', open: true },
    { id: 'habitual', min: 'basico', status: 'listo', Icon: Heart, name: 'Cliente habitual', text: 'Premia a quien te pide seguido.', open: true },
    { id: 'cuadre', min: 'basico', status: 'listo', Icon: ClipboardList, name: 'Cuadre de ventas e inventario', text: 'Cierre del día y control de cantidades.', open: true },
    { id: 'cercanos', min: 'basico', status: 'listo', Icon: BellRing, name: 'Aviso a clientes cercanos', text: 'Publica una oferta para quien esté cerca.', open: true },
    { id: 'horario', min: 'basico', status: 'listo', Icon: Clock, name: 'Horario automático', text: 'Abres y cierras solo según tu horario.', open: true },
    { id: 'agotados', min: 'basico', status: 'listo', Icon: PackageX, name: 'Marcar productos agotados', text: 'Un toque y el cliente lo ve agotado.', open: true },
    { id: 'posicion', min: 'pro', status: 'listo', Icon: TrendingUp, name: 'Mejor posición en la lista', text: 'Apareces antes que los negocios Básico.' },
    { id: 'estadisticas', min: 'basico', status: 'listo', Icon: BarChart3, name: 'Estadísticas de ventas', text: 'Hoy en Básico; gráfico y ranking completos desde Pro.', open: true },
    { id: 'enlace', min: 'basico', status: 'listo', Icon: QrCode, name: 'Enlace y código QR', text: 'Comparte tu negocio por WhatsApp o imprime tu QR.', open: true },
    { id: 'categorias', min: 'pro', status: 'listo', Icon: Layers, name: 'Categorías del menú', text: 'Organiza tu menú: Completas, Bebidas, Postres...', open: true },
    { id: 'bloqueos', min: 'basico', status: 'listo', Icon: ShieldBan, name: 'Clientes bloqueados', text: 'Protege tu negocio de pedidos falsos.', open: true },
    { id: 'destacados', min: 'premium', status: 'listo', Icon: Star, name: 'Sección Destacados', text: 'Apareces arriba, en la sección de destacados.' },
    { id: 'soporte', min: 'premium', status: 'listo', Icon: Headset, name: 'Soporte prioritario', text: 'Te atendemos primero por WhatsApp.', open: true },
  ],
  repartidor: [
    { id: 'mapa', min: 'basico', status: 'listo', Icon: MapIcon, name: 'Mapa y ruta', text: 'Ves el destino de cada entrega.' },
    { id: 'radio3', min: 'basico', status: 'listo', Icon: Gauge, name: 'Radio de 3 km', text: 'Recibes ofertas de pedidos cercanos.' },
    { id: 'dia', min: 'basico', status: 'pronto', Icon: Route, name: 'Historial y ganancias del día', text: 'Cuánto llevas ganado hoy.' },
    { id: 'radio5', min: 'pro', status: 'listo', Icon: Gauge, name: 'Radio de 5 km', text: 'Recibes ofertas de pedidos hasta 5 km.' },
    { id: 'antes', min: 'pro', status: 'listo', Icon: TrendingUp, name: 'Ofertas antes que los Básico', text: 'Te eligen antes que a los Básico.' },
    { id: 'semana', min: 'pro', status: 'pronto', Icon: BarChart3, name: 'Ganancias por semana y mes', text: 'Tu resumen de ingresos.' },
    { id: 'radio8', min: 'premium', status: 'listo', Icon: Gauge, name: 'Radio de 8 km', text: 'El mayor alcance: pedidos hasta 8 km.' },
    { id: 'prioridad', min: 'premium', status: 'listo', Icon: Medal, name: 'Primera prioridad en ofertas', text: 'Te eligen primero, antes que Pro y Básico.' },
    { id: 'rendimiento', min: 'premium', status: 'pronto', Icon: BarChart3, name: 'Estadísticas de rendimiento', text: 'Entregas, tiempos y calificación.' },
    { id: 'soporte', min: 'premium', status: 'listo', Icon: Headset, name: 'Soporte prioritario', text: 'Te atendemos primero por WhatsApp.', open: true },
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
