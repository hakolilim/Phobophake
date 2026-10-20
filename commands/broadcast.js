const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js')
require('dotenv').config({ quiet: true })
const config = require('../repos/config')

const REPORT_CHANNEL = process.env.REPORT_CHANNEL || ''
const FAILURE_DETAILS_LIMIT = 5

const getFailureReason = (reason) => {
    switch (reason) {
        case 'unavailable': return 'không tìm thấy hoặc bot không truy cập được'
        case 'wrong_guild': return 'không khớp máy chủ đã cấu hình'
        case 'not_sendable': return 'không phải kênh văn bản có thể gửi tin'
        case 'missing_permissions': return 'bot thiếu quyền xem hoặc gửi tin'
        default: return 'gửi tin thất bại'
    }
}

const recordFailure = (failures, channelId, reason, error) => {
    console.error(`[ERROR] broadcast to channel ${channelId}: ${error?.message ?? reason}`)
    failures.push({ channelId, reason })
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('broadcast')
        .setDescription('Gửi tin nhắn đến tất cả kênh chơi nối từ đã cấu hình')
        .addStringOption(option =>
            option
                .setName('message')
                .setDescription('Nội dung cần gửi (tối đa 2000 ký tự)')
                .setMaxLength(2000)
                .setRequired(true)
        ),
    /**
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     * @param {import('discord.js').Client} client
     */
    async execute (interaction, client) {
        if (REPORT_CHANNEL === '') {
            return await interaction.reply({
                content: 'Lệnh gửi tin hàng loạt hiện chưa được cấu hình.',
                flags: MessageFlags.Ephemeral
            })
        }

        if (interaction.channelId !== REPORT_CHANNEL) {
            return await interaction.reply({
                content: 'Lệnh này chỉ dùng được trong kênh báo cáo.',
                flags: MessageFlags.Ephemeral
            })
        }

        const message = interaction.options.getString('message', true)
        if (!message.trim()) {
            return await interaction.reply({
                content: 'Nội dung tin nhắn không được để trống.',
                flags: MessageFlags.Ephemeral
            })
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral })

        const channelConfigs = config.getAllConfigs()
        if (channelConfigs.length === 0) {
            return await interaction.editReply('Hiện chưa có kênh chơi nối từ nào được cấu hình.')
        }

        let sentCount = 0
        const failures = []

        for (const channelConfig of channelConfigs) {
            try {
                const channel = await client.channels.fetch(channelConfig.channel)
                if (!channel) {
                    recordFailure(failures, channelConfig.channel, 'unavailable')
                    continue
                }

                if (channel.guildId !== channelConfig.guildId) {
                    recordFailure(failures, channelConfig.channel, 'wrong_guild')
                    continue
                }

                if (!channel.isTextBased() || typeof channel.send !== 'function') {
                    recordFailure(failures, channelConfig.channel, 'not_sendable')
                    continue
                }

                const permissions = channel.permissionsFor(client.user)
                if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
                    recordFailure(failures, channelConfig.channel, 'missing_permissions')
                    continue
                }

                await channel.send({
                    content: message,
                    allowedMentions: { parse: [] }
                })
                sentCount++
            } catch (error) {
                recordFailure(failures, channelConfig.channel, 'send_failed', error)
            }
        }

        const failureSummary = failures.length === 0
            ? ''
            : `\nThất bại: ${failures.length}` +
                `\n${failures.slice(0, FAILURE_DETAILS_LIMIT).map(failure =>
                    `• \`${failure.channelId}\`: ${getFailureReason(failure.reason)}`
                ).join('\n')}` +
                (failures.length > FAILURE_DETAILS_LIMIT
                    ? `\n… và ${failures.length - FAILURE_DETAILS_LIMIT} kênh khác.`
                    : '')

        await interaction.editReply(
            `Đã gửi thành công đến ${sentCount}/${channelConfigs.length} kênh.` + failureSummary
        )
    }
}
