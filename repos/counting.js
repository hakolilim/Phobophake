const supabase = require('../db/supabase')

const PAGE_SIZE = 1000
let stateCache = new Map()
const queues = new Map()

// Tuần tự hoá cả cấu hình và lượt đếm trong cùng kênh; các kênh độc lập nhau.
const enqueue = (channelId, operation) => {
    const previous = queues.get(channelId) || Promise.resolve()
    const result = previous.then(operation)
    const tail = result.catch(() => {}).finally(() => {
        if (queues.get(channelId) === tail) queues.delete(channelId)
    })
    queues.set(channelId, tail)
    return result
}

const loadCountingStates = async () => {
    const nextCache = new Map()
    for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
            .from('counting_channels')
            .select('channel_id, guild_id, current_count, last_player_id')
            .order('channel_id')
            .range(from, from + PAGE_SIZE - 1)
        if (error) throw new Error('Lỗi nạp counting_channels: ' + error.message)
        for (const row of data || []) {
            nextCache.set(row.channel_id, {
                guildId: row.guild_id,
                currentCount: row.current_count,
                lastPlayerId: row.last_player_id ?? null
            })
        }
        if (!data || data.length < PAGE_SIZE) break
    }
    stateCache = nextCache
    console.log(`[OK] Nạp trạng thái ${stateCache.size} kênh đếm số.`)
}

const getState = (channelId) => {
    const state = stateCache.get(channelId)
    return state && { ...state }
}

// Snapshot cấu hình kênh cho các chức năng dùng chung như broadcast.
const getAllConfigs = () => [...stateCache].map(([channel, state]) => ({
    channel,
    guildId: state.guildId
}))

const persist = async (channelId, state) => {
    const { error } = await supabase.from('counting_channels').upsert({
        channel_id: channelId,
        guild_id: state.guildId,
        current_count: state.currentCount,
        last_player_id: state.lastPlayerId
    }, { onConflict: 'channel_id' })
    if (error) throw new Error('Lỗi lưu counting_channels: ' + error.message)
    // Chỉ xác nhận lượt đếm sau khi DB đã lưu thành công.
    stateCache.set(channelId, state)
}

const setChannel = (guildId, channelId) => enqueue(channelId, async () => {
    const existing = stateCache.get(channelId)
    if (existing) return { ...existing }
    const state = { guildId, currentCount: '0', lastPlayerId: null }
    await persist(channelId, state)
    return { ...state }
})

const unsetChannel = (channelId) => enqueue(channelId, async () => {
    const { error } = await supabase.from('counting_channels')
        .delete().eq('channel_id', channelId)
    if (error) throw new Error('Lỗi xoá counting_channels: ' + error.message)
    stateCache.delete(channelId)
})

const submitCount = (channelId, content, userId) => {
    const text = content.trim()
    // Bỏ qua trò chuyện; số âm, số thập phân vẫn là một lượt đếm sai.
    if (!/^[+-]?\d+(?:[.,]\d+)?$/.test(text)) return Promise.resolve(null)
    return enqueue(channelId, async () => {
        const state = stateCache.get(channelId)
        if (!state) return null
        const expected = BigInt(state.currentCount) + 1n
        const samePlayer = state.lastPlayerId !== null && state.lastPlayerId === userId
        const correct = !samePlayer && /^\d+$/.test(text) && BigInt(text) === expected
        const currentCount = correct ? expected.toString() : '0'
        const lastPlayerId = correct ? userId : null
        await persist(channelId, { ...state, currentCount, lastPlayerId })
        return { correct, currentCount, reason: correct ? null : samePlayer ? 'same_player' : 'wrong_number' }
    })
}

module.exports = { loadCountingStates, getState, getAllConfigs, setChannel, unsetChannel, submitCount }
