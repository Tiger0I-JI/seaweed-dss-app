import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://czgxawsevfrheuiuxepv.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6Z3hhd3NldmZyaGV1aXV4ZXB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyNzk1NzQsImV4cCI6MjEwNDg1NTU3NH0.DuY53gNvk0r1RtliUxXQFSmXbBDCtTlUduyWZ_f_F58'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
