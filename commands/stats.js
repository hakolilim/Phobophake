const { SlashCommandBuilder, EmbedBuilder } = require('discord.js')
const dictionary = require('../repos/words')
const stats = require('../repos/stats')
const ranking = require('../repos/ranking')

const statEmbed = (client) => {
    const playerCount = ranking.countAllPlayers()
    const queryNumber = stats.getQuery()

    return new EmbedBuilder()
    .setColor(13250094)
    .addFields(
        {
            name: 'Tổng số server đang sử dụng',
            value: `${client.guilds.cache.size} servers`,
            inline: true
        },
        {
            name: 'Tổng số người đã chơi',
            value: `${playerCount}`,
            inline: true
        },
        {
            name: 'Tổng số từ đã nối',
            value: `${stats.getWordPlayedCount()}`,
            inline: true
        },
        {
            name: 'Tổng số vòng đã diễn ra',
            value: `${stats.getRoundPlayedCount()}`,
            inline: true
        },
        {
            name: 'Tổng số truy vấn dữ liệu',
            value: `${queryNumber}`,
            inline: true
        },
        {
            name: 'Tổng số từ trong ngân hàng từ',
            value: `${dictionary.countWordInDictionary()}`,
            inline: true
        },
    )
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Xem các thống kê của BOT'),

        async execute(interaction, client) {
            await interaction.reply({
                embeds: [statEmbed(client)],
                flags: [4096]
            })
        }
}
