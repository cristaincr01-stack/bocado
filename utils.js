import { useEffect, useRef } from 'react'
import { supabase } from './lib.js'

export const money = (n) => `${Number(n || 0).toLocaleString('es')} CUP`

export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Tu navegador no permite leer la ubicación.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () =>
        reject(
          new Error('No pudimos leer tu ubicación. Activa el permiso de ubicación del navegador.')
        ),
      { enableHighAccuracy: true, timeout: 15000 }
    )
  })
}

// Ejecuta onChange cada vez que cambie algo en la tabla (con el filtro dado).
// Si filter es null no se suscribe todavía.
export function useRealtime(name, table, filter, onChange) {
  const ref = useRef(onChange)
  ref.current = onChange

  useEffect(() => {
    if (filter === null) return
    const channel = supabase
      .channel(name)
      .on('postgres_changes', { event: '*', schema: 'public', table, filter }, () => ref.current())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [name, table, filter])
}
