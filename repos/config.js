const supabase = require('../db/supabase')

// cache RAM: { [guildId]: { channel: channelId } }
let configCache = {}

/**
 * Nạp toàn bộ cấu hình kênh từ Supabase vào RAM.
 */
const loadConfig = async () => {
    const { data, error } = await supabase
        .from('guild_config')
        .select('guild_id, channel_id')
    if (error) {
        throw new Error('Lỗi nạp guild_config: ' + error.message)
    }
    configCache = {}
    for (const row of data) {
        configCache[row.guild_id] = { channel: row.channel_id }
    }
    console.log(`[OK] Nạp cấu hình kênh cho ${data.length} máy chủ.`)
}

/**
 * @param {String} guildId
 * @returns {{channel: String}|undefined}
 */
const getConfig = (guildId) => {
    return configCache[guildId]
}

/**
 * @param {String} guildId
 * @param {String} channelId
 */
const setChannel = async (guildId, channelId) => {
    configCache[guildId] = { channel: channelId }
    const { error } = await supabase
        .from('guild_config')
        .upsert({ guild_id: guildId, channel_id: channelId }, { onConflict: 'guild_id' })
    if (error) {
        console.error('[ERROR] setChannel:', error.message)
    }
}

module.exports = {
    loadConfig,
    getConfig,
    setChannel
}
