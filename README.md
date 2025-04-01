# AutoBumper

A Discord selfbot that can automatically bump your server on Disboard.

## Overview

This selfbot provides the following features:
- Responds to basic commands like `!ping`
- Automatically sends `/bump` commands to Disboard bot every 10 minutes
- Extracts and displays embed information from Disboard bot responses
- Configurable through simple commands

## Configuration

The bot is configured to:
- Only interact with channel ID: 1341675216635559964
- Only in server ID: 1340995921332273255
- Only respond to user ID: 686107711829704725
- Auto-bump interval: 10 minutes

## Usage

1. Install dependencies:
```
npm install
```

2. Run the bot:
```
node index.js
```

## Commands

- `!ping`: The bot will respond with "pong"
- `!help`: The bot will respond with a list of available commands
- `!startbump`: Start the auto-bumping process (sends `/bump` every 10 minutes)
- `!stopbump`: Stop the auto-bumping process
- `!bumpstatus`: Check if auto-bumping is currently enabled or disabled

## Auto-Bumping

The bot can automatically send the `/bump` command to the Disboard bot (ID: 302050872383242240) every 10 minutes. When the Disboard bot responds, the selfbot will extract and display the embed information (title and description) from the response.

To start auto-bumping, send `!startbump` in the configured channel. To stop, send `!stopbump`.

## Note

This bot uses discord.js-selfbot-v13, which is a selfbot library. Please be aware that using selfbots may violate Discord's Terms of Service. Use at your own risk.