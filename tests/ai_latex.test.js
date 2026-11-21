const { test } = require('node:test')
const assert = require('node:assert/strict')
const sharp = require('sharp')
const { createLatexPreview, extractFormulas } = require('../modules/ai_latex')

test('extracts all supported delimiters and math fences in order, without duplicate formulas', () => {
    const text = String.raw`Inline $x^2$ and \(y^2\).
$$\frac{a}{b}$$
\[\sum_{i=1}^n i\]
` + '\n```latex\na+b=c\n```\n~~~math\nx+y\n~~~\n' + '$x^2$'
    assert.deepEqual(extractFormulas(text), [
        { tex: 'x^2', display: false },
        { tex: 'y^2', display: false },
        { tex: '\\frac{a}{b}', display: true },
        { tex: '\\sum_{i=1}^n i', display: true },
        { tex: 'a+b=c', display: true },
        { tex: 'x+y', display: true }
    ])
})

test('ignores ordinary code, escaped dollars, prices and unfinished math', () => {
    const text = '`$code$`\n```js\nconst a = "$notMath$"\n```\n'
        + String.raw`Giá \$5 hoặc $10 và $20. Công thức chưa xong: \[x^2`
    assert.deepEqual(extractFormulas(text), [])
    assert.deepEqual(extractFormulas('$$unfinished'), [])
    assert.deepEqual(extractFormulas(String.raw`$x+\$y$`), [{ tex: 'x+\\$y', display: false }])
})

test('renders fractions, matrices and Vietnamese text into a bounded PNG', async () => {
    const preview = await createLatexPreview(String.raw`$$\frac{-b\pm\sqrt{b^2-4ac}}{2a}$$
\[\begin{pmatrix}1&2\\3&4\end{pmatrix}\]
$$\text{Diện tích}=\pi r^2$$`)
    assert.equal(preview.rendered, 3)
    assert.equal(preview.skipped, 0)
    const metadata = await sharp(preview.image).metadata()
    assert.equal(metadata.format, 'png')
    assert.ok(metadata.width <= 1400)
    assert.ok(metadata.height <= 3912)
    const { channels } = await sharp(preview.image).stats()
    assert.ok(channels.some(channel => channel.min < 128), 'image contains visible formula pixels')
})

test('bad or oversized formulas do not prevent valid formulas from rendering', async () => {
    const preview = await createLatexPreview('$\\notARealCommand{x}$ $' + 'x'.repeat(2001) + '$ $x^2$')
    assert.equal(preview.rendered, 1)
    assert.equal(preview.skipped, 2)
    assert.ok(preview.image)
    const invalid = await createLatexPreview('$\\frac{$')
    assert.deepEqual(invalid, { image: null, rendered: 0, skipped: 1 })
})

test('limits previews to twelve unique formulas and isolates macros between formulas and requests', async () => {
    const many = await createLatexPreview(Array.from({ length: 14 }, (_, i) => `$x_{${i}}$`).join(' '))
    assert.equal(many.rendered, 12)
    assert.equal(many.skipped, 2)
    const macros = await createLatexPreview(String.raw`$\newcommand{\myvar}{x}\myvar$ $\myvar$`)
    assert.equal(macros.rendered, 1)
    assert.equal(macros.skipped, 1)
    const next = await createLatexPreview(String.raw`$\myvar$`)
    assert.equal(next.skipped, 1)
})

test('plain text needs no preview', async () => {
    assert.deepEqual(await createLatexPreview('Xin chào!'), { image: null, rendered: 0, skipped: 0 })
})
