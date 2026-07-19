const express = require('express')
const stats = require('../repos/stats')
const ranking = require('../repos/ranking')
const dictionary = require('../repos/words')

const startedAt = Date.now()

/**
 * Format milliseconds as human-readable uptime (e.g. "1d 2h 3m 4s").
 * @param {number} ms
 * @returns {string}
 */
function formatUptime(ms) {
    const totalSec = Math.floor(ms / 1000)
    const days = Math.floor(totalSec / 86400)
    const hours = Math.floor((totalSec % 86400) / 3600)
    const minutes = Math.floor((totalSec % 3600) / 60)
    const seconds = totalSec % 60
    const parts = []
    if (days > 0) parts.push(`${days}d`)
    if (hours > 0 || days > 0) parts.push(`${hours}h`)
    if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`)
    parts.push(`${seconds}s`)
    return parts.join(' ')
}

/**
 * Snapshot of public status for HTML + JSON endpoints.
 * @param {import('discord.js').Client} client
 */
function getStatus(client) {
    const ready = !!(client && client.isReady && client.isReady())
    let guildCount = 0
    let botTag = null
    let botAvatar = null

    if (ready) {
        guildCount = client.guilds.cache.size
        botTag = client.user.tag
        botAvatar = client.user.displayAvatarURL({ size: 128 })
    }

    // stats/dictionary may not be loaded yet if bootstrap is still running
    let wordPlayed = 0
    let roundPlayed = 0
    let playerCount = 0
    let dictionaryCount = 0
    try {
        wordPlayed = stats.getWordPlayedCount()
        roundPlayed = stats.getRoundPlayedCount()
        playerCount = ranking.countAllPlayers()
        dictionaryCount = dictionary.countWordInDictionary()
    } catch (_) {
        // ignore while booting
    }

    return {
        status: ready ? 'online' : 'booting',
        ready,
        bot: {
            tag: botTag,
            avatar: botAvatar
        },
        guilds: guildCount,
        uptimeMs: Date.now() - startedAt,
        uptime: formatUptime(Date.now() - startedAt),
        stats: {
            wordPlayed,
            roundPlayed,
            players: playerCount,
            dictionaryWords: dictionaryCount
        },
        timestamp: new Date().toISOString()
    }
}

/**
 * Minimal status HTML page (inline CSS, no template engine).
 * @param {ReturnType<typeof getStatus>} data
 */
function renderStatusPage(data) {
    const statusColor = data.ready ? '#22c55e' : '#f59e0b'
    const statusLabel = data.ready ? 'Online' : 'Booting'
    const botName = data.bot.tag || 'Phở Bò'
    const avatar = data.bot.avatar
        ? `<img class="avatar" src="${data.bot.avatar}" alt="avatar" />`
        : `<div class="avatar placeholder">🍜</div>`

    return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="refresh" content="30" />
  <title>${botName} — Status</title>
  <style>
    :root {
      --bg: #0f1419;
      --card: #1a2332;
      --text: #e7ecf3;
      --muted: #8b9bb4;
      --accent: #f97316;
      --border: #2a3548;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: radial-gradient(1200px 600px at 20% -10%, #1e293b 0%, var(--bg) 55%);
      color: var(--text);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      width: 100%;
      max-width: 440px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 28px 24px;
      box-shadow: 0 20px 50px rgba(0,0,0,.35);
    }
    .header {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 20px;
    }
    .avatar {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      object-fit: cover;
      border: 2px solid var(--border);
    }
    .avatar.placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      background: #243044;
    }
    h1 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 700;
    }
    .sub {
      margin: 4px 0 0;
      color: var(--muted);
      font-size: 0.85rem;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      border-radius: 999px;
      background: rgba(255,255,255,.04);
      border: 1px solid var(--border);
      font-size: 0.9rem;
      margin-bottom: 18px;
    }
    .dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: ${statusColor};
      box-shadow: 0 0 10px ${statusColor};
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .stat {
      background: rgba(0,0,0,.18);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px;
    }
    .stat .label {
      color: var(--muted);
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: .04em;
      margin-bottom: 4px;
    }
    .stat .value {
      font-size: 1.15rem;
      font-weight: 600;
      word-break: break-all;
    }
    .footer {
      margin-top: 18px;
      color: var(--muted);
      font-size: 0.75rem;
      text-align: center;
    }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <main class="card">
    <div class="header">
      ${avatar}
      <div>
        <h1>${escapeHtml(botName)}</h1>
        <p class="sub">Bot nối từ tiếng Việt</p>
      </div>
    </div>
    <div class="badge"><span class="dot"></span> ${statusLabel}</div>
    <div class="grid">
      <div class="stat"><div class="label">Servers</div><div class="value">${data.guilds}</div></div>
      <div class="stat"><div class="label">Uptime</div><div class="value">${escapeHtml(data.uptime)}</div></div>
      <div class="stat"><div class="label">Từ đã nối</div><div class="value">${data.stats.wordPlayed}</div></div>
      <div class="stat"><div class="label">Vòng chơi</div><div class="value">${data.stats.roundPlayed}</div></div>
      <div class="stat"><div class="label">Người chơi</div><div class="value">${data.stats.players}</div></div>
      <div class="stat"><div class="label">Ngân hàng từ</div><div class="value">${data.stats.dictionaryWords}</div></div>
    </div>
    <p class="footer">
      <a href="/health">/health</a> · <a href="/api/status">/api/status</a><br />
      Auto-refresh 30s · ${escapeHtml(data.timestamp)}
    </p>
  </main>
</body>
</html>`
}

/**
 * @param {string} s
 */
function escapeHtml(s) {
    // Use \x26 so HTML entity strings are not mangled by tooling that unescapes &...;
    return String(s)
        .replace(/&/g, '\x26amp;')
        .replace(/</g, '\x26lt;')
        .replace(/>/g, '\x26gt;')
        .replace(/"/g, '\x26quot;')
}

/**
 * Start Express web server for Render health checks + simple status UI.
 * Call from events/ready.js after slash commands are synchronized.
 *
 * @param {import('discord.js').Client} client
 * @returns {import('http').Server}
 */


function startWebServer(client) {
    const app = express()
    const port = Number(process.env.PORT) || 3000

    app.get('/health', (_req, res) => {
        res.status(200).json({ status: 'ok' })
    })

    app.get('/api/status', (_req, res) => {
        res.json(getStatus(client))
    })

    app.get('/', (_req, res) => {
        res.type('html').send(renderStatusPage(getStatus(client)))
    })

    const server = app.listen(port, '0.0.0.0', () => {
        console.log(`[OK] Web server listening on 0.0.0.0:${port}`)
    })

    server.on('error', (err) => {
        console.error('[ERROR] Web server:', err.message)
    })

    return server
}

module.exports = { startWebServer }
