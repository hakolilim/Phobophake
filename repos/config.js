const supabase = require('../db/supabase')

// cache RAM: { [guildId]: { channel: channelId, botMode: bool } }
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
        configCache[row.guild_id] = { channel: row.channel_id, botMode: row.bot_mode === true }
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
 * @param {Boolean} botMode
 */
const setChannel = async (guildId, channelId, botMode = false) => {
    configCache[guildId] = { channel: channelId, botMode }
    const { error } = await supabase
        .from('guild_config')
        .upsert({ guild_id: guildId, channel_id: channelId, bot_mode: botMode }, { onConflict: 'guild_id' })
    if (error) {
        console.error('[ERROR] setChannel:', error.message)
    }
}

module.exports = {
    loadConfig,
    getConfig,
    setChannel
}
