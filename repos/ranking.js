const supabase = require('../db/supabase')

// cache RAM: { [guildId]: [ {id, win, total, true, name, avatar} ] }
// Lưu ý: cột DB `true_count` map sang thuộc tính `.true` trong RAM để giữ
// nguyên logic embed của commands/rank.js, commands/me.js.
let rankCache = {}

/**
 * Nạp toàn bộ ranking từ Supabase vào RAM.
 */
const loadRankings = async () => {
    const PAGE_SIZE = 1000
    rankCache = {}
    let from = 0
    let total = 0
    for (;;) {
        const { data, error } = await supabase
            .from('rankings')
            .select('guild_id, user_id, win, total, true_count, name, avatar')
            .range(from, from + PAGE_SIZE - 1)
        if (error) {
            throw new Error('Lỗi nạp rankings: ' + error.message)
        }
        if (!data || data.length === 0) break
        for (const row of data) {
            if (!rankCache[row.guild_id]) rankCache[row.guild_id] = []
            rankCache[row.guild_id].push({
                id: row.user_id,
                win: row.win,
                total: row.total,
                true: row.true_count,
                name: row.name,
                avatar: row.avatar
            })
        }
        total += data.length
        if (data.length < PAGE_SIZE) break
        from += PAGE_SIZE
    }
    console.log(`[OK] Nạp ${total} bản ghi xếp hạng.`)
}

/**
 * Ghi 1 player xuống Supabase (write-through).
 * @param {String} guildId
 * @param {Object} player
 */
const persistUser = async (guildId, player) => {
    const { error } = await supabase
        .from('rankings')
        .upsert({
            guild_id: guildId,
            user_id: player.id,
            win: player.win,
            total: player.total,
            true_count: player.true,
            name: player.name,
            avatar: player.avatar
        }, { onConflict: 'guild_id,user_id' })
    if (error) {
        console.error('[ERROR] ranking.persistUser:', error.message)
    }
}

/**
 * @param {String} guildId
 * @returns {Array} players (mảng tham chiếu trong cache)
 */
const getGuildPlayers = (guildId) => {
    return rankCache[guildId] ?? []
}

/**
 * @param {String} guildId
 * @param {String} userId
 * @returns {Object|undefined}
 */
const getUser = (guildId, userId) => {
    const players = rankCache[guildId]
    if (!players) return undefined
    return players.find(p => p.id === userId)
}

/**
 * @param {String} guildId
 * @param {String} userId
 * @returns {Boolean}
 */
const userExists = (guildId, userId) => {
    return getUser(guildId, userId) !== undefined
}

/**
 * Khởi tạo bản ghi xếp hạng cho 1 người chơi mới.
 * @param {String} guildId
 * @param {String} userId
 * @param {String} name
 * @param {String} avatar
 */
const initRankDataForUser = async (guildId, userId, name, avatar) => {
    if (!rankCache[guildId]) rankCache[guildId] = []
    const player = { id: userId, win: 0, total: 0, true: 0, name, avatar }
    rankCache[guildId].push(player)
    await persistUser(guildId, player)
}

/**
 * Cập nhật tên + avatar của người chơi.
 * @param {String} guildId
 * @param {String} userId
 * @param {String} newName
 * @param {String} newAvatar
 */
const updateUserInfo = async (guildId, userId, newName, newAvatar) => {
    const player = getUser(guildId, userId)
    if (!player) return
    player.name = newName
    player.avatar = newAvatar
    await persistUser(guildId, player)
}

/**
 * Cộng dồn win/true/total cho người chơi.
 * @param {String} guildId
 * @param {String} userId
 * @param {Number} newWin
 * @param {Number} newTrue
 * @param {Number} newTotal
 */
const updateRankingForUser = async (guildId, userId, newWin, newTrue, newTotal) => {
    const player = getUser(guildId, userId)
    if (!player) return
    player.win += newWin
    player.true += newTrue
    player.total += newTotal
    await persistUser(guildId, player)
}

/**
 * @returns {Number} tổng số người chơi trên toàn bộ máy chủ.
 */
const countAllPlayers = () => {
    let count = 0
    for (const guildId in rankCache) {
        count += rankCache[guildId].length
    }
    return count
}

module.exports = {
    loadRankings,
    getGuildPlayers,
    getUser,
    userExists,
    initRankDataForUser,
    updateUserInfo,
    updateRankingForUser,
    countAllPlayers
}
