import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, ImagePlus, X, Star, MapPin } from 'lucide-react'

/* ------------------------------------------------------------------ */
/* Hoja inferior (reemplaza los menús nativos del navegador)           */
/* ------------------------------------------------------------------ */

export function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return createPortal(
    <div className="ui-back" onClick={onClose}>
      <div
        className="ui-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ui-grip" />
        {title && <h3 className="ui-title">{title}</h3>}
        {children}
      </div>
    </div>,
    document.body
  )
}

/* ------------------------------------------------------------------ */
/* Selector propio                                                     */
/* options: [{ value, label, hint? }] o lista de textos                */
/* ------------------------------------------------------------------ */

export function Select({ value, onChange, options, title, placeholder = 'Elegir', disabled }) {
  const [open, setOpen] = useState(false)
  const list = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o))
  const current = list.find((o) => o.value === value)
  const close = useCallback(() => setOpen(false), [])

  return (
    <>
      <button
        type="button"
        className="ui-pick"
        disabled={disabled}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <span className={current ? '' : 'ui-placeholder'}>{current ? current.label : placeholder}</span>
        <ChevronDown size={18} />
      </button>
      {open && (
        <Sheet title={title} onClose={close}>
          <div className="ui-options">
            {list.map((o) => (
              <button
                type="button"
                key={o.value}
                className="ui-option"
                aria-pressed={o.value === value}
                onClick={() => {
                  onChange(o.value)
                  close()
                }}
              >
                <span>
                  {o.label}
                  {o.hint && <small>{o.hint}</small>}
                </span>
                {o.value === value && <Check size={20} />}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Selector de imagen propio                                           */
/* ------------------------------------------------------------------ */

export function FilePick({ file, onChange, text = 'Elegir imagen', accept = 'image/*' }) {
  const input = useRef(null)
  const [preview, setPreview] = useState(null)

  useEffect(() => {
    if (!file) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  return (
    <div className="ui-file">
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => onChange(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
      />
      {file ? (
        <div className="ui-file-chosen">
          {preview && <img src={preview} alt="" />}
          <span>{file.name}</span>
          <button
            type="button"
            aria-label="Quitar imagen"
            onClick={() => {
              onChange(null)
              if (input.current) input.current.value = ''
            }}
          >
            <X size={18} />
          </button>
        </div>
      ) : (
        <button type="button" className="ui-file-add" onClick={() => input.current && input.current.click()}>
          <ImagePlus size={22} />
          {text}
        </button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Confirmación propia (reemplaza window.confirm)                      */
/* const [confirm, confirmUI] = useConfirm()                           */
/* if (await confirm('¿Eliminar?', 'Eliminar')) ...                    */
/* ------------------------------------------------------------------ */

export function useConfirm() {
  const [state, setState] = useState(null)

  const confirm = useCallback(
    (text, action = 'Confirmar') =>
      new Promise((resolve) => {
        setState({ text, action, resolve })
      }),
    []
  )

  function finish(answer) {
    if (state) state.resolve(answer)
    setState(null)
  }

  const ui = state ? (
    <Sheet onClose={() => finish(false)}>
      <p className="ui-confirm-text">{state.text}</p>
      <div className="ui-confirm-actions">
        <button type="button" className="btn danger" onClick={() => finish(true)}>
          {state.action}
        </button>
        <button type="button" className="btn secondary" onClick={() => finish(false)}>
          Cancelar
        </button>
      </div>
    </Sheet>
  ) : null

  return [confirm, ui]
}

/* ------------------------------------------------------------------ */
/* Horas cada 30 minutos para los horarios                             */
/* ------------------------------------------------------------------ */

export const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2)
  const m = i % 2 ? '30' : '00'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return { value: `${String(h).padStart(2, '0')}:${m}`, label: `${h12}:${m} ${h < 12 ? 'am' : 'pm'}` }
})

/* ------------------------------------------------------------------ */
/* Navegación: principal (píldoras con icono) y secundaria (segmentada) */
/* ------------------------------------------------------------------ */

export function PillNav({ items, value, onChange }) {
  return (
    <nav className="adm-nav" aria-label="Secciones">
      {items.map(({ id, label, Icon, badge }) => (
        <button key={id} aria-pressed={value === id} onClick={() => onChange(id)}>
          {Icon && <Icon size={18} />} {label}
          {badge > 0 && <span className="adm-dot">{badge}</span>}
        </button>
      ))}
    </nav>
  )
}

export function SegNav({ items, value, onChange }) {
  return (
    <div className="adm-seg">
      {items.map(({ id, label }) => (
        <button key={id} aria-pressed={value === id} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  )
}


/* ------------------------------------------------------------------ */
/* Barra inferior (cliente)                                            */
/* ------------------------------------------------------------------ */

export function BottomNav({ items, value, onChange }) {
  return (
    <nav className="bottom-nav" aria-label="Navegación principal">
      {items.map(({ id, label, Icon }) => (
        <button key={id} aria-pressed={value === id} onClick={() => onChange(id)}>
          <Icon size={22} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}

/* ------------------------------------------------------------------ */
/* Estrellas                                                           */
/* ------------------------------------------------------------------ */

export function Stars({ value, onChange, size = 28 }) {
  return (
    <div className="stars" role={onChange ? 'radiogroup' : undefined}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          type="button"
          key={n}
          disabled={!onChange}
          aria-label={`${n} estrellas`}
          onClick={() => onChange && onChange(n)}
          className={n <= value ? 'on' : ''}
        >
          <Star size={size} fill={n <= value ? 'currentColor' : 'none'} />
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Pantalla propia antes del permiso de ubicación                      */
/* const [askGeo, geoUI] = useGeoConsent()                             */
/* if (await askGeo()) { ...pedir la ubicación al navegador... }       */
/* ------------------------------------------------------------------ */

const GEO_KEY = 'bocado_geo_ok'

export function useGeoConsent() {
  const [state, setState] = useState(null)

  const ask = useCallback(
    () =>
      new Promise((resolve) => {
        let saved = false
        try {
          saved = window.localStorage.getItem(GEO_KEY) === '1'
        } catch (e) {
          saved = false
        }
        if (saved) return resolve(true)
        setState({ resolve })
      }),
    []
  )

  function finish(ok) {
    if (ok) {
      try {
        window.localStorage.setItem(GEO_KEY, '1')
      } catch (e) {
        /* sin almacenamiento: se vuelve a preguntar la próxima vez */
      }
    }
    if (state) state.resolve(ok)
    setState(null)
  }

  const ui = state ? (
    <Sheet onClose={() => finish(false)}>
      <div className="geo-sheet">
        <div className="geo-icon">
          <MapPin size={30} />
        </div>
        <h3>Encuentra negocios cerca de ti</h3>
        <p>
          Usamos tu ubicación solo mientras tienes Bocado abierto: para mostrarte los negocios más cercanos,
          avisarte de ofertas a pocos metros y ayudar a tu repartidor a encontrarte. No la compartimos con
          nadie más.
        </p>
        <p className="hint">Después tu teléfono te pedirá confirmar el permiso.</p>
        <div className="ui-confirm-actions">
          <button type="button" className="btn" onClick={() => finish(true)}>
            Permitir ubicación
          </button>
          <button type="button" className="btn secondary" onClick={() => finish(false)}>
            Ahora no
          </button>
        </div>
      </div>
    </Sheet>
  ) : null

  return [ask, ui]
}
