// Sello de verificación (estilo redes sociales) con el color de cada nivel
const BUMPS = 8
const POINTS = Array.from({ length: 96 }, (_, i) => {
  const t = (i / 96) * Math.PI * 2
  const r = 10 + 1.6 * Math.cos(BUMPS * t)
  return `${(12 + r * Math.cos(t)).toFixed(2)},${(12 + r * Math.sin(t)).toFixed(2)}`
}).join(' ')

const TIERS = {
  basico: { name: 'Verificado Básico', from: '#4cb4ff', to: '#1a73e8' },
  pro: { name: 'Verificado Pro', from: '#d5dbe3', to: '#7c8696' },
  premium: { name: 'Verificado Premium', from: '#ffe680', to: '#d4920a' },
}

export function VerifiedBadge({ tier = 'basico', size = 18 }) {
  const key = TIERS[tier] ? tier : 'basico'
  const t = TIERS[key]
  const id = `vb-${key}`
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={t.name}
      style={{ flexShrink: 0 }}
    >
      <title>{t.name}</title>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={t.from} />
          <stop offset="1" stopColor={t.to} />
        </linearGradient>
      </defs>
      <polygon points={POINTS} fill={`url(#${id})`} />
      <path
        d="M7.6 12.4l3 3 5.9-6.2"
        fill="none"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
