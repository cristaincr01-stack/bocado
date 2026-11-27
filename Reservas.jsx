import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarCheck, Phone, Trash2, Users } from 'lucide-react'
import { supabase } from './lib.js'
import { money } from './utils.js'
import { Select, SegNav, FilePick, useConfirm, TIME_OPTIONS } from './ui.jsx'
import { shrinkImage } from './images.js'

const TZ = 'America/Havana'
const STATUS = {
  pendiente_pago: { label: 'Pago por confirmar', cls: '' },
  confirmada: { label: 'Confirmada', cls: 'aprobado' },
  sentada: { label: 'En la mesa', cls: 'aprobado' },
  completada: { label: 'Completada', cls: 'aprobado' },
  cancelada: { label: 'Cancelada', cls: 'rechazado' },
  no_show: { label: 'No vino', cls: 'rechazado' },
  expirada: { label: 'Expirada', cls: 'rechazado' },
}

const hour = (ts) => new Date(ts).toLocaleTimeString('es', { hour: 'numeric', minute: '2-digit', timeZone: TZ })
const dayKey = (ts) => new Date(ts).toLocaleDateString('en-CA', { timeZone: TZ })
function dayLabel(key) {
  const today = dayKey(Date.now())
  const tomorrow = dayKey(Date.now() + 86400000)
  if (key === today) return 'Hoy'
  if (key === tomorrow) return 'Mañana'
  const t = new Date(`${key}T12:00:00`).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}
function dayOptions(n) {
  return Array.from({ length: n }, (_, i) => {
    const key = dayKey(Date.now() + i * 86400000)
    return { value: key, label: dayLabel(key) }
  })
}
const errText = (e, fallback) => (e && e.message && e.message.length < 140 ? e.message : fallback)

/* ------------------------------------------------------------------ */
/* Selector de día, personas y horario (lo usan cliente y negocio)     */
/* ------------------------------------------------------------------ */
function SlotPicker({ business, days, onPick, picked }) {
  const [day, setDay] = useState(dayOptions(1)[0].value)
  const [party, setParty] = useState('2')
  const [slots, setSlots] = useState(null)

  useEffect(() => {
    setSlots(null)
    supabase
      .rpc('reservation_slots', { p_business: business.id, p_day: day, p_party: Number(party) })
      .then(({ data }) => setSlots(Array.isArray(data) ? data : []))
  }, [business.id, day, party])

  return (
    <div className="stack">
      <div className="field">
        <span>Día</span>
        <Select title="Día" value={day} onChange={setDay} options={dayOptions(days)} />
      </div>
      <div className="field">
        <span>Personas</span>
        <Select
          title="Personas"
          value={party}
          onChange={setParty}
          options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: i === 0 ? '1 persona' : `${i + 1} personas` }))}
        />
      </div>
      <div className="field">
        <span>Horario disponible</span>
        {slots === null && <p className="hint">Buscando mesas...</p>}
        {slots && slots.length === 0 && <p className="hint">No hay mesas libres ese día para {party} personas. Prueba otro día.</p>}
        {slots && slots.length > 0 && (
          <div className="h-quick">
            {slots.map((s) => (
              <button
                type="button"
                key={s.starts_at}
                aria-pressed={picked && picked.starts_at === s.starts_at}
                onClick={() => onPick({ ...s, party: Number(party) })}
              >
                {new Date(s.starts_at).toLocaleTimeString('es', { hour: 'numeric', minute: '2-digit', timeZone: TZ })}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PolicyText({ cfg, deposit }) {
  if (!cfg) return null
  return (
    <p className="hint">
      {Number(deposit) > 0
        ? `Depósito de ${money(deposit)} para asegurar la mesa. ${
            cfg.refund_hours > 0
              ? `Se devuelve si cancelas con al menos ${cfg.refund_hours} horas de anticipación.`
              : 'No es reembolsable.'
          } Si no llegas, el negocio lo conserva.`
        : 'Reserva sin depósito.'}
    </p>
  )
}

/* ------------------------------------------------------------------ */
/* CLIENTE: reservar una mesa                                          */
/* ------------------------------------------------------------------ */
export function ReserveScreen({ business, onBack }) {
  const [cfg, setCfg] = useState(undefined)
  const [picked, setPicked] = useState(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [done, setDone] = useState(null)
  const [proof, setProof] = useState(null)
  const [ref, setRef] = useState('')

  useEffect(() => {
    supabase.from('reservation_settings').select('*').eq('business_id', business.id).maybeSingle().then(({ data }) => setCfg(data || null))
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const p = await supabase.from('profiles').select('full_name, phone').eq('id', data.user.id).maybeSingle()
      if (p.data) {
        setName((v) => v || p.data.full_name || '')
        setPhone((v) => v || p.data.phone || '')
      }
    })
  }, [business.id])

  async function reserve() {
    setMsg(null)
    if (!picked) return setMsg('Elige un horario.')
    if (!name.trim() || !phone.trim()) return setMsg('Escribe tu nombre y tu teléfono.')
    setBusy(true)
    const { data, error } = await supabase.rpc('reservation_create', {
      p_business: business.id,
      p_table: picked.table_id,
      p_starts: picked.starts_at,
      p_party: picked.party,
      p_name: name.trim(),
      p_phone: phone.trim(),
      p_note: note.trim() || null,
      p_manual: false,
      p_paid: false,
    })
    setBusy(false)
    if (error) return setMsg(errText(error, 'No pudimos crear la reserva. Inténtalo de nuevo.'))
    setDone(data)
  }

  async function sendProof() {
    setMsg(null)
    if (!proof && !ref.trim()) return setMsg('Sube la captura del pago o escribe el número de la transferencia.')
    setBusy(true)
    try {
      let path = null
      if (proof) {
        const { data: u } = await supabase.auth.getUser()
        const blob = await shrinkImage(proof, 1100)
        path = `${u.user.id}/${done.id}-${Date.now()}.jpg`
        const up = await supabase.storage.from('reservation-proofs').upload(path, blob, { contentType: 'image/jpeg' })
        if (up.error) throw up.error
      }
      const { error } = await supabase.rpc('reservation_pay', { p_id: done.id, p_ref: ref.trim() || null, p_proof: path })
      if (error) throw error
      setDone({ ...done, claimed: true })
    } catch (e) {
      setMsg(errText(e, 'No pudimos enviar el comprobante.'))
    }
    setBusy(false)
  }

  if (cfg === undefined) return <p>Cargando...</p>
  if (!cfg || !cfg.enabled)
    return (
      <div className="stack">
        <button className="link" onClick={onBack}><ArrowLeft size={18} /> {business.name}</button>
        <div className="empty"><strong>Este negocio no recibe reservas por la app</strong>Puedes llamar o ir directamente.</div>
      </div>
    )

  if (done)
    return (
      <div className="stack">
        <button className="link" onClick={onBack}><ArrowLeft size={18} /> {business.name}</button>
        <div className={`shift-result ${done.status === 'confirmada' ? 'ok' : 'plus'}`}>
          <small>{done.status === 'confirmada' ? 'Reserva confirmada' : 'Reserva apartada, falta el pago'}</small>
          <b>{done.table}</b>
          <span>
            {dayLabel(dayKey(done.starts_at))} · {hour(done.starts_at)} · {done.party} {done.party === 1 ? 'persona' : 'personas'}
          </span>
        </div>

        {done.status === 'pendiente_pago' && !done.claimed && (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Paga el depósito: {money(done.deposit)}</h3>
            {cfg.pay_info ? <p style={{ whiteSpace: 'pre-wrap' }}>{cfg.pay_info}</p> : <p className="hint">Pregunta al negocio cómo pagar el depósito.</p>}
            <p className="hint">
              Tienes hasta las {hour(done.hold_until)} para enviar el comprobante; si no, la mesa se libera.
            </p>
            <div className="field">
              <span>Captura del pago</span>
              <FilePick file={proof} onChange={setProof} text="Subir captura" />
            </div>
            <label className="field">
              <span>Número de la transferencia (opcional)</span>
              <input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={40} />
            </label>
            {msg && <div className="msg error">{msg}</div>}
            <button className="btn" disabled={busy} onClick={sendProof}>{busy ? 'Enviando...' : 'Ya pagué, enviar comprobante'}</button>
          </div>
        )}
        {done.status === 'pendiente_pago' && done.claimed && (
          <div className="notice">Comprobante enviado. El negocio confirmará tu pago en breve.</div>
        )}
        <PolicyText cfg={cfg} deposit={done.deposit} />
        <button className="btn secondary" onClick={onBack}>Listo</button>
      </div>
    )

  return (
    <div className="stack">
      <button className="link" onClick={onBack}><ArrowLeft size={18} /> {business.name}</button>
      <h3 className="section-title" style={{ marginTop: 0 }}>Reservar mesa</h3>
      <SlotPicker business={business} days={Math.min(cfg.max_days, 14)} onPick={setPicked} picked={picked} />

      {picked && (
        <>
          <div className="card">
            <div className="row">
              <h3 style={{ margin: 0 }}>{picked.table}</h3>
              <span className="badge"><Users size={13} /> {picked.seats} sillas</span>
            </div>
            <PolicyText cfg={cfg} deposit={picked.deposit} />
          </div>
          <label className="field"><span>Tu nombre</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="field"><span>Tu teléfono</span><input value={phone} inputMode="tel" onChange={(e) => setPhone(e.target.value)} /></label>
          <label className="field"><span>Nota (opcional)</span><input value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} placeholder="Por ejemplo: cumpleaños" /></label>
          {msg && <div className="msg error">{msg}</div>}
          <button className="btn" disabled={busy} onClick={reserve}>
            {busy ? 'Reservando...' : Number(picked.deposit) > 0 ? `Reservar (depósito ${money(picked.deposit)})` : 'Reservar'}
          </button>
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* CLIENTE: mis reservas (aparece solo si hay)                         */
/* ------------------------------------------------------------------ */
export function MyReservations() {
  const [list, setList] = useState([])
  const [confirm, confirmUI] = useConfirm()
  const [proofFor, setProofFor] = useState(null)
  const [proof, setProof] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('reservations')
      .select('id, status, starts_at, party_size, table_label, deposit, paid, pay_claimed, refund_due, hold_until, business:businesses(name)')
      .gte('starts_at', new Date(Date.now() - 6 * 3600000).toISOString())
      .order('starts_at')
      .limit(20)
    setList((data || []).filter((r) => ['pendiente_pago', 'confirmada', 'sentada', 'cancelada'].includes(r.status)))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function cancel(r) {
    if (!(await confirm('¿Cancelar esta reserva?', 'Cancelar reserva'))) return
    const { error } = await supabase.rpc('reservation_cancel', { p_id: r.id })
    if (error) setMsg(errText(error, 'No pudimos cancelar.'))
    load()
  }

  async function sendProof(r) {
    if (!proof) return setMsg('Elige la captura del pago.')
    setBusy(true)
    try {
      const { data: u } = await supabase.auth.getUser()
      const blob = await shrinkImage(proof, 1100)
      const path = `${u.user.id}/${r.id}-${Date.now()}.jpg`
      const up = await supabase.storage.from('reservation-proofs').upload(path, blob, { contentType: 'image/jpeg' })
      if (up.error) throw up.error
      const { error } = await supabase.rpc('reservation_pay', { p_id: r.id, p_ref: null, p_proof: path })
      if (error) throw error
      setProof(null)
      setProofFor(null)
    } catch (e) {
      setMsg(errText(e, 'No pudimos enviar el comprobante.'))
    }
    setBusy(false)
    load()
  }

  if (list.length === 0) return null
  return (
    <>
      {confirmUI}
      <h3 className="section-title" style={{ marginTop: 0 }}>Tus reservas</h3>
      {msg && <div className="msg error">{msg}</div>}
      <div className="list" style={{ marginBottom: 18 }}>
        {list.map((r) => (
          <div className="card" key={r.id}>
            <div className="row">
              <h3 style={{ margin: 0 }}>{r.business?.name || 'Negocio'}</h3>
              <span className={`badge ${STATUS[r.status]?.cls || ''}`}>{STATUS[r.status]?.label}</span>
            </div>
            <p className="meta">
              {dayLabel(dayKey(r.starts_at))} · {hour(r.starts_at)} · {r.table_label} · {r.party_size} {r.party_size === 1 ? 'persona' : 'personas'}
            </p>
            {r.refund_due && <p className="meta discount-line">El negocio te devolverá el depósito.</p>}
            {r.status === 'pendiente_pago' && !r.pay_claimed && (
              <>
                <p className="meta">Falta el depósito de {money(r.deposit)}. Se libera a las {hour(r.hold_until)}.</p>
                {proofFor === r.id ? (
                  <div className="stack">
                    <FilePick file={proof} onChange={setProof} text="Subir captura del pago" />
                    <button className="btn small" disabled={busy} onClick={() => sendProof(r)}>{busy ? 'Enviando...' : 'Enviar comprobante'}</button>
                  </div>
                ) : (
                  <button className="btn small" onClick={() => setProofFor(r.id)}>Subir comprobante</button>
                )}
              </>
            )}
            {r.status === 'pendiente_pago' && r.pay_claimed && <p className="meta">Comprobante enviado. Esperando confirmación.</p>}
            {['pendiente_pago', 'confirmada'].includes(r.status) && (
              <div className="order-actions">
                <button className="btn small secondary" onClick={() => cancel(r)}>Cancelar reserva</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* NEGOCIO: panel de reservas                                          */
/* ------------------------------------------------------------------ */
function Upcoming({ business }) {
  const [confirm, confirmUI] = useConfirm()
  const [list, setList] = useState(null)
  const [msg, setMsg] = useState(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('reservations')
      .select('*')
      .eq('business_id', business.id)
      .gte('starts_at', new Date(Date.now() - 4 * 3600000).toISOString())
      .in('status', ['pendiente_pago', 'confirmada', 'sentada'])
      .order('starts_at')
      .limit(80)
    if (error) setMsg(errText(error, 'No pudimos cargar las reservas.'))
    setList(data || [])
  }, [business.id])

  useEffect(() => {
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [load])

  async function setStatus(r, status, ask) {
    if (ask && !(await confirm(ask, 'Sí, continuar'))) return
    const { error } = await supabase.rpc('reservation_set_status', { p_id: r.id, p_status: status })
    if (error) setMsg(errText(error, 'No pudimos actualizar.'))
    load()
  }

  async function viewProof(r) {
    const { data, error } = await supabase.storage.from('reservation-proofs').createSignedUrl(r.proof_path, 600)
    if (error || !data) return setMsg('No pudimos abrir el comprobante.')
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  const groups = useMemo(() => {
    const m = new Map()
    for (const r of list || []) {
      const k = dayKey(r.starts_at)
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(r)
    }
    return [...m.entries()]
  }, [list])

  return (
    <div className="stack">
      {confirmUI}
      {msg && <div className="msg error">{msg}</div>}
      {list === null && <p>Cargando...</p>}
      {list && list.length === 0 && (
        <div className="empty"><strong>No hay reservas próximas</strong>Las nuevas aparecerán aquí. Se actualiza solo.</div>
      )}
      {groups.map(([key, items]) => (
        <div key={key}>
          <h3 className="section-title">{dayLabel(key)}</h3>
          <div className="list">
            {items.map((r) => (
              <div className="card" key={r.id}>
                <div className="row">
                  <h3 style={{ margin: 0 }}>{hour(r.starts_at)} · {r.table_label}</h3>
                  <span className={`badge ${STATUS[r.status]?.cls || ''}`}>{STATUS[r.status]?.label}</span>
                </div>
                <p className="meta">
                  {r.guest_name} · {r.party_size} {r.party_size === 1 ? 'persona' : 'personas'}
                  {r.source === 'negocio' ? ' · anotada por ti' : ''}
                </p>
                {r.guest_phone && (
                  <p className="meta">
                    <Phone size={13} /> <a href={`tel:${r.guest_phone}`}>{r.guest_phone}</a>
                  </p>
                )}
                {r.note && <p className="meta">Nota: {r.note}</p>}
                {Number(r.deposit) > 0 && (
                  <p className="meta">
                    Depósito {money(r.deposit)} · {r.paid ? 'cobrado' : r.pay_claimed ? 'el cliente dice que pagó' : 'sin pagar'}
                    {r.pay_ref ? ` · ref. ${r.pay_ref}` : ''}
                  </p>
                )}
                <div className="order-actions">
                  {r.status === 'pendiente_pago' && (
                    <>
                      {r.proof_path && <button className="btn small secondary" onClick={() => viewProof(r)}>Ver comprobante</button>}
                      <button className="btn small" onClick={() => setStatus(r, 'confirmada')}>Confirmar pago</button>
                    </>
                  )}
                  {r.status === 'confirmada' && (
                    <>
                      <button className="btn small" onClick={() => setStatus(r, 'sentada')}>Llegaron</button>
                      <button className="btn small secondary" onClick={() => setStatus(r, 'no_show', 'Marcar que no vinieron. El depósito se conserva.')}>No vino</button>
                    </>
                  )}
                  {r.status === 'sentada' && <button className="btn small" onClick={() => setStatus(r, 'completada')}>Terminaron</button>}
                  {['pendiente_pago', 'confirmada'].includes(r.status) && (
                    <button className="btn small danger" onClick={() => setStatus(r, 'cancelada', 'Cancelar esta reserva. Si ya pagó, deberás devolver el depósito.')}>Cancelar</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function Manual({ business, cfg, onDone }) {
  const [picked, setPicked] = useState(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [paid, setPaid] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  async function save() {
    setMsg(null)
    if (!picked) return setMsg('Elige un horario.')
    if (!name.trim()) return setMsg('Escribe el nombre del cliente.')
    setBusy(true)
    const { error } = await supabase.rpc('reservation_create', {
      p_business: business.id,
      p_table: picked.table_id,
      p_starts: picked.starts_at,
      p_party: picked.party,
      p_name: name.trim(),
      p_phone: phone.trim() || null,
      p_note: note.trim() || null,
      p_manual: true,
      p_paid: paid,
    })
    setBusy(false)
    if (error) return setMsg(errText(error, 'No pudimos guardar la reserva.'))
    onDone()
  }

  return (
    <div className="stack">
      <p className="hint">Para reservas por teléfono o en persona. Usa las mismas mesas, así nunca se cruzan con las de la app.</p>
      <SlotPicker business={business} days={Math.min(cfg.max_days, 30)} onPick={setPicked} picked={picked} />
      {picked && (
        <>
          <div className="card">
            <h3 style={{ margin: 0 }}>{picked.table} · {picked.seats} sillas</h3>
            {Number(picked.deposit) > 0 && (
              <label className="check" style={{ marginTop: 10 }}>
                <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
                Ya cobré el depósito de {money(picked.deposit)}
              </label>
            )}
          </div>
          <label className="field"><span>Nombre del cliente</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="field"><span>Teléfono (opcional)</span><input value={phone} inputMode="tel" onChange={(e) => setPhone(e.target.value)} /></label>
          <label className="field"><span>Nota (opcional)</span><input value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} /></label>
          {msg && <div className="msg error">{msg}</div>}
          <button className="btn" disabled={busy} onClick={save}>{busy ? 'Guardando...' : 'Guardar reserva'}</button>
        </>
      )}
    </div>
  )
}

function Tables({ business }) {
  const [confirm, confirmUI] = useConfirm()
  const [list, setList] = useState(null)
  const [f, setF] = useState({ label: '', seats: '4', deposit: '' })
  const [msg, setMsg] = useState(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('restaurant_tables').select('*').eq('business_id', business.id).order('label')
    if (error) setMsg(errText(error, 'No pudimos cargar las mesas.'))
    setList(data || [])
  }, [business.id])

  useEffect(() => {
    load()
  }, [load])

  async function add(e) {
    e.preventDefault()
    setMsg(null)
    if (!f.label.trim()) return setMsg('Escribe el número o nombre de la mesa.')
    const { error } = await supabase.from('restaurant_tables').insert({
      business_id: business.id,
      label: f.label.trim(),
      seats: Math.max(1, Math.floor(Number(f.seats) || 1)),
      deposit: f.deposit === '' ? 0 : Math.max(0, Number(f.deposit)),
    })
    if (error) return setMsg(error.code === '23505' ? 'Ya tienes una mesa con ese nombre.' : errText(error, 'No pudimos crear la mesa.'))
    setF({ label: '', seats: f.seats, deposit: f.deposit })
    load()
  }

  async function toggle(t) {
    await supabase.from('restaurant_tables').update({ active: !t.active }).eq('id', t.id)
    load()
  }
  async function remove(t) {
    if (!(await confirm(`¿Eliminar "${t.label}"? Si tiene reservas, mejor desactívala.`, 'Eliminar'))) return
    const { error } = await supabase.from('restaurant_tables').delete().eq('id', t.id)
    if (error) setMsg('No se puede eliminar una mesa con reservas. Desactívala.')
    load()
  }
  async function setDeposit(t, v) {
    await supabase.from('restaurant_tables').update({ deposit: v === '' ? 0 : Math.max(0, Number(v)) }).eq('id', t.id)
    load()
  }

  return (
    <div className="stack">
      {confirmUI}
      <p className="hint">Agrega tus mesas con su número y cuántas sillas tienen. Tú decides el depósito de cada una (0 si no cobras).</p>
      <form className="card" onSubmit={add}>
        <label className="field"><span>Número o nombre de la mesa</span><input value={f.label} maxLength={20} placeholder="Por ejemplo: Mesa 1" onChange={(e) => setF({ ...f, label: e.target.value })} /></label>
        <div className="two-cols">
          <label className="field"><span>Sillas</span><input type="number" inputMode="numeric" min="1" max="30" value={f.seats} onChange={(e) => setF({ ...f, seats: e.target.value })} /></label>
          <label className="field"><span>Depósito (CUP)</span><input type="number" inputMode="decimal" min="0" value={f.deposit} placeholder="0" onChange={(e) => setF({ ...f, deposit: e.target.value })} /></label>
        </div>
        {msg && <div className="msg error">{msg}</div>}
        <button className="btn small">Agregar mesa</button>
      </form>
      {list === null && <p>Cargando...</p>}
      <div className="list">
        {(list || []).map((t) => (
          <div className={`card ${t.active ? '' : 'soldout'}`} key={t.id}>
            <div className="row">
              <h3 style={{ margin: 0 }}>{t.label}</h3>
              <span className="badge"><Users size={13} /> {t.seats} sillas</span>
            </div>
            <label className="field" style={{ marginTop: 10 }}>
              <span>Depósito (CUP)</span>
              <input type="number" inputMode="decimal" min="0" defaultValue={Number(t.deposit)} onBlur={(e) => Number(e.target.value) !== Number(t.deposit) && setDeposit(t, e.target.value)} />
            </label>
            <div className="order-actions">
              <button className="btn small secondary" onClick={() => toggle(t)}>{t.active ? 'Desactivar' : 'Activar'}</button>
              <button className="btn small danger" aria-label="Eliminar mesa" onClick={() => remove(t)}><Trash2 size={16} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const opt = (arr, suffix) => arr.map((n) => ({ value: String(n), label: `${n} ${suffix}` }))

function Settings({ business, cfg, onSaved }) {
  const [f, setF] = useState({
    enabled: cfg?.enabled ?? false,
    from_time: (cfg?.from_time || '12:00:00').slice(0, 5),
    to_time: (cfg?.to_time || '22:00:00').slice(0, 5),
    slot_minutes: String(cfg?.slot_minutes || 90),
    max_days: String(cfg?.max_days || 14),
    hold_minutes: String(cfg?.hold_minutes || 60),
    refund_hours: String(cfg?.refund_hours ?? 24),
    pay_info: cfg?.pay_info || '',
  })
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  async function save() {
    setMsg(null)
    setBusy(true)
    const { error } = await supabase.from('reservation_settings').upsert({
      business_id: business.id,
      enabled: f.enabled,
      from_time: f.from_time,
      to_time: f.to_time,
      slot_minutes: Number(f.slot_minutes),
      max_days: Number(f.max_days),
      hold_minutes: Number(f.hold_minutes),
      refund_hours: Number(f.refund_hours),
      pay_info: f.pay_info.trim() || null,
    })
    setBusy(false)
    if (error) return setMsg({ type: 'error', text: errText(error, 'No pudimos guardar.') })
    setMsg({ type: 'ok', text: 'Ajustes guardados.' })
    onSaved()
  }

  return (
    <div className="stack">
      <button type="button" className="switch" role="switch" aria-checked={f.enabled} onClick={() => setF({ ...f, enabled: !f.enabled })}>
        <span className="dot" />
        {f.enabled ? 'Reservas por la app: activadas' : 'Reservas por la app: apagadas'}
      </button>
      <div className="two-cols">
        <div className="field"><span>Primera reserva</span><Select title="Primera reserva" value={f.from_time} onChange={(v) => setF({ ...f, from_time: v })} options={TIME_OPTIONS} /></div>
        <div className="field"><span>Última reserva</span><Select title="Última reserva" value={f.to_time} onChange={(v) => setF({ ...f, to_time: v })} options={TIME_OPTIONS} /></div>
      </div>
      <div className="field"><span>Duración de cada reserva</span><Select title="Duración" value={f.slot_minutes} onChange={(v) => setF({ ...f, slot_minutes: v })} options={opt([60, 90, 120, 150, 180], 'minutos')} /></div>
      <div className="field"><span>¿Con cuánta anticipación reservan?</span><Select title="Anticipación" value={f.max_days} onChange={(v) => setF({ ...f, max_days: v })} options={opt([7, 14, 30], 'días')} /></div>
      <div className="field"><span>Tiempo para enviar el pago</span><Select title="Tiempo para pagar" value={f.hold_minutes} onChange={(v) => setF({ ...f, hold_minutes: v })} options={opt([30, 60, 120, 240], 'minutos')} /></div>
      <div className="field">
        <span>Devolver el depósito si cancelan con</span>
        <Select
          title="Devolución"
          value={f.refund_hours}
          onChange={(v) => setF({ ...f, refund_hours: v })}
          options={[{ value: '0', label: 'Nunca se devuelve' }, ...opt([6, 12, 24, 48], 'horas de anticipación')]}
        />
      </div>
      <label className="field">
        <span>Cómo pagar el depósito</span>
        <textarea rows={4} value={f.pay_info} onChange={(e) => setF({ ...f, pay_info: e.target.value })} placeholder={'Por ejemplo:\nTransfermóvil a la tarjeta 0000 0000 0000 0000\nTitular: ...'} />
        <p className="hint">Lo ve el cliente después de reservar una mesa con depósito.</p>
      </label>
      {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}
      <button className="btn" disabled={busy} onClick={save}>{busy ? 'Guardando...' : 'Guardar ajustes'}</button>
    </div>
  )
}

export function ReservasManager({ business, onBack }) {
  const [tab, setTab] = useState('proximas')
  const [cfg, setCfg] = useState(undefined)

  const loadCfg = useCallback(async () => {
    const { data } = await supabase.from('reservation_settings').select('*').eq('business_id', business.id).maybeSingle()
    setCfg(data || null)
  }, [business.id])

  useEffect(() => {
    loadCfg()
  }, [loadCfg])

  return (
    <div className="stack">
      <button type="button" className="link" onClick={onBack}><ArrowLeft size={18} /> Volver a herramientas</button>
      <h3 className="section-title" style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <CalendarCheck size={20} /> Reservas de mesa
      </h3>
      <SegNav
        items={[
          { id: 'proximas', label: 'Próximas' },
          { id: 'nueva', label: 'Nueva' },
          { id: 'mesas', label: 'Mesas' },
          { id: 'ajustes', label: 'Ajustes' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {cfg === undefined && <p>Cargando...</p>}
      {cfg !== undefined && tab === 'proximas' && <Upcoming business={business} />}
      {cfg !== undefined && tab === 'nueva' && (cfg ? <Manual business={business} cfg={cfg} onDone={() => setTab('proximas')} /> : <div className="notice">Primero configura tus mesas y los ajustes de reservas.</div>)}
      {cfg !== undefined && tab === 'mesas' && <Tables business={business} />}
      {cfg !== undefined && tab === 'ajustes' && <Settings business={business} cfg={cfg} onSaved={loadCfg} />}
    </div>
  )
}
