import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://czgxawsevfrheuiuxepv.supabase.co'
const supabaseAnonKey = 'sb_publishable_Msn2HQnePUvfyYXKHbCM9Bw_-IRlQqfZ'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
