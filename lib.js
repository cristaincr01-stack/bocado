import { createClient } from '@supabase/supabase-js'

// Nombre provisional de la app: cambia este texto cuando decidas el definitivo.
export const APP_NAME = 'Bocado'
export const CITY = 'Santa Clara'

// La URL y la clave "publishable" son publicas por diseno (la seguridad la da RLS en la base de datos).
const SUPABASE_URL = 'https://lngqywhvihxmcdvskixp.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_YqCvlluH2zYhbRHSp6G_nA_-ClqGxah'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

// Textos que ve el usuario para cada estado del pedido (se usaran en la siguiente etapa).
export const STATUS_LABELS = {
  enviado: 'Pedido enviado',
  confirmado: 'Confirmado',
  en_fogones: 'En los fogones',
  listo_para_salir: 'Listo para salir',
  rumbo_a_ti: 'Va rumbo a ti',
  a_la_vuelta: 'A la vuelta de la esquina',
  entregado: 'Disfruta tu pedido',
  cancelado: 'Cancelado',
}
