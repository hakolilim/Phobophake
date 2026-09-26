const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js')
const axios = require('axios')
const readline = require('readline')
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
const MAX_REPLY_LENGTH = 1024 // giới hạn value của embed field theo Discord API
const EDIT_INTERVAL_MS = 1500 // debounce edit message khi đang stream

// Tính năng được kích hoạt nếu đã cấu hình AI_BASE_URL hoặc AI_API_KEY
const aiEnabled = () => (process.env.AI_BASE_URL || '').trim() !== '' || AI_API_KEY !== ''

// ─── Đọc stream SSE ──────────────────────────────────────────────────────────

/**
 * Đọc SSE từ OpenAI-compatible API, yield từng delta token.
 * @param {import('stream').Readable} stream
 * @yields {string} delta content
 */
const sseDeltas = async function * (stream) {
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })
    for await (const line of rl) {
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (payload === '[DONE]') break
        let parsed
        try { parsed = JSON.parse(payload) } catch { continue }
        const delta = parsed.choices?.[0]?.delta?.content
        if (delta) yield delta
    }
}

/**
 * Gọi API với stream:true, yield từng delta token.
 * Provider không hỗ trợ stream sẽ trả JSON thường → tự fallback yield 1 lần.
 * @param {Array} messages payload messages đã build
 * @yields {string} delta content
 */
const streamAI = async function * (messages) {
    const headers = { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' }
    if (AI_API_KEY !== '') {
        headers['Authorization'] = `Bearer ${AI_API_KEY}`
    }

    const response = await axios.post(
        `${AI_BASE_URL}/chat/completions`,
        { model: AI_MODEL, messages, max_tokens: 2048, stream: true },
        { headers, timeout: AI_TIMEOUT_MS, responseType: 'stream' }
    )

    const body = response.data
    const isStream = body !== null && typeof body === 'object' && typeof body.pipe === 'function'

    if (isStream) {
        // Deadline tổng cho cả quá trình đọc — axios timeout chỉ tính tới khi nhận header,
        // nên cần chốt riêng để stream treo giữa chừng cũng bị cắt.
        const deadline = Date.now() + AI_TIMEOUT_MS
        for await (const delta of sseDeltas(body)) {
            if (Date.now() > deadline) throw new Error(`AI không phản hồi trong ${AI_TIMEOUT_MS}ms`)
            yield delta
        }
        return
    }

    // Fallback: provider trả JSON thường (không hỗ trợ stream) → yield nguyên nội dung 1 lần
    const content = body?.choices?.[0]?.message?.content
    if (content) yield content
}

/**
 * Chuyển lỗi axios thành thông điệp tiếng Việt để hiển thị.
 * @param {Error} err
 * @returns {String}
 */
const errorMessage = (err) => {
    if (err.response) {
        // Với responseType: 'stream', axios trả body lỗi cũng dạng stream → đọc hết rồi parse
        const data = err.response.data
        if (data !== null && typeof data === 'object' && typeof data.pipe === 'function') {
            return `Lỗi ${err.response.status} từ AI`
        }
        const apiMessage = data?.error?.message
        if (apiMessage) return `Lỗi từ AI: ${apiMessage}`
        return `Lỗi ${err.response.status} từ AI`
    }
    if (err.code === 'ECONNABORTED') return `AI không phản hồi trong ${AI_TIMEOUT_MS}ms`
    return 'Không thể kết nối tới AI, vui lòng thử lại sau!'
}

// ─── Build ngữ cảnh hội thoại ────────────────────────────────────────────────

/**
 * Lấy 10 tin nhắn gần nhất và dựng payload messages cho API.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('discord.js').Client} client
 * @param {String} question
 * @param {String} systemPrompt
 * @returns {Promise<Array>}
 */
const buildMessages = async (interaction, client, question, systemPrompt) => {
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

    return [
        { role: 'system', content: systemPrompt },
        ...contextMessages,
        { role: 'user', content: question }
    ]
}

// ─── Cắt ngắn ────────────────────────────────────────────────────────────────

/**
 * Cắt bớt câu trả lời cho vừa giới hạn value của embed field.
 * @param {String} text
 * @returns {String}
 */
const truncate = (text) => {
    if (text.length <= MAX_REPLY_LENGTH) {
        return text
    }
    return `${text.slice(0, MAX_REPLY_LENGTH - 50)}\n\n*...(câu trả lời bị cắt ngắn vì quá dài)*`
}

// ─── Embed ───────────────────────────────────────────────────────────────────

/**
 * Embed hiển thị câu hỏi + câu trả lời đang stream hoặc đã hoàn tất.
 * @param {String} question
 * @param {String} reply
 * @param {{ streaming?: Boolean }} options
 * @returns {EmbedBuilder}
 */
const aiEmbed = (question, reply, { streaming = false } = {}) => new EmbedBuilder()
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
            value: truncate(reply) || '*đang soạn...*',
            inline: false
        }
    )
    .setFooter({ text: streaming ? `Model: ${AI_MODEL} · ⏳ đang soạn...` : `Model: ${AI_MODEL}` })
    .setTimestamp()

// ─── Renderer có throttle ────────────────────────────────────────────────────

/**
 * Gom token vào buffer, edit message mỗi EDIT_INTERVAL_MS để tránh dính rate limit.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {String} question
 */
const createStreamer = (interaction, question) => {
    let buffer = ''
    let timer = null
    let done = false
    let lastRendered = null
    // Xếp các lần edit nối tiếp để không gọi editReply chồng lên nhau
    let queue = Promise.resolve()

    const render = (text) => {
        if (text === lastRendered) return
        lastRendered = text
        queue = queue
            .then(() => interaction.editReply({ embeds: [aiEmbed(question, text, { streaming: !done })] }))
            .catch(err => console.error('[ERROR] /ai editReply:', err.status || err.code || err.message))
    }

    return {
        /**
         * @param {String} delta
         */
        push (delta) {
            buffer += delta
            // Debounce kiểu trailing: chỉ giữ 1 timer, đổ về sau liên tục vẫn edit 1 lần/1.5s
            if (timer === null) {
                timer = setTimeout(() => {
                    timer = null
                    render(buffer)
                }, EDIT_INTERVAL_MS)
            }
        },

        /**
         * Kết thúc stream — bỏ timer pending, flush nội dung cuối cùng.
         * @returns {Promise<String>} toàn bộ nội dung đã stream
         */
        async finish () {
            if (timer !== null) {
                clearTimeout(timer)
                timer = null
            }
            done = true
            render(buffer)
            await queue
            return buffer
        },

        /**
         * Stream bị ngắt — hiển thị phần đã có kèm cảnh báo trong đúng 1 lần editReply
         * (tránh gọi editReply 2 lần → dễ dính lỗi đã reply).
         * @param {String} warning
         */
        async abort (warning) {
            if (timer !== null) {
                clearTimeout(timer)
                timer = null
            }
            done = true
            lastRendered = null // bỏ qua check trùng, buộc render lần này
            queue = queue
                .then(() => interaction.editReply({
                    content: `⚠️ ${warning}`,
                    embeds: buffer.trim() !== '' ? [aiEmbed(question, buffer)] : []
                }))
                .catch(err => console.error('[ERROR] /ai editReply:', err.status || err.code || err.message))
            await queue
        },

        get text () { return buffer }
    }
}

// ─── Command ─────────────────────────────────────────────────────────────────

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

        // Ngoài try để nhánh lỗi vẫn đọc được phần đã stream
        const streamer = createStreamer(interaction, question)

        try {
            const messages = await buildMessages(interaction, client, question, systemPrompt)

            // Hiện ngay khung embed trống — người dùng thấy phản hồi tức thì, không chờ token đầu
            await interaction.editReply({ embeds: [aiEmbed(question, '', { streaming: true })] })

            for await (const delta of streamAI(messages)) {
                streamer.push(delta)
            }

            const reply = await streamer.finish()
            if (reply.trim() === '') {
                throw new Error('AI trả về nội dung rỗng')
            }
        } catch (err) {
            console.error('[ERROR] /ai:', err.status || err.code || err.message)

            // Stream bị ngắt giữa chừng → giữ lại phần đã có thay vì mất trắng
            if (streamer.text.trim() !== '') {
                await streamer.abort(errorMessage(err))
                return
            }

            await interaction.editReply({
                content: errorMessage(err),
                embeds: []
            })
        }
    }
}
