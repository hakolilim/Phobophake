const fs = require('node:fs')
const path = require('node:path')

const documentRoutes = {
    'PRIVACY_POLICY.md': '/privacy-policy',
    'TERMS_OF_SERVICE.md': '/terms-of-service'
}

const escapeHtml = text => String(text).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character])

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

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="${escapeHtml(description)}" />
  <title>${escapeHtml(title)} — OrenjiNeko</title>
  <style>
    :root { color-scheme: dark; --bg: #0f1419; --card: #1a2332; --text: #e7ecf3; --muted: #adbbce; --accent: #fb923c; --border: #2a3548; }
    * { box-sizing: border-box; }
    html { scroll-padding-top: 1.5rem; }
    body { margin: 0; background: var(--bg); color: var(--text); font: 1rem/1.8 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
    a { color: var(--accent); text-underline-offset: .2em; overflow-wrap: anywhere; }
    a:hover { text-decoration-thickness: 2px; }
    a:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; border-radius: 2px; }
    .skip-link { position: absolute; top: -10rem; left: 1rem; padding: .5rem 1rem; background: var(--card); }
    .skip-link:focus { top: 1rem; }
    .site-header { border-bottom: 1px solid var(--border); }
    .header-inner, .layout, .site-footer { width: min(100% - 3rem, 1160px); margin: auto; }
    .header-inner { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem; padding: 1.25rem 0; }
    .brand { color: var(--text); font-size: 1.25rem; font-weight: 750; text-decoration: none; }
    .brand span { color: var(--accent); }
    .site-nav { display: flex; flex-wrap: wrap; gap: .5rem 1.5rem; font-size: .9375rem; }
    .site-nav a[aria-current="page"] { color: var(--text); text-decoration-thickness: 2px; }
    .layout { display: grid; grid-template-columns: 230px minmax(0, 1fr); gap: 3rem; align-items: start; padding: 3rem 0; }
    aside { position: sticky; top: 1.5rem; }
    aside h2 { margin: 0 0 .75rem; font-size: 1rem; }
    .toc { margin: 0; padding: 0; list-style: none; }
    .toc li { margin: .6rem 0; line-height: 1.5; }
    .toc a { color: var(--muted); font-size: .9375rem; text-decoration: none; }
    .toc a:hover { color: var(--accent); text-decoration: underline; }
    article { min-width: 0; background: var(--card); padding: clamp(1.25rem, 4vw, 3rem); border: 1px solid var(--border); border-radius: 16px; overflow-wrap: anywhere; }
    h1 { margin: 0 0 1rem; font-size: clamp(1.75rem, 4vw, 2.5rem); line-height: 1.25; letter-spacing: -.025em; }
    article > p:first-of-type { color: var(--muted); font-size: .9375rem; }
    article h2 { margin: 2.5rem 0 1rem; font-size: 1.35rem; line-height: 1.4; }
    article p { margin: 1rem 0; }
    article ul { padding-left: 1.4rem; }
    article li { margin: .8rem 0; }
    code { padding: .1rem .35rem; border-radius: 4px; background: #0f1419; color: #fdba74; font-size: .9375em; }
    .site-footer { padding: 1.5rem 0 2.5rem; border-top: 1px solid var(--border); color: var(--muted); font-size: .9375rem; }
    .site-footer p { margin: .5rem 0; }
    @media (max-width: 800px) {
      .layout { grid-template-columns: minmax(0, 1fr); gap: 1.5rem; padding-top: 1.5rem; }
      aside { position: static; padding: 1.25rem; border: 1px solid var(--border); border-radius: 12px; }
      .toc { columns: 2; column-gap: 1.5rem; }
      .toc li { break-inside: avoid; }
    }
    @media (max-width: 480px) {
      .header-inner, .layout, .site-footer { width: calc(100% - 2rem); }
      .toc { columns: 1; }
    }
  </style>
</head>
<body>
  <a class="skip-link" href="#content">Skip to main content</a>
  <header class="site-header">
    <div class="header-inner">
      <a class="brand" href="/">Orenji<span>Neko</span></a>
      <nav class="site-nav" aria-label="Main navigation">
        <a href="/">Bot Status</a>
        <a href="/privacy-policy"${filename === 'PRIVACY_POLICY.md' ? ' aria-current="page"' : ''}>Privacy Policy</a>
        <a href="/terms-of-service"${filename === 'TERMS_OF_SERVICE.md' ? ' aria-current="page"' : ''}>Terms of Service</a>
      </nav>
    </div>
  </header>
  <div class="layout">
    <aside aria-label="Table of contents">
      <h2>On this page</h2>
      <nav aria-label="Document sections">
        <ul class="toc">${sections.map(section => `<li><a href="#${section.id}">${escapeHtml(section.label)}</a></li>`).join('')}</ul>
      </nav>
    </aside>
    <main id="content" tabindex="-1"><article>${body}</article></main>
  </div>
  <footer class="site-footer">
    <p>OrenjiNeko · Word-chain games, counting games, and AI chat.</p>
    <p>Contact hakolilim through the <a href="https://discord.gg/NC7Ks2c5wE">Support Discord Server</a> · <a href="https://github.com/hakolilim/Phobophake">GitHub</a></p>
  </footer>
</body>
</html>`
}

// Build once at startup from the same Markdown documents shown on GitHub.
const legalPages = new Map([
    ['/privacy-policy', renderLegalPage('PRIVACY_POLICY.md', 'Privacy Policy',
        'How OrenjiNeko processes game data, AI context, and requests to delete your data.')],
    ['/terms-of-service', renderLegalPage('TERMS_OF_SERVICE.md', 'Terms of Service',
        'Terms for using OrenjiNeko, user responsibilities, and how to contact support.')]
])

module.exports = { legalPages }
