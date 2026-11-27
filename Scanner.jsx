import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ScanLine, X } from 'lucide-react'

/* Escáner de código de barras con la cámara (Chrome y Samsung Internet en Android) */
export const canScan = () =>
  typeof window !== 'undefined' &&
  'BarcodeDetector' in window &&
  !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)

function ScanOverlay({ onCode, onClose }) {
  const video = useRef(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let stream = null
    let timer = null
    let stopped = false

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        if (stopped) return stream.getTracks().forEach((t) => t.stop())
        video.current.srcObject = stream
        await video.current.play()
        const detector = new window.BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'],
        })
        timer = setInterval(async () => {
          try {
            const found = await detector.detect(video.current)
            if (found && found.length > 0 && found[0].rawValue) {
              clearInterval(timer)
              onCode(found[0].rawValue)
            }
          } catch (e) {
            /* sigue intentando */
          }
        }, 350)
      } catch (e) {
        setError('No pudimos abrir la cámara. Revisa el permiso de cámara del navegador.')
      }
    }
    start()
    return () => {
      stopped = true
      if (timer) clearInterval(timer)
      if (stream) stream.getTracks().forEach((t) => t.stop())
    }
  }, [onCode])

  return createPortal(
    <div className="scan-overlay" role="dialog" aria-label="Escanear código">
      <video ref={video} playsInline muted />
      <div className="scan-frame" />
      <p className="scan-hint">{error || 'Apunta al código de barras'}</p>
      <button type="button" className="scan-close" aria-label="Cerrar" onClick={onClose}>
        <X size={24} />
      </button>
    </div>,
    document.body
  )
}

export function ScanButton({ onCode, label = 'Escanear' }) {
  const [open, setOpen] = useState(false)
  if (!canScan()) return null
  return (
    <>
      <button type="button" className="btn small secondary scan-btn" onClick={() => setOpen(true)}>
        <ScanLine size={18} /> {label}
      </button>
      {open && (
        <ScanOverlay
          onClose={() => setOpen(false)}
          onCode={(code) => {
            setOpen(false)
            onCode(code)
          }}
        />
      )}
    </>
  )
}
