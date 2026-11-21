import { useEffect, useRef, useState, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './map.css'
import { supabase } from './lib.js'
import { useRealtime } from './utils.js'

// Centro aproximado de Santa Clara, por si todavia no hay ningun punto
const DEFAULT_CENTER = [22.4069, -79.9647]

function pin(kind, glyph) {
  return L.divIcon({
    className: `pin pin-${kind}`,
    html: `<span>${glyph}</span>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  })
}

const ICONS = {
  business: pin('store', '🍽️'),
  dest: pin('home', '🏠'),
  courier: pin('courier', '🛵'),
}

function hasPoint(p) {
  return p && p.lat != null && p.lng != null
}

function ago(ts) {
  if (!ts) return ''
  const s = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 1000))
  if (s < 60) return `hace ${s} s`
  return `hace ${Math.round(s / 60)} min`
}

function TrackingMap({ business, dest, courier }) {
  const el = useRef(null)
  const mapRef = useRef(null)
  const markers = useRef({})
  const fitted = useRef('')

  // Crear el mapa una sola vez
  useEffect(() => {
    const map = L.map(el.current).setView(DEFAULT_CENTER, 13)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map)
    mapRef.current = map
    setTimeout(() => map.invalidateSize(), 0)
    return () => {
      map.remove()
      mapRef.current = null
      markers.current = {}
      fitted.current = ''
    }
  }, [])

  // Mover marcadores cuando cambian las posiciones
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const put = (key, point) => {
      if (!hasPoint(point)) {
        if (markers.current[key]) {
          markers.current[key].remove()
          delete markers.current[key]
        }
        return
      }
      const latlng = [point.lat, point.lng]
      if (markers.current[key]) markers.current[key].setLatLng(latlng)
      else markers.current[key] = L.marker(latlng, { icon: ICONS[key] }).addTo(map)
    }

    put('business', business)
    put('dest', dest)
    put('courier', courier)

    // Ajustar la vista solo cuando aparece o desaparece algun punto
    const keys = Object.keys(markers.current).sort().join(',')
    if (keys && keys !== fitted.current) {
      fitted.current = keys
      const points = Object.values(markers.current).map((m) => m.getLatLng())
      if (points.length === 1) map.setView(points[0], 16)
      else map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 17 })
    }
  }, [business?.lat, business?.lng, dest?.lat, dest?.lng, courier?.lat, courier?.lng])

  return <div className="map-box" ref={el} />
}

// Muestra el mapa y sigue la posicion del repartidor en tiempo real
export function LiveMap({ business, dest, courierId }) {
  const [courier, setCourier] = useState(null)

  const load = useCallback(async () => {
    if (!courierId) {
      setCourier(null)
      return
    }
    const { data } = await supabase
      .from('couriers')
      .select('lat, lng, location_updated_at')
      .eq('id', courierId)
      .maybeSingle()
    if (data) setCourier(data)
  }, [courierId])

  useEffect(() => {
    load()
    const timer = setInterval(load, 10000)
    return () => clearInterval(timer)
  }, [load])

  useRealtime(`posicion-${courierId}`, 'couriers', courierId ? `id=eq.${courierId}` : null, load)

  return (
    <>
      <TrackingMap business={business} dest={dest} courier={courier} />
      <p className="hint" style={{ marginTop: 8 }}>
        {hasPoint(courier)
          ? `Última señal del repartidor ${ago(courier.location_updated_at)}`
          : 'Esperando la ubicación del repartidor...'}
      </p>
    </>
  )
}
