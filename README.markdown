# Discord Points Bot README

## Overview
This is a Discord bot designed to manage a points-based economy system using "Diamonds" (💎) as currency. Users can earn, spend, transfer, and gamble points, redeem gift cards, and view leaderboards. The bot is built using Node.js and the `discord.js` library, with data persistence via a JSON file.

## Bot Structure
The bot is structured as a modular Node.js application with the following components:

### Core Components
- **Client Setup**: Uses `discord.js` with intents for Guilds, GuildMessages, and MessageContent to interact with Discord servers, channels, and messages.
- **PointsBot Class**: Manages user data, settings, and gift card requests, with methods for data persistence (`saveData`, `loadData`) and streak calculations.
- **Data Storage**: Stores user data (points, streaks, etc.) and settings in a `bot_data.json` file, with auto-saving every 5 minutes.
- **Channel Configuration**: Uses specific channel IDs for different functionalities (e.g., daily claims, gambling, leaderboard) defined in the `CHANNELS` object.
- **Gift Card System**: Supports predefined gift cards (e.g., PCRP Gift Card) with costs and emojis, stored in the `GIFT_CARDS` object.

### Key Files
- **index.js**: Main bot script containing all logic, event handlers, and command implementations.
- **bot_data.json**: Persistent storage for user points, streaks, and gift card requests.

### Dependencies
- `discord.js`: For Discord API interactions.
- `fs` (Node.js File System): For reading/writing to `bot_data.json`.
- `path`: For handling file paths.

## Plan
The bot is designed to provide an engaging economy system for Discord communities with the following goals:
- **User Engagement**: Encourage daily interaction through daily claims with streak bonuses.
- **Economy Management**: Allow users to earn, transfer, and spend points on gambling or gift cards.
- **Gambling Features**: Offer fun games (Dice, Coinflip, Slots) with varying risk/reward mechanics.
- **Reward System**: Enable point redemption for gift cards, with admin-managed processing.
- **Leaderboard**: Showcase top users to foster competition.
- **Admin Tools**: Provide commands for point drops and panel management.

## Connectivity
The bot connects to Discord using the `discord.js` library and a bot token. Two connection methods are provided:
1. **Hardcoded Token**: A token is included directly in the code (`client.login('MTM4NjM2...')`). **Note**: This is insecure and not recommended for production.
2. **Environment Variable**: Uses `process.env.DISCORD_TOKEN` for secure token management via a `.env` file or server environment (recommended).

### Setup Instructions
1. **Install Node.js**: Ensure Node.js (v16 or higher) is installed.
2. **Install Dependencies**:
   ```bash
   npm install discord.js
   ```
3. **Configure Token**:
   - Create a `.env` file with:
     ```env
     DISCORD_TOKEN=your_bot_token_here
     ```
   - Alternatively, replace the hardcoded token in `index.js` (not recommended).
4. **Set Channel IDs**: Update the `CHANNELS` object in `index.js` with your Discord server's channel IDs.
5. **Run the Bot**:
   ```bash
   node index.js
   ```
6. **Invite Bot to Server**: Create a bot application in the [Discord Developer Portal](https://discord.com/developers/applications), generate an invite link with appropriate permissions, and add it to your server.

### Data Persistence
- User data (points, streaks, inventory, etc.) is saved to `bot_data.json` on every interaction and every 5 minutes via an auto-save interval.
- If `bot_data.json` doesn't exist, the bot starts with an empty dataset and creates the file on the first save.

## Commands
The bot supports the following slash commands, each restricted to specific channels defined in the `CHANNELS` object:

### User Commands
- **/claim_daily** (Channel: `daily_claims`)
  - Description: Claim daily reward with streak bonus (50 💎 base, up to 3x multiplier).
  - Example: `/claim_daily`
- **/get_points** (Channel: `transfers`)
  - Description: Check your points or another user's points.
  - Options:
    - `user` (optional): User to check points for.
  - Example: `/get_points` or `/get_points @user`
- **/transfer_points** (Channel: `transfers`)
  - Description: Send points to another user.
  - Options:
    - `recipient` (required): User to send points to.
    - `amount` (required): Number of points to send (min 1).
  - Example: `/transfer_points @user 100`
- **/gambling_menu** (Channel: `gambling`)
  - Description: Open the gambling menu with options for Dice, Coinflip, and Slots.
  - Example: `/gambling_menu`
- **/redeem_gift_card** (Channel: `gift_cards`)
  - Description: Open the gift card redemption menu.
  - Example: `/redeem_gift_card`
- **/leaderboard** (Channels: `leaderboard`, `general`)
  - Description: View the top 10 users by points.
  - Example: `/leaderboard`
- **/test_dm** (Any channel)
  - Description: Test if the bot can send DMs for gift card delivery.
  - Example: `/test_dm`
- **/convert_points** (Channel: `gift_cards`)
  - Description: Convert points to a gift card (same as `/redeem_gift_card`).
  - Example: `/convert_points`
- **/convert_giftcard** (Channel: `gift_cards`)
  - Description: Convert a gift card back to points (feature not yet implemented).
  - Example: `/convert_giftcard`

### Admin Commands
- **/drop_points** (Any channel, Admin only)
  - Description: Start a point drop session (feature not yet implemented).
  - Example: `/drop_points`
- **/send_daily_claim** (Any channel, Admin only)
  - Description: Manually send the daily claim panel to the `daily_claims` channel.
  - Example: `/send_daily_claim`
- **/send_gift_card_panel** (Any channel, Admin only)
  - Description: Send the gift card redemption panel to the `gift_cards` channel.
  - Example: `/send_gift_card_panel`

## Interactive Components
### Buttons
- **Claim Daily Diamonds** (`claim_daily`): Claims daily reward in the `daily_claims` channel.
- **Dice Game** (`dice_game`): Opens a modal to input guess and bet for the Dice game.
- **Coinflip Game** (`coinflip_game`): Opens a modal to input choice (heads/tails) and bet.
- **Lucky Slots** (`slots_game`): Plays a slots game with a fixed 30 💎 bet.
- **Game Details** (`game_details`): Shows details of gambling games.
- **Open Gift Card Ticket** (`open_gift_ticket`): Provides instructions for gift card support.
- **Test DM** (`dm_test_button`): Tests if the bot can send DMs.
- **Confirm Convert Back** (`confirm_convert_back`): Placeholder for converting gift cards back to points (not implemented).

### Select Menus
- **Gift Card Selection** (`gift_card_select`): Allows users to choose a gift card to redeem.

### Modals
- **Dice Game Modal** (`dice_modal`): Inputs for guess (1-6) and bet amount (min 10 💎).
- **Coinflip Game Modal** (`coinflip_modal`): Inputs for choice (heads/tails) and bet amount (min 10 💎).

## Gambling Games
- **Dice Game**:
  - Guess a number (1-6).
  - Bet minimum: 10 💎.
  - Win: 5x bet if correct.
- **Coinflip Game**:
  - Choose heads or tails.
  - Bet minimum: 10 💎.
  - Win: 2x bet if correct.
- **Lucky Slots**:
  - Fixed bet: 30 💎.
  - Win multipliers: 1.5x (two matching symbols), 3x (three matching common symbols), up to 12x (three rare symbols like 🍀).

## Gift Card System
- **Available Gift Card**: PCRP Gift Card (500 💎).
- **Process**:
  1. Use `/redeem_gift_card` or `/convert_points` to select a gift card.
  2. Points are deducted, and a request is created.
  3. Admins process the request, and the gift card code is sent via DM.
- **Pending Feature**: Converting gift cards back to points (`/convert_giftcard`).

## Startup Behavior
On startup, the bot:
1. Loads data from `bot_data.json`.
2. Registers slash commands globally.
3. Clears old bot messages in configured channels.
4. Sends panels to the following channels:
   - **Daily Claims**: Embed with a claim button.
   - **Gambling**: Embed with game buttons.
   - **Gift Cards**: Embed with gift card options and buttons.
   - **Leaderboard**: Embed with top 10 users.

## Error Handling
- Commands check for correct channel usage and provide feedback if used in the wrong channel.
- Gambling games validate bets and user balances.
- DM tests ensure users have DMs enabled.
- Data loading handles missing files gracefully, starting fresh if needed.

## Security Notes
- **Token Security**: Avoid hardcoding the bot token in production. Use environment variables (e.g., `.env` file) to prevent accidental exposure.
- **Permissions**: Admin commands (`/drop_points`, `/send_daily_claim`, `/send_gift_card_panel`) require Administrator permissions.
- **DMs**: Users must enable DMs from server members for gift card delivery.

## Troubleshooting
- **Bot Not Responding**: Check the token, ensure the bot is invited to the server, and verify channel IDs in `CHANNELS`.
- **Data Not Saving**: Ensure write permissions for `bot_data.json`.
- **Command Errors**: Verify channel IDs and user permissions. Check console logs for errors.

## Future Improvements
- Implement point drop system (`/drop_points`).
- Complete gift card conversion back to points (`/convert_giftcard`).
- Add more gift card options.
- Enhance gambling games with additional features or animations.
- Implement rate limiting for commands to prevent abuse.

## Contributing
To contribute:
1. Fork the repository (if hosted).
2. Create a feature branch.
3. Submit a pull request with detailed changes.

## License
This project is unlicensed. Use and modify at your own risk. Ensure compliance with Discord's Terms of Service.

---

**Developed by**: [PRIMOIX]  
**Last Updated**: June 24, 2025