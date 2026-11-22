const fs = require('node:fs')
const path = require('node:path')
const { escapeHtml, renderPage } = require('./layout')

const documentRoutes = {
    'PRIVACY_POLICY.md': '/privacy-policy',
    'TERMS_OF_SERVICE.md': '/terms-of-service'
}

// Only the Markdown features used by the two bundled documents are supported.
// Escape source text and allow only HTTPS or known document links; never render raw HTML.
function inlineMarkdown(text) {
    return text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).map(part => {
        if (part.startsWith('`')) return `<code>${escapeHtml(part.slice(1, -1))}</code>`
        if (part.startsWith('**')) return `<strong>${escapeHtml(part.slice(2, -2))}</strong>`
        const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
        if (link) {
            const href = documentRoutes[link[2]] || link[2]
            if (Object.values(documentRoutes).includes(href) || /^https:\/\//i.test(href)) {
                return `<a href="${escapeHtml(href)}">${escapeHtml(link[1])}</a>`
            }
        }
        return escapeHtml(part)
    }).join('')
}

function renderLegalPage(filename, title, description) {
    const markdown = fs.readFileSync(path.join(__dirname, '..', filename), 'utf8')
    const sections = []
    const body = markdown.trim().split(/\r?\n\s*\r?\n/).map(block => {
        if (block.startsWith('# ')) return `<h1>${inlineMarkdown(block.slice(2))}</h1>`
        if (block.startsWith('## ')) {
            const label = block.slice(3)
            const id = `section-${sections.length + 1}`
            sections.push({ id, label })
            return `<h2 id="${id}">${inlineMarkdown(label)}</h2>`
        }
        if (block.startsWith('- ')) {
            return `<ul>${block.split(/\r?\n/).map(line => `<li>${inlineMarkdown(line.slice(2))}</li>`).join('')}</ul>`
        }
        return `<p>${inlineMarkdown(block.replace(/\r?\n/g, ' '))}</p>`
    }).join('\n')

    return renderPage({
        route: documentRoutes[filename],
        title,
        description,
        styles: `
    article > p:first-of-type { color: var(--muted); font-size: .9375rem; }
    article h2 { margin: 2.5rem 0 1rem; font-size: 1.35rem; line-height: 1.4; }
    article p { margin: 1rem 0; }
    article ul { padding-left: 1.4rem; }
    article li { margin: .8rem 0; }
    code { padding: .1rem .35rem; border-radius: 4px; background: var(--bg); color: #fdba74; font-size: .9375em; }`,
        sidebar: `<aside aria-label="Table of contents">
      <h2>On this page</h2>
      <nav aria-label="Document sections">
        <ul class="sidebar-links">${sections.map(section => `<li><a href="#${section.id}">${escapeHtml(section.label)}</a></li>`).join('')}</ul>
      </nav>
    </aside>`,
        content: `<article class="panel">${body}</article>`
    })
}

// Build once at startup from the same Markdown documents shown on GitHub.
const legalPages = new Map([
    ['/privacy-policy', renderLegalPage('PRIVACY_POLICY.md', 'Privacy Policy',
        'How OrenjiNeko processes game data, AI context, and requests to delete your data.')],
    ['/terms-of-service', renderLegalPage('TERMS_OF_SERVICE.md', 'Terms of Service',
        'Terms for using OrenjiNeko, user responsibilities, and how to contact support.')]
])

module.exports = { legalPages }
