const { MessageFlags } = require('discord.js')
const counting = require('../repos/counting')

const handleCountingMessage = async (message) => {
    const result = await counting.submitCount(message.channelId, message.content, message.author.id)
    if (!result) return

    // Lỗi thả emoji không được ngăn thông báo reset đã lưu xuống DB.
    try {
        await message.react(result.correct
            ? process.env.CORRECT_EMOJI || '✅'
            : process.env.WRONG_EMOJI || '❌')
    } catch (error) {
        console.error('[ERROR] counting reaction:', error)
    }

    if (!result.correct) {
        const reason = result.reason === 'same_player'
            ? 'Bạn không thể đếm hai lần liên tiếp!'
            : 'Bạn đã đếm sai!'
        await message.reply({
            content: `${reason} Số đếm đã được reset về **0**. Hãy bắt đầu lại từ **1**.`,
            allowedMentions: { parse: [], repliedUser: false },
            flags: MessageFlags.SuppressNotifications
        })
    }
}

module.exports = { handleCountingMessage }
