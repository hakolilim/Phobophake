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
// Khi tách phần chỉ tìm điểm cắt trong [MAX_REPLY_LENGTH - 200, MAX_REPLY_LENGTH]
// để mỗi phần gần đủ 1024 chars thay vì cắt quá sớm ở ranh giới gần nhất
const BREAK_SEARCH_WINDOW = 200

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

// ─── Chia nhỏ nội dung ───────────────────────────────────────────────────────

/**
 * Cắt bớt nội dung cho vừa embed field khi đang stream.
 * Khi stream xong, `splitChunks()` sẽ tách đầy đủ thành nhiều phần ≤ 1024 chars.
 * @param {String} text
 * @returns {String}
 */
const clip = (text) => {
    if (text.length <= MAX_REPLY_LENGTH) {
        return text
    }
    return `${text.slice(0, MAX_REPLY_LENGTH - 40)}\n\n*⏳ đang soạn tiếp...*`
}

/**
 * Tách chuỗi thành nhiều phần ≤ MAX_REPLY_LENGTH, cắt tại ranh giới tự nhiên
 * (đoạn → dòng mới → khoảng trắng). Guard tránh infinite loop nếu 1 đoạn dài
 * vượt xa giới hạn (slice cứng tại MAX_REPLY_LENGTH).
 * @param {String} text
 * @returns {string[]}
 */
const splitChunks = (text) => {
    const chunks = []
    let rest = text
    while (rest.length > MAX_REPLY_LENGTH) {
        const floor = Math.max(1, MAX_REPLY_LENGTH - BREAK_SEARCH_WINDOW)
        const window = rest.slice(floor, MAX_REPLY_LENGTH)
        let cut = -1
        // Ưu tiên: đoạn trống (\n\n) → dòng mới (\n) → khoảng trắng ( )
        for (const sep of ['\n\n', '\n', ' ']) {
            const idx = window.lastIndexOf(sep)
            if (idx !== -1) {
                cut = Math.min(floor + idx + sep.length, MAX_REPLY_LENGTH)
                break
            }
        }
        if (cut <= 0) cut = MAX_REPLY_LENGTH // edge case: 1 token quá dài
        chunks.push(rest.slice(0, cut).trimEnd())
        rest = rest.slice(cut)
    }
    if (rest.trim() !== '') chunks.push(rest.trimEnd())
    return chunks
}

// ─── Embed ───────────────────────────────────────────────────────────────────

/**
 * Embed hiển thị một phần của câu trả lời.
 * Phần đầu kèm luôn câu hỏi; các phần sau chỉ hiện nội dung trả lời.
 * @param {String} question
 * @param {String} reply
 * @param {{ streaming?: Boolean, partIndex?: Number, partTotal?: Number }} options
 * @returns {EmbedBuilder}
 */
const aiEmbed = (question, reply, { streaming = false, partIndex = 0, partTotal = 1 } = {}) => {
    const footer = [`Model: ${AI_MODEL}`]
    if (partTotal > 1) footer.push(`phần ${partIndex + 1}/${partTotal}`)
    if (streaming) footer.push('⏳ đang soạn...')

    const embed = new EmbedBuilder()
        .setColor(13250094)
        .setTitle(':crystal_ball: Trí tuệ nhân tạo')

    if (partIndex === 0) {
        embed.addFields({ name: 'Bạn hỏi', value: clip(question), inline: false })
    }
    embed.addFields({ name: 'AI trả lời', value: clip(reply) || '*đang soạn...*', inline: false })
    embed.setFooter({ text: footer.join(' · ') })
    embed.setTimestamp()
    return embed
}

// ─── Renderer có throttle ────────────────────────────────────────────────────

/**
 * Gom token vào buffer, edit message mỗi EDIT_INTERVAL_MS để tránh dính rate limit.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {String} question
 * @param {Boolean} isPublic false = reply của interaction là ephemeral
 */
const createStreamer = (interaction, question, isPublic) => {
    let buffer = ''
    let timer = null
    let done = false
    let lastRendered = null
    // Xếp các lần edit/followUp nối tiếp để không gọi chồng lên nhau
    let queue = Promise.resolve()

    // Ephemeral không được kế thừa từ interaction → mỗi followUp phải tự mang cờ
    const replyFlags = isPublic ? undefined : MessageFlags.Ephemeral
    const logError = (err) => console.error('[ERROR] /ai:', err.status || err.code || err.message)

    const render = (text) => {
        if (text === lastRendered) return
        lastRendered = text
        queue = queue
            .then(() => interaction.editReply({ embeds: [aiEmbed(question, text, { streaming: !done })] }))
            .catch(logError)
    }

    /**
     * Chốt nội dung cuối cùng: giữ nguyên 1 message nếu vừa 1 phần,
     * nếu dài hơn thì tách thành nhiều message (edit reply cũ + followUp các phần sau).
     * @param {String} text toàn bộ nội dung
     * @param {String} [warning] cảnh báo gắn vào message cuối (dùng khi stream bị ngắt)
     * @returns {Promise<void>}
     */
    const publish = async (text, warning) => {
        const chunks = text.trim() === '' ? [] : splitChunks(text)
        const total = chunks.length
        lastRendered = null // buộc ghi lại, tránh lastRendered chặn lần chốt này

        // Không có nội dung → để execute() tự xử lý lỗi
        if (total === 0) return

        queue = queue
            .then(async () => {
                await interaction.editReply({ embeds: [aiEmbed(question, chunks[0], { partIndex: 0, partTotal: total })] })
                for (let i = 1; i < total; i++) {
                    await interaction.followUp({
                        content: i === total - 1 && warning ? `⚠️ ${warning}` : undefined,
                        embeds: [aiEmbed(question, chunks[i], { partIndex: i, partTotal: total })],
                        flags: replyFlags
                    })
                }
            })
            .catch(logError)
        await queue
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
         * Kết thúc stream — bỏ timer pending, chốt nội dung cuối cùng.
         * @returns {Promise<String>} toàn bộ nội dung đã stream
         */
        async finish () {
            if (timer !== null) {
                clearTimeout(timer)
                timer = null
            }
            done = true
            await publish(buffer)
            return buffer
        },

        /**
         * Stream bị ngắt — hiển thị phần đã có (kèm cảnh báo ở message cuối)
         * qua đúng 1 lần editReply + các followUp nếu nội dung dài.
         * @param {String} warning
         */
        async abort (warning) {
            if (timer !== null) {
                clearTimeout(timer)
                timer = null
            }
            done = true
            if (buffer.trim() === '') {
                lastRendered = null
                queue = queue.then(() => interaction.editReply({ content: `⚠️ ${warning}`, embeds: [] })).catch(logError)
                await queue
                return
            }
            await publish(buffer, warning)
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
        const streamer = createStreamer(interaction, question, isPublic)

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
