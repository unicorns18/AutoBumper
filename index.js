const { Client } = require('discord.js-selfbot-v13');
const client = new Client({
  checkUpdate: false,
});

// Configuration
const TOKEN = 'NzYzNzkyMDUyNTU4NjI2ODM2.GwTHas.SicmBAoi0eFOpOBbbSO0kmney54eMiaIHN0ua0';
const TARGET_SERVER_ID = '1340995921332273255';
const TARGET_CHANNEL_ID = '1341675216635559964';
const AUTHORIZED_USER_ID = '686107711829704725';

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  console.log(`Watching channel ${TARGET_CHANNEL_ID} in server ${TARGET_SERVER_ID}`);
  console.log(`Only responding to user ${AUTHORIZED_USER_ID}`);
});

client.on('messageCreate', async (message) => {
  // Check if the message is from the target channel
  if (message.channel.id !== TARGET_CHANNEL_ID) return;
  
  // Check if the message is from the authorized user
  if (message.author.id !== AUTHORIZED_USER_ID) return;
  
  // Check if the message content is "!ping"
  if (message.content === '!ping') {
    console.log(`Responding to ping from ${message.author.tag}`);
    await message.reply('pong');
  } else if (message.content === '!help') {
    console.log(`Responding to help request from ${message.author.tag}`);
    await message.reply('Available commands: !ping');
  }
});

// Handle errors
client.on('error', (error) => {
  console.error('Discord client error:', error);
});

// Login to Discord
client.login(TOKEN).catch(error => {
  console.error('Failed to login:', error);
});

console.log('Starting Discord selfbot...');