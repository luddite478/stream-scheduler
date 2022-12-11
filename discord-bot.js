const { Client, GatewayIntentBits  } = require('discord.js')

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
})

const discord = {
    bot: null
}

client.on('ready', (c) => {
    console.log(`\n*** Logged in Discord as ${c.user.tag}`)
    discord.bot = c
})

function chunkSubstr(str, size) {
  const numChunks = Math.ceil(str.length / size)
  const chunks = new Array(numChunks)

  for (let i = 0, o = 0; i < numChunks; ++i, o += size) {
    chunks[i] = str.substr(o, size)
  }

  return chunks
}

const wrap_code = (text) => '```' + text + '```'

function discord_send(input_text) {

    if (!discord.bot) {
        return
    }
    
    const text_chunks = chunkSubstr(input_text, 1994)

    text_chunks.forEach(text => {
        discord.bot.channels.cache.get(process.env.DISCORD_CHANNEL_ID).send(wrap_code(text))
    })
}

client.login(process.env.DISCORD_TOKEN)

module.exports = {
    discord_send
}