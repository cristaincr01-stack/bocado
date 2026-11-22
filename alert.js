// Aviso sonoro y vibración para pedidos nuevos (sin archivos de audio)
let ctx = null

export function playAlert() {
  try {
    if (navigator.vibrate) navigator.vibrate([200, 100, 200])
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    ctx = ctx || new AC()
    if (ctx.state === 'suspended') ctx.resume()
    const beep = (start, freq) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      const t0 = ctx.currentTime + start
      o.type = 'sine'
      o.frequency.value = freq
      g.gain.setValueAtTime(0.0001, t0)
      g.gain.exponentialRampToValueAtTime(0.4, t0 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35)
      o.connect(g)
      g.connect(ctx.destination)
      o.start(t0)
      o.stop(t0 + 0.4)
    }
    beep(0, 880)
    beep(0.45, 1175)
  } catch {
    // sin sonido
  }
}
