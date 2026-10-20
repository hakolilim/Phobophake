const supabase = require('../db/supabase')

const PAGE_SIZE = 1000

// cache RAM keyed by channelId: { [channelId]: { guildId, channel, botMode } }
let configCache = {}

/**
 * Nạp toàn bộ cấu hình kênh từ Supabase vào RAM.
 */
const loadConfig = async () => {
    const nextConfigCache = {}
    let from = 0
    let count = 0

    for (;;) {
        const { data, error } = await supabase
            .from('guild_config')
            .select('guild_id, channel_id, bot_mode')
            .order('channel_id')
            .range(from, from + PAGE_SIZE - 1)
        if (error) {
            throw new Error('Lỗi nạp guild_config: ' + error.message)
        }

        if (!data || data.length === 0) break
        for (const row of data) {
            nextConfigCache[row.channel_id] = {
                guildId: row.guild_id,
                channel: row.channel_id,
                botMode: row.bot_mode === true
            }
        }
        count += data.length
        if (data.length < PAGE_SIZE) break
        from += PAGE_SIZE
    }

    configCache = nextConfigCache
    console.log(`[OK] Nạp cấu hình ${count} kênh nối từ.`)
}

/**
 * Lấy cấu hình của 1 kênh.
 * @param {String} channelId
 * @returns {{guildId: String, channel: String, botMode: Boolean}|undefined}
 */
const getConfig = (channelId) => {
    return configCache[channelId]
}

/**
 * Lấy snapshot cấu hình của tất cả kênh nối từ.
 * @returns {{guildId: String, channel: String, botMode: Boolean}[]}
 */
const getAllConfigs = () => {
    return Object.values(configCache).map(channelConfig => ({ ...channelConfig }))
}

/**
 * Đăng ký 1 kênh nối từ. Một guild có thể có nhiều kênh.
 * @param {String} guildId
 * @param {String} channelId
 * @param {Boolean} botMode
 */
const setChannel = async (guildId, channelId, botMode = false) => {
    configCache[channelId] = { guildId, channel: channelId, botMode }
    const { error } = await supabase
        .from('guild_config')
        .upsert({ guild_id: guildId, channel_id: channelId, bot_mode: botMode }, { onConflict: 'channel_id' })
    if (error) {
        console.error('[ERROR] setChannel:', error.message)
    }
}

/**
 * Xoá cấu hình kênh nối từ.
 * @param {String} channelId
 */
const unsetChannel = async (channelId) => {
    delete configCache[channelId]
    const { error } = await supabase
        .from('guild_config')
        .delete()
        .eq('channel_id', channelId)
    if (error) {
        console.error('[ERROR] unsetChannel:', error.message)
    }
}

module.exports = {
    loadConfig,
    getConfig,
    getAllConfigs,
    setChannel,
    unsetChannel
}
