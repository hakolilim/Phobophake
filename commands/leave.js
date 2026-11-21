const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, InteractionContextType } = require('discord.js')
const { removeGuildData } = require('../repos/guild')
const guildActivity = require('../modules/guildActivity')

const REPORT_CHANNEL = process.env.REPORT_CHANNEL || ''
const normalizeName = value => value.trim().toLowerCase().normalize('NFD')
    .replace(/\p{M}/gu, '').replace(/đ/g, 'd')

const canSelectGuild = interaction => interaction.inGuild()
    && REPORT_CHANNEL !== '' && interaction.channelId === REPORT_CHANNEL
    && interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leave')
        .setDescription('Xoá dữ liệu và cho bot rời máy chủ hiện tại hoặc máy chủ được chọn')
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addStringOption(option => option
            .setName('guild')
            .setDescription('Chọn máy chủ hoặc nhập tên/ID (chỉ dùng trong REPORT_CHANNEL; mặc định: máy chủ này)')
            .setAutocomplete(true)
            .setMinLength(1)
            .setMaxLength(100)
            .setRequired(false)),
    async autocomplete(interaction, client) {
        if (!canSelectGuild(interaction)) return interaction.respond([])
        const focused = interaction.options.getFocused(true)
        if (focused.name !== 'guild') return interaction.respond([])

        const query = normalizeName(focused.value)
        const choices = [...client.guilds.cache.values()]
            .filter(guild => normalizeName(guild.name).includes(query) || guild.id.includes(query))
            .sort((a, b) => a.name.localeCompare(b.name, 'vi') || a.id.localeCompare(b.id))
            .slice(0, 25)
            .map(guild => ({
                name: `${guild.name.slice(0, 100 - guild.id.length - 3).replace(/[\uD800-\uDBFF]$/, '')} (${guild.id})`,
                value: guild.id
            }))
        await interaction.respond(choices)
    },
    async execute(interaction, client) {
        if (!interaction.inGuild() || !interaction.guild) {
            return interaction.reply({
                content: 'Lệnh này chỉ dùng được trong máy chủ.',
                flags: MessageFlags.Ephemeral
            })
        }
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({
                content: 'Bạn cần có quyền `MANAGE_GUILD` để thực hiện thao tác này!',
                flags: MessageFlags.Ephemeral
            })
        }

        // Discord có thể còn gửi cấu trúc cũ trong lúc đồng bộ lệnh mới.
        const selectedGuild = interaction.options.getString('guild') ?? interaction.options.getString('guild_id')
        let guildId = interaction.guildId
        if (selectedGuild !== null) {
            if (!REPORT_CHANNEL || interaction.channelId !== REPORT_CHANNEL) {
                return interaction.reply({
                    content: 'Tuỳ chọn `guild` chỉ dùng được trong kênh báo cáo đã cấu hình (`REPORT_CHANNEL`).',
                    flags: MessageFlags.Ephemeral
                })
            }
            const input = selectedGuild.trim()
            if (/^\d{17,20}$/.test(input)) {
                guildId = input
            } else {
                const matches = input ? [...client.guilds.cache.values()]
                    .filter(guild => normalizeName(guild.name) === normalizeName(input)) : []
                if (matches.length !== 1) {
                    return interaction.reply({
                        content: matches.length > 1
                            ? 'Có nhiều máy chủ trùng tên. Hãy chọn đúng máy chủ từ danh sách gợi ý có kèm ID.'
                            : 'Không tìm thấy máy chủ theo tên này. Hãy chọn từ danh sách gợi ý hoặc nhập ID Discord gồm 17–20 chữ số.',
                        flags: MessageFlags.Ephemeral
                    })
                }
                guildId = matches[0].id
            }
        }

        const retryCommand = selectedGuild === null ? '/leave' : `/leave guild:${guildId}`
        const lock = guildActivity.beginLeave(guildId)
        if (!lock) {
            return interaction.reply({
                content: `Bot đang xoá dữ liệu và rời máy chủ \`${guildId}\`.`,
                flags: MessageFlags.Ephemeral
            })
        }

        let cleaned = false
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral })
            await lock.drained
            let guild = interaction.guild
            if (guildId !== interaction.guildId) {
                try {
                    guild = await client.guilds.fetch(guildId)
                } catch (error) {
                    lock.cancel()
                    console.error(`[ERROR] leave.fetchGuild ${guildId}:`, error)
                    return await interaction.editReply(`Không tìm thấy máy chủ \`${guildId}\` hoặc bot không truy cập được máy chủ này. Chưa xoá dữ liệu.`)
                }
            }
            const channels = await guild.channels.fetch()
            await removeGuildData(guildId, [...channels.keys()])
            cleaned = true

            // Trả lời trước khi rời để không phụ thuộc webhook sau khi mất guild.
            await interaction.editReply(`Đã xoá toàn bộ cấu hình, trạng thái trò chơi, bảng xếp hạng và Premium của máy chủ \`${guildId}\` trên Supabase. Bot sẽ rời máy chủ ngay bây giờ.`)
                .catch(error => console.error('[ERROR] leave.editReply:', error))
            await guild.leave()
            // Giữ khoá sau khi rời để các event cũ không tạo lại dữ liệu.
        } catch (error) {
            lock.cancel()
            console.error(`[ERROR] leave ${guildId}:`, error)
            const content = cleaned
                ? `Đã xoá dữ liệu của máy chủ \`${guildId}\`, nhưng bot chưa rời được. Vui lòng thử lại \`${retryCommand}\`.`
                : `Chưa thể xoá hết dữ liệu của máy chủ \`${guildId}\` nên bot chưa rời. Một phần dữ liệu có thể đã được xoá; vui lòng thử lại \`${retryCommand}\`.`
            if (interaction.deferred) await interaction.editReply(content)
            else await interaction.reply({ content, flags: MessageFlags.Ephemeral })
        }
    }
}
