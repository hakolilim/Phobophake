const { SlashCommandBuilder, ChannelType, PermissionsBitField, MessageFlags } = require('discord.js')
const config = require('../repos/config')
const counting = require('../repos/counting')
const gameState = require('../repos/gameState')

module.exports = {
    data: new SlashCommandBuilder()
        .setName('set-channel')
        .setDescription('Cài đặt kênh chơi nối từ hoặc đếm số')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Kênh chơi nối từ hoặc đếm số')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true))
        .addStringOption(option =>
            option.setName('bot_mode')
                .setDescription('Chọn chế độ chơi (mặc định: nối từ không có bot)')
                .addChoices(
                    { name: 'Nối từ (False)', value: 'false' },
                    { name: 'Nối từ với bot (True)', value: 'true' },
                    { name: 'Couting', value: 'counting' }
                )
                .setRequired(false)),
    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({
                content: 'Bạn cần có quyền `MANAGE_GUILD` để thực hiện thao tác này!',
                flags: MessageFlags.Ephemeral
            })
        }

        const channel = interaction.options.getChannel('channel', true)
        const mode = interaction.options.getString('bot_mode') ?? 'false'
        const isCounting = mode === 'counting'
        const botMode = mode === 'true'
        const permissions = channel.permissionsFor(interaction.guild.members.me)
        const requiredPermissions = [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.AddReactions
        ]
        if (isCounting) requiredPermissions.push(PermissionsBitField.Flags.ReadMessageHistory)

        if (!permissions?.has(requiredPermissions)) {
            return interaction.reply({
                content: isCounting
                    ? 'Bot cần quyền xem kênh, gửi tin nhắn, đọc lịch sử và thả cảm xúc trong kênh đếm số.'
                    : 'Bot cần quyền xem kênh, gửi tin nhắn và thả cảm xúc trong kênh nối từ.',
                flags: MessageFlags.Ephemeral
            })
        }

        await interaction.deferReply()
        if (isCounting) {
            const state = await counting.setChannel(interaction.guildId, channel.id)
            if (config.getConfig(channel.id)) {
                await config.unsetChannel(channel.id)
                await gameState.removeGameState(channel.id)
            }
            return interaction.editReply(
                `Đã chọn kênh **${channel.name}** làm kênh đếm số! Số hiện tại: **${state.currentCount}**. ` +
                `Hãy gửi **${BigInt(state.currentCount) + 1n}** để đếm tiếp. ` +
                'Đếm sai hoặc một người đếm hai lần liên tiếp sẽ reset về 0. Trò chơi không có xếp hạng.'
            )
        }

        await config.setChannel(interaction.guildId, channel.id, botMode)
        if (counting.getState(channel.id)) await counting.unsetChannel(channel.id)
        return interaction.editReply(
            `Bạn đã chọn kênh **${channel.name}** làm kênh chơi nối từ của máy chủ **${interaction.guild.name}**!` +
            (botMode ? ' Chế độ nối từ với bot đã được **bật**.' : '')
        )
    }
}
