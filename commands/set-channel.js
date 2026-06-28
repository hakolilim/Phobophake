const { SlashCommandBuilder, ChannelType, PermissionsBitField } = require('discord.js');
const config = require('../repos/config')

module.exports = {
    data: new SlashCommandBuilder()
        .setName('set-channel')
        .setDescription('Cài đặt kênh chơi nối từ')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Kênh chơi nối từ')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('bot_mode')
                .setDescription('Bật chế độ nối từ với bot (bot sẽ cùng nối từ với thành viên)')
                .setRequired(false)),
    async execute (interaction) {
        if(!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            await interaction.reply({
                content: 'Bạn cần có quyền Admin để thực hiện thao tác này!',
                ephemeral: true
            })
        } else {
            let channel = interaction.options.getChannel('channel')
            let botMode = interaction.options.getBoolean('bot_mode') ?? false

            // check send permission for bot
            if (!interaction.member.permissionsIn(channel).has(PermissionsBitField.Flags.ViewChannel)) {
                await interaction.reply({
                    content: 'Tôi không có quyền xem kênh này!',
                    ephemeral: true
                })
                return
            }

            if (!interaction.member.permissionsIn(channel).has(PermissionsBitField.Flags.SendMessages)) {
                await interaction.reply({
                    content: 'Tôi không có quyền gửi tin nhắn ở kênh này!',
                    ephemeral: true
                })
                return
            }

            if (!interaction.member.permissionsIn(channel).has(PermissionsBitField.Flags.AddReactions)) {
                await interaction.reply({
                    content: 'Tôi không có quyền thả cảm xúc vào tin nhắn ở kênh này!',
                    ephemeral: true
                })
                return
            }

            await config.setChannel(interaction.guildId, channel.id, botMode)

            await interaction.reply({
                content: `Bạn đã chọn kênh **${channel.name}** làm kênh chơi nối từ của máy chủ **${interaction.member.guild.name}**!${botMode ? ' Chế độ nối từ với bot đã được **bật**.' : ''}`,
                flags: [4096]
            })

            return
        }
    }
}
