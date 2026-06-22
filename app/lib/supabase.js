import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  'https://aqrczwhdvhxmvmquckid.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxcmN6d2hkdmh4bXZtcXVja2lkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNTUwODAsImV4cCI6MjA5MjkzMTA4MH0.YjnfQs2ywJL01HR7lOMT-pN4sh_xYOCB474hMINAh6w'
)
