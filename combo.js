/* Sorpréndeme: arma combos con un presupuesto usando reglas simples (sin IA) */

const TIER_BONUS = { premium: 2, pro: 1, basico: 0 }

function shuffle(list) {
  const a = list.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/* Mejor combo de un negocio dentro de un presupuesto de productos */
function bestForBusiness(products, cap, people) {
  const minUnits = Math.max(1, people)
  const maxUnits = Math.min(8, Math.max(3, people * 3))
  const usable = products.filter((p) => Number(p.price) > 0 && Number(p.price) <= cap)
  if (usable.length === 0) return null

  let best = null
  for (let t = 0; t < 250; t++) {
    const picked = {}
    let total = 0
    let units = 0
    for (const p of shuffle(usable)) {
      const price = Number(p.price)
      while (units < maxUnits && (picked[p.id]?.qty || 0) < 2 && total + price <= cap) {
        picked[p.id] = { product: p, qty: (picked[p.id]?.qty || 0) + 1 }
        total += price
        units += 1
        if (Math.random() < 0.5) break
      }
    }
    if (units < minUnits) continue
    const lines = Object.values(picked)
    const score = (total / cap) * 100 + lines.length * 4
    if (!best || score > best.score) best = { lines, total, units, score }
  }
  return best
}

/* products: [{ id, name, price, has_delivery, business_id, business: {...} }] */
export function buildCombos(products, budget, people, wantDelivery = true) {
  const byBusiness = {}
  for (const p of products) {
    if (!byBusiness[p.business_id]) byBusiness[p.business_id] = { business: p.business, items: [] }
    byBusiness[p.business_id].items.push(p)
  }

  const results = []
  for (const { business, items } of Object.values(byBusiness)) {
    const allOwn = items.every((i) => i.has_delivery)
    const fee = wantDelivery && !allOwn ? Number(business.courier_fee || 0) : 0
    const cap = budget - fee
    if (cap <= 0) continue
    const best = bestForBusiness(items, cap, people)
    if (!best) continue
    results.push({
      business,
      lines: best.lines,
      subtotal: best.total,
      fee,
      total: best.total + fee,
      left: budget - (best.total + fee),
      score: best.score + (TIER_BONUS[business.tier] || 0),
    })
  }
  return results.sort((a, b) => b.score - a.score).slice(0, 3)
}
