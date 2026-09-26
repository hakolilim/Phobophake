const { EmbedBuilder, MessageFlags } = require('discord.js')
module.exports = {
    // "data" is the body of the command,
    // this is what we will find when we type /ping
    data: {
        name: 'ping',
        description: 'Kiểm tra ping của bot',
        options: []
    },
    // and all this is the logic of the order
    async execute(interaction, client) {
        // For example here we create an embed with EmbedBuilder from discord.js
        // We add a name and iconURL to it, and then modify it with the values.
        const PingBeforeEmbed = new EmbedBuilder().setAuthor({
            name: `Đang kiểm tra ping...`,
            iconURL: client.user.avatarURL()
        })
        const sent = await interaction.reply({
            embeds: [PingBeforeEmbed],
            flags: MessageFlags.Ephemeral,
            withResponse: true
        })
        const TotalPing = (sent.resource?.message?.createdTimestamp ?? Date.now()) - interaction.createdTimestamp
        const PingEmbed = new EmbedBuilder()
        .setAuthor({
            name: `Ping của ${client.user.username}`,
            iconURL: client.user.avatarURL()
        })
        .addFields(
            {
                name: 'Ping',
                value: `${TotalPing}ms`,
                inline: true
            },
            {
                name: 'Websocket',
                value: `${client.ws.ping} ms`,
                inline: true
            }
        )
        // Không truyền ephemeral khi edit: cờ đã được đặt lúc reply và không thể đổi bằng editReply
        await interaction.editReply({
            embeds: [PingEmbed]
        })
    }
}