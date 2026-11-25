import { useEffect, useState } from 'react'
import { supabase } from './lib.js'
import { FilePick } from './ui.jsx'
import { shrinkImage } from './images.js'

export const photoUrl = (path) =>
  path ? supabase.storage.from('courier-photos').getPublicUrl(path).data.publicUrl : null

export function Avatar({ name, path, size = 44 }) {
  const url = photoUrl(path)
  return url ? (
    <img className="avatar-img" src={url} alt="" width={size} height={size} style={{ width: size, height: size }} />
  ) : (
    <div className="avatar-ph" style={{ width: size, height: size }} aria-hidden="true">
      {(name || '?').trim().charAt(0).toUpperCase()}
    </div>
  )
}

/* Repartidor asignado a un pedido (lo ven el cliente y el negocio) */
export function CourierInfo({ orderId, label = 'Tu repartidor' }) {
  const [info, setInfo] = useState(undefined)

  useEffect(() => {
    let alive = true
    supabase.rpc('order_courier_info', { p_order: orderId }).then(({ data, error }) => {
      if (alive) setInfo(error ? null : data)
    })
    return () => {
      alive = false
    }
  }, [orderId])

  if (info === undefined) return null
  if (!info) return <p className="meta" style={{ fontWeight: 700 }}>Repartidor asignado</p>
  return (
    <div className="courier-info">
      <Avatar name={info.name} path={info.photo_path} />
      <div>
        <small>{label}</small>
        <b>{info.name}</b>
        {info.vehicle && <span className="meta"> · {info.vehicle}</span>}
      </div>
    </div>
  )
}

/* Foto de rostro y carnet del repartidor */
export function CourierDocs({ courier, setCourier }) {
  const [photo, setPhoto] = useState(null)
  const [card, setCard] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  async function upload(file, bucket, kind) {
    const blob = await shrinkImage(file, 900)
    const path = `${courier.id}/${kind}-${Date.now()}.jpg`
    const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType: 'image/jpeg' })
    if (error) throw error
    return path
  }

  async function save() {
    setMsg(null)
    if (!photo && !card) return setMsg({ type: 'error', text: 'Elige al menos una imagen.' })
    setBusy(true)
    try {
      const change = {}
      if (photo) change.photo_path = await upload(photo, 'courier-photos', 'foto')
      if (card) change.id_card_path = await upload(card, 'courier-docs', 'carnet')
      const { error } = await supabase.from('couriers').update(change).eq('id', courier.id)
      if (error) throw error
      setCourier({ ...courier, ...change })
      setPhoto(null)
      setCard(null)
      setMsg({ type: 'ok', text: 'Documentos guardados.' })
    } catch (e) {
      const detail = e && e.message ? e.message : ''
      setMsg({ type: 'error', text: `No pudimos subir los documentos. ${detail}`.slice(0, 200) })
    }
    setBusy(false)
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Foto y carnet</h3>
      <p className="hint">
        Tu foto se muestra a clientes y negocios cuando llevas un pedido. El carnet solo lo ve el administrador,
        para verificar tu identidad.
      </p>

      <div className="docs-row">
        <Avatar name={courier.display_name} path={courier.photo_path} size={64} />
        <span className={`badge ${courier.photo_path ? 'aprobado' : ''}`}>
          {courier.photo_path ? 'Foto subida' : 'Falta tu foto'}
        </span>
      </div>
      <div className="field">
        <span>{courier.photo_path ? 'Cambiar foto de rostro' : 'Foto de rostro'}</span>
        <FilePick file={photo} onChange={setPhoto} text="Elegir foto" />
      </div>

      <div className="docs-row">
        <span className={`badge ${courier.id_card_path ? 'aprobado' : ''}`}>
          {courier.id_card_path ? 'Carnet subido' : 'Falta tu carnet'}
        </span>
      </div>
      <div className="field">
        <span>{courier.id_card_path ? 'Cambiar foto del carnet' : 'Foto del carnet de identidad'}</span>
        <FilePick file={card} onChange={setCard} text="Elegir foto del carnet" />
      </div>

      {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}
      <button className="btn small" disabled={busy} onClick={save}>
        {busy ? 'Subiendo...' : 'Guardar documentos'}
      </button>
    </div>
  )
}

/* Para el administrador: ver foto y carnet de un repartidor */
export function AdminCourierDocs({ item }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function openCard() {
    setError('')
    setBusy(true)
    const { data, error: err } = await supabase.storage.from('courier-docs').createSignedUrl(item.id_card_path, 600)
    setBusy(false)
    if (err || !data) return setError('No pudimos abrir el carnet.')
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  return (
    <div className="adm-owner" style={{ marginTop: 10 }}>
      <Avatar name={item.display_name} path={item.photo_path} size={44} />
      <div style={{ flex: 1 }}>
        <small>Documentos</small>
        {item.photo_path ? 'Foto subida' : 'Sin foto'} · {item.id_card_path ? 'Carnet subido' : 'Sin carnet'}
        {error && <div className="meta" style={{ color: '#b3261e' }}>{error}</div>}
      </div>
      {item.id_card_path && (
        <button type="button" className="btn small secondary" style={{ width: 'auto' }} disabled={busy} onClick={openCard}>
          {busy ? '...' : 'Ver carnet'}
        </button>
      )}
    </div>
  )
}
