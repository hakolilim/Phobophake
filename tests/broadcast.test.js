const { test } = require('node:test')
const assert = require('node:assert/strict')
const { MessageFlags, PermissionFlagsBits } = require('discord.js')

const loadBroadcast = (wordChannels, countingChannels, reportChannel = 'report') => {
    const commandPath = require.resolve('../commands/broadcast')
    const configPath = require.resolve('../repos/config')
    const countingPath = require.resolve('../repos/counting')
    const saved = new Map([commandPath, configPath, countingPath].map(path => [path, require.cache[path]]))
    const savedReportChannel = process.env.REPORT_CHANNEL
    try {
        process.env.REPORT_CHANNEL = reportChannel
        delete require.cache[commandPath]
        require.cache[configPath] = { exports: { getAllConfigs: () => wordChannels } }
        require.cache[countingPath] = { exports: { getAllConfigs: () => countingChannels } }
        return require(commandPath)
    } finally {
        for (const [path, entry] of saved) {
            if (entry) require.cache[path] = entry
            else delete require.cache[path]
        }
        if (savedReportChannel === undefined) delete process.env.REPORT_CHANNEL
        else process.env.REPORT_CHANNEL = savedReportChannel
    }
}

const createDiscord = (channelIds, content = 'Thông báo @everyone <@123> <@&456>') => {
    const sent = [], fetched = [], replies = [], edits = [], deferred = []
    const channels = new Map(channelIds.map(id => [id, {
        guildId: 'guild',
        isTextBased: () => true,
        permissionsFor: () => ({ has: permissions => {
            assert.deepEqual(permissions, [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])
            return true
        } }),
        send: async payload => sent.push({ channel: id, ...payload })
    }]))
    const interaction = {
        channelId: 'report',
        options: { getString: () => content },
        reply: async payload => replies.push(payload),
        deferReply: async payload => deferred.push(payload),
        editReply: async payload => edits.push(payload)
    }
    const client = { user: { id: 'bot' }, channels: { fetch: async id => {
        fetched.push(id)
        return channels.get(id)
    } } }
    return { interaction, client, channels, sent, fetched, replies, edits, deferred }
}

const channelConfig = channel => ({ channel, guildId: 'guild' })

test('broadcast reaches both games once per channel, without pings, and counts unique destinations', async () => {
    const command = loadBroadcast(
        [channelConfig('word'), channelConfig('shared')],
        [channelConfig('counting'), channelConfig('shared')]
    )
    const discord = createDiscord(['word', 'shared', 'counting'])
    await command.execute(discord.interaction, discord.client)
    assert.deepEqual(discord.sent.map(message => message.channel), ['word', 'shared', 'counting'])
    assert.equal(discord.fetched.length, 3)
    for (const message of discord.sent) {
        assert.equal(message.content, discord.interaction.options.getString())
        assert.deepEqual(message.allowedMentions, { parse: [] })
    }
    assert.equal(discord.deferred[0].flags, MessageFlags.Ephemeral)
    assert.equal(discord.edits[0], 'Đã gửi thành công đến 3/3 kênh.')
})

test('broadcast works when only counting channels are configured', async () => {
    const command = loadBroadcast([], [channelConfig('counting')])
    const discord = createDiscord(['counting'])
    await command.execute(discord.interaction, discord.client)
    assert.equal(discord.sent.length, 1)
    assert.equal(discord.edits[0], 'Đã gửi thành công đến 1/1 kênh.')
})

test('broadcast reports failures from both games and continues to remaining channels', async (t) => {
    t.mock.method(console, 'error', () => {})
    const command = loadBroadcast(
        [channelConfig('word')],
        [channelConfig('blocked'), channelConfig('counting')]
    )
    const discord = createDiscord(['word', 'blocked', 'counting'])
    discord.channels.get('word').send = async () => { throw new Error('send failed') }
    discord.channels.get('blocked').permissionsFor = () => ({ has: () => false })
    await command.execute(discord.interaction, discord.client)
    assert.deepEqual(discord.sent.map(message => message.channel), ['counting'])
    assert.match(discord.edits[0], /1\/3 kênh/)
    assert.match(discord.edits[0], /Thất bại: 2/)
    assert.match(discord.edits[0], /`word`: gửi tin thất bại/)
    assert.match(discord.edits[0], /`blocked`: bot thiếu quyền xem hoặc gửi tin/)
})

test('broadcast still restricts use to REPORT_CHANNEL and validates configuration and content', async () => {
    for (const scenario of ['wrong_channel', 'unconfigured', 'empty_message']) {
        const command = loadBroadcast([], [channelConfig('counting')], scenario === 'unconfigured' ? '' : 'report')
        const discord = createDiscord(['counting'], scenario === 'empty_message' ? '   ' : 'Thông báo')
        if (scenario === 'wrong_channel') discord.interaction.channelId = 'elsewhere'
        await command.execute(discord.interaction, discord.client)
        assert.equal(discord.replies.length, 1)
        assert.equal(discord.replies[0].flags, MessageFlags.Ephemeral)
        assert.equal(discord.deferred.length, 0)
        assert.equal(discord.fetched.length, 0)
    }
})

test('broadcast explains when neither game has configured channels', async () => {
    const command = loadBroadcast([], [])
    const discord = createDiscord([])
    await command.execute(discord.interaction, discord.client)
    assert.match(discord.edits[0], /chưa có kênh nối từ hoặc đếm số/)
    assert.equal(discord.fetched.length, 0)
})
