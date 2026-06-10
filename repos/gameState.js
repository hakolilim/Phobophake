const supabase = require('../db/supabase')

// cache RAM: { [channelId]: { running, currentPlayer: {id, name}, words: [] } }
let stateCache = {}

/**
 * Ghi state của 1 channel xuống Supabase (write-through).
 * @param {String} channelId
 */
const persist = async (channelId) => {
    const s = stateCache[channelId]
    const { error } = await supabase
        .from('game_state')
        .upsert({
            channel_id: channelId,
            running: s.running,
            current_player_id: s.currentPlayer.id ?? null,
            current_player_name: s.currentPlayer.name ?? null,
            words: s.words
        }, { onConflict: 'channel_id' })
    if (error) {
        console.error('[ERROR] gameState.persist:', error.message)
    }
}

/**
 * Nạp toàn bộ game state từ Supabase vào RAM.
 */
const loadGameStates = async () => {
    const { data, error } = await supabase
        .from('game_state')
        .select('channel_id, running, current_player_id, current_player_name, words')
    if (error) {
        throw new Error('Lỗi nạp game_state: ' + error.message)
    }
    stateCache = {}
    for (const row of data) {
        stateCache[row.channel_id] = {
            running: row.running,
            currentPlayer: {
                id: row.current_player_id ?? undefined,
                name: row.current_player_name ?? undefined
            },
            words: Array.isArray(row.words) ? row.words : []
        }
    }
    console.log(`[OK] Nạp game state cho ${data.length} kênh.`)
}

/**
 * @param {String} channelId
 * @returns {Object|undefined}
 */
const getState = (channelId) => {
    return stateCache[channelId]
}

/**
 * @param {String} channelId
 * @returns {Boolean}
 */
const exists = (channelId) => {
    return stateCache[channelId] !== undefined
}

/**
 * @param {String} channelId
 * @returns {Boolean}
 */
const isRunning = (channelId) => {
    return exists(channelId) && stateCache[channelId].running === true
}

/**
 * Khởi tạo state rỗng cho channel.
 * @param {String} channelId
 */
const initWordData = async (channelId) => {
    stateCache[channelId] = {
        running: false,
        currentPlayer: {},
        words: []
    }
    await persist(channelId)
}

/**
 * Bắt đầu ván với từ khởi đầu cho trước.
 * @param {String} channelId
 * @param {String} startWord
 */
const startGame = async (channelId, startWord) => {
    stateCache[channelId].running = true
    stateCache[channelId].words = [startWord]
    await persist(channelId)
}

/**
 * @param {String} channelId
 */
const stopGame = async (channelId) => {
    stateCache[channelId].running = false
    await persist(channelId)
}

/**
 * Ghi nhận 1 từ hợp lệ: thêm vào words + cập nhật người chơi hiện tại.
 * @param {String} channelId
 * @param {String} word
 * @param {String} playerId
 * @param {String} playerName
 */
const recordWord = async (channelId, word, playerId, playerName) => {
    const s = stateCache[channelId]
    s.words.push(word)
    s.currentPlayer.id = playerId
    s.currentPlayer.name = playerName
    await persist(channelId)
}

module.exports = {
    loadGameStates,
    getState,
    exists,
    isRunning,
    initWordData,
    startGame,
    stopGame,
    recordWord
}
