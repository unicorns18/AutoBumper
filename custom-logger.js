const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m'
};

// Log levels with their prefixes and colors
const levels = {
  success: { prefix: '[+]', color: colors.green, priority: 1 },
  warn: { prefix: '[-]', color: colors.yellow, priority: 2 },
  error: { prefix: '[!]', color: colors.red, priority: 3 },
  info: { prefix: '[*]', color: colors.blue, priority: 4 },
  bump: { prefix: '[B]', color: colors.magenta, priority: 5 },
  debug: { prefix: '[D]', color: colors.cyan, priority: 6 }
};

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Log file paths
const logFilePath = path.join(logsDir, 'auto-bumper.log');
const errorLogFilePath = path.join(logsDir, 'error.log');

// Current log level (can be set via environment variable)
const currentLevel = process.env.LOG_LEVEL || 'debug';
const currentLevelPriority = levels[currentLevel] ? levels[currentLevel].priority : 6; // Default to debug

// Format the current time
function getTimestamp() {
  const now = new Date();
  return now.toLocaleTimeString();
}

// Write to log file
function writeToFile(filePath, message) {
  try {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(filePath, `[${timestamp}] ${message}\n`);
  } catch (error) {
    console.error(`Failed to write to log file ${filePath}:`, error);
  }
}

// Main logging function
function log(level, message, data = null) {
  // Check if this level should be logged based on current level priority
  if (levels[level].priority > currentLevelPriority) {
    return;
  }
  
  const timestamp = getTimestamp();
  const { prefix, color } = levels[level];
  
  // Format the message
  let consoleMessage = `${colors.gray}[${timestamp}]${colors.reset} ${color}${prefix}${colors.reset} ${message}`;
  let fileMessage = `[${timestamp}] ${prefix} ${message}`;
  
  // Add data if provided
  if (data) {
    // For console, we'll show data on a new line with indentation for readability
    if (typeof data === 'object') {
      const dataStr = JSON.stringify(data, null, 2);
      consoleMessage += `\n${colors.gray}${dataStr}${colors.reset}`;
      fileMessage += ` ${dataStr}`;
    } else {
      consoleMessage += ` ${colors.gray}${data}${colors.reset}`;
      fileMessage += ` ${data}`;
    }
  }
  
  // Output to console
  console.log(consoleMessage);
  
  // Write to main log file
  writeToFile(logFilePath, fileMessage);
  
  // Also write errors to the error log
  if (level === 'error') {
    writeToFile(errorLogFilePath, fileMessage);
  }
}

// Create logger object with methods for each log level
const logger = {};

// Add a method for each log level
Object.keys(levels).forEach(level => {
  logger[level] = (message, data) => log(level, message, data);
});

// Add state method as an alias for info
logger.state = (message, data) => log('info', message, data);

module.exports = logger;