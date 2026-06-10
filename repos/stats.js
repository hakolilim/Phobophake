const supabase = require('../db/supabase')

// cache RAM cho 3 counter trong bảng global_stats
let counters = {
    query: 0,
    word_played: 0,
    round_played: 0
}

// query tăng hàng nghìn/lượt → tích trong RAM, flush định kỳ thay vì ghi mỗi message.
let dirtyQuery = false

/**
 * Nạp 3 counter từ Supabase vào RAM.
 */
const load = async () => {
    const { data, error } = await supabase
        .from('global_stats')
        .select('key, value')
    if (error) {
        throw new Error('Lỗi nạp global_stats: ' + error.message)
    }
    for (const row of data) {
        if (row.key in counters) {
            counters[row.key] = Number(row.value)
        }
    }
    console.log(`[OK] Nạp counters: query=${counters.query}, word_played=${counters.word_played}, round_played=${counters.round_played}.`)
}

/**
 * Ghi 1 counter xuống Supabase.
 * @param {String} key
 */
const persist = async (key) => {
    const { error } = await supabase
        .from('global_stats')
        .upsert({ key, value: counters[key] }, { onConflict: 'key' })
    if (error) {
        console.error(`[ERROR] stats.persist(${key}):`, error.message)
    }
}

/**
 * @returns {Number}
 */
const getQuery = () => counters.query

/**
 * Cộng query vào RAM (đánh dấu dirty, flush sau).
 * @param {Number} query
 */
const addQuery = (query = 1) => {
    counters.query += query
    dirtyQuery = true
}

/**
 * Flush query xuống DB nếu có thay đổi. Gọi định kỳ + lúc thoát.
 */
const flushQuery = async () => {
    if (!dirtyQuery) return
    dirtyQuery = false
    await persist('query')
}

/**
 * @returns {Number}
 */
const getWordPlayedCount = () => counters.word_played

/**
 * Tăng word_played (ghi ngay vì ít).
 */
const addWordPlayedCount = async () => {
    counters.word_played++
    await persist('word_played')
}

/**
 * @returns {Number}
 */
const getRoundPlayedCount = () => counters.round_played

/**
 * Tăng round_played (ghi ngay vì ít).
 */
const addRoundPlayedCount = async () => {
    counters.round_played++
    await persist('round_played')
}

module.exports = {
    load,
    getQuery,
    addQuery,
    flushQuery,
    getWordPlayedCount,
    addWordPlayedCount,
    getRoundPlayedCount,
    addRoundPlayedCount
}
