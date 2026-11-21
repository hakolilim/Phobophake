const { test } = require('node:test')
const assert = require('node:assert/strict')
const { Readable } = require('node:stream')
const { MessageFlags } = require('discord.js')
const axios = require('axios')

const loadAI = (previewModule) => {
    const commandPath = require.resolve('../commands/ai')
    const previewPath = require.resolve('../modules/ai_latex')
    const saved = new Map([commandPath, previewPath].map(path => [path, require.cache[path]]))
    const env = { AI_BASE_URL: 'http://localhost/v1', AI_API_KEY: 'test', AI_MODEL: 'test' }
    const savedEnv = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]))
    try {
        Object.assign(process.env, env)
        delete require.cache[commandPath]
        if (previewModule) require.cache[previewPath] = { exports: previewModule }
        return require(commandPath)
    } finally {
        for (const [path, entry] of saved) {
            if (entry) require.cache[path] = entry
            else delete require.cache[path]
        }
        for (const [key, value] of Object.entries(savedEnv)) {
            if (value === undefined) delete process.env[key]
            else process.env[key] = value
        }
    }
}

const createDiscord = (visible = true) => {
    const edits = [], followUps = [], deferred = []
    const interaction = {
        id: 'interaction',
        options: {
            getString: name => name === 'message' ? 'Giải thích công thức' : null,
            getBoolean: () => visible
        },
        channel: { messages: { fetch: async () => new Map() } },
        deferReply: async payload => deferred.push(payload),
        editReply: async payload => edits.push(payload),
        followUp: async payload => followUps.push(payload)
    }
    return { interaction, client: { user: { id: 'bot' } }, edits, followUps, deferred }
}

test('private long AI answer keeps all original text and sends a private attached preview afterwards', async (t) => {
    const text = 'a'.repeat(1050) + String.raw` $$\frac{x}{2}$$`
    t.mock.method(axios, 'post', async () => ({ data: { choices: [{ message: { content: text } }] } }))
    const discord = createDiscord(false)
    await loadAI().execute(discord.interaction, discord.client)
    assert.equal(discord.deferred[0].flags, MessageFlags.Ephemeral)
    const first = discord.edits.at(-1).embeds[0].toJSON()
    assert.equal(first.fields[0].name, 'Bạn hỏi')
    const textParts = [first.fields.at(-1).value]
    for (const message of discord.followUps) {
        assert.equal(message.flags, MessageFlags.Ephemeral)
        if (!message.files) textParts.push(message.embeds[0].toJSON().fields[0].value)
    }
    assert.equal(textParts.join(''), text)
    assert.ok(textParts.every(part => part.length <= 1024))
    const preview = discord.followUps.at(-1)
    assert.equal(preview.files[0].name, 'ai-latex.png')
    assert.ok(Buffer.isBuffer(preview.files[0].attachment))
    assert.equal(preview.embeds[0].toJSON().image.url, 'attachment://ai-latex.png')
})

test('public plain text answer does not send an extra message', async (t) => {
    t.mock.method(axios, 'post', async () => ({ data: { choices: [{ message: { content: 'Xin chào!' } }] } }))
    const discord = createDiscord()
    await loadAI().execute(discord.interaction, discord.client)
    assert.equal(discord.followUps.length, 0)
    assert.equal(discord.edits.at(-1).embeds[0].toJSON().fields.at(-1).value, 'Xin chào!')
})

test('interrupted SSE retains partial text and warning, then previews complete formulas only', async (t) => {
    t.mock.method(console, 'error', () => {})
    const text = String.raw`Kết quả $x^2$. Chưa xong: \[y`
    const data = Readable.from([
        `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
        `data: ${JSON.stringify({ error: { message: 'stream interrupted' } })}\n\n`
    ])
    t.mock.method(axios, 'post', async () => ({ data }))
    const discord = createDiscord()
    await loadAI().execute(discord.interaction, discord.client)
    assert.match(discord.edits.at(-1).content, /stream interrupted/)
    assert.equal(discord.edits.at(-1).embeds[0].toJSON().fields.at(-1).value, text)
    assert.equal(discord.followUps.length, 1)
    assert.equal(discord.followUps[0].flags, undefined)
    assert.match(discord.followUps[0].embeds[0].toJSON().footer.text, /1 công thức/)
})

test('preview failure leaves original answer visible and reports the problem privately', async (t) => {
    t.mock.method(console, 'error', () => {})
    t.mock.method(axios, 'post', async () => ({ data: { choices: [{ message: { content: '$x$' } }] } }))
    const discord = createDiscord(false)
    const command = loadAI({ createLatexPreview: async () => { throw new Error('renderer failed') } })
    await command.execute(discord.interaction, discord.client)
    assert.equal(discord.edits.at(-1).embeds[0].toJSON().fields.at(-1).value, '$x$')
    assert.match(discord.followUps[0].content, /Không thể tạo preview LaTeX/)
    assert.equal(discord.followUps[0].flags, MessageFlags.Ephemeral)
})

test('unrenderable math reports skipped formulas without attaching a broken image', async (t) => {
    t.mock.method(axios, 'post', async () => ({ data: { choices: [{ message: { content: '$\\invalidCommand$' } }] } }))
    const discord = createDiscord()
    await loadAI().execute(discord.interaction, discord.client)
    assert.equal(discord.followUps.length, 1)
    assert.match(discord.followUps[0].content, /1 công thức không được preview/)
    assert.equal(discord.followUps[0].files, undefined)
})
