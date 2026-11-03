const { SlashCommandBuilder, ChannelType, PermissionsBitField, MessageFlags } = require('discord.js')
const config = require('../repos/config')
const gameState = require('../repos/gameState')
const counting = require('../repos/counting')

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unset-channel')
        .setDescription('Xoá cài đặt kênh chơi nối từ hoặc đếm số')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Kênh cần xoá cài đặt trò chơi')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)),
    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            await interaction.reply({
                content: 'Bạn cần có quyền Admin để thực hiện thao tác này!',
                flags: MessageFlags.Ephemeral
            })
            return
        }

        const channel = interaction.options.getChannel('channel')
        const guildConfig = config.getConfig(channel.id)
        const countingState = counting.getState(channel.id)

        if (!guildConfig && !countingState) {
            await interaction.reply({
                content: `Kênh **${channel.name}** chưa được cài đặt trò chơi!`,
                flags: MessageFlags.Ephemeral
            })
            return
        }

        await interaction.deferReply()
        if (countingState) await counting.unsetChannel(channel.id)
        if (guildConfig) {
            await config.unsetChannel(channel.id)
            await gameState.removeGameState(channel.id)
        }

        await interaction.editReply(
            `Đã xoá cài đặt kênh ${countingState ? 'đếm số' : 'nối từ'} **${channel.name}** của máy chủ **${interaction.guild.name}**!`
        )
    }
}
