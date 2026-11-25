import { supabase } from './lib.js'
import { shrinkImage } from './images.js'

export const productPhoto = (path) =>
  path ? supabase.storage.from('product-photos').getPublicUrl(path).data.publicUrl : null

export const logoPhoto = (path) =>
  path ? supabase.storage.from('business-logos').getPublicUrl(path).data.publicUrl : null

/* Sube una imagen reducida y devuelve la ruta guardada */
export async function uploadImage(bucket, folder, file, max = 900) {
  const blob = await shrinkImage(file, max)
  const path = `${folder}/${Date.now()}.jpg`
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType: 'image/jpeg' })
  if (error) throw error
  return path
}

/* Tiempo estimado: preparación + trayecto (aprox. 4 min por km) */
export function etaRange(prepMinutes, km) {
  if (km == null) return null
  const total = Number(prepMinutes || 20) + 5 + Math.round(km * 4)
  const lo = Math.max(10, Math.round(total / 5) * 5)
  return `${lo}-${lo + 10} min`
}
