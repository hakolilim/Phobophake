const { SlashCommandBuilder, EmbedBuilder } = require('discord.js')
const ranking = require('../repos/ranking')

/**
 *
 * @param {String} userId
 * @param {String} guildId
 * @returns {Object|undefined}
 */
const getDataOfUser = (userId, guildId) => {
    return ranking.getUser(guildId, userId)
}

const embedData = (userId, guildId) => {
    const dataUser = getDataOfUser(userId, guildId)
    if (!dataUser) {
        return [{
            name: 'Hồ sơ trống',
            value: 'Bạn chưa chơi nối từ ở server này!'
        }]
    } else {
        return [
            {
                name: 'Thắng',
                value: '`' + dataUser.win + '`',
                inline: true
            },
            {
                name: 'Đã trả lời đúng',
                value: '`' + dataUser.true + '/' + dataUser.total + ' từ (' + (dataUser.true/dataUser.total*100).toFixed(2) + '%)`',
                inline: true
            },
        ]
    }
}

const meEmbed = (interaction) => new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle(interaction.member.displayName)
    .setDescription('Hồ sơ nối từ')
    .setThumbnail(interaction.member.user.avatarURL())
    .addFields(embedData(interaction.member.user.id, interaction.member.guild.id))

module.exports = {
    data: new SlashCommandBuilder()
        .setName('me')
        .setDescription('Xem thống kê nối từ của bạn'),

        async execute(interaction, client) {
            await interaction.reply({
                embeds: [meEmbed(interaction)]
            })
        }
}
