const supabase = require('../db/supabase')

// cache RAM: danh sách guild_id (string)
let premiumCache = []

/**
 * Nạp danh sách guild Premium từ Supabase vào RAM.
 */
const loadPremium = async () => {
    const { data, error } = await supabase
        .from('premium_guilds')
        .select('guild_id')
    if (error) {
        console.error('[ERROR] loadPremium:', error.message)
        premiumCache = []
        return
    }
    premiumCache = data.map(row => row.guild_id)
    console.log(`[OK] Nạp ${premiumCache.length} máy chủ Premium.`)
}

/**
 * @returns {String[]} danh sách guild_id Premium.
 */
const getPremiumList = () => {
    return premiumCache
}

/**
 * @param {String} guildId
 * @returns {Boolean}
 */
const isPremium = (guildId) => {
    return premiumCache.includes(guildId)
}

const removeGuild = async (guildId) => {
    const { error } = await supabase.from('premium_guilds').delete().eq('guild_id', guildId)
    if (error) throw new Error('Lỗi xoá premium_guilds: ' + error.message)
    premiumCache = premiumCache.filter(id => id !== guildId)
}

module.exports = {
    loadPremium,
    getPremiumList,
    isPremium,
    removeGuild
}
