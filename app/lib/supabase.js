import { createClient } from '@supabase/supabase-js'

// Public (anon) values — safe to ship to the browser. Data access is protected by RLS.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ctraubzxdycwtzzpnhen.supabase.co'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0cmF1Ynp4ZHljd3R6enBuaGVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4Mzc3NjQsImV4cCI6MjEwODQxMzc2NH0.1WqT5xhNch6NyNmA-G8t713C9X5Yg3_OqxZ44_SkqAE'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
