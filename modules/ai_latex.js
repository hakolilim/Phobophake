// Render tại chỗ: nội dung công thức không được gửi tới dịch vụ ảnh bên ngoài.
const MAX_FORMULAS = 12
const MAX_FORMULA_LENGTH = 2000
const MAX_WIDTH = 1400
const PADDING = 24
let registeredAdaptor = null

const escapedAt = (text, index) => {
    let backslashes = 0
    while (index > 0 && text[--index] === '\\') backslashes++
    return backslashes % 2 === 1
}

/** Nhận diện công thức hoàn chỉnh, bỏ qua inline code và code block thông thường. */
const extractFormulas = (text) => {
    const formulas = []
    const seen = new Set()
    const add = (source, display) => {
        const tex = source.trim()
        if (tex && !seen.has(tex)) {
            seen.add(tex)
            formulas.push({ tex, display })
        }
    }

    for (let i = 0; i < text.length;) {
        if (escapedAt(text, i)) { i++; continue }

        // Fenced latex/math được preview; các ngôn ngữ khác chỉ là mã nguồn.
        const fence = /^(?:`{3,}|~{3,})/.exec(text.slice(i))?.[0]
        if (fence) {
            const lineEnd = text.indexOf('\n', i + fence.length)
            const close = lineEnd < 0 ? -1 : text.indexOf(fence, lineEnd + 1)
            if (close < 0) break
            const language = text.slice(i + fence.length, lineEnd).trim().toLowerCase()
            if (language === 'latex' || language === 'math') add(text.slice(lineEnd + 1, close), true)
            i = close + fence.length
            continue
        }
        if (text[i] === '`') {
            const ticks = /^`+/.exec(text.slice(i))[0]
            const close = text.indexOf(ticks, i + ticks.length)
            i = close < 0 ? text.length : close + ticks.length
            continue
        }

        const open = ['$$', '\\[', '\\(', '$'].find(delimiter => text.startsWith(delimiter, i))
        if (!open) { i++; continue }
        const end = i + open.length
        const closing = open === '\\[' ? '\\]' : open === '\\(' ? '\\)' : open
        let close = text.indexOf(closing, end)
        while (close >= 0 && escapedAt(text, close)) close = text.indexOf(closing, close + closing.length)
        if (close < 0) { i = end; continue }

        // Không nhầm giá tiền "$5 và $10" thành công thức inline.
        if (open === '$' && (/\s/.test(text[end] || '') || /\s/.test(text[close - 1] || '') || text.slice(end, close).includes('\n'))) {
            i = end
            continue
        }
        add(text.slice(end, close), open === '$$' || open === '\\[')
        i = close + closing.length
    }
    return formulas
}

/**
 * Gom các công thức thành một PNG nền trắng, giữ nguyên câu trả lời gốc trên Discord.
 * Không render delimiter chưa đóng khi stream bị ngắt. Lỗi một công thức không bỏ các công thức còn lại.
 * @returns {Promise<{image: Buffer|null, rendered: number, skipped: number}>}
 */
const createLatexPreview = async (text) => {
    const formulas = extractFormulas(text)
    if (formulas.length === 0) return { image: null, rendered: 0, skipped: 0 }

    // Lazy load để các câu trả lời không có toán không phải khởi tạo renderer.
    const { mathjax } = require('@mathjax/src/js/mathjax.js')
    const { TeX } = require('@mathjax/src/js/input/tex.js')
    const { SVG } = require('@mathjax/src/js/output/svg.js')
    const { MathJaxTexFont } = require('@mathjax/mathjax-tex-font/js/svg.js')
    const { liteAdaptor } = require('@mathjax/src/js/adaptors/liteAdaptor.js')
    const { RegisterHTMLHandler } = require('@mathjax/src/js/handlers/html.js')
    require('@mathjax/src/js/input/tex/ams/AmsConfiguration.js')
    require('@mathjax/src/js/input/tex/newcommand/NewcommandConfiguration.js')
    const sharp = require('sharp')
    if (!registeredAdaptor) {
        // Font bổ sung (nếu cần) cũng chỉ được nạp từ các package đã cài tại bot.
        mathjax.asyncLoad = name => Promise.resolve().then(() => require(name))
        registeredAdaptor = liteAdaptor()
        RegisterHTMLHandler(registeredAdaptor)
    }
    const adaptor = registeredAdaptor

    const rows = []
    let skipped = Math.max(0, formulas.length - MAX_FORMULAS)
    let height = PADDING
    let width = 320
    for (const { tex, display } of formulas.slice(0, MAX_FORMULAS)) {
        if (tex.length > MAX_FORMULA_LENGTH) { skipped++; continue }
        try {
            // Document riêng cho mỗi công thức để macro/nhãn không rò sang công thức hoặc lượt khác.
            const document = mathjax.document('', {
                InputJax: new TeX({
                    packages: ['base', 'ams', 'newcommand'],
                    maxMacros: 1000,
                    maxBuffer: 4096,
                    formatError: (_jax, error) => { throw error }
                }),
                OutputJax: new SVG({ fontCache: 'none', fontData: MathJaxTexFont })
            })
            const node = await document.convertPromise(tex, { display })
            const svg = adaptor.firstChild(node)
            const viewBox = adaptor.getAttribute(svg, 'viewBox')
            const [, , boxWidth, boxHeight] = viewBox.split(/\s+/).map(Number)
            if (![boxWidth, boxHeight].every(value => Number.isFinite(value) && value > 0)) throw new Error('Empty formula')
            const scale = Math.min(26 / 1000, (MAX_WIDTH - 2 * PADDING - 40) / boxWidth, 300 / boxHeight)
            const rowWidth = Math.ceil(boxWidth * scale)
            const rowHeight = Math.max(36, Math.ceil(boxHeight * scale))
            const paths = adaptor.innerHTML(svg)
            if (paths.length > 1000000) throw new Error('Formula too large')
            rows.push(`<text x="${PADDING}" y="${height + 24}" font-family="sans-serif" font-size="16" fill="#666">${rows.length + 1}.</text><svg x="${PADDING + 40}" y="${height}" width="${rowWidth}" height="${rowHeight}" viewBox="${viewBox}" color="#111">${paths}</svg>`)
            height += rowHeight + PADDING
            width = Math.max(width, rowWidth + 2 * PADDING + 40)
        } catch {
            skipped++
        }
    }
    if (rows.length === 0) return { image: null, rendered: 0, skipped }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="white"/>${rows.join('')}</svg>`
    const image = await sharp(Buffer.from(svg), { limitInputPixels: 8000000 }).png().toBuffer()
    return { image, rendered: rows.length, skipped }
}

module.exports = { createLatexPreview, extractFormulas }
