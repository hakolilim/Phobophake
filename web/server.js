const express = require('express')
const stats = require('../repos/stats')
const ranking = require('../repos/ranking')
const dictionary = require('../repos/words')
const { legalPages } = require('./legal')
const { escapeHtml, renderPage } = require('./layout')
const { renderSuggestPage } = require('./suggest')

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

const statusRefreshSeconds = 30
const statusNumberFormat = new Intl.NumberFormat('vi-VN')
const statusDateFormat = new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'UTC'
})

/**
 * @param {ReturnType<typeof getStatus>} data
 */
function renderStatusPage(data) {
    const botName = data.bot.tag || 'OrenjiNeko'
    const avatar = data.bot.avatar
        ? `<img class="status-avatar" src="${escapeHtml(data.bot.avatar)}" width="56" height="56" alt="" />`
        : '<span class="status-avatar" aria-hidden="true">🍊</span>'
    const statusLabel = data.ready ? 'Đang hoạt động' : 'Đang khởi động'
    const updatedAt = statusDateFormat.format(new Date(data.timestamp))
    const metrics = [
        ['Máy chủ Discord', statusNumberFormat.format(data.guilds)],
        ['Thời gian hoạt động', data.uptime],
        ['Người chơi', statusNumberFormat.format(data.stats.players)],
        ['Từ đã nối', statusNumberFormat.format(data.stats.wordPlayed)],
        ['Ván đã chơi', statusNumberFormat.format(data.stats.roundPlayed)],
        ['Từ trong từ điển', statusNumberFormat.format(data.stats.dictionaryWords)]
    ]

    return renderPage({
        lang: 'vi',
        route: '/',
        title: 'Trạng thái bot',
        description: 'Trạng thái kết nối Discord và thống kê trò chơi nối từ của OrenjiNeko.',
        refreshSeconds: statusRefreshSeconds,
        styles: `
    .status-header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid var(--border);
    }
    .status-identity { display: flex; align-items: center; gap: .875rem; min-width: 0; }
    .status-avatar {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 3.5rem;
      height: 3.5rem;
      border: 1px solid var(--border);
      border-radius: 50%;
      background: var(--bg);
      object-fit: cover;
      font-size: 1.5rem;
    }
    .status-name, .status-description { margin: 0; line-height: 1.5; }
    .status-name { font-weight: 700; }
    .status-description { color: var(--muted); font-size: .9375rem; }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: .5rem;
      padding: .25rem .875rem;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--bg);
      color: #86efac;
      font-size: .875rem;
      font-weight: 650;
    }
    .status-badge.is-booting { color: #fcd34d; }
    .status-badge::before { content: ""; flex: 0 0 .5rem; height: .5rem; border-radius: 50%; background: currentColor; }
    .status-metrics {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: .75rem;
      margin: 1.5rem 0 0;
    }
    .status-metric {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: .75rem 1rem;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--bg);
    }
    .status-metric dt { color: var(--muted); font-size: .9375rem; line-height: 1.4; }
    .status-metric dd { margin: .375rem 0 0; font-size: 1.375rem; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.3; }
    .status-meta { display: flex; flex-wrap: wrap; gap: .25rem 1.25rem; margin: 1.25rem 0 0; color: var(--muted); font-size: .8125rem; }
    @media (max-width: 960px) {
      .status-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 480px) {
      .status-metric { padding: .75rem; }
      .status-metric dd { font-size: clamp(1rem, 4.6vw, 1.375rem); }
    }`,
        content: `<section class="panel" aria-labelledby="status-title">
      <h1 id="status-title">Trạng thái bot</h1>
      <div class="status-header">
        <div class="status-identity">
          ${avatar}
          <div>
            <p class="status-name">${escapeHtml(botName)}</p>
            <p class="status-description">Bot nối từ tiếng Việt</p>
          </div>
        </div>
        <span class="status-badge${data.ready ? '' : ' is-booting'}">${statusLabel}</span>
      </div>
      <dl class="status-metrics">
        ${metrics.map(([label, value]) => `<div class="status-metric">
          <dt>${label}</dt>
          <dd>${escapeHtml(value)}</dd>
        </div>`).join('\n        ')}
      </dl>
      <p class="status-meta">
        <span>Cập nhật lúc <time datetime="${escapeHtml(data.timestamp)}">${escapeHtml(updatedAt)} UTC</time></span>
        <span>Tự làm mới mỗi ${statusRefreshSeconds} giây</span>
      </p>
    </section>`
    })
}

function createWebApp(client) {
    const app = express()

    for (const [route, html] of legalPages) {
        app.get(route, (_req, res) => {
            res.type('html').send(html)
        })
    }

    app.get('/health', (_req, res) => {
        res.status(200).json({ status: 'ok' })
    })

    app.get('/api/status', (_req, res) => {
        res.json(getStatus(client))
    })

    app.get('/api/suggest', (req, res) => {
        const word = (req.query.word || '').trim().toLowerCase()
        if (!word) {
            return res.status(400).json({ error: 'Missing word parameter' })
        }
        const suggestions = dictionary.findNextWords(word)
        res.json({ word, suggestions })
    })

    app.get('/', (_req, res) => {
        res.type('html').send(renderStatusPage(getStatus(client)))
    })

    app.get('/suggest', (_req, res) => {
        res.type('html').send(renderSuggestPage())
    })

    return app
}

/**
 * Start the public web pages and health checks after Discord commands are synced.
 * @param {import('discord.js').Client} client
 * @returns {import('http').Server}
 */
function startWebServer(client) {
    const app = createWebApp(client)
    const port = Number(process.env.PORT) || 3000
    const server = app.listen(port, '0.0.0.0', () => {
        console.log(`[OK] Web server listening on 0.0.0.0:${port}`)
    })

    server.on('error', (err) => {
        console.error('[ERROR] Web server:', err.message)
    })

    return server
}

module.exports = { createWebApp, startWebServer }
