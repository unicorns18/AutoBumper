const { Client } = require('discord.js-selfbot-v13');
const client = new Client({
  checkUpdate: false,
});

// Configuration
const TOKEN = 'NzYzNzkyMDUyNTU4NjI2ODM2.GwTHas.SicmBAoi0eFOpOBbbSO0kmney54eMiaIHN0ua0';
const TARGET_SERVER_ID = '1340995921332273255';
const TARGET_CHANNEL_ID = '1341675216635559964';
const AUTHORIZED_USER_ID = '686107711829704725';

// Debug mode - if DEBUG environment variable is set to 1, use 1 minute interval
const DEBUG_MODE = process.env.DEBUG === '1';
const DEFAULT_BUMP_INTERVAL_MS = DEBUG_MODE ? 60 * 1000 : 10 * 60 * 1000; // 1 or 10 minutes

// State tracking
let bumpChannel = null;
let bumpTimer = null;
let isBumpEnabled = false;
let nextBumpTime = null;
let bumpState = {
  lastBumpTime: null,
  nextBumpTime: null,
  bumpCount: 0,
  successCount: 0,
  failureCount: 0,
  waitTimes: [] // Track wait times to optimize timing
};

// Function to calculate optimal bump interval based on past wait times
function calculateOptimalBumpInterval() {
  if (bumpState.waitTimes.length === 0) {
    return DEFAULT_BUMP_INTERVAL_MS;
  }
  
  // If we have wait times, use the average plus a small buffer (10 seconds)
  const sum = bumpState.waitTimes.reduce((a, b) => a + b, 0);
  const average = sum / bumpState.waitTimes.length;
  return Math.max(average + 10000, 60000); // At least 1 minute, average + 10 seconds
}

// Function to send the /bump command
async function sendBumpCommand() {
  if (!bumpChannel || !isBumpEnabled) return;
  
  // Check if we're trying to bump too early based on tracked next bump time
  const now = Date.now();
  if (bumpState.nextBumpTime && now < bumpState.nextBumpTime) {
    const waitTimeMs = bumpState.nextBumpTime - now;
    const waitTimeMin = Math.ceil(waitTimeMs / 60000);
    console.log(`Cannot bump yet. Need to wait approximately ${waitTimeMin} more minutes.`);
    
    // Reschedule the bump for when it's available
    if (bumpTimer) {
      clearTimeout(bumpTimer);
    }
    console.log(`Rescheduling bump for ${new Date(bumpState.nextBumpTime).toLocaleTimeString()}`);
    bumpTimer = setTimeout(sendBumpCommand, waitTimeMs + 1000); // Add 1 second buffer
    return;
  }
  
  try {
    console.log(`Sending /bump command in channel ${bumpChannel.name}...`);
    await bumpChannel.sendSlash('302050872383242240', 'bump');
    console.log('Bump command sent successfully');
    
    // Update state
    bumpState.lastBumpTime = now;
    bumpState.bumpCount++;
  } catch (error) {
    console.error('Error sending bump command:', error);
  }
}

// Function to start the auto-bumping
function startAutoBump() {
  if (bumpTimer) {
    clearTimeout(bumpTimer);
  }
  
  isBumpEnabled = true;
  const intervalMs = DEBUG_MODE ? DEFAULT_BUMP_INTERVAL_MS : calculateOptimalBumpInterval();
  console.log(`Starting auto-bump with ${intervalMs / 60000} minute interval${DEBUG_MODE ? ' (DEBUG MODE)' : ''}`);
  
  // Send the first bump immediately
  sendBumpCommand();
  
  // We'll set the next timer in the message handler after we get a response
  // This allows us to adapt to the actual wait time required
}

// Function to stop the auto-bumping
function stopAutoBump() {
  if (bumpTimer) {
    clearTimeout(bumpTimer);
    bumpTimer = null;
  }
  
  isBumpEnabled = false;
  console.log('Auto-bump stopped');
  
  // Save state to console for debugging
  console.log('Bump session stats:');
  console.log(`- Total bumps attempted: ${bumpState.bumpCount}`);
  console.log(`- Successful bumps: ${bumpState.successCount}`);
  console.log(`- Failed bumps: ${bumpState.failureCount}`);
  if (bumpState.waitTimes.length > 0) {
    const avgWaitTime = bumpState.waitTimes.reduce((a, b) => a + b, 0) / bumpState.waitTimes.length;
    console.log(`- Average wait time: ${avgWaitTime / 60000} minutes`);
  }
}

// Function to extract wait time from Disboard response
function extractWaitTime(description) {
  if (!description) return null;
  
  // Try to extract wait time from "Please wait another X minutes" message
  const waitRegex = /wait another (\d+) minute/i;
  const match = description.match(waitRegex);
  
  if (match && match[1]) {
    const minutes = parseInt(match[1], 10);
    return minutes * 60 * 1000; // Convert to milliseconds
  }
  
  return null;
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
    await message.reply('Available commands: !ping, !startbump, !stopbump, !bumpstatus, !bumpstats, !resetstats');
  } else if (message.content === '!startbump') {
    startAutoBump();
    const intervalText = DEBUG_MODE ? '1 minute (DEBUG MODE)' : 'optimized intervals';
    await message.reply(`Auto-bump started. Will send /bump every ${intervalText}.`);
  } else if (message.content === '!stopbump') {
    stopAutoBump();
    await message.reply('Auto-bump stopped.');
  } else if (message.content === '!bumpstatus') {
    const status = isBumpEnabled ? 'enabled' : 'disabled';
    let reply = `Auto-bump is currently ${status}.`;
    
    if (isBumpEnabled && bumpState.nextBumpTime) {
      const now = Date.now();
      const timeUntilNextBump = bumpState.nextBumpTime - now;
      
      if (timeUntilNextBump > 0) {
        const minutesUntilNextBump = Math.ceil(timeUntilNextBump / 60000);
        reply += `\nNext bump scheduled in approximately ${minutesUntilNextBump} minutes (${new Date(bumpState.nextBumpTime).toLocaleTimeString()}).`;
      } else {
        reply += '\nNext bump will be sent soon.';
      }
    }
    
    await message.reply(reply);
  } else if (message.content === '!bumpstats') {
    // Generate statistics about bumping
    let statsMessage = '**Bump Statistics**\n';
    statsMessage += `- Total bumps attempted: ${bumpState.bumpCount}\n`;
    statsMessage += `- Successful bumps: ${bumpState.successCount}\n`;
    statsMessage += `- Failed bumps: ${bumpState.failureCount}\n`;
    
    if (bumpState.lastBumpTime) {
      statsMessage += `- Last bump attempt: ${new Date(bumpState.lastBumpTime).toLocaleString()}\n`;
    }
    
    if (bumpState.nextBumpTime) {
      statsMessage += `- Next scheduled bump: ${new Date(bumpState.nextBumpTime).toLocaleString()}\n`;
    }
    
    if (bumpState.waitTimes.length > 0) {
      const avgWaitTime = bumpState.waitTimes.reduce((a, b) => a + b, 0) / bumpState.waitTimes.length;
      statsMessage += `- Average wait time: ${(avgWaitTime / 60000).toFixed(1)} minutes\n`;
    }
    
    statsMessage += `- Debug mode: ${DEBUG_MODE ? 'ON' : 'OFF'}`;
    
    await message.reply(statsMessage);
  } else if (message.content === '!resetstats') {
    // Reset the bump statistics
    bumpState = {
      lastBumpTime: null,
      nextBumpTime: null,
      bumpCount: 0,
      successCount: 0,
      failureCount: 0,
      waitTimes: []
    };
    
    await message.reply('Bump statistics have been reset.');
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
    
    // Process the response to update our state tracking
    if (embed.description) {
      const now = Date.now();
      
      // Check for success message
      if (embed.description.includes('Bump done!') || embed.description.includes(':thumbsup:')) {
        console.log('Bump was successful!');
        bumpState.successCount++;
        
        // In normal operation, we'd wait the standard 2 hours (7200000 ms)
        // In debug mode, we'll use a shorter interval
        const waitTime = DEBUG_MODE ? DEFAULT_BUMP_INTERVAL_MS : 2 * 60 * 60 * 1000;
        bumpState.nextBumpTime = now + waitTime;
        
        // Schedule the next bump
        if (isBumpEnabled) {
          if (bumpTimer) {
            clearTimeout(bumpTimer);
          }
          console.log(`Next bump scheduled for ${new Date(bumpState.nextBumpTime).toLocaleTimeString()}`);
          bumpTimer = setTimeout(sendBumpCommand, waitTime);
        }
      } 
      // Check for wait message
      else if (embed.description.includes('Please wait another')) {
        console.log('Bump failed - need to wait longer');
        bumpState.failureCount++;
        
        // Extract the wait time from the message
        const waitTimeMs = extractWaitTime(embed.description);
        if (waitTimeMs) {
          console.log(`Extracted wait time: ${waitTimeMs / 60000} minutes`);
          
          // Add to our tracking for optimization
          bumpState.waitTimes.push(waitTimeMs);
          
          // Set the next bump time
          bumpState.nextBumpTime = now + waitTimeMs;
          
          // Schedule the next bump
          if (isBumpEnabled) {
            if (bumpTimer) {
              clearTimeout(bumpTimer);
            }
            console.log(`Next bump scheduled for ${new Date(bumpState.nextBumpTime).toLocaleTimeString()}`);
            bumpTimer = setTimeout(sendBumpCommand, waitTimeMs + 1000); // Add 1 second buffer
          }
        } else {
          // If we couldn't extract the time, use a default
          const defaultWaitTime = DEBUG_MODE ? 60 * 1000 : 10 * 60 * 1000;
          console.log(`Could not extract wait time, using default: ${defaultWaitTime / 60000} minutes`);
          
          if (isBumpEnabled) {
            if (bumpTimer) {
              clearTimeout(bumpTimer);
            }
            bumpTimer = setTimeout(sendBumpCommand, defaultWaitTime);
          }
        }
      }
    }
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