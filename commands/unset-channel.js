const { SlashCommandBuilder, ChannelType, PermissionsBitField } = require('discord.js')
const config = require('../repos/config')
const gameState = require('../repos/gameState')

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unset-channel')
        .setDescription('Xoá cài đặt kênh chơi nối từ')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Kênh cần xoá cài đặt nối từ')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)),
    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            await interaction.reply({
                content: 'Bạn cần có quyền Admin để thực hiện thao tác này!',
                ephemeral: true
            })
            return
        }

        const channel = interaction.options.getChannel('channel')
        const guildConfig = config.getConfig(channel.id)

        if (!guildConfig) {
            await interaction.reply({
                content: `Kênh **${channel.name}** chưa được cài đặt làm kênh nối từ!`,
                ephemeral: true
            })
            return
        }

        await config.unsetChannel(channel.id)
        await gameState.removeGameState(channel.id)

        await interaction.reply({
            content: `Đã xoá cài đặt kênh nối từ **${channel.name}** của máy chủ **${interaction.member.guild.name}**!`,
            flags: [4096]
        })
    }
}