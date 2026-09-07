const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ quiet: true })

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('[FATAL] Thiếu SUPABASE_URL hoặc SUPABASE_KEY trong .env')
}

// Node >= 22 có WebSocket native, RealtimeClient tự dùng nó (dự án chỉ dùng PostgREST).
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false }
})

module.exports = supabase

