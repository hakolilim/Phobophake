const synchronizeSlashCommands = require('../modules/sync_commands.js')
const { ActivityType } = require('discord.js')
const { startWebServer } = require('../web/server')

module.exports = {
    name: 'ready',
    once: true,
    async execute(client) {

        console.log(`Connected as ${client.user.username}`)
        client.user.setActivity(`nối từ | /rank`, { type: ActivityType.Playing })
        client.user.setStatus('idle')

        // This is when the Slash Commands synchronisation starts
        await synchronizeSlashCommands(client,
        client.commands.map((c) => c.data),
        {
            // The parameters to be modified for synchronisation
            debug: true,
            // If you set a server ID, then it will ONLY be for the targeted server.
            // If you don't put guildID, it will be in GLOBAL,
            // So on all servers.
            // guildId: "YourDiscordServerOrDeleteThisLine"
        }
        )

        // Mở web sau khi Discord ready + commands synchronized.
        startWebServer(client)
    }
}


