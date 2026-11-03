const { test } = require('node:test')
const assert = require('node:assert/strict')
const { MessageFlags, PermissionsBitField } = require('discord.js')

const loadWithStubs = (path, stubs) => {
    const saved = new Map()
    const replace = (id, value) => {
        const resolved = require.resolve(id)
        saved.set(resolved, require.cache[resolved])
        if (value) require.cache[resolved] = { id: resolved, loaded: true, exports: value }
        else delete require.cache[resolved]
    }
    replace(path, null)
    for (const [id, value] of Object.entries(stubs)) replace(id, value)
    try {
        return require(path)
    } finally {
        for (const [id, value] of saved) {
            if (value) require.cache[id] = value
            else delete require.cache[id]
        }
    }
}

const createRepo = (initialRows = []) => {
    const rows = new Map(initialRows.map(row => [row.channel_id, { ...row }]))
    const db = { failWrite: false, failDelete: false, failRead: false, writes: [], pages: [] }
    const supabase = {
        from(table) {
            assert.equal(table, 'counting_channels')
            return {
                select() { return this },
                order() { return this },
                async range(from, to) {
                    db.pages.push([from, to])
                    return db.failRead
                        ? { error: { message: 'read failed' } }
                        : { data: [...rows.values()].slice(from, to + 1) }
                },
                async upsert(row) {
                    // Yield so overlapping message handlers exercise the channel queue.
                    await new Promise(resolve => setImmediate(resolve))
                    if (db.failWrite) return { error: { message: 'write failed' } }
                    rows.set(row.channel_id, { ...row })
                    db.writes.push({ ...row })
                    return { error: null }
                },
                delete() { return this },
                async eq(key, channelId) {
                    assert.equal(key, 'channel_id')
                    if (db.failDelete) return { error: { message: 'delete failed' } }
                    rows.delete(channelId)
                    return { error: null }
                }
            }
        }
    }
    const repo = loadWithStubs('../repos/counting', { '../db/supabase': supabase })
    return { repo, db, rows }
}

test('correct counts advance, wrong counts reset, chat and other channels are ignored', async () => {
    const { repo, rows, db } = createRepo()
    await repo.setChannel('guild', 'channel')
    assert.equal((await repo.submitCount('channel', ' 1 ')).correct, true)
    assert.equal((await repo.submitCount('channel', '2')).correct, true)
    assert.equal(await repo.submitCount('channel', 'xin chào'), null)
    assert.equal(await repo.submitCount('other', '1'), null)
    assert.equal(repo.getState('channel').currentCount, '2')
    assert.deepEqual(await repo.submitCount('channel', '4'), { correct: false, currentCount: '0' })
    assert.equal(rows.get('channel').current_count, '0')
    assert.equal((await repo.submitCount('channel', '1')).correct, true)
    for (const wrong of ['1', '0', '-1', '2.5', '2,5']) {
        assert.equal((await repo.submitCount('channel', wrong)).correct, false)
        assert.equal(repo.getState('channel').currentCount, '0')
    }
    assert.equal(db.writes.length, 10)
})

test('simultaneous counts are ordered per channel and channels have independent state', async () => {
    const { repo } = createRepo()
    await Promise.all([repo.setChannel('guild', 'a'), repo.setChannel('guild', 'b')])
    const results = await Promise.all([
        repo.submitCount('a', '1'), repo.submitCount('a', '2'),
        repo.submitCount('a', '3'), repo.submitCount('b', '1')
    ])
    assert.ok(results.every(result => result.correct))
    assert.equal(repo.getState('a').currentCount, '3')
    assert.equal(repo.getState('b').currentCount, '1')
    const duplicate = await Promise.all([repo.submitCount('a', '4'), repo.submitCount('a', '4')])
    assert.deepEqual(duplicate.map(result => result.correct), [true, false])
    assert.equal(repo.getState('a').currentCount, '0')
})

test('failed writes preserve the previous state and the queue recovers', async () => {
    const { repo, db, rows } = createRepo()
    await repo.setChannel('guild', 'channel')
    db.failWrite = true
    await assert.rejects(repo.submitCount('channel', '1'), /write failed/)
    assert.equal(repo.getState('channel').currentCount, '0')
    assert.equal(rows.get('channel').current_count, '0')
    db.failWrite = false
    await repo.submitCount('channel', '1')
    db.failWrite = true
    await assert.rejects(repo.submitCount('channel', '9'), /write failed/)
    assert.equal(repo.getState('channel').currentCount, '1')
    db.failWrite = false
    assert.equal((await repo.submitCount('channel', '2')).correct, true)
})

test('enabling again preserves the count; disabling removes it and queued counts stop', async () => {
    const { repo, rows, db } = createRepo()
    await repo.setChannel('guild', 'channel')
    await repo.submitCount('channel', '1')
    assert.equal((await repo.setChannel('guild', 'channel')).currentCount, '1')
    db.failDelete = true
    await assert.rejects(repo.unsetChannel('channel'), /delete failed/)
    assert.equal(repo.getState('channel').currentCount, '1')
    db.failDelete = false
    const [, result] = await Promise.all([
        repo.unsetChannel('channel'), repo.submitCount('channel', '2')
    ])
    assert.equal(result, null)
    assert.equal(repo.getState('channel'), undefined)
    assert.equal(rows.has('channel'), false)
    assert.equal((await repo.setChannel('guild', 'channel')).currentCount, '0')
})

test('bootstrap loads every page and resumes counts exactly beyond JS safe integers', async () => {
    const initial = Array.from({ length: 1001 }, (_, i) => ({
        guild_id: 'guild', channel_id: `channel-${i}`, current_count: '9007199254740992'
    }))
    const { repo, db, rows } = createRepo(initial)
    await repo.loadCountingStates()
    assert.deepEqual(db.pages, [[0, 999], [1000, 1999]])
    assert.equal((await repo.submitCount('channel-1000', '9007199254740993')).correct, true)
    assert.equal(rows.get('channel-1000').current_count, '9007199254740993')
    await repo.loadCountingStates()
    assert.equal(repo.getState('channel-1000').currentCount, '9007199254740993')
    db.failRead = true
    await assert.rejects(repo.loadCountingStates(), /read failed/)
    assert.equal(repo.getState('channel-1000').currentCount, '9007199254740993')
})

test('Discord reactions use configured emoji and a wrong count replies with the reset notice', async (t) => {
    const savedEnv = { CORRECT_EMOJI: process.env.CORRECT_EMOJI, WRONG_EMOJI: process.env.WRONG_EMOJI }
    t.after(() => {
        for (const [key, value] of Object.entries(savedEnv)) {
            if (value === undefined) delete process.env[key]
            else process.env[key] = value
        }
    })
    process.env.CORRECT_EMOJI = '👍'
    process.env.WRONG_EMOJI = '👎'
    const { repo } = createRepo()
    await repo.setChannel('guild', 'channel')
    const { handleCountingMessage } = loadWithStubs('../modules/counting', { '../repos/counting': repo })
    const reactions = [], replies = []
    const message = {
        channelId: 'channel', content: '1',
        react: async emoji => reactions.push(emoji),
        reply: async payload => replies.push(payload)
    }
    await handleCountingMessage(message)
    message.content = '3'
    await handleCountingMessage(message)
    assert.deepEqual(reactions, ['👍', '👎'])
    assert.equal(replies.length, 1)
    assert.match(replies[0].content, /Bạn đã đếm sai.*reset về \*\*0\*\*/)
    assert.equal(replies[0].allowedMentions.repliedUser, false)
    message.content = 'trò chuyện'
    await handleCountingMessage(message)
    assert.equal(reactions.length, 2)
})

test('reaction failure still announces the saved reset; DB failure never confirms a count', async (t) => {
    t.mock.method(console, 'error', () => {})
    const { repo, db } = createRepo()
    await repo.setChannel('guild', 'channel')
    const { handleCountingMessage } = loadWithStubs('../modules/counting', { '../repos/counting': repo })
    let replies = 0, reactions = 0
    const message = {
        channelId: 'channel', content: '8',
        react: async () => { reactions++; throw new Error('missing reaction permission') },
        reply: async () => { replies++ }
    }
    await handleCountingMessage(message)
    assert.equal(replies, 1)
    assert.equal(repo.getState('channel').currentCount, '0')
    db.failWrite = true
    await assert.rejects(handleCountingMessage(message), /write failed/)
    assert.equal(reactions, 1)
    assert.equal(replies, 1)
})

const createChannelCommands = () => {
    const { repo, db } = createRepo()
    const configs = new Map()
    const removedGames = []
    const settings = { mode: null, memberPermissions: true, botPermissions: true, failConfig: false }
    const config = {
        getConfig: channelId => configs.get(channelId),
        async setChannel(guildId, channelId, botMode) {
            if (settings.failConfig) throw new Error('config write failed')
            configs.set(channelId, { guildId, channel: channelId, botMode })
        },
        async unsetChannel(channelId) {
            if (settings.failConfig) throw new Error('config delete failed')
            configs.delete(channelId)
        }
    }
    const stubs = {
        '../repos/counting': repo,
        '../repos/config': config,
        '../repos/gameState': { removeGameState: async channelId => removedGames.push(channelId) }
    }
    const set = loadWithStubs('../commands/set-channel', stubs)
    const unset = loadWithStubs('../commands/unset-channel', stubs)
    const replies = [], edits = [], deferred = [], checkedPermissions = []
    const botMember = { id: 'bot' }
    const interaction = {
        guildId: 'guild', guild: { name: 'Server', members: { me: botMember } },
        member: { permissions: { has: () => settings.memberPermissions } },
        options: {
            getString: () => settings.mode,
            getChannel: () => ({
                id: 'channel', name: 'Game',
                permissionsFor: member => {
                    assert.equal(member, botMember)
                    return { has: permissions => {
                        checkedPermissions.push(permissions)
                        return settings.botPermissions
                    } }
                }
            })
        },
        reply: async payload => replies.push(payload),
        deferReply: async () => deferred.push(true),
        editReply: async payload => edits.push(payload)
    }
    return { repo, db, configs, settings, set, unset, interaction, replies, edits, deferred, checkedPermissions, removedGames }
}

test('/set-channel exposes Couting and checks member and bot permissions', async () => {
    const f = createChannelCommands()
    const data = f.set.data.toJSON()
    assert.equal(data.name, 'set-channel')
    const modeOption = data.options.find(option => option.name === 'bot_mode')
    assert.equal(modeOption.type, 3) // Discord string option replaces the old boolean option.
    assert.equal(modeOption.required, false)
    assert.deepEqual(modeOption.choices.map(choice => choice.value), ['false', 'true', 'counting'])
    assert.equal(modeOption.choices.find(choice => choice.value === 'counting').name, 'Couting')
    f.settings.mode = 'counting'
    f.settings.memberPermissions = false
    await f.set.execute(f.interaction)
    assert.match(f.replies.at(-1).content, /MANAGE_GUILD/)
    assert.equal(f.replies.at(-1).flags, MessageFlags.Ephemeral)
    f.settings.memberPermissions = true
    f.settings.botPermissions = false
    await f.set.execute(f.interaction)
    assert.match(f.replies.at(-1).content, /Bot cần quyền/)
    assert.ok(f.checkedPermissions.at(-1).includes(PermissionsBitField.Flags.ReadMessageHistory))
    assert.equal(f.repo.getState('channel'), undefined)
    assert.equal(f.configs.size, 0)
    assert.equal(f.deferred.length, 0)
})

test('/set-channel preserves both word-chain modes and switches to and from counting', async () => {
    const f = createChannelCommands()
    await f.set.execute(f.interaction)
    assert.equal(f.configs.get('channel').botMode, false)
    f.settings.mode = 'true'
    await f.set.execute(f.interaction)
    assert.equal(f.configs.get('channel').botMode, true)
    assert.match(f.edits.at(-1), /với bot đã được/)
    f.settings.mode = 'counting'
    await f.set.execute(f.interaction)
    assert.equal(f.repo.getState('channel').currentCount, '0')
    assert.equal(f.configs.has('channel'), false)
    assert.deepEqual(f.removedGames, ['channel'])
    await f.repo.submitCount('channel', '1')
    await f.set.execute(f.interaction)
    assert.equal(f.repo.getState('channel').currentCount, '1')
    assert.match(f.edits.at(-1), /Hãy gửi \*\*2\*\*/)
    f.settings.mode = 'false'
    await f.set.execute(f.interaction)
    assert.equal(f.configs.get('channel').botMode, false)
    assert.equal(f.repo.getState('channel'), undefined)
})

test('/unset-channel removes counting state and word-chain state and enforces permission', async () => {
    const f = createChannelCommands()
    f.settings.mode = 'counting'
    await f.set.execute(f.interaction)
    f.settings.memberPermissions = false
    await f.unset.execute(f.interaction)
    assert.ok(f.repo.getState('channel'))
    assert.equal(f.replies.at(-1).flags, MessageFlags.Ephemeral)
    f.settings.memberPermissions = true
    await f.unset.execute(f.interaction)
    assert.equal(f.repo.getState('channel'), undefined)
    assert.match(f.edits.at(-1), /xoá cài đặt kênh đếm số/)
    await f.unset.execute(f.interaction)
    assert.match(f.replies.at(-1).content, /chưa được cài đặt/)
    f.settings.mode = 'true'
    await f.set.execute(f.interaction)
    await f.unset.execute(f.interaction)
    assert.equal(f.configs.has('channel'), false)
    assert.deepEqual(f.removedGames, ['channel'])
    assert.match(f.edits.at(-1), /xoá cài đặt kênh nối từ/)
})

test('failed mode writes preserve the previous game and do not confirm the switch', async () => {
    const f = createChannelCommands()
    await f.set.execute(f.interaction)
    f.settings.mode = 'counting'
    f.db.failWrite = true
    await assert.rejects(f.set.execute(f.interaction), /write failed/)
    assert.equal(f.configs.get('channel').botMode, false)
    assert.equal(f.repo.getState('channel'), undefined)
    assert.equal(f.edits.length, 1)
    f.db.failWrite = false
    await f.set.execute(f.interaction)
    await f.repo.submitCount('channel', '1')
    f.settings.mode = 'true'
    f.settings.failConfig = true
    await assert.rejects(f.set.execute(f.interaction), /config write failed/)
    assert.equal(f.repo.getState('channel').currentCount, '1')
    assert.equal(f.edits.length, 2)
    f.db.failDelete = true
    await assert.rejects(f.unset.execute(f.interaction), /delete failed/)
    assert.equal(f.repo.getState('channel').currentCount, '1')
    assert.equal(f.edits.length, 2)
})

test('word-chain config mutations reject DB failures without changing the cached mode', async () => {
    let fail = false
    const config = loadWithStubs('../repos/config', {
        '../db/supabase': { from: () => ({
            upsert: async () => ({ error: fail ? { message: 'write failed' } : null }),
            delete() { return this },
            eq: async () => ({ error: fail ? { message: 'delete failed' } : null })
        }) }
    })
    await config.setChannel('guild', 'channel', false)
    fail = true
    await assert.rejects(config.setChannel('guild', 'channel', true), /write failed/)
    assert.equal(config.getConfig('channel').botMode, false)
    await assert.rejects(config.unsetChannel('channel'), /delete failed/)
    assert.ok(config.getConfig('channel'))
    fail = false
    await config.unsetChannel('channel')
    assert.equal(config.getConfig('channel'), undefined)
})
