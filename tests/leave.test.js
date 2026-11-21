const { test } = require('node:test')
const assert = require('node:assert/strict')
const { PermissionFlagsBits, MessageFlags, InteractionContextType } = require('discord.js')

const loadWithStubs = (path, stubs = {}) => {
    const resolved = require.resolve(path)
    const entries = [[resolved, undefined], ...Object.entries(stubs).map(([id, exports]) => [require.resolve(id), exports])]
    const saved = new Map(entries.map(([id]) => [id, require.cache[id]]))
    try {
        delete require.cache[resolved]
        for (const [id, exports] of entries.slice(1)) require.cache[id] = { exports }
        return require(resolved)
    } finally {
        for (const [id, entry] of saved) {
            if (entry) require.cache[id] = entry
            else delete require.cache[id]
        }
    }
}

const createFixture = async ({ guildId = 'guild', reportChannel = 'report' } = {}) => {
    const rows = {
        guild_config: [
            { channel_id: 'word', guild_id: guildId },
            { channel_id: 'deleted-channel', guild_id: guildId },
            { channel_id: 'other-word', guild_id: 'other' }
        ],
        game_state: ['word', 'deleted-channel', 'orphan', 'other-word'].map(channel_id => ({ channel_id, words: ['bắt đầu'] })),
        counting_channels: [
            { channel_id: 'count', guild_id: guildId, current_count: '5', last_player_id: 'alice' },
            { channel_id: 'other-count', guild_id: 'other', current_count: '10', last_player_id: 'bob' }
        ],
        rankings: [
            { guild_id: guildId, user_id: 'alice', true_count: 5 },
            { guild_id: 'other', user_id: 'alice', true_count: 10 }
        ],
        premium_guilds: [{ guild_id: guildId }, { guild_id: 'other' }],
        words: [{ word: 'bắt đầu' }],
        report_words: [{ word: 'từ cấm' }],
        global_stats: [{ key: 'word_played', value: 10 }]
    }
    const db = { failTable: null, deletes: [], rows }
    const supabase = {
        from(table) {
            const query = {
                select() { return this },
                order() { return this },
                async range(from, to) { return { data: rows[table].slice(from, to + 1), error: null } },
                then(resolve, reject) { return Promise.resolve({ data: rows[table], error: null }).then(resolve, reject) },
                delete() { return this },
                async eq(key, value) { return this.in(key, [value]) },
                async in(key, values) {
                    db.deletes.push({ table, key, values })
                    if (db.failTable === table) return { error: { message: 'delete failed' } }
                    rows[table] = rows[table].filter(row => !values.includes(row[key]))
                    return { error: null }
                },
                async upsert(row) {
                    await new Promise(resolve => setImmediate(resolve))
                    rows[table] = rows[table].filter(entry => entry.channel_id !== row.channel_id)
                    rows[table].push(row)
                    return { error: null }
                }
            }
            return query
        }
    }
    const repos = {}
    for (const name of ['config', 'counting', 'gameState', 'ranking', 'premium']) {
        repos[name] = loadWithStubs(`../repos/${name}`, { '../db/supabase': supabase })
    }
    await repos.config.loadConfig()
    await repos.counting.loadCountingStates()
    await repos.gameState.loadGameStates()
    await repos.ranking.loadRankings()
    await repos.premium.loadPremium()

    const guildRepo = loadWithStubs('../repos/guild', Object.fromEntries(
        Object.entries(repos).map(([name, repo]) => [`../repos/${name}`, repo])
    ))
    const activity = loadWithStubs('../modules/guildActivity')
    const savedReportChannel = process.env.REPORT_CHANNEL
    let command
    try {
        process.env.REPORT_CHANNEL = reportChannel
        command = loadWithStubs('../commands/leave', {
            '../repos/guild': guildRepo,
            '../modules/guildActivity': activity
        })
    } finally {
        if (savedReportChannel === undefined) delete process.env.REPORT_CHANNEL
        else process.env.REPORT_CHANNEL = savedReportChannel
    }
    const replies = [], edits = [], deferred = []
    let left = 0
    const interaction = {
        guildId,
        channelId: 'normal-channel',
        options: { getString: name => {
            assert.ok(['guild', 'guild_id'].includes(name))
            return null
        } },
        inGuild: () => true,
        memberPermissions: { has: flag => {
            assert.equal(flag, PermissionFlagsBits.ManageGuild)
            return true
        } },
        guild: {
            id: guildId,
            name: 'Máy chủ thử nghiệm',
            channels: { fetch: async () => new Map(['word', 'count', 'orphan'].map(id => [id, { id }])) },
            async leave() { left++ }
        },
        async reply(payload) { replies.push(payload) },
        async deferReply(payload) { deferred.push(payload); this.deferred = true },
        async editReply(payload) { edits.push(payload) }
    }
    const targetGuild = interaction.guild
    const fetched = []
    const client = { guilds: { cache: new Map([[guildId, targetGuild]]), fetch: async id => {
        fetched.push(id)
        assert.equal(id, guildId)
        return targetGuild
    } } }
    return { guildId, client, fetched, repos, guildRepo, activity, command, interaction, db, replies, edits, deferred, get left() { return left } }
}

const assertOtherGuildPreserved = (f) => {
    assert.ok(f.repos.config.getConfig('other-word'))
    assert.ok(f.repos.gameState.getState('other-word'))
    assert.equal(f.repos.counting.getState('other-count').currentCount, '10')
    assert.equal(f.repos.ranking.getUser('other', 'alice').true, 10)
    assert.equal(f.repos.premium.isPremium('other'), true)
    assert.equal(f.db.rows.guild_config.filter(row => row.guild_id === 'other').length, 1)
    assert.equal(f.db.rows.game_state.filter(row => row.channel_id === 'other-word').length, 1)
    for (const table of ['counting_channels', 'rankings', 'premium_guilds']) {
        assert.equal(f.db.rows[table].filter(row => row.guild_id === 'other').length, 1)
    }
    assert.deepEqual(f.db.rows.words, [{ word: 'bắt đầu' }])
    assert.deepEqual(f.db.rows.report_words, [{ word: 'từ cấm' }])
    assert.deepEqual(f.db.rows.global_stats, [{ key: 'word_played', value: 10 }])
}

const assertGuildRemoved = (f) => {
    assert.equal(f.repos.config.getConfig('word'), undefined)
    assert.equal(f.repos.config.getConfig('deleted-channel'), undefined)
    for (const channelId of ['word', 'deleted-channel', 'orphan']) {
        assert.equal(f.repos.gameState.getState(channelId), undefined)
    }
    assert.equal(f.repos.counting.getState('count'), undefined)
    assert.deepEqual(f.repos.ranking.getGuildPlayers(f.guildId), [])
    assert.equal(f.repos.premium.isPremium(f.guildId), false)
    for (const table of ['guild_config', 'counting_channels', 'rankings', 'premium_guilds']) {
        assert.equal(f.db.rows[table].some(row => row.guild_id === f.guildId), false)
    }
    assert.deepEqual(f.db.rows.game_state.map(row => row.channel_id), ['other-word'])
    assertOtherGuildPreserved(f)
}

test('/leave removes all guild data in DB and RAM before leaving and preserves shared/other guild data', async () => {
    const f = await createFixture()
    const leave = f.interaction.guild.leave
    f.interaction.guild.leave = async () => {
        assertGuildRemoved(f)
        assert.equal(f.edits.length, 1)
        await leave()
    }
    await f.command.execute(f.interaction)
    assert.equal(f.left, 1)
    assert.equal(f.deferred[0].flags, MessageFlags.Ephemeral)
    assert.equal(f.activity.beginOperation('guild'), null)
    // Được mời lại trong cùng tiến trình thì bot hoạt động bình thường.
    f.activity.allowGuild('guild')
    f.activity.beginOperation('guild')()
})

test('/leave is guild-only and checks ManageGuild at registration and execution', async () => {
    const f = await createFixture()
    const data = f.command.data.toJSON()
    assert.deepEqual(data.contexts, [InteractionContextType.Guild])
    assert.equal(data.default_member_permissions, String(PermissionFlagsBits.ManageGuild))
    f.interaction.inGuild = () => false
    await f.command.execute(f.interaction)
    f.interaction.inGuild = () => true
    f.interaction.memberPermissions = { has: () => false }
    await f.command.execute(f.interaction)
    f.interaction.memberPermissions = null
    await f.command.execute(f.interaction)
    assert.equal(f.replies.length, 3)
    assert.ok(f.replies.every(reply => reply.flags === MessageFlags.Ephemeral))
    assert.equal(f.deferred.length, 0)
    assert.equal(f.db.deletes.length, 0)
    assert.equal(f.left, 0)
})

for (const table of ['game_state', 'counting_channels', 'rankings', 'premium_guilds', 'guild_config']) {
    test(`/leave stops on ${table} failure, preserves its cache and supports retry`, async (t) => {
        t.mock.method(console, 'error', () => {})
        const f = await createFixture()
        f.db.failTable = table
        await f.command.execute(f.interaction)
        assert.equal(f.left, 0)
        assert.match(f.edits.at(-1), /chưa rời/)
        assert.ok(f.repos.config.getConfig('word'))
        if (table === 'game_state') assert.ok(f.repos.gameState.getState('word'))
        if (table === 'counting_channels') assert.ok(f.repos.counting.getState('count'))
        if (table === 'rankings') assert.ok(f.repos.ranking.getUser('guild', 'alice'))
        if (table === 'premium_guilds') assert.equal(f.repos.premium.isPremium('guild'), true)
        assertOtherGuildPreserved(f)
        f.activity.beginOperation('guild')()
        f.db.failTable = null
        await f.command.execute(f.interaction)
        assert.equal(f.left, 1)
        assertGuildRemoved(f)
    })
}

test('/leave waits for running work, blocks new work and duplicate leaves, and allows other guilds', async () => {
    const f = await createFixture()
    const finish = f.activity.beginOperation('guild')
    const pending = f.command.execute(f.interaction)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(f.db.deletes.length, 0)
    assert.equal(f.activity.beginOperation('guild'), null)
    const finishOther = f.activity.beginOperation('other')
    assert.equal(typeof finishOther, 'function')
    await f.command.execute(f.interaction)
    assert.match(f.replies.at(-1).content, /đang xoá/)
    assert.equal(f.deferred.length, 1)
    finish()
    await pending
    assertGuildRemoved(f)
    assert.equal(f.left, 1)
    finishOther()
})

test('channel fetch failure causes no deletions and unlocks guild', async (t) => {
    t.mock.method(console, 'error', () => {})
    const f = await createFixture()
    f.interaction.guild.channels.fetch = async () => { throw new Error('Discord unavailable') }
    await f.command.execute(f.interaction)
    assert.equal(f.db.deletes.length, 0)
    assert.equal(f.left, 0)
    f.activity.beginOperation('guild')()
})

test('failed guild.leave reports that data was deleted and permits an idempotent retry', async (t) => {
    t.mock.method(console, 'error', () => {})
    const f = await createFixture()
    const leave = f.interaction.guild.leave
    f.interaction.guild.leave = async () => { throw new Error('leave failed') }
    await f.command.execute(f.interaction)
    assertGuildRemoved(f)
    assert.match(f.edits.at(-1), /Đã xoá dữ liệu.*chưa rời được/)
    f.interaction.guild.leave = leave
    await f.command.execute(f.interaction)
    assert.equal(f.left, 1)
})

test('response failure after cleanup still lets the bot leave', async (t) => {
    t.mock.method(console, 'error', () => {})
    const f = await createFixture()
    f.interaction.editReply = async () => { throw new Error('webhook failed') }
    await f.command.execute(f.interaction)
    assert.equal(f.left, 1)
    assertGuildRemoved(f)
})

test('bulk game-state deletion uses bounded batches and preserves cache for a failed batch', async () => {
    const f = await createFixture()
    const ids = Array.from({ length: 205 }, (_, i) => `channel-${i}`)
    await f.repos.gameState.removeGameStates([...ids, ...ids])
    assert.deepEqual(f.db.deletes.map(query => query.values.length), [100, 100, 5])
    f.db.failTable = 'game_state'
    await assert.rejects(f.repos.gameState.removeGameState('word'), /delete failed/)
    assert.ok(f.repos.gameState.getState('word'))
})

test('counting deletion waits for an already queued count so it cannot recreate deleted data', async () => {
    const f = await createFixture()
    const pendingCount = f.repos.counting.submitCount('count', '6', 'bob')
    const pendingDelete = f.repos.counting.removeGuild('guild')
    assert.equal((await pendingCount).correct, true)
    await pendingDelete
    assert.equal(f.repos.counting.getState('count'), undefined)
    assert.equal(f.db.rows.counting_channels.some(row => row.guild_id === 'guild'), false)
    assert.equal(await f.repos.counting.submitCount('count', '7', 'alice'), null)
    assertOtherGuildPreserved(f)
})

const REMOTE_GUILD_ID = '123456789012345678'

const createRemoteFixture = async (options = {}) => {
    const f = await createFixture({ guildId: REMOTE_GUILD_ID, ...options })
    f.interaction.guildId = 'other'
    f.interaction.channelId = 'report'
    f.interaction.options.getString = () => REMOTE_GUILD_ID
    f.interaction.guild = {
        id: 'other',
        channels: { fetch: async () => { throw new Error('must fetch target channels') } },
        leave: async () => { throw new Error('must leave target guild') }
    }
    return f
}

test('/leave exposes an optional guild autocomplete and retains current-guild behavior outside REPORT_CHANNEL', async () => {
    const f = await createFixture({ reportChannel: '' })
    const option = f.command.data.toJSON().options.find(option => option.name === 'guild')
    assert.equal(option.type, 3)
    assert.equal(option.required, false)
    assert.equal(option.autocomplete, true)
    assert.equal(option.min_length, 1)
    assert.equal(option.max_length, 100)
    await f.command.execute(f.interaction, f.client)
    assert.equal(f.left, 1)
    assert.deepEqual(f.fetched, [])
    assertGuildRemoved(f)
})

test('guild is rejected outside REPORT_CHANNEL, even when selecting the current guild', async () => {
    const f = await createFixture({ guildId: REMOTE_GUILD_ID })
    f.interaction.options.getString = () => REMOTE_GUILD_ID
    await f.command.execute(f.interaction, f.client)
    assert.match(f.replies.at(-1).content, /REPORT_CHANNEL/)
    assert.equal(f.replies.at(-1).flags, MessageFlags.Ephemeral)
    assert.deepEqual(f.fetched, [])
    assert.equal(f.db.deletes.length, 0)
    assert.equal(f.deferred.length, 0)
    assert.equal(f.left, 0)
    f.activity.beginOperation(REMOTE_GUILD_ID)()
})

test('guild is rejected when REPORT_CHANNEL is not configured', async () => {
    const f = await createRemoteFixture({ reportChannel: '' })
    await f.command.execute(f.interaction, f.client)
    assert.match(f.replies.at(-1).content, /REPORT_CHANNEL/)
    assert.deepEqual(f.fetched, [])
    assert.equal(f.db.deletes.length, 0)
    assert.equal(f.left, 0)
})

test('invalid guild IDs and missing ManageGuild are rejected before target lookup or deletion', async () => {
    const f = await createRemoteFixture()
    for (const id of ['', 'abc', '123', '12345678901234567x', '123456789012345678901']) {
        f.interaction.options.getString = () => id
        await f.command.execute(f.interaction, f.client)
        assert.match(f.replies.at(-1).content, /Không tìm thấy máy chủ theo tên này/)
    }
    f.interaction.options.getString = () => REMOTE_GUILD_ID
    f.interaction.memberPermissions.has = () => false
    await f.command.execute(f.interaction, f.client)
    assert.match(f.replies.at(-1).content, /MANAGE_GUILD/)
    assert.deepEqual(f.fetched, [])
    assert.equal(f.db.deletes.length, 0)
    assert.equal(f.left, 0)
})

test('remote /leave locks and drains the target guild and preserves the reporting guild', async () => {
    const f = await createRemoteFixture()
    const finish = f.activity.beginOperation(REMOTE_GUILD_ID)
    const pending = f.command.execute(f.interaction, f.client)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(f.activity.beginOperation(REMOTE_GUILD_ID), null)
    f.activity.beginOperation('other')()
    assert.equal(f.db.deletes.length, 0)
    await f.command.execute(f.interaction, f.client)
    assert.match(f.replies.at(-1).content, /đang xoá/)
    finish()
    await pending
    assert.deepEqual(f.fetched, [REMOTE_GUILD_ID])
    assert.equal(f.left, 1)
    assert.match(f.edits.at(-1), new RegExp(REMOTE_GUILD_ID))
    assertGuildRemoved(f)
})

test('unknown or inaccessible target guild does not delete data and releases its lock', async (t) => {
    t.mock.method(console, 'error', () => {})
    const f = await createRemoteFixture()
    f.client.guilds.fetch = async () => { throw new Error('Unknown Guild') }
    await f.command.execute(f.interaction, f.client)
    assert.match(f.edits.at(-1), /Không tìm thấy máy chủ.*Chưa xoá dữ liệu/)
    assert.equal(f.db.deletes.length, 0)
    assert.equal(f.left, 0)
    f.activity.beginOperation(REMOTE_GUILD_ID)()
    assertOtherGuildPreserved(f)
})

test('remote cleanup and leave failures retain the target ID in retry instructions', async (t) => {
    t.mock.method(console, 'error', () => {})
    const f = await createRemoteFixture()
    f.db.failTable = 'rankings'
    await f.command.execute(f.interaction, f.client)
    assert.equal(f.left, 0)
    assert.ok(f.edits.at(-1).includes(`/leave guild:${REMOTE_GUILD_ID}`))
    f.activity.beginOperation(REMOTE_GUILD_ID)()
    assertOtherGuildPreserved(f)
    f.db.failTable = null
    const target = await f.client.guilds.fetch(REMOTE_GUILD_ID)
    const leave = target.leave
    target.leave = async () => { throw new Error('leave failed') }
    await f.command.execute(f.interaction, f.client)
    assertGuildRemoved(f)
    assert.match(f.edits.at(-1), /Đã xoá dữ liệu.*chưa rời được/)
    assert.ok(f.edits.at(-1).includes(`/leave guild:${REMOTE_GUILD_ID}`))
    target.leave = leave
    await f.command.execute(f.interaction, f.client)
    assert.equal(f.left, 1)
})

const createAutocomplete = (f, value = '') => {
    const responses = []
    f.interaction.options.getFocused = full => {
        assert.equal(full, true)
        return { name: 'guild', value }
    }
    f.interaction.respond = async choices => responses.push(choices)
    return responses
}

test('guild autocomplete lists up to 25 guilds with names and stable ID values without fetching or deleting', async () => {
    const f = await createRemoteFixture()
    f.client.guilds.cache = new Map(Array.from({ length: 30 }, (_, i) => {
        const id = String(123456789012345600n + BigInt(i))
        return [id, { id, name: `Server ${String(i).padStart(2, '0')}` }]
    }))
    const responses = createAutocomplete(f)
    await f.command.autocomplete(f.interaction, f.client)
    assert.equal(responses[0].length, 25)
    assert.deepEqual(responses[0][0], { name: 'Server 00 (123456789012345600)', value: '123456789012345600' })
    assert.deepEqual(f.fetched, [])
    assert.equal(f.db.deletes.length, 0)
    assert.equal(f.left, 0)
})

test('guild autocomplete filters partial names case/accent-insensitively and filters partial IDs', async () => {
    const f = await createRemoteFixture()
    const other = { id: '987654321098765432', name: 'Đội Bạn' }
    f.client.guilds.cache.set(other.id, other)
    for (const [query, expected] of [
        ['MAY CHU', REMOTE_GUILD_ID],
        ['thử', REMOTE_GUILD_ID],
        ['thu\u031b\u0309', REMOTE_GUILD_ID],
        ['doi ban', other.id],
        ['98765', other.id],
        ['không tồn tại', null]
    ]) {
        const responses = createAutocomplete(f, query)
        await f.command.autocomplete(f.interaction, f.client)
        assert.deepEqual(responses[0].map(choice => choice.value), expected ? [expected] : [])
    }
})

test('guild autocomplete never exposes guild names outside REPORT_CHANNEL or without ManageGuild', async () => {
    for (const scenario of ['wrong_channel', 'unconfigured', 'missing_permission', 'dm']) {
        const f = await createRemoteFixture(scenario === 'unconfigured' ? { reportChannel: '' } : {})
        if (scenario === 'wrong_channel') f.interaction.channelId = 'elsewhere'
        if (scenario === 'missing_permission') f.interaction.memberPermissions = null
        if (scenario === 'dm') f.interaction.inGuild = () => false
        Object.defineProperty(f.client.guilds, 'cache', { get() { throw new Error('must not read guild list') } })
        const responses = createAutocomplete(f)
        await f.command.autocomplete(f.interaction, f.client)
        assert.deepEqual(responses, [[]])
        assert.equal(f.db.deletes.length, 0)
    }
})

test('guild suggestions distinguish duplicate names and fit Discord label limits with emoji names', async () => {
    const f = await createRemoteFixture()
    const target = f.client.guilds.cache.get(REMOTE_GUILD_ID)
    const duplicate = { id: '987654321098765432', name: target.name }
    const longName = { id: '111111111111111111', name: '😀'.repeat(100) }
    f.client.guilds.cache.set(duplicate.id, duplicate)
    f.client.guilds.cache.set(longName.id, longName)
    const responses = createAutocomplete(f)
    await f.command.autocomplete(f.interaction, f.client)
    assert.equal(responses[0].length, 3)
    assert.equal(new Set(responses[0].map(choice => choice.name)).size, 3)
    for (const choice of responses[0]) {
        assert.ok(choice.name.length <= 100)
        assert.ok(choice.name.endsWith(`(${choice.value})`))
        assert.equal(choice.name.isWellFormed(), true)
    }
})

test('entering a unique full guild name resolves the ID and only removes the selected guild', async () => {
    const f = await createRemoteFixture()
    f.interaction.options.getString = () => '  MAY CHU THU NGHIEM  '
    await f.command.execute(f.interaction, f.client)
    assert.deepEqual(f.fetched, [REMOTE_GUILD_ID])
    assert.equal(f.left, 1)
    assertGuildRemoved(f)
})

test('duplicate guild names require a suggestion or ID and never guess a guild to delete', async () => {
    const f = await createRemoteFixture()
    f.client.guilds.cache.set('987654321098765432', { id: '987654321098765432', name: 'Máy chủ thử nghiệm' })
    f.interaction.options.getString = () => 'Máy chủ thử nghiệm'
    await f.command.execute(f.interaction, f.client)
    assert.match(f.replies.at(-1).content, /nhiều máy chủ trùng tên/)
    assert.deepEqual(f.fetched, [])
    assert.equal(f.db.deletes.length, 0)
    assert.equal(f.left, 0)
    // Chọn gợi ý gửi value = ID, tránh phụ thuộc tên trùng nhau.
    f.interaction.options.getString = () => REMOTE_GUILD_ID
    await f.command.execute(f.interaction, f.client)
    assert.equal(f.left, 1)
    assertGuildRemoved(f)
})

test('a cached guild_id option still targets the selected guild while Discord syncs the new schema', async () => {
    const f = await createRemoteFixture()
    f.interaction.options.getString = name => name === 'guild_id' ? REMOTE_GUILD_ID : null
    await f.command.execute(f.interaction, f.client)
    assert.deepEqual(f.fetched, [REMOTE_GUILD_ID])
    assert.equal(f.left, 1)
    assertGuildRemoved(f)
})
