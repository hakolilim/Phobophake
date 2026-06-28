const fs = require('fs')
const { Client, GatewayIntentBits, Collection, PermissionsBitField } = require('discord.js')
require('dotenv').config()

const words = require('./repos/words')
const config = require('./repos/config')
const gameState = require('./repos/gameState')
const ranking = require('./repos/ranking')
const stats = require('./repos/stats')
const premium = require('./repos/premium')

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
})

// global config
const START_COMMAND = '!start'
const STOP_COMMAND = '!stop'
const PREFIX = '?phobo'
const CORRECT_EMOJI = process.env.CORRECT_EMOJI || '✅'
const WRONG_EMOJI = process.env.WRONG_EMOJI || '❌'

// We create a collection for commands
client.commands = new Collection()
const commandFiles = fs
  .readdirSync('./commands')
  .filter((file) => file.endsWith('.js'))

for (const file of commandFiles) {
    const command = require(`./commands/${file}`)
    client.commands.set(command.data.name, command)
}

// Events like ready.js (when the robot turns on),
// or messageCreate.js (when a user/robot sends a message)
const eventFiles = fs
  .readdirSync('./events')
  .filter((file) => file.endsWith('.js'))

for (const file of eventFiles) {
    const event = require(`./events/${file}`)
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client))
    } else {
        client.on(event.name, (...args) => event.execute(...args, client))
    }
}

// LOGIC GAME
client.on('messageCreate', async message => {
    if (message.author.bot) return // detect mess from BOT
    if (!message.guild) return // bỏ qua DM

    let queryCount = 0

    try {
        // function
        const sendMessageToChannel = (msg, channel_id) => {
            client.channels.cache.get(channel_id).send({
                content: msg,
                flags: [4096]
            })
        }

        const sendAutoDeleteMessageToChannel = (msg, channel_id, seconds = 3) => {
            client.channels.cache.get(channel_id).send({
                content: msg,
                flags: [4096]
            }).then(mess => setTimeout(() => mess.delete(), 1000 * seconds))
        }

        /**
         *
         * @param {String} word
         * @returns {Boolean}
         */
        const checkIfHaveAnswer = (word) => {
            let w = word.split(/ +/)
            let lc = w[w.length - 1]
            for (let i = 0; i < global.dicData.length; i++) {
                queryCount++
                let temp = global.dicData[i]
                let tempw = temp.split(/ +/)
                if (tempw.length > 1 && tempw[0] === lc && temp !== word) {
                    // detect word
                    return true
                }
            }
            return false
        }

        const randomWord = () => {
            const wordIndex = Math.floor(Math.random() * (global.dicData.length - 1))
            queryCount += wordIndex + 1
            const rWord = global.dicData[wordIndex]
            return checkIfHaveAnswer(rWord) ? rWord : randomWord()
        }

        const startGame = async (channel) => {
            let word = randomWord()
            sendMessageToChannel(`Từ bắt đầu: **${word}**`, channel)
            await gameState.startGame(channel, word)
        }

        const checkDict = (word) => {
            return global.dicData.includes(word.toLowerCase())
        }

        // end function

        let guild = message.guild
        let channel = message.channel

        const guildConfig = config.getConfig(guild.id)
        if (guildConfig === undefined || guildConfig.channel === undefined) {
            // detect channel not config
            queryCount++
            return
        }
        let configChannel = guildConfig.channel

        // FIRST LOAD
        if (message.content.startsWith(PREFIX)) {
            let arg = message.content.trim().split(/\s+/).filter(Boolean)[1]
            console.log(`[${message.guild.name}][${message.channel.name}] ${message.author.displayName} used prefix command [${arg ? arg : 'no action'}]`)
            if (arg === 'set') {
                if (!message.member.permissionsIn(configChannel).has(PermissionsBitField.Flags.ManageGuild)) {
                    return message.reply({
                        content: 'Bạn cần có quyền `MANAGE_GUILD` để dùng lệnh này',
                        ephemeral: true
                    })
                } else {
                    await config.setChannel(message.guildId, message.channelId)
                    return message.reply({
                        content: `Bạn đã chọn kênh **${message.channel.name}** làm kênh nối từ của máy chủ **${message.guild.name}**. Dùng \`!start\` để bắt đầu trò chơi`,
                        ephemeral: true
                    })
                }
            }
        }

        if (message.channel.id !== configChannel) return

        if (!gameState.exists(configChannel)) {
            await gameState.initWordData(configChannel)
        }

        let isRunning = gameState.isRunning(configChannel)

        if (message.content === START_COMMAND) {
            if (!isRunning) {
                sendMessageToChannel(`Trò chơi đã bắt đầu!`, configChannel)
                await startGame(configChannel)
            } else sendMessageToChannel('Trò chơi vẫn đang tiếp tục. Bạn có thể dùng `!stop`', configChannel)
            return
        } else if (message.content === STOP_COMMAND) {

            if (isRunning) {
                sendMessageToChannel(`Đã kết thúc lượt này! Lượt mới đã bắt đầu!`, configChannel)
                await gameState.initWordData(configChannel)
                await stats.addRoundPlayedCount()
                await startGame(configChannel)
            } else sendMessageToChannel('Trò chơi chưa bắt đầu. Bạn có thể dùng `!start`', configChannel)
            return
        }

        if (!isRunning) {
            // check if game is running
            return
        }

        let currentWordData = gameState.getState(configChannel)
        let tu = message.content.trim().toLowerCase()
        let args1 = tu.split(/\s+/).filter(Boolean) // split fix for multiple space in word.
        tu = args1.join(' ') // remake word after split.
        let words_ = currentWordData.words

        // functions load after channel defined
        /**
         *
         * @param {String} word
         * @returns {Boolean}
         */
        const checkIfWordUsed = (word) => {
            for (let j = 0; j < words_.length; j++) {
                queryCount++
                if (words_[j] === word) {
                    return true
                }
            }
        }

        /**
         * Trả về danh sách các từ chưa dùng có thể nối tiếp `word`.
         * @param {String} word
         * @returns {String[]}
         */
        const findAnswersInDb = (word) => {
            let w = word.split(/ +/)
            let lc = w[w.length - 1]
            let answers = []
            for (let i = 0; i < global.dicData.length; i++) {
                queryCount++
                let temp = global.dicData[i]
                let tempw = temp.split(/ +/)
                if (tempw.length > 1 && tempw[0] === lc && temp !== word) {
                    if (checkIfWordUsed(temp)) {
                        continue
                    }
                    answers.push(temp)
                }
            }
            return answers
        }

        // end function

        if (!ranking.userExists(message.guildId, message.author.id)) {
            await ranking.initRankDataForUser(message.guildId, message.author.id, message.author.displayName, message.author.avatarURL())
        } else {
            await ranking.updateUserInfo(message.guildId, message.author.id, message.author.displayName, message.author.avatarURL())
        }

        // check if words have or more than 1 space
        if (!(args1.length == 2)) {
            return
        }

        if (words_.length > 0) {
            // player can't answer 2 times
            let lastPlayerId = currentWordData.currentPlayer.id
            if (message.author.id === lastPlayerId) {
                message.react(WRONG_EMOJI)
                sendAutoDeleteMessageToChannel('Bạn đã trả lời lượt trước rồi, hãy đợi đối thủ!', configChannel)
                return
            }
        }

        if (words_.length > 0) {
            const lastWord = words_[words_.length - 1]
            const args2 = lastWord.split(/\s+/).filter(Boolean)
            if (!(args1[0] === args2[args2.length - 1])) {
                message.react(WRONG_EMOJI)
                sendAutoDeleteMessageToChannel('Từ này không bắt đầu với tiếng `' + args2[args2.length - 1] + '`', configChannel)
                return
            }
        }

        if (checkIfWordUsed(tu)) {
            message.react(WRONG_EMOJI)
            sendAutoDeleteMessageToChannel('Từ này đã được sử dụng!', configChannel)
            return
        }

        if (!checkDict(tu)) {
            // check in dictionary
            message.react(WRONG_EMOJI)
            await ranking.updateRankingForUser(message.guildId, message.author.id, 0, 0, 1)
            return
        }

        await gameState.recordWord(configChannel, tu, message.author.id, message.author.displayName)

        message.react(CORRECT_EMOJI)

        await stats.addWordPlayedCount()

        await ranking.updateRankingForUser(message.guildId, message.author.id, 0, 1, 1)

        console.log(`[${message.guild.name}][${message.channel.name}][#${words_.length}] ${tu}`)

        const nextWords = findAnswersInDb(tu)

        if (nextWords.length === 0) {
            const reason = guildConfig.botMode === true ? 'Bot đã bí từ! ' : ''
            sendMessageToChannel(`${reason}${message.author.displayName} đã chiến thắng sau ${words_.length - 1} lượt! Lượt mới đã bắt đầu!`, configChannel)
            await ranking.updateRankingForUser(message.guildId, message.author.id, 1, 0, 0)
            await stats.addRoundPlayedCount()
            await gameState.initWordData(configChannel)
            await startGame(configChannel)
            return
        }

        // BOT MODE: bot tự nối tiếp từ của thành viên bằng 1 từ ngẫu nhiên
        if (guildConfig.botMode === true) {
            const nextWord = nextWords[Math.floor(Math.random() * nextWords.length)]
            await gameState.recordWord(configChannel, nextWord, client.user.id, client.user.username)
            await stats.addWordPlayedCount()

            const botChannel = client.channels.cache.get(configChannel)
            const botMsg = await botChannel.send({ content: `**${nextWord}**`, flags: [4096] })
            await botMsg.react(CORRECT_EMOJI)

            console.log(`[${message.guild.name}][${message.channel.name}][#${words_.length + 1}] (bot) ${nextWord}`)

            // bot vừa nối: nếu không còn từ nào nối tiếp được thì bot thắng, tự dừng và bắt đầu vòng mới
            const afterBotWords = findAnswersInDb(nextWord)
            if (afterBotWords.length === 0) {
                sendMessageToChannel(`Bot đã chiến thắng sau ${words_.length} lượt! Lượt mới đã bắt đầu!`, configChannel)
                await stats.addRoundPlayedCount()
                await gameState.initWordData(configChannel)
                await startGame(configChannel)
                return
            }
        }
    } catch (err) {
        console.error('[ERROR] messageCreate:', err)
    } finally {
        if (queryCount > 0) stats.addQuery(queryCount)
    }
})
// END LOGIC GAME

// The interactionCreate event directly here, as this is the heart of the robot.
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return
    const command = client.commands.get(interaction.commandName)
    if (!command) return

    // We log when a user makes a command
    try {
        await console.log(
            `[${interaction.guild.name}] ${interaction.user.username} used /${interaction.commandName}`
        )
        await command.execute(interaction, client)
        // But if there is a mistake,
        // then we log that and send an error message only to the person (ephemeral: true)
    } catch (error) {
        console.error(error)
        return interaction.reply({
            content: "An error occurred while executing this command!",
            ephemeral: true,
            fetchReply: true
        })
    }
})

// Nạp toàn bộ state từ Supabase vào RAM rồi mới đăng nhập.
async function bootstrap() {
    console.log('[WARNING] Khởi động: nạp dữ liệu từ Supabase...')
    await words.loadDictionary()
    await config.loadConfig()
    await gameState.loadGameStates()
    await ranking.loadRankings()
    await stats.load()
    await premium.loadPremium()
    console.log('[OK] Nạp dữ liệu hoàn tất. Đang đăng nhập Discord...')

    // flush query định kỳ (query tích trong RAM giữa các lần ghi)
    setInterval(() => {
        stats.flushQuery().catch(err => console.error('[ERROR] flushQuery:', err.message))
    }, 60 * 1000)

    await client.login(process.env.BOT_TOKEN)
}

// flush stats trước khi thoát để không mất query counter.
let shuttingDown = false
const gracefulShutdown = async (signal) => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`[WARNING] Nhận ${signal}, đang flush dữ liệu...`)
    try {
        await stats.flushQuery()
    } catch (err) {
        console.error('[ERROR] flush khi thoát:', err.message)
    }
    process.exit(0)
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))

bootstrap().catch(err => {
    console.error('[FATAL] Lỗi khởi động bot:', err)
    process.exit(1)
})
