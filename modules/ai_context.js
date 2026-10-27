const SUPPORTED_IMAGE_TYPES = new Set([
    'image/gif',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp'
])

const IMAGE_FILE_PATTERN = /\.(?:gif|jpe?g|png|webp)(?:$|[?#])/i
const DEFAULT_IMAGE_LIMIT = 4

const collectionValues = (collection) => {
    if (!collection) return []
    if (Array.isArray(collection)) return collection
    if (typeof collection.values === 'function') return [...collection.values()]
    return Object.values(collection)
}

const httpUrl = (value) => {
    if (typeof value !== 'string') return null
    try {
        const url = new URL(value)
        return url.protocol === 'http:' || url.protocol === 'https:' ? value : null
    } catch {
        return null
    }
}

const attachmentImageUrl = (attachment) => {
    const contentType = attachment.contentType?.split(';', 1)[0].trim().toLowerCase()
    const nameOrUrl = attachment.name || attachment.url || ''
    const isImage = contentType
        ? SUPPORTED_IMAGE_TYPES.has(contentType)
        : IMAGE_FILE_PATTERN.test(nameOrUrl)

    if (!isImage) return null
    return httpUrl(attachment.url || attachment.proxyURL)
}

const embedAssetUrl = (asset) => {
    if (!asset) return null
    return httpUrl(asset.proxyURL || asset.proxy_url || asset.url)
}

/**
 * Lấy các URL ảnh có thể nhìn thấy trong một Discord message.
 * Attachment được lấy trước, sau đó tới ảnh lớn và thumbnail của từng embed.
 * @param {import('discord.js').Message|Object} message
 * @returns {string[]}
 */
const messageImageUrls = (message) => {
    const urls = []

    for (const attachment of collectionValues(message.attachments)) {
        const url = attachmentImageUrl(attachment)
        if (url) urls.push(url)
    }

    for (const embed of collectionValues(message.embeds)) {
        const imageUrl = embedAssetUrl(embed.image)
        const thumbnailUrl = embedAssetUrl(embed.thumbnail)
        if (imageUrl) urls.push(imageUrl)
        if (thumbnailUrl) urls.push(thumbnailUrl)
    }

    return [...new Set(urls)]
}

/**
 * Dựng các message ngữ cảnh theo định dạng OpenAI Chat Completions.
 * `messages` phải được truyền theo thứ tự cũ -> mới.
 * @param {Array<import('discord.js').Message|Object>} messages
 * @param {string} botUserId
 * @param {number} imageLimit
 * @returns {Array<{role: 'assistant'|'user', content: string|Array}>}
 */
const buildContextMessages = (messages, botUserId, imageLimit = DEFAULT_IMAGE_LIMIT) => {
    const records = messages.map((message, index) => {
        const role = message.author?.id === botUserId ? 'assistant' : 'user'
        return {
            index,
            message,
            role,
            // Chat Completions chỉ nhận image input ở user message.
            images: role === 'user' ? messageImageUrls(message) : []
        }
    })

    // Duyệt mới -> cũ để ưu tiên ảnh gần câu hỏi nhất. Trong cùng một message,
    // giữ thứ tự attachment/embed mà Discord cung cấp.
    const selectedByMessage = new Map()
    const seen = new Set()
    let selectedCount = 0
    const normalizedLimit = Number.isInteger(imageLimit) && imageLimit > 0 ? imageLimit : 0

    for (let i = records.length - 1; i >= 0 && selectedCount < normalizedLimit; i--) {
        const selected = []
        for (const url of records[i].images) {
            if (seen.has(url)) continue
            seen.add(url)
            selected.push(url)
            selectedCount++
            if (selectedCount >= normalizedLimit) break
        }
        if (selected.length > 0) selectedByMessage.set(records[i].index, selected)
    }

    return records.flatMap(({ index, message, role }) => {
        const text = typeof message.content === 'string' ? message.content.trim() : ''
        const images = selectedByMessage.get(index) || []
        if (text === '' && images.length === 0) return []

        const displayName = message.author?.displayName || message.author?.username || 'Người dùng'
        const labelledText = `${displayName}: ${text || '[đã gửi hình ảnh]'}`

        if (images.length === 0) {
            return [{ role, content: labelledText }]
        }

        return [{
            role,
            content: [
                { type: 'text', text: labelledText },
                ...images.map(url => ({ type: 'image_url', image_url: { url } }))
            ]
        }]
    })
}

const hasImageContent = (messages) => messages.some(message =>
    Array.isArray(message.content) && message.content.some(part => part?.type === 'image_url')
)

/**
 * Loại image_url để retry với model chỉ hỗ trợ text.
 * @param {Array} messages
 * @returns {Array}
 */
const stripImageContent = (messages) => messages.map(message => {
    if (!Array.isArray(message.content)) return message
    const text = message.content
        .filter(part => part?.type === 'text' && typeof part.text === 'string')
        .map(part => part.text)
        .join('\n')
    return { ...message, content: text || '[Hình ảnh đã được lược bỏ]' }
})

/**
 * Chỉ fallback khi provider từ chối định dạng vision trước khi có token.
 * @param {Error|Object} error
 * @returns {boolean}
 */
const shouldFallbackToText = (error) => {
    const status = error?.response?.status || error?.status
    const numericApiCode = Number(error?.apiCode)
    if ([401, 403, 429].includes(status) || [401, 403, 429].includes(numericApiCode)) return false

    const apiCode = String(error?.apiCode || '').toLowerCase()
    if (/(?:auth|api[_ -]?key|permission|rate[_ -]?limit|timeout)/.test(apiCode)) return false

    if (error?.emptyAIResponse === true || error?.aiStreamError === true) return true
    return [400, 415, 422].includes(status)
}

module.exports = {
    DEFAULT_IMAGE_LIMIT,
    buildContextMessages,
    hasImageContent,
    messageImageUrls,
    shouldFallbackToText,
    stripImageContent
}
