const { Client } = require('discord.js-selfbot-v13');
const client = new Client({
  checkUpdate: false,
});

// Configuration
const TOKEN = 'NzYzNzkyMDUyNTU4NjI2ODM2.GwTHas.SicmBAoi0eFOpOBbbSO0kmney54eMiaIHN0ua0';
const TARGET_SERVER_ID = '1340995921332273255';
const TARGET_CHANNEL_ID = '1341675216635559964';
const AUTHORIZED_USER_ID = '686107711829704725';
const BUMP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes in milliseconds
let bumpChannel = null;
let bumpTimer = null;
let isBumpEnabled = false;

// Function to send the /bump command
async function sendBumpCommand() {
  if (!bumpChannel || !isBumpEnabled) return;
  
  try {
    console.log(`Sending /bump command in channel ${bumpChannel.name}...`);
    await bumpChannel.sendSlash('302050872383242240', 'bump');
    console.log('Bump command sent successfully');
  } catch (error) {
    console.error('Error sending bump command:', error);
  }
}

// Function to start the auto-bumping
function startAutoBump() {
  if (bumpTimer) {
    clearInterval(bumpTimer);
  }
  
  isBumpEnabled = true;
  console.log(`Starting auto-bump every ${BUMP_INTERVAL_MS / 60000} minutes`);
  
  // Send the first bump immediately
  sendBumpCommand();
  
  // Set up the interval for subsequent bumps
  bumpTimer = setInterval(sendBumpCommand, BUMP_INTERVAL_MS);
}

// Function to stop the auto-bumping
function stopAutoBump() {
  if (bumpTimer) {
    clearInterval(bumpTimer);
    bumpTimer = null;
  }
  
  isBumpEnabled = false;
  console.log('Auto-bump stopped');
}

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  console.log(`Watching channel ${TARGET_CHANNEL_ID} in server ${TARGET_SERVER_ID}`);
  console.log(`Only responding to user ${AUTHORIZED_USER_ID}`);
  
  // Get the channel for bumping
  const guild = client.guilds.cache.get(TARGET_SERVER_ID);
  if (guild) {
    bumpChannel = guild.channels.cache.get(TARGET_CHANNEL_ID);
    if (bumpChannel) {
      console.log(`Bump channel set to #${bumpChannel.name}`);
    } else {
      console.error(`Could not find channel with ID ${TARGET_CHANNEL_ID}`);
    }
  } else {
    console.error(`Could not find server with ID ${TARGET_SERVER_ID}`);
  }
});

client.on('messageCreate', async (message) => {
  // Check if the message is from the target channel
  if (message.channel.id !== TARGET_CHANNEL_ID) return;
  
  // Check if the message is from the authorized user
  if (message.author.id !== AUTHORIZED_USER_ID) return;
  
  // Handle commands
  if (message.content === '!ping') {
    console.log(`Responding to ping from ${message.author.tag}`);
    await message.reply('pong');
  } else if (message.content === '!help') {
    console.log(`Responding to help request from ${message.author.tag}`);
    await message.reply('Available commands: !ping, !startbump, !stopbump, !bumpstatus');
  } else if (message.content === '!startbump') {
    startAutoBump();
    await message.reply('Auto-bump started. Will send /bump every 10 minutes.');
  } else if (message.content === '!stopbump') {
    stopAutoBump();
    await message.reply('Auto-bump stopped.');
  } else if (message.content === '!bumpstatus') {
    const status = isBumpEnabled ? 'enabled' : 'disabled';
    await message.reply(`Auto-bump is currently ${status}.`);
  }
});

// Listen for messages from the Disboard bot to extract embed information
client.on('messageCreate', async (message) => {
  // Check if the message is in the target channel
  if (message.channel.id !== TARGET_CHANNEL_ID) return;
  
  // Check if the message is from Disboard bot (ID: 302050872383242240)
  if (message.author.id !== '302050872383242240') return;
  
  // Check if the message has embeds (response to /bump command)
  if (message.embeds && message.embeds.length > 0) {
    const embed = message.embeds[0];
    console.log('\n=== Bump Response ===');
    
    if (embed.title) {
      console.log(`Title: ${embed.title}`);
    }
    
    if (embed.description) {
      console.log(`Description: ${embed.description}`);
    }
    
    console.log('====================\n');
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