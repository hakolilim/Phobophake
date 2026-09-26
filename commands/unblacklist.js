const { SlashCommandBuilder, Client, PermissionsBitField, EmbedBuilder, MessageFlags } = require('discord.js')
require('dotenv').config({ quiet: true })
const REPORT_CHANNEL = process.env.REPORT_CHANNEL || ''
const dictionary = require('../repos/words')

const normalizeWord = (word) => {
    const tu = word.trim().toLowerCase()
    const wArr = tu.split(/\s+/).filter(Boolean)
    return {
        word: wArr.join(' '),
        wordCount: wArr.length
    }
}

const resultEmbed = (title, description, color = 13250094) => {
    return new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description)
        .setTimestamp()
}

const ensureReporterChannel = async (interaction) => {
    if (interaction.channelId !== REPORT_CHANNEL) {
        await interaction.reply({
            content: 'Lệnh này chỉ dùng được trong kênh báo cáo.',
            flags: MessageFlags.Ephemeral
        })
        return false
    }

    return true
}

const ensureValidWord = async (interaction, word) => {
    const normalized = normalizeWord(word)

    if (normalized.wordCount !== 2) {
        await interaction.reply({
            content: 'Cụm từ không hợp lệ.',
            flags: MessageFlags.Ephemeral
        })
        return null
    }

    return normalized.word
}

const ensureManageGuild = async (interaction) => {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        await interaction.reply({
            content: 'Bạn cần có quyền admin để gỡ từ khỏi blacklist.',
            flags: MessageFlags.Ephemeral
        })
        return false
    }

    return true
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unblacklist')
        .setDescription('Kiểm tra và gỡ từ khỏi blacklist của bot')
        .addStringOption(option =>
            option
                .setName('word')
                .setDescription('Cụm từ cần kiểm tra hoặc gỡ')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('action')
                .setDescription('Hành động cần thực hiện')
                .addChoices(
                    { name: 'Kiểm tra', value: 'check' },
                    { name: 'Gỡ khỏi blacklist', value: 'remove' }
                )
        ),
    /**
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     * @param {Client} client
     */
    async execute (interaction) {
        if (REPORT_CHANNEL === '') {
            return await interaction.reply({
                content: 'Tính năng blacklist hiện không hoạt động.',
                flags: MessageFlags.Ephemeral
            })
        }

        if (!(await ensureReporterChannel(interaction))) {
            return
        }

        const action = interaction.options.getString('action') ?? 'check'
        const rawWord = interaction.options.getString('word')
        const word = await ensureValidWord(interaction, rawWord)
        if (!word) {
            return
        }

        const isBlacklisted = dictionary.checkWordIfInReportDictionary(word)

        if (action === 'check') {
            return await interaction.reply({
                embeds: [resultEmbed(
                    isBlacklisted ? 'Kết quả kiểm tra' : 'Kết quả kiểm tra',
                    isBlacklisted
                        ? `**${word}** đang nằm trong blacklist của bot.`
                        : `**${word}** không nằm trong blacklist của bot.`
                )],
                flags: MessageFlags.Ephemeral
            })
        }

        if (!(await ensureManageGuild(interaction))) {
            return
        }

        if (!isBlacklisted) {
            return await interaction.reply({
                content: `**${word}** không nằm trong blacklist.`,
                flags: MessageFlags.Ephemeral
            })
        }

        const removed = await dictionary.removeWordFromReportList(word)
        if (!removed) {
            return await interaction.reply({
                content: `Không thể gỡ **${word}** khỏi blacklist.`,
                flags: MessageFlags.Ephemeral
            })
        }

        await interaction.reply({
            embeds: [resultEmbed(
                'Đã gỡ blacklist',
                `**${word}** đã được gỡ khỏi blacklist và được nạp lại vào từ điển runtime.`
            )],
            flags: MessageFlags.Ephemeral
        })

        const reportChannel = interaction.client.channels.cache.get(REPORT_CHANNEL)
        if (reportChannel) {
            await reportChannel.send({
                embeds: [resultEmbed(
                    'Blacklist updated',
                    `**${word}** đã được gỡ khỏi blacklist bởi **${interaction.user.tag}**.`
                )]
            })
        }
    }
}
