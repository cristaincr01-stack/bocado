import { useCallback, useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Pencil, Trash2 } from 'lucide-react'
import { supabase } from './lib.js'
import { useConfirm } from './ui.jsx'

/* Categorías del menú (planes Pro y Premium) */
export function CategoryManager({ business, onBack }) {
  const [confirm, confirmUI] = useConfirm()
  const [list, setList] = useState(null)
  const [name, setName] = useState('')
  const [editing, setEditing] = useState(null)
  const [editName, setEditName] = useState('')
  const [msg, setMsg] = useState(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('menu_categories')
      .select('id, name, sort')
      .eq('business_id', business.id)
      .order('sort')
    if (error) setMsg({ type: 'error', text: 'No pudimos cargar tus categorías.' })
    else setList(data)
  }, [business.id])

  useEffect(() => {
    load()
  }, [load])

  async function add(e) {
    e.preventDefault()
    setMsg(null)
    const n = name.trim()
    if (!n) return
    const { error } = await supabase.rpc('create_menu_category', { p_business: business.id, p_name: n })
    if (error)
      return setMsg({
        type: 'error',
        text: error.message && error.message.length < 140 ? error.message : 'No pudimos crear la categoría.',
      })
    setName('')
    load()
  }

  async function rename(c) {
    const n = editName.trim()
    if (!n) return
    const { error } = await supabase.from('menu_categories').update({ name: n }).eq('id', c.id)
    if (error) return setMsg({ type: 'error', text: 'No pudimos cambiar el nombre.' })
    setEditing(null)
    load()
  }

  async function move(c, dir) {
    const i = list.findIndex((x) => x.id === c.id)
    const other = list[i + dir]
    if (!other) return
    await Promise.all([
      supabase.from('menu_categories').update({ sort: other.sort }).eq('id', c.id),
      supabase.from('menu_categories').update({ sort: c.sort }).eq('id', other.id),
    ])
    load()
  }

  async function remove(c) {
    if (!(await confirm(`¿Eliminar la categoría "${c.name}"? Sus productos quedan sin categoría.`, 'Eliminar'))) return
    await supabase.from('menu_categories').delete().eq('id', c.id)
    load()
  }

  return (
    <div className="stack">
      {confirmUI}
      <button type="button" className="link" onClick={onBack}>
        Volver al menú
      </button>
      <h3 className="section-title" style={{ marginTop: 0 }}>
        Categorías del menú
      </h3>
      <p className="hint">
        Crea las que quieras, por ejemplo "Completas", "Bebidas" o "Postres". Después asigna cada producto a una
        categoría al editarlo, y tus clientes verán el menú organizado.
      </p>
      {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}

      <form className="card" onSubmit={add}>
        <label className="field">
          <span>Nueva categoría</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Por ejemplo: Bebidas" />
        </label>
        <button className="btn small">Agregar categoría</button>
      </form>

      {list === null && <p>Cargando...</p>}
      {list && list.length === 0 && (
        <div className="empty">
          <strong>Aún no tienes categorías</strong>
          Crea la primera arriba.
        </div>
      )}
      <div className="list">
        {(list || []).map((c, i) => (
          <div className="card" key={c.id}>
            {editing === c.id ? (
              <div className="coupon-row">
                <input value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={40} aria-label="Nombre" />
                <button type="button" className="btn small" onClick={() => rename(c)}>
                  Guardar
                </button>
              </div>
            ) : (
              <div className="row">
                <h3>{c.name}</h3>
                <div className="cat-actions">
                  <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => move(c, -1)}>
                    <ArrowUp size={18} />
                  </button>
                  <button type="button" aria-label="Bajar" disabled={i === list.length - 1} onClick={() => move(c, 1)}>
                    <ArrowDown size={18} />
                  </button>
                  <button
                    type="button"
                    aria-label="Cambiar nombre"
                    onClick={() => {
                      setEditing(c.id)
                      setEditName(c.name)
                    }}
                  >
                    <Pencil size={18} />
                  </button>
                  <button type="button" aria-label="Eliminar" onClick={() => remove(c)}>
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
