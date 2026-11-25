import { useMemo, useState } from 'react'
import { Plus, Minus, LayoutGrid, List } from 'lucide-react'
import { money } from './utils.js'
import { productPhoto } from './media.js'

function Photo({ p, className }) {
  const url = productPhoto(p.photo_path)
  return url ? (
    <img className={className} src={url} alt={p.name} loading="lazy" />
  ) : (
    <div className={`${className} ph`} aria-hidden="true">
      {(p.name || '?').trim().charAt(0).toUpperCase()}
    </div>
  )
}

function Badges({ p }) {
  return (
    <div className="p-badges">
      {p.has_delivery && <span className="badge propio">Envío incluido</span>}
      {!p.available && <span className="badge agotado">Agotado</span>}
      {p.available && p.stock !== null && p.stock !== undefined && p.stock <= 5 && (
        <span className="badge">{p.stock <= 3 ? 'Últimas unidades' : `Quedan ${p.stock}`}</span>
      )}
    </div>
  )
}

function QtyControl({ p, business, cart, add, remove, atStock }) {
  return (
    <div className="qty">
      {p.available && cart[p.id] && (
        <>
          <button aria-label="Quitar uno" onClick={() => remove(p)}>
            <Minus size={18} />
          </button>
          <b>{cart[p.id].qty}</b>
        </>
      )}
      {p.available && (
        <button className="add" aria-label="Agregar uno" onClick={() => add(p)} disabled={!business.is_open || atStock(p)}>
          <Plus size={18} />
        </button>
      )}
    </div>
  )
}

/* Menú del cliente: por categorías, en tarjetas horizontales o en lista vertical */
export function CustomerMenu({ products, cats, cart, business, add, remove, atStock }) {
  const hasPhotos = products.some((p) => p.photo_path)
  const [view, setView] = useState(hasPhotos ? 'cards' : 'list')
  const [filter, setFilter] = useState('todos')

  const groups = useMemo(() => {
    const sorted = (arr) => arr.slice().sort((x, y) => Number(y.available) - Number(x.available))
    const out = []
    for (const c of cats) {
      const items = products.filter((p) => p.category_id === c.id)
      if (items.length) out.push({ id: c.id, name: c.name, items: sorted(items) })
    }
    const rest = products.filter((p) => !p.category_id || !cats.some((c) => c.id === p.category_id))
    if (rest.length) out.push({ id: 'otros', name: cats.length ? 'Más productos' : 'Menú', items: sorted(rest) })
    return out
  }, [products, cats])

  const shown = filter === 'todos' ? groups : groups.filter((g) => g.id === filter)
  const showHeads = groups.length > 1 || (groups.length === 1 && cats.length > 0)

  return (
    <>
      <div className="menu-bar">
        {groups.length > 1 ? (
          <div className="menu-cats" role="tablist" aria-label="Categorías del menú">
            <button aria-pressed={filter === 'todos'} onClick={() => setFilter('todos')}>
              Todo
            </button>
            {groups.map((g) => (
              <button key={g.id} aria-pressed={filter === g.id} onClick={() => setFilter(g.id)}>
                {g.name}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        <div className="view-toggle" role="group" aria-label="Forma de ver el menú">
          <button aria-pressed={view === 'cards'} aria-label="Tarjetas" onClick={() => setView('cards')}>
            <LayoutGrid size={18} />
          </button>
          <button aria-pressed={view === 'list'} aria-label="Lista" onClick={() => setView('list')}>
            <List size={18} />
          </button>
        </div>
      </div>

      {shown.map((g) => (
        <section key={g.id} className="menu-group">
          {showHeads && <h3 className="section-title">{g.name}</h3>}
          {view === 'cards' ? (
            <div className="menu-row">
              {g.items.map((p) => (
                <div className={`pcard ${p.available ? '' : 'soldout'}`} key={p.id}>
                  <Photo p={p} className="pcard-img" />
                  <div className="pcard-body">
                    <h4>{p.name}</h4>
                    {p.description && <p className="meta clamp">{p.description}</p>}
                    <Badges p={p} />
                    <div className="pcard-foot">
                      <b>{money(p.price)}</b>
                      <QtyControl p={p} business={business} cart={cart} add={add} remove={remove} atStock={atStock} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="list">
              {g.items.map((p) => (
                <div className={`card product ${p.available ? '' : 'soldout'}`} key={p.id}>
                  <div className="info">
                    <h3>{p.name}</h3>
                    {p.description && <p className="meta">{p.description}</p>}
                    <p className="price">{money(p.price)}</p>
                    <Badges p={p} />
                  </div>
                  {p.photo_path && <Photo p={p} className="prow-img" />}
                  <QtyControl p={p} business={business} cart={cart} add={add} remove={remove} atStock={atStock} />
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </>
  )
}
