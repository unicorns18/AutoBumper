# AutoBumper

A repository for Discord automation tools, featuring a selfbot that can automatically bump your server on Disboard with intelligent timing.

## Overview

This repository contains various Discord automation tools, including a selfbot with the following features:
- Responds to basic commands like `!ping`
- Automatically sends `/bump` commands to Disboard bot with intelligent timing
- Extracts and displays embed information from Disboard bot responses
- Tracks bump statistics and optimizes bump timing
- Configurable through simple commands
- Debug mode for faster testing
- State persistence across restarts
- Structured logging system with different log levels

## Configuration

The bot uses a `config.json` file for configuration. On first run, a template file will be created that you need to fill in with your details.

Example configuration:
```json
{
  "token": "YOUR_DISCORD_TOKEN_HERE",
  "targetServerId": "YOUR_SERVER_ID_HERE",
  "targetChannelId": "YOUR_CHANNEL_ID_HERE",
  "authorizedUserId": "YOUR_USER_ID_HERE",
  "debug": false,
  "logging": {
    "level": "info",
    "directory": "logs"
  }
}
```

Required settings:
- `token`: Your Discord account token
- `targetServerId`: The ID of the server where the bot will operate
- `targetChannelId`: The ID of the channel where the bot will send and listen for messages
- `authorizedUserId`: The ID of the user who can control the bot

Optional settings:
- `debug`: Set to `true` to enable debug mode (1-minute intervals)
- `logging.level`: Set the logging level (`error`, `warn`, `info`, or `debug`)
- `logging.directory`: Set the directory where logs will be stored

Default behavior:
- Only interacts with the specified channel ID
- Only responds to the specified user ID
- In normal mode: Waits for Disboard's standard 2-hour cooldown between bumps, plus a random offset (3-20 minutes) for human-like behavior
- In debug mode: Uses a 1-minute interval for testing purposes

## Usage

1. Install dependencies:
```
npm install
```

2. Run the bot for the first time to generate the config file:
```
node index.js
```

3. Edit the `config.json` file with your Discord token and other settings

4. Run the bot again to start:
```
node index.js
```

5. Alternatively, run with debug mode via environment variable (overrides config setting):
```
DEBUG=1 node index.js
```

6. Or set a specific log level:
```
LOG_LEVEL=debug node index.js
```

## Commands

- `!ping`: The bot will respond with "pong"
- `!help`: The bot will respond with a list of available commands
- `!startbump`: Start the auto-bumping process
- `!stopbump`: Stop the auto-bumping process
- `!bumpstatus`: Check if auto-bumping is currently enabled and when the next bump is scheduled
- `!bumpstats`: Display statistics about bump attempts, success rate, and timing
- `!resetstats`: Reset the bump statistics

## Intelligent Auto-Bumping

The bot can automatically send the `/bump` command to the Disboard bot (ID: 302050872383242240) with intelligent timing. When the Disboard bot responds, the selfbot will:

1. Extract and display the embed information (title and description)
2. Analyze the response to determine if the bump was successful
3. If the bump failed with a "wait" message, extract the required wait time
4. Schedule the next bump attempt based on the extracted wait time
5. Add a random time offset (3-20 minutes) to appear more human-like
6. Track statistics to optimize future bump timing

The bot adapts to Disboard's requirements and will automatically schedule bumps at the optimal time, avoiding unnecessary failed attempts. The random time offset makes the bot's behavior less predictable and more human-like.

## State Tracking

The bot maintains state information about:
- Last bump time
- Next scheduled bump time (including random offset)
- Total bump attempts
- Successful bumps
- Failed bumps
- Average wait times
- Random time offsets applied

This information is used to optimize the bumping process and can be viewed with the `!bumpstats` command. The random time offsets (3-20 minutes) are added to the standard wait times to make the bot's behavior appear more human-like and less predictable.

## Debug Mode

For testing purposes, you can run the bot in debug mode by setting the `DEBUG` environment variable:

```
DEBUG=1 node index.js
```

In debug mode, the bot will use 1-minute intervals instead of the standard 2-hour cooldown after successful bumps.

## State Persistence

The bot automatically saves its state to a file (`bump_state.json`) in the following situations:
- After each successful bump
- After each failed bump with a wait time
- When statistics are reset
- Every 5 minutes as a backup

This ensures that if the bot is restarted, it will:
- Retain all bump statistics
- Remember the next scheduled bump time
- Continue operation without losing data

## Logging System

The bot uses a custom color-coded logging system that:
- Logs to both console and files
- Uses intuitive prefixes with color coding:
  - `[+]` (Green) - Success messages
  - `[-]` (Yellow) - Warning messages
  - `[!]` (Red) - Error messages
  - `[*]` (Blue) - Information messages
  - `[B]` (Magenta) - Bump-related messages
  - `[D]` (Cyan) - Debug messages
- Stores logs in the `logs` directory
- Keeps separate error logs
- Includes timestamps and structured data

Log files:
- `auto-bumper.log`: Contains all logs
- `error.log`: Contains only error logs

You can adjust the log level by setting the `LOG_LEVEL` environment variable:
```
LOG_LEVEL=debug node index.js
```

Available log levels (from highest to lowest priority):
1. `error` - Only show errors
2. `warn` - Show errors and warnings
3. `info` - Show errors, warnings, and info messages
4. `debug` - Show all messages (default)

## Note

This bot uses discord.js-selfbot-v13, which is a selfbot library. Please be aware that using selfbots may violate Discord's Terms of Service. Use at your own risk.