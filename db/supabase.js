const { createClient } = require('@supabase/supabase-js')
const ws = require('ws')
require('dotenv').config()

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('[FATAL] Thiếu SUPABASE_URL hoặc SUPABASE_KEY trong .env')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
    // Node < 22 không có WebSocket native; cung cấp `ws` cho RealtimeClient.
    // (Dự án chỉ dùng PostgREST, không dùng realtime, nhưng client vẫn khởi tạo
    // RealtimeClient trong constructor nên cần transport này để không lỗi.)
    realtime: { transport: ws }
})

module.exports = supabase

