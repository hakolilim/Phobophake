const supabase = require('../db/supabase')

// cache RAM keyed by channelId: { [channelId]: { guildId, channel, botMode } }
let configCache = {}

/**
 * Nạp toàn bộ cấu hình kênh từ Supabase vào RAM.
 */
const loadConfig = async () => {
    const { data, error } = await supabase
        .from('guild_config')
        .select('guild_id, channel_id, bot_mode')
    if (error) {
        throw new Error('Lỗi nạp guild_config: ' + error.message)
    }
    configCache = {}
    for (const row of data) {
        configCache[row.channel_id] = {
            guildId: row.guild_id,
            channel: row.channel_id,
            botMode: row.bot_mode === true
        }
    }
    console.log(`[OK] Nạp cấu hình ${data.length} kênh nối từ.`)
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

module.exports = {
    loadConfig,
    getConfig,
    setChannel
}
