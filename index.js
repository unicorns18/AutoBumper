const { Client } = require('discord.js-selfbot-v13');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const client = new Client({
  checkUpdate: false,
});

// Configuration
const TOKEN = 'NzYzNzkyMDUyNTU4NjI2ODM2.GwTHas.SicmBAoi0eFOpOBbbSO0kmney54eMiaIHN0ua0';
const TARGET_SERVER_ID = '1340995921332273255';
const TARGET_CHANNEL_ID = '1341675216635559964';
const AUTHORIZED_USER_ID = '686107711829704725';
const STATE_FILE_PATH = path.join(__dirname, 'bump_state.json');

// Debug mode - if DEBUG environment variable is set to 1, use 1 minute interval
const DEBUG_MODE = process.env.DEBUG === '1';
const DEFAULT_BUMP_INTERVAL_MS = DEBUG_MODE ? 60 * 1000 : 10 * 60 * 1000; // 1 or 10 minutes

// State tracking
let bumpChannel = null;
let bumpTimer = null;
let isBumpEnabled = false;
let nextBumpTime = null;

// Default state
let bumpState = {
  lastBumpTime: null,
  nextBumpTime: null,
  bumpCount: 0,
  successCount: 0,
  failureCount: 0,
  waitTimes: [], // Track wait times to optimize timing
  lastSaved: Date.now()
};

// Function to load state from file
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      const data = fs.readFileSync(STATE_FILE_PATH, 'utf8');
      const loadedState = JSON.parse(data);
      logger.state('Loaded state from file', { path: STATE_FILE_PATH });
      
      // Merge loaded state with default state to ensure all properties exist
      bumpState = { ...bumpState, ...loadedState };
      
      // If we have a next bump time in the future, schedule it
      if (bumpState.nextBumpTime && bumpState.nextBumpTime > Date.now()) {
        nextBumpTime = bumpState.nextBumpTime;
        const nextTime = new Date(nextBumpTime).toLocaleTimeString();
        logger.state(`Restored scheduled bump time: ${nextTime}`, { nextBumpTime });
      }
      
      return true;
    }
  } catch (error) {
    logger.error('Error loading state', { error: error.message, stack: error.stack });
  }
  return false;
}

// Function to save state to file
function saveState() {
  try {
    bumpState.lastSaved = Date.now();
    const data = JSON.stringify(bumpState, null, 2);
    fs.writeFileSync(STATE_FILE_PATH, data);
    logger.state('State saved to file', { path: STATE_FILE_PATH });
    return true;
  } catch (error) {
    logger.error('Error saving state', { error: error.message, stack: error.stack });
    return false;
  }
}

// Load state on startup
loadState();

// Function to generate a random time offset (between 3 and 20 minutes)
function getRandomTimeOffset() {
  // Random minutes between 3 and 20
  const minOffset = 3;
  const maxOffset = 20;
  const randomMinutes = Math.floor(Math.random() * (maxOffset - minOffset + 1)) + minOffset;
  return randomMinutes * 60 * 1000; // Convert to milliseconds
}

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
  if (!bumpChannel || !isBumpEnabled) {
    logger.debug('Bump command not sent - channel not available or bumping disabled');
    return;
  }
  
  // Check if we're trying to bump too early based on tracked next bump time
  const now = Date.now();
  if (bumpState.nextBumpTime && now < bumpState.nextBumpTime && !DEBUG_MODE) {
    // In normal mode, respect the next bump time
    const waitTimeMs = bumpState.nextBumpTime - now;
    const waitTimeMin = Math.ceil(waitTimeMs / 60000);
    logger.bump(`Cannot bump yet. Need to wait approximately ${waitTimeMin} more minutes.`, { waitTimeMin });
    
    // Reschedule the bump for when it's available
    if (bumpTimer) {
      clearTimeout(bumpTimer);
    }
    
    const nextTime = new Date(bumpState.nextBumpTime).toLocaleTimeString();
    logger.bump(`Rescheduling bump for ${nextTime}`, { nextBumpTime: bumpState.nextBumpTime });
    bumpTimer = setTimeout(sendBumpCommand, waitTimeMs + 1000); // Add 1 second buffer
    return;
  } else if (DEBUG_MODE && bumpState.nextBumpTime && now < bumpState.nextBumpTime) {
    // In debug mode, we'll override and bump anyway
    const nextTime = new Date(bumpState.nextBumpTime).toLocaleTimeString();
    logger.bump(`DEBUG MODE: Overriding next bump time check. Would normally wait until ${nextTime}`, 
      { debugMode: true, nextBumpTime: bumpState.nextBumpTime });
  }
  
  try {
    logger.bump(`Sending /bump command in channel ${bumpChannel.name}...`, { channelId: bumpChannel.id });
    await bumpChannel.sendSlash('302050872383242240', 'bump');
    logger.bump('Bump command sent successfully');
    
    // Update state
    bumpState.lastBumpTime = now;
    bumpState.bumpCount++;
    
    // Save state after updating
    saveState();
  } catch (error) {
    logger.error('Error sending bump command', { error: error.message, stack: error.stack });
  }
}

// Function to start the auto-bumping
function startAutoBump() {
  if (bumpTimer) {
    clearTimeout(bumpTimer);
  }
  
  isBumpEnabled = true;
  const intervalMs = DEBUG_MODE ? DEFAULT_BUMP_INTERVAL_MS : calculateOptimalBumpInterval();
  logger.info(`Starting auto-bump with ${intervalMs / 60000} minute interval${DEBUG_MODE ? ' (DEBUG MODE)' : ''}`, 
    { intervalMinutes: intervalMs / 60000, debugMode: DEBUG_MODE });
  
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
  logger.info('Auto-bump stopped');
  
  // Log bump session stats
  let statsObj = {
    bumpCount: bumpState.bumpCount,
    successCount: bumpState.successCount,
    failureCount: bumpState.failureCount
  };
  
  if (bumpState.waitTimes.length > 0) {
    const avgWaitTime = bumpState.waitTimes.reduce((a, b) => a + b, 0) / bumpState.waitTimes.length;
    statsObj.avgWaitTimeMinutes = avgWaitTime / 60000;
    logger.info('Bump session stats', statsObj);
  } else {
    logger.info('Bump session stats', statsObj);
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
  logger.info(`Logged in as ${client.user.tag}!`, { username: client.user.tag });
  logger.info(`Watching channel ${TARGET_CHANNEL_ID} in server ${TARGET_SERVER_ID}`, 
    { channelId: TARGET_CHANNEL_ID, serverId: TARGET_SERVER_ID });
  logger.info(`Only responding to user ${AUTHORIZED_USER_ID}`, { authorizedUserId: AUTHORIZED_USER_ID });
  
  // Get the channel for bumping
  const guild = client.guilds.cache.get(TARGET_SERVER_ID);
  if (guild) {
    bumpChannel = guild.channels.cache.get(TARGET_CHANNEL_ID);
    if (bumpChannel) {
      logger.info(`Bump channel set to #${bumpChannel.name}`, { channelName: bumpChannel.name, channelId: bumpChannel.id });
    } else {
      logger.error(`Could not find channel with ID ${TARGET_CHANNEL_ID}`, { channelId: TARGET_CHANNEL_ID });
    }
  } else {
    logger.error(`Could not find server with ID ${TARGET_SERVER_ID}`, { serverId: TARGET_SERVER_ID });
  }
});

client.on('messageCreate', async (message) => {
  // Check if the message is from the target channel
  if (message.channel.id !== TARGET_CHANNEL_ID) return;
  
  // Check if the message is from the authorized user
  if (message.author.id !== AUTHORIZED_USER_ID) return;
  
  // Handle commands
  if (message.content === '!ping') {
    logger.info(`Responding to ping from ${message.author.tag}`, { user: message.author.tag, command: 'ping' });
    await message.reply('pong');
  } else if (message.content === '!help') {
    logger.info(`Responding to help request from ${message.author.tag}`, { user: message.author.tag, command: 'help' });
    await message.reply('Available commands: !ping, !startbump, !stopbump, !bumpstatus, !bumpstats, !resetstats');
  } else if (message.content === '!startbump') {
    logger.info(`Starting auto-bump for ${message.author.tag}`, { user: message.author.tag, command: 'startbump' });
    startAutoBump();
    const intervalText = DEBUG_MODE ? '1 minute (DEBUG MODE)' : 'optimized intervals';
    await message.reply(`Auto-bump started. Will send /bump every ${intervalText}.`);
  } else if (message.content === '!stopbump') {
    logger.info(`Stopping auto-bump for ${message.author.tag}`, { user: message.author.tag, command: 'stopbump' });
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
    
    logger.info(`Status request from ${message.author.tag}`, { 
      user: message.author.tag, 
      command: 'bumpstatus',
      status: isBumpEnabled ? 'enabled' : 'disabled',
      nextBumpTime: bumpState.nextBumpTime
    });
    
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
      const now = Date.now();
      const timeUntilNextBump = bumpState.nextBumpTime - now;
      
      if (timeUntilNextBump > 0) {
        const minutesUntilNextBump = Math.ceil(timeUntilNextBump / 60000);
        statsMessage += `- Next scheduled bump: ${new Date(bumpState.nextBumpTime).toLocaleString()} (in ${minutesUntilNextBump} minutes)\n`;
      } else {
        statsMessage += `- Next scheduled bump: ${new Date(bumpState.nextBumpTime).toLocaleString()} (due now)\n`;
      }
    }
    
    if (bumpState.waitTimes.length > 0) {
      const avgWaitTime = bumpState.waitTimes.reduce((a, b) => a + b, 0) / bumpState.waitTimes.length;
      statsMessage += `- Average wait time: ${(avgWaitTime / 60000).toFixed(1)} minutes\n`;
    }
    
    // Add information about randomization
    if (!DEBUG_MODE) {
      const minOffset = 3;
      const maxOffset = 20;
      statsMessage += `- Human-like randomization: +${minOffset} to +${maxOffset} minutes added to each schedule\n`;
    }
    
    statsMessage += `- Debug mode: ${DEBUG_MODE ? 'ON' : 'OFF'}`;
    
    logger.info(`Stats request from ${message.author.tag}`, { 
      user: message.author.tag, 
      command: 'bumpstats',
      stats: {
        bumpCount: bumpState.bumpCount,
        successCount: bumpState.successCount,
        failureCount: bumpState.failureCount,
        avgWaitTime: bumpState.waitTimes.length > 0 ? 
          (bumpState.waitTimes.reduce((a, b) => a + b, 0) / bumpState.waitTimes.length / 60000).toFixed(1) : null
      }
    });
    
    await message.reply(statsMessage);
  } else if (message.content === '!resetstats') {
    logger.info(`Stats reset by ${message.author.tag}`, { user: message.author.tag, command: 'resetstats' });
    
    // Reset the bump statistics
    bumpState = {
      lastBumpTime: null,
      nextBumpTime: null,
      bumpCount: 0,
      successCount: 0,
      failureCount: 0,
      waitTimes: [],
      lastSaved: Date.now()
    };
    
    // Save the reset state
    saveState();
    
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
    
    // Log the bump response
    const embedData = {
      title: embed.title || '',
      description: embed.description || ''
    };
    
    logger.bump('Received bump response from Disboard', embedData);
    
    // Process the response to update our state tracking
    if (embed.description) {
      const now = Date.now();
      
      // Check for success message
      if (embed.description.includes('Bump done!') || embed.description.includes(':thumbsup:')) {
        logger.bump('Bump was successful!', { success: true });
        bumpState.successCount++;
        
        // In normal operation, we'd wait the standard 2 hours (7200000 ms)
        // In debug mode, we'll use a shorter interval
        const standardWaitTime = 2 * 60 * 60 * 1000; // 2 hours
        
        // Add randomization to appear more human-like (except in debug mode)
        const randomOffset = DEBUG_MODE ? 0 : getRandomTimeOffset();
        const waitTime = DEBUG_MODE ? DEFAULT_BUMP_INTERVAL_MS : (standardWaitTime + randomOffset);
        bumpState.nextBumpTime = now + waitTime;
        
        // Save state after updating
        saveState();
        
        // Schedule the next bump
        if (isBumpEnabled) {
          if (bumpTimer) {
            clearTimeout(bumpTimer);
          }
          
          if (DEBUG_MODE) {
            logger.bump(`DEBUG MODE: Using ${DEFAULT_BUMP_INTERVAL_MS / 60000} minute interval instead of standard ${standardWaitTime / 60000 / 60} hour cooldown`, 
              { debugMode: true, intervalMinutes: DEFAULT_BUMP_INTERVAL_MS / 60000 });
          } else if (randomOffset > 0) {
            const randomMinutes = Math.round(randomOffset / 60000);
            logger.bump(`Added random offset of +${randomMinutes} minutes to appear more human-like`, 
              { randomOffsetMinutes: randomMinutes });
          }
          
          const nextTime = new Date(bumpState.nextBumpTime).toLocaleTimeString();
          logger.bump(`Next bump scheduled for ${nextTime}`, { nextBumpTime: bumpState.nextBumpTime });
          bumpTimer = setTimeout(sendBumpCommand, waitTime);
        }
      } 
      // Check for wait message
      else if (embed.description.includes('Please wait another')) {
        logger.bump('Bump failed - need to wait longer', { success: false });
        bumpState.failureCount++;
        
        // Extract the wait time from the message
        const waitTimeMs = extractWaitTime(embed.description);
        if (waitTimeMs) {
          logger.bump(`Extracted wait time: ${waitTimeMs / 60000} minutes`, { waitTimeMinutes: waitTimeMs / 60000 });
          
          // Add to our tracking for optimization
          bumpState.waitTimes.push(waitTimeMs);
          
          // In debug mode, override the wait time to use the debug interval
          // In normal mode, add random offset to appear more human-like
          const randomOffset = DEBUG_MODE ? 0 : getRandomTimeOffset();
          const actualWaitTime = DEBUG_MODE ? DEFAULT_BUMP_INTERVAL_MS : (waitTimeMs + randomOffset);
          
          // Set the next bump time
          bumpState.nextBumpTime = now + actualWaitTime;
          
          // Save state after updating
          saveState();
          
          // Schedule the next bump
          if (isBumpEnabled) {
            if (bumpTimer) {
              clearTimeout(bumpTimer);
            }
            
            if (DEBUG_MODE) {
              logger.bump(`DEBUG MODE: Overriding wait time to ${DEFAULT_BUMP_INTERVAL_MS / 60000} minutes instead of ${waitTimeMs / 60000} minutes`, 
                { debugMode: true, originalWaitMinutes: waitTimeMs / 60000, overrideWaitMinutes: DEFAULT_BUMP_INTERVAL_MS / 60000 });
            } else if (randomOffset > 0) {
              const randomMinutes = Math.round(randomOffset / 60000);
              logger.bump(`Added random offset of +${randomMinutes} minutes to appear more human-like`, 
                { randomOffsetMinutes: randomMinutes });
            }
            
            const nextTime = new Date(bumpState.nextBumpTime).toLocaleTimeString();
            logger.bump(`Next bump scheduled for ${nextTime}`, { nextBumpTime: bumpState.nextBumpTime });
            bumpTimer = setTimeout(sendBumpCommand, actualWaitTime + 1000); // Add 1 second buffer
          }
        } else {
          // If we couldn't extract the time, use a default
          const defaultWaitTime = DEBUG_MODE ? 60 * 1000 : 10 * 60 * 1000;
          logger.warn(`Could not extract wait time, using default: ${defaultWaitTime / 60000} minutes`, 
            { defaultWaitMinutes: defaultWaitTime / 60000 });
          
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
  logger.error('Discord client error', { error: error.message, stack: error.stack });
});

// Set up auto-save of state every 5 minutes
setInterval(saveState, 5 * 60 * 1000);

// Login to Discord
logger.info('Starting Discord selfbot...');
client.login(TOKEN).catch(error => {
  logger.error('Failed to login', { error: error.message, stack: error.stack });
});