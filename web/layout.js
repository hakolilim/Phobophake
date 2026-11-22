const escapeHtml = text => String(text).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character])

const navigation = [
    ['/', 'Bot Status'],
    ['/suggest', 'Gợi ý từ nối tiếp', 'vi'],
    ['/privacy-policy', 'Privacy Policy'],
    ['/terms-of-service', 'Terms of Service']
]

function renderPage({ lang = 'en', route, title, description, sidebar, content, styles, refreshSeconds }) {
    const english = lang === 'en' ? '' : ' lang="en"'
    const skipLabel = lang === 'vi' ? 'Đến nội dung chính' : 'Skip to main content'

    return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="${escapeHtml(description)}" />
  ${refreshSeconds ? `<meta http-equiv="refresh" content="${refreshSeconds}" />` : ''}
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
    .layout--single { grid-template-columns: minmax(0, 55rem); justify-content: center; }
    aside { position: sticky; top: 1.5rem; }
    aside h2 { margin: 0 0 .75rem; font-size: 1rem; }
    .sidebar-links { margin: 0; padding: 0; list-style: none; }
    .sidebar-links li { margin: .6rem 0; line-height: 1.5; }
    .sidebar-links a { color: var(--muted); font-size: .9375rem; text-decoration: none; }
    .sidebar-links a:hover { color: var(--accent); text-decoration: underline; }
    .panel { min-width: 0; background: var(--card); padding: clamp(1.25rem, 4vw, 3rem); border: 1px solid var(--border); border-radius: 16px; overflow-wrap: anywhere; }
    h1 { margin: 0 0 1rem; font-size: clamp(1.75rem, 4vw, 2.5rem); line-height: 1.25; letter-spacing: -.025em; }
    .site-footer { padding: 1.5rem 0 2.5rem; border-top: 1px solid var(--border); color: var(--muted); font-size: .9375rem; }
    .site-footer p { margin: .5rem 0; }
    @media (max-width: 800px) {
      .layout { grid-template-columns: minmax(0, 1fr); gap: 1.5rem; padding-top: 1.5rem; }
      aside { position: static; padding: 1.25rem; border: 1px solid var(--border); border-radius: 12px; }
      .sidebar-links { columns: 2; column-gap: 1.5rem; }
      .sidebar-links li { break-inside: avoid; }
    }
    @media (max-width: 480px) {
      .header-inner, .layout, .site-footer { width: calc(100% - 2rem); }
      .sidebar-links { columns: 1; }
    }
${styles}
  </style>
</head>
<body>
  <a class="skip-link" href="#content">${skipLabel}</a>
  <header class="site-header">
    <div class="header-inner">
      <a class="brand" href="/">Orenji<span>Neko</span></a>
      <nav class="site-nav"${english} aria-label="Main navigation">
        ${navigation.map(([href, label, language]) => `<a href="${href}"${language ? ` lang="${language}"` : ''}${route === href ? ' aria-current="page"' : ''}>${label}</a>`).join('\n        ')}
      </nav>
    </div>
  </header>
  <div class="layout${sidebar ? '' : ' layout--single'}">
    ${sidebar || ''}
    <main id="content" tabindex="-1">${content}</main>
  </div>
  <footer class="site-footer"${english}>
    <p>OrenjiNeko · Word-chain games, counting games, and AI chat.</p>
    <p>Contact hakolilim through the <a href="https://discord.gg/NC7Ks2c5wE">Support Discord Server</a> · <a href="https://github.com/hakolilim/Phobophake">GitHub</a></p>
  </footer>
</body>
</html>`
}

module.exports = { escapeHtml, renderPage }
