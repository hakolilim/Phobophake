const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js')
const axios = require('axios')
require('dotenv').config({ quiet: true })

// Cấu hình AI qua .env — dùng chung định dạng OpenAI Chat Completions
// nên hỗ trợ OpenAI, Gemini (OpenAI adapter), Anthropic (proxy), local model (Ollama, vLLM...)...
const AI_BASE_URL = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')
const AI_API_KEY = process.env.AI_API_KEY || ''
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini'
const AI_SYSTEM_PROMPT = process.env.AI_SYSTEM_PROMPT || 'Bạn là trợ lý tiếng Việt hữu ích, trả lời ngắn gọn, súc tích.'

// Timeout (ms) khi gọi API AI — AI_TIMEOUT_MS trong .env.
// Chỉ nhận số dương; nhập sai/âm/rỗng → fallback 30s (timeout: 0 trong axios nghĩa là không giới hạn)
const AI_TIMEOUT_ENV = Number(process.env.AI_TIMEOUT_MS)
const AI_TIMEOUT_MS = AI_TIMEOUT_ENV > 0 ? AI_TIMEOUT_ENV : 30 * 1000

const CONTEXT_LIMIT = 10 // số tin nhắn gần nhất lấy làm ngữ cảnh
const MAX_REPLY_LENGTH = 2000 // giới hạn của Discord message/embed description an toàn

// Tính năng được kích hoạt nếu đã cấu hình AI_BASE_URL hoặc AI_API_KEY
const aiEnabled = () => (process.env.AI_BASE_URL || '').trim() !== '' || AI_API_KEY !== ''

/**
 * Gửi context + câu hỏi tới AI, trả về nội dung trả lời.
 * @param {Object} interaction
 * @param {Client} client
 * @param {String} question
 * @param {String} systemPrompt
 * @returns {Promise<String>}
 */
const askAI = async (interaction, client, question, systemPrompt) => {
    // Lấy 10 tin nhắn gần nhất (loại trừ chính lệnh /ai đang thực thi)
    const fetched = await interaction.channel.messages.fetch({
        limit: CONTEXT_LIMIT,
        before: interaction.id
    })

    // Sắp xếp cũ → mới để AI đọc đúng thứ tự hội thoại
    const sorted = [...fetched.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp)

    const contextMessages = sorted
        .filter(m => m.content && m.content.trim() !== '')
        .map(m => ({
            // Tin nhắn của bot chính là câu trả lời trước đó → role assistant
            role: m.author.id === client.user.id ? 'assistant' : 'user',
            content: `${m.author.displayName}: ${m.content}`
        }))

    const messages = [
        { role: 'system', content: systemPrompt },
        ...contextMessages,
        { role: 'user', content: question }
    ]

    const headers = { 'Content-Type': 'application/json' }
    if (AI_API_KEY !== '') {
        headers['Authorization'] = `Bearer ${AI_API_KEY}`
    }

    const response = await axios.post(
        `${AI_BASE_URL}/chat/completions`,
        {
            model: AI_MODEL,
            messages,
            max_tokens: 2048
        },
        {
            headers,
            timeout: AI_TIMEOUT_MS
        }
    )

    const content = response.data?.choices?.[0]?.message?.content
    if (!content || content.trim() === '') {
        throw new Error('AI trả về nội dung rỗng')
    }

    return content.trim()
}

/**
 * Cắt bớt câu trả lời nếu vượt giới hạn Discord.
 * @param {String} text
 * @returns {String}
 */
const truncate = (text) => {
    if (text.length <= MAX_REPLY_LENGTH) {
        return text
    }
    return `${text.slice(0, MAX_REPLY_LENGTH - 50)}\n\n*...(câu trả lời bị cắt ngắn vì quá dài)*`
}

const aiEmbed = (question, reply) => new EmbedBuilder()
    .setColor(13250094)
    .setTitle(':crystal_ball: Trí tuệ nhân tạo')
    .addFields(
        {
            name: 'Bạn hỏi',
            value: question,
            inline: false
        },
        {
            name: 'AI trả lời',
            value: truncate(reply),
            inline: false
        }
    )
    .setFooter({ text: `Model: ${AI_MODEL}` })
    .setTimestamp()

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ai')
        .setDescription('Chat với AI, AI sẽ đọc 10 tin nhắn gần nhất trong kênh')
        .addStringOption(option =>
            option
                .setName('message')
                .setDescription('Tin nhắn gửi cho AI')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('system')
                .setDescription('System prompt tùy chỉnh (mặc định: trợ lý tiếng Việt)')
        )
        .addBooleanOption(option =>
            option
                .setName('visible')
                .setDescription('Để mọi người trong kênh cùng thấy câu trả lời (mặc định: chỉ bạn thấy)')
        ),
    /**
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     * @param {import('discord.js').Client} client
     */
    async execute (interaction, client) {
        if (!aiEnabled()) {
            return await interaction.reply({
                content: 'Tính năng AI hiện chưa được cấu hình!',
                flags: MessageFlags.Ephemeral
            })
        }

        const question = interaction.options.getString('message')
        const systemPrompt = interaction.options.getString('system') || AI_SYSTEM_PROMPT
        const isPublic = interaction.options.getBoolean('visible') ?? false

        // AI có thể mất vài giây → defer trước (chỉ người gọi thấy, trừ khi chọn visible)
        await interaction.deferReply({ flags: isPublic ? undefined : MessageFlags.Ephemeral })

        try {
            const reply = await askAI(interaction, client, question, systemPrompt)

            await interaction.editReply({
                embeds: [aiEmbed(question, reply)]
            })
        } catch (err) {
            console.error('[ERROR] /ai:', err.response?.data || err.message)

            let message = 'Không thể kết nối tới AI, vui lòng thử lại sau!'
            const apiMessage = err.response?.data?.error?.message
            if (apiMessage) {
                message = `Lỗi từ AI: ${apiMessage}`
            }

            await interaction.editReply({
                content: message
            })
        }
    }
}
