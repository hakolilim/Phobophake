const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, Client, ButtonStyle } = require('discord.js')
require('dotenv').config()
const REPORT_CHANNEL = process.env.REPORT_CHANNEL || ''
const dictionary = require('../repos/words')

const messageEmbed = (msg) => {
    return new EmbedBuilder()
        .setColor(13250094)
        .setDescription(msg)
        .setTimestamp()
}

/**
 *
 * @param {Object} wordData
 * @param {Number} status
 * @returns {EmbedBuilder}
 */
const reportEmbed = (wordData, status = 0) => {
    return new EmbedBuilder()
        .setColor(13250094)
        .setThumbnail(wordData.guildIcon)
        .addFields(
            {
                name: wordData.type === 'add' ? ':heavy_plus_sign: Từ đề xuất thêm' : ':regional_indicator_p: Từ báo cáo',
                value: `**${wordData.word}**`,
                inline: true
            },
            {
                name: ':bulb: Lý do',
                value: wordData.reason,
                inline: true
            },
            {
                name: ':bust_in_silhouette: Người gửi',
                value: wordData.user,
                inline: true
            },
            {
                name: ':shield: Máy chủ',
                value: wordData.guildName,
                inline: true
            },
            {
                name: ':id: ID server',
                value: wordData.guildId,
                inline: true
            },
            {
                name: 'Trạng thái',
                value: (status === 0) ? ':clock12: Đang chờ' : (status === 1) ? ':white_check_mark: Đã đồng ý' : ':x: Đã từ chối',
                inline: true
            }
        )
        .setTimestamp()
}

const normalizeWord = (word) => {
    const tu = word.trim().toLowerCase()
    const wArr = tu.split(/\s+/).filter(Boolean)
    return {
        word: wArr.join(' '),
        wordCount: wArr.length
    }
}

const getActionWord = (type) => {
    return type === 'add' ? 'thêm từ' : 'báo cáo'
}

const applyApprovedWord = async (type, word) => {
    if (type === 'add') {
        if (global.dicData && !global.dicData.includes(word)) {
            global.dicData.push(word)
        }
        await dictionary.addWordToDictionary(word)
        return
    }

    await dictionary.addWordToReportList(word)
}

const sendDmToReporter = async (client, userId, embeds) => {
    const user = await client.users.fetch(userId)
    if (!user) {
        return
    }

    await user.send({ embeds })
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('report')
        .setDescription('Báo cáo từ ngữ không phù hợp trong từ điển')
        .addStringOption(option =>
            option
                .setName('word')
                .setDescription('Từ muốn báo cáo')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Lý do (không bắt buộc)')
        )
        .addStringOption(option =>
            option
                .setName('type')
                .setDescription('Chọn báo cáo hay đề xuất thêm từ')
                .addChoices(
                    { name: 'Báo cáo', value: 'report' },
                    { name: 'Thêm từ', value: 'add' }
                )
        ),
    /**
     *
     * @param {InteractionCollector} interaction
     * @param {Client} client
     */
    async execute (interaction, client) {
        if (REPORT_CHANNEL === '') {
            return await interaction.reply({
                content: 'Tính năng báo cáo hiện không hoạt động!',
                ephemeral: true
            })
        }

        let word = interaction.options.getString('word')
        let reason = interaction.options.getString('reason') ?? 'No reason provided.'
        const type = interaction.options.getString('type') ?? 'report'

        const normalized = normalizeWord(word)
        word = normalized.word

        if (normalized.wordCount !== 2) {
            return await interaction.reply({
                content: `Cụm từ không hợp lệ`,
                ephemeral: true
            })
        }

        if (type === 'report' && !dictionary.checkWordIfInDictionary(word)) {
            return await interaction.reply({
                content: `Cụm từ này không có trong từ điển của Bot`,
                ephemeral: true
            })
        }

        if (type === 'report' && dictionary.checkWordIfInReportDictionary(word)) {
            return await interaction.reply({
                content: `Cụm từ này đã có trong danh sách đen của Bot`,
                ephemeral: true
            })
        }

        if (type === 'add' && dictionary.checkWordIfInDictionary(word)) {
            return await interaction.reply({
                content: `Cụm từ này đã có trong từ điển của Bot`,
                ephemeral: true
            })
        }

        await interaction.reply({
            content: `Đã gửi yêu cầu ${getActionWord(type)} từ **${word}**`,
            ephemeral: true
        })

        const acceptButton = new ButtonBuilder()
            .setCustomId('accept')
            .setLabel('Đồng ý')
            .setStyle(ButtonStyle.Success)

        const declineButton = new ButtonBuilder()
            .setCustomId('decline')
            .setLabel('Từ chối')
            .setStyle(ButtonStyle.Danger)

        const row = new ActionRowBuilder()
            .addComponents(acceptButton, declineButton)

        const wordData = {
            word,
            reason,
            type,
            user: interaction.user.username,
            guildName: interaction.guild.name,
            guildId: interaction.guildId,
            guildIcon: interaction.guild.iconURL({ dynamic: true })
        }

        const msg = await client.channels.cache.get(REPORT_CHANNEL).send({
            embeds: [reportEmbed(wordData)],
            components: [row]
        })

        const filter = i => i.customId === 'accept' || i.customId === 'decline'

        const collection = msg.createMessageComponentCollector({filter})

        collection.on('collect', async i => {

            let status

            if (i.customId === 'accept') {
                status = 1
                await applyApprovedWord(type, word)
            } else {
                status = 2
            }

            await sendDmToReporter(client, interaction.user.id, [
                messageEmbed(`Từ \`${word}\` của bạn đã ${(status === 1) ? (type === 'add' ? 'được đồng ý thêm vào từ điển' : 'được đồng ý gỡ bỏ') : (type === 'add' ? 'bị từ chối thêm vào từ điển' : 'bị từ chối gỡ bỏ')} bởi mod \`${i.member.displayName}\``)
            ])

            await msg.edit({
                embeds: [reportEmbed(wordData, status)],
                components: []
            })
            return
        })

    }

}
