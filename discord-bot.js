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

function discord_send(text) {

    if (!discord.bot) {
        return
    }
    
    const text_chunks = chunkSubstr(text, 4000)

    text_chunks.forEach(t => {
        discord.bot.channels.cache.get(process.env.DISCORD_CHANNEL_ID).send(t)
    })
}

client.login(process.env.DISCORD_TOKEN)

module.exports = {
    discord_send
}