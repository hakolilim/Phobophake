const config = require('./config')
const counting = require('./counting')
const gameState = require('./gameState')
const ranking = require('./ranking')
const premium = require('./premium')

// Caller phải giữ khoá guildActivity và chờ các lượt đang xử lý hoàn tất.
const removeGuildData = async (guildId, channelIds = []) => {
    const configuredChannels = [...config.getAllConfigs(), ...counting.getAllConfigs()]
        .filter(entry => entry.guildId === guildId)
        .map(entry => entry.channel)

    // game_state chỉ có channel_id. Giữ guild_config đến cuối để còn xác định
    // được các kênh (kể cả kênh đã xoá trên Discord) nếu phải chạy lại sau lỗi.
    await gameState.removeGameStates([...channelIds, ...configuredChannels])
    await counting.removeGuild(guildId)
    await ranking.removeGuild(guildId)
    await premium.removeGuild(guildId)
    await config.removeGuild(guildId)
}

module.exports = { removeGuildData }
