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
    console.log(`\n***Logged in Discord as ${c.user.tag}`)
    discord.bot = c
})

function discord_send(text) {
    
    if (!discord.bot) {
        return
    }

    discord.bot.channels.cache.get(process.env.DISCORD_CHANNEL_ID).send(text)
}

client.login(process.env.DISCORD_TOKEN)

module.exports = {
    discord_send
}