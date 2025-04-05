const { Client } = require('discord.js-selfbot-v13');
const fs = require('fs');
const path = require('path');
const logger = require('./custom-logger');

const CONFIG_FILE_PATH = path.join(__dirname, 'config.json');
const CONFIG_TEMPLATE_PATH = path.join(__dirname, 'config.template.json');
const STATE_FILE_PATH = path.join(__dirname, 'bump_state.json');

if (!fs.existsSync(CONFIG_FILE_PATH)) {
  try {
    if (fs.existsSync(CONFIG_TEMPLATE_PATH)) {
      fs.copyFileSync(CONFIG_TEMPLATE_PATH, CONFIG_FILE_PATH);
    } else {
      const defaultConfig = {
        "token": "YOUR_DISCORD_TOKEN_HERE",
        "targetServerId": "YOUR_SERVER_ID_HERE",
        "targetChannelId": "YOUR_CHANNEL_ID_HERE",
        "authorizedUserId": "YOUR_USER_ID_HERE",
        "debug": false,
        "logging": {
          "level": "info",
          "directory": "logs"
        }
      };
      fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(defaultConfig, null, 2));
    }
    
    console.log('\n\x1b[33m[!] Configuration file not found!\x1b[0m');
    console.log('\x1b[32m[+] A new config.json file has been created\x1b[0m');
    console.log('\x1b[36m[*] Please edit the config.json file with your Discord token and other settings\x1b[0m');
    console.log('\x1b[36m[*] Then restart the bot\x1b[0m\n');
    process.exit(0);
  } catch (error) {
    console.error('\x1b[31m[!] Error creating config file:', error.message, '\x1b[0m');
    process.exit(1);
  }
}

let config;
try {
  const configData = fs.readFileSync(CONFIG_FILE_PATH, 'utf8');
  config = JSON.parse(configData);  
  const requiredFields = ['token', 'targetServerId', 'targetChannelId', 'authorizedUserId'];
  const missingFields = requiredFields.filter(field => !config[field] || config[field] === `YOUR_${field.toUpperCase()}_HERE`);
  if (missingFields.length > 0) {
    console.log('\n\x1b[31m[!] Configuration file is incomplete!\x1b[0m');
    console.log(`\x1b[33m[-] Missing or invalid fields: ${missingFields.join(', ')}\x1b[0m`);
    console.log('\x1b[36m[*] Please edit the config.json file with the required information\x1b[0m');
    console.log('\x1b[36m[*] Then restart the bot\x1b[0m\n');
    process.exit(1);
  }
} catch (error) {
  console.error('\x1b[31m[!] Error reading config file:', error.message, '\x1b[0m');
  process.exit(1);
}

const client = new Client({
  checkUpdate: false,
});

const TOKEN = config.token;
const TARGET_SERVER_ID = config.targetServerId;
const TARGET_CHANNEL_ID = config.targetChannelId;
const AUTHORIZED_USER_ID = config.authorizedUserId;

const DEBUG_MODE = config.debug === true || process.env.DEBUG === '1';
const DEFAULT_BUMP_INTERVAL_MS = DEBUG_MODE ? 60 * 1000 : 10 * 60 * 1000;

if (config.logging && config.logging.level) process.env.LOG_LEVEL = config.logging.level;

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
  waitTimes: [],
  lastSaved: Date.now()
};

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      const data = fs.readFileSync(STATE_FILE_PATH, 'utf8');
      const loadedState = JSON.parse(data);
      logger.success('Loaded state from file', { path: STATE_FILE_PATH });
      bumpState = { ...bumpState, ...loadedState };
      if (bumpState.nextBumpTime && bumpState.nextBumpTime > Date.now()) {
        nextBumpTime = bumpState.nextBumpTime;
        const nextTime = new Date(nextBumpTime).toLocaleTimeString();
        logger.info(`Restored scheduled bump time: ${nextTime}`, { nextBumpTime });
      }      
      return true;
    }
  } catch (error) {
    logger.error('Error loading state', { error: error.message, stack: error.stack });
  }
  return false;
}

function saveState() {
  try {
    bumpState.lastSaved = Date.now();
    const data = JSON.stringify(bumpState, null, 2);
    fs.writeFileSync(STATE_FILE_PATH, data);
    logger.debug('State saved to file', { path: STATE_FILE_PATH });
    return true;
  } catch (error) {
    logger.error('Error saving state', { error: error.message, stack: error.stack });
    return false;
  }
}

loadState();

function getRandomTimeOffset() {
  const minOffset = 3;
  const maxOffset = 20;
  const randomMinutes = Math.floor(Math.random() * (maxOffset - minOffset + 1)) + minOffset;
  return randomMinutes * 60 * 1000;
}

function calculateOptimalBumpInterval() {
  if (bumpState.waitTimes.length === 0) return DEFAULT_BUMP_INTERVAL_MS;
  const sum = bumpState.waitTimes.reduce((a, b) => a + b, 0);
  const average = sum / bumpState.waitTimes.length;
  return Math.max(average + 10000, 60000);
}

async function sendBumpCommand() {
  if (!bumpChannel || !isBumpEnabled) {
    logger.debug('Bump command not sent - channel not available or bumping disabled');
    return;
  }
  const now = Date.now();
  if (bumpState.nextBumpTime && now < bumpState.nextBumpTime && !DEBUG_MODE) {
    const waitTimeMs = bumpState.nextBumpTime - now;
    const waitTimeMin = Math.ceil(waitTimeMs / 60000);
    logger.warn(`Cannot bump yet. Need to wait approximately ${waitTimeMin} more minutes.`, { waitTimeMin });
    if (bumpTimer) clearTimeout(bumpTimer);    
    const nextTime = new Date(bumpState.nextBumpTime).toLocaleTimeString();
    logger.bump(`Rescheduling bump for ${nextTime}`, { nextBumpTime: bumpState.nextBumpTime });
    bumpTimer = setTimeout(sendBumpCommand, waitTimeMs + 1000);
    return;
  } else if (DEBUG_MODE && bumpState.nextBumpTime && now < bumpState.nextBumpTime) {
    const nextTime = new Date(bumpState.nextBumpTime).toLocaleTimeString();
    logger.debug(`DEBUG MODE: Overriding next bump time check. Would normally wait until ${nextTime}`, { debugMode: true, nextBumpTime: bumpState.nextBumpTime });
  }
  try {
    logger.bump(`Sending /bump command in channel ${bumpChannel.name}...`, { channelId: bumpChannel.id });
    await bumpChannel.sendSlash('302050872383242240', 'bump');
    logger.success('Bump command sent successfully');
    bumpState.lastBumpTime = now;
    bumpState.bumpCount++;
    saveState();
  } catch (error) {
    logger.error('Error sending bump command', { error: error.message, stack: error.stack });
  }
}

function startAutoBump() {
  if (bumpTimer) clearTimeout(bumpTimer);
  isBumpEnabled = true;
  const intervalMs = DEBUG_MODE ? DEFAULT_BUMP_INTERVAL_MS : calculateOptimalBumpInterval();
  logger.success(`Starting auto-bump with ${intervalMs / 60000} minute interval${DEBUG_MODE ? ' (DEBUG MODE)' : ''}`, { intervalMinutes: intervalMs / 60000, debugMode: DEBUG_MODE });
  sendBumpCommand();
}

function stopAutoBump() {
  if (bumpTimer) {
    clearTimeout(bumpTimer);
    bumpTimer = null;
  }  
  isBumpEnabled = false;
  logger.warn('Auto-bump stopped');
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

function extractWaitTime(description) {
  if (!description) return null;
  const waitRegex = /wait another (\d+) minute/i;
  const match = description.match(waitRegex);
  if (match && match[1]) {
    const minutes = parseInt(match[1], 10);
    return minutes * 60 * 1000;
  }  
  return null;
}

client.on('ready', () => {
  logger.success(`Logged in as ${client.user.tag}!`, { username: client.user.tag });
  logger.info(`Watching channel ${TARGET_CHANNEL_ID} in server ${TARGET_SERVER_ID}`, { channelId: TARGET_CHANNEL_ID, serverId: TARGET_SERVER_ID });
  logger.info(`Only responding to user ${AUTHORIZED_USER_ID}`, { authorizedUserId: AUTHORIZED_USER_ID });  
  const guild = client.guilds.cache.get(TARGET_SERVER_ID);
  if (guild) {
    bumpChannel = guild.channels.cache.get(TARGET_CHANNEL_ID);
    if (bumpChannel) {
      logger.success(`Bump channel set to #${bumpChannel.name}`, { channelName: bumpChannel.name, channelId: bumpChannel.id });
    } else {
      logger.error(`Could not find channel with ID ${TARGET_CHANNEL_ID}`, { channelId: TARGET_CHANNEL_ID });
    }
  } else {
    logger.error(`Could not find server with ID ${TARGET_SERVER_ID}`, { serverId: TARGET_SERVER_ID });
  }
});

client.on('messageCreate', async (message) => {
  if (message.channel.id !== TARGET_CHANNEL_ID) return;
  if (message.author.id !== AUTHORIZED_USER_ID) return;  
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
    logger.info(`Status request from ${message.author.tag}`, {user: message.author.tag, command: 'bumpstatus', status: isBumpEnabled ? 'enabled' : 'disabled', nextBumpTime: bumpState.nextBumpTime});
    await message.reply(reply);
  } else if (message.content === '!bumpstats') {
    let statsMessage = '**Bump Statistics**\n';
    statsMessage += `- Total bumps attempted: ${bumpState.bumpCount}\n`;
    statsMessage += `- Successful bumps: ${bumpState.successCount}\n`;
    statsMessage += `- Failed bumps: ${bumpState.failureCount}\n`;    
    if (bumpState.lastBumpTime) statsMessage += `- Last bump attempt: ${new Date(bumpState.lastBumpTime).toLocaleString()}\n`;
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
    bumpState = {
      lastBumpTime: null,
      nextBumpTime: null,
      bumpCount: 0,
      successCount: 0,
      failureCount: 0,
      waitTimes: [],
      lastSaved: Date.now()
    };
    saveState();
    await message.reply('Bump statistics have been reset.');
  }
});

client.on('messageCreate', async (message) => {
  if (message.channel.id !== TARGET_CHANNEL_ID) return;
  if (message.author.id !== '302050872383242240') return;
  if (message.embeds && message.embeds.length > 0) {
    const embed = message.embeds[0];
    const embedData = {
      title: embed.title || '',
      description: embed.description || ''
    };    
    logger.bump('Received bump response from Disboard', embedData);
    if (embed.description) {
      const now = Date.now();
      if (embed.description.includes('Bump done!') || embed.description.includes(':thumbsup:')) {
        logger.success('Bump was successful!', { success: true });
        bumpState.successCount++;
        const standardWaitTime = 2 * 60 * 60 * 1000;
        const randomOffset = DEBUG_MODE ? 0 : getRandomTimeOffset();
        const waitTime = DEBUG_MODE ? DEFAULT_BUMP_INTERVAL_MS : (standardWaitTime + randomOffset);
        bumpState.nextBumpTime = now + waitTime;
        saveState();
        if (isBumpEnabled) {
          if (bumpTimer) clearTimeout(bumpTimer);
          if (DEBUG_MODE) {
            logger.debug(`DEBUG MODE: Using ${DEFAULT_BUMP_INTERVAL_MS / 60000} minute interval instead of standard ${standardWaitTime / 60000 / 60} hour cooldown`, { debugMode: true, intervalMinutes: DEFAULT_BUMP_INTERVAL_MS / 60000 });
          } else if (randomOffset > 0) {
            const randomMinutes = Math.round(randomOffset / 60000);
            logger.info(`Added random offset of +${randomMinutes} minutes to appear more human-like`, { randomOffsetMinutes: randomMinutes });
          }
          const nextTime = new Date(bumpState.nextBumpTime).toLocaleTimeString();
          logger.bump(`Next bump scheduled for ${nextTime}`, { nextBumpTime: bumpState.nextBumpTime });
          bumpTimer = setTimeout(sendBumpCommand, waitTime);
        }
      }
      else if (embed.description.includes('Please wait another')) {
        logger.warn('Bump failed - need to wait longer', { success: false });
        bumpState.failureCount++;
        const waitTimeMs = extractWaitTime(embed.description);
        if (waitTimeMs) {
          logger.info(`Extracted wait time: ${waitTimeMs / 60000} minutes`, { waitTimeMinutes: waitTimeMs / 60000 });
          bumpState.waitTimes.push(waitTimeMs);
          const randomOffset = DEBUG_MODE ? 0 : getRandomTimeOffset();
          const actualWaitTime = DEBUG_MODE ? DEFAULT_BUMP_INTERVAL_MS : (waitTimeMs + randomOffset);
          bumpState.nextBumpTime = now + actualWaitTime;
          saveState();
          if (isBumpEnabled) {
            if (bumpTimer) clearTimeout(bumpTimer);            
            if (DEBUG_MODE) {
              logger.debug(`DEBUG MODE: Overriding wait time to ${DEFAULT_BUMP_INTERVAL_MS / 60000} minutes instead of ${waitTimeMs / 60000} minutes`, { debugMode: true, originalWaitMinutes: waitTimeMs / 60000, overrideWaitMinutes: DEFAULT_BUMP_INTERVAL_MS / 60000 });
            } else if (randomOffset > 0) {
              const randomMinutes = Math.round(randomOffset / 60000);
              logger.info(`Added random offset of +${randomMinutes} minutes to appear more human-like`, { randomOffsetMinutes: randomMinutes });
            }
            const nextTime = new Date(bumpState.nextBumpTime).toLocaleTimeString();
            logger.bump(`Next bump scheduled for ${nextTime}`, { nextBumpTime: bumpState.nextBumpTime });
            bumpTimer = setTimeout(sendBumpCommand, actualWaitTime + 1000);
          }
        } else {
          const defaultWaitTime = DEBUG_MODE ? 60 * 1000 : 10 * 60 * 1000;
          logger.warn(`Could not extract wait time, using default: ${defaultWaitTime / 60000} minutes`, { defaultWaitMinutes: defaultWaitTime / 60000 });
          if (isBumpEnabled) {
            if (bumpTimer) clearTimeout(bumpTimer);
            bumpTimer = setTimeout(sendBumpCommand, defaultWaitTime);
          }
        }
      }
    }
  }
});

client.on('error', (error) => {
  logger.error('Discord client error', { error: error.message, stack: error.stack });
});
setInterval(saveState, 5 * 60 * 1000);
logger.info('Starting Discord selfbot...');
client.login(TOKEN).catch(error => {
  logger.error('Failed to login', { error: error.message, stack: error.stack });
});