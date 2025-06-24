
# Discord Diamond Points Bot

A comprehensive Discord bot that implements a diamond-based economy system designed to increase server interaction, reward user engagement, and gamify the Discord experience. Users can earn diamonds through daily claims, participate in casino games, transfer points, and redeem gift cards for real rewards.

## ✨ Key Features

### 💎 Diamond Economy System
- **Daily Claims**: Users earn 50-150 💎 daily with streak bonuses (up to 3x multiplier)
- **Streak System**: Consecutive claims within 36-hour windows increase rewards
- **Point Transfers**: Secure diamond transfers between users
- **Persistent Storage**: All data automatically saved to `bot_data.json`
- **Auto-Save**: Data persistence every 5 minutes with startup recovery

### 🎲 Interactive Casino Games
- **Dice Game**: Guess numbers 1-6 for 5x multiplier rewards (min bet: 10 💎)
- **Coinflip Game**: Pick heads/tails for 2x multiplier (min bet: 10 💎)
- **Lucky Slots**: Auto-spin slot machine with up to 12x jackpot (fixed bet: 30 💎)
- **Modal Interfaces**: All games use Discord forms for seamless interaction
- **Auto-Cleanup**: Game results auto-delete after 3 minutes

### 🎁 Advanced Gift Card System
- **User Generation**: Convert 500-100,000 💎 to gift cards
- **Admin Generation**: Admin-only gift card creation without diamond cost
- **Status Tracking**: Valid/Claimed/Void status with expiry dates
- **7-Day Validity**: All gift cards expire after 7 days
- **DM Delivery**: Automatic gift card code delivery via direct messages
- **Legacy Support**: Maintains backward compatibility with PCRP gift cards

### 📊 Management & Analytics
- **Leaderboards**: Top 10 users with medals and detailed statistics
- **User Statistics**: Track total earned, spent, streaks, and gift card history
- **Admin Controls**: Comprehensive panel management and data oversight
- **Channel Restrictions**: Commands restricted to designated channels
- **Auto-Cleanup**: Automatic removal of old bot messages

## 🎮 Game Mechanics

### 🎲 Dice Game
- **Gameplay**: Choose a number between 1-6, place your bet
- **Minimum Bet**: 10 💎
- **Payout**: 5x your bet if you guess correctly
- **Interface**: Modal form with number input and bet amount

### 🪙 Coinflip Game
- **Gameplay**: Choose heads or tails (H/T shortcuts supported)
- **Minimum Bet**: 10 💎
- **Payout**: 2x your bet for correct guess
- **Interface**: Modal form with choice input and bet amount

### 🎰 Lucky Slots
- **Gameplay**: Automatic 3-reel spin with weighted symbols
- **Fixed Bet**: 30 💎 per spin
- **Symbols**: 🍒🍋🍊💎⭐🍀 with varying rarities
- **Payouts**:
  - Two matching symbols: 1.5x multiplier
  - Three common symbols: 3x multiplier
  - Three 💎: 10x multiplier
  - Three ⭐: 8x multiplier
  - Three 🍀: 12x multiplier (JACKPOT!)

## 🎁 Gift Card Economy

### Conversion System
- **Rate**: 100 Diamonds = 1 Rupee (PCRP virtual system)
- **Range**: 500-100,000 💎 per gift card
- **Validity**: 7 days from creation
- **Status Types**: Valid, Claimed, Void (expired)

### User Generation Process
1. Use `/generate_gift_card <amount>` command
2. Diamonds automatically deducted from balance
3. Unique code generated (format: GC-XXXXXXXXXXXX)
4. Code delivered via DM with expiry information
5. Gift card can be shared or used personally

### Admin Generation
- **Admin-Only Access**: Requires admin role or authorized user ID
- **No Cost**: Creates gift cards without deducting diamonds
- **Security**: Codes delivered exclusively via DMs
- **Panel Access**: Dedicated admin panel in verification channel

## 🛠️ Technical Architecture

### Core Components
- **Node.js Backend**: Built with discord.js v14.20.0
- **Data Persistence**: JSON file storage with auto-save functionality
- **Modular Design**: Organized command handling and event management
- **Error Handling**: Comprehensive error catching with user feedback

### Channel Configuration
```javascript
const CHANNELS = {
    daily_claims: "1387023026301960212",      // Daily claim panel
    gambling: "1387023670634872873",          // Casino games
    gift_cards: "1387023764012797972",        // Gift card management
    gift_card_verification: "1387119676961849464", // Admin verification
    transfers: "1387023571368415292",         // Point transfers
    leaderboard: "1387023490649034782",       // Rankings display
    information: "1387120060870688788"        // Bot information
};
```

### Security Features
- **Role-Based Access**: Admin commands restricted to authorized roles
- **Channel Restrictions**: Commands only work in designated channels
- **DM Verification**: Tests user DM availability before gift card delivery
- **Input Validation**: Comprehensive validation for all user inputs
- **Rate Limiting**: Built-in protections against abuse

## 📋 Complete Command Reference

### 💎 Daily & Points Commands
| Command | Channel | Description |
|---------|---------|-------------|
| `/claim_daily` | daily_claims | Claim daily diamonds with streak bonus |
| `/get_points [user]` | transfers | Check your or another user's balance |
| `/transfer_points <user> <amount>` | transfers | Send diamonds to another user |

### 🎲 Gaming Commands
| Command | Channel | Description |
|---------|---------|-------------|
| `/gambling_menu` | gambling | Access all casino games |
| Dice Game Button | gambling | Opens modal for dice betting |
| Coinflip Button | gambling | Opens modal for coinflip betting |
| Lucky Slots Button | gambling | Instant 30 💎 slot spin |

### 🎁 Gift Card Commands
| Command | Channel | Description |
|---------|---------|-------------|
| `/generate_gift_card <amount>` | gift_cards | Create gift card (500-100k 💎) |
| `/check_gift_card <code>` | gift_cards/verification | Verify gift card status |
| `/redeem_gift_card` | gift_cards | Legacy PCRP gift card system |
| `/convert_points` | gift_cards | Same as redeem_gift_card |

### 📊 Information Commands
| Command | Channel | Description |
|---------|---------|-------------|
| `/leaderboard` | leaderboard/general | View top 10 diamond holders |
| `/test_dm` | any | Test bot's ability to send DMs |
| `/info` | information | Show comprehensive bot information |

### 🛡️ Admin Commands
| Command | Access | Description |
|---------|--------|-------------|
| `/send_daily_claim` | Admin | Manually send daily claim panel |
| `/send_gift_card_panel` | Admin | Deploy gift card management panel |
| `/send_info_panel` | Admin | Deploy information panel |
| `/drop_points` | Admin | Point drop events (coming soon) |
| Admin Generate Button | Admin | Create gift cards without cost |

## 🚀 Setup & Deployment Guide

### Prerequisites
- Node.js 16+ installed
- Discord bot token from [Discord Developer Portal](https://discord.com/developers/applications)
- Discord server with appropriate permissions

### Quick Start on Replit
1. **Fork this Repl** or create new Node.js Repl
2. **Install Dependencies**: Run `npm install` (automatically handled)
3. **Configure Bot Token**: Set up your Discord bot token
4. **Update Channel IDs**: Modify the `CHANNELS` object with your server's channel IDs
5. **Set Admin Access**: Update `ADMIN_ROLE_ID` and `ADMIN_USER_IDS`
6. **Deploy**: Use Replit's deployment feature for 24/7 operation

### Environment Configuration
```javascript
// Option 1: Environment Variable (Recommended)
client.login(process.env.DISCORD_TOKEN);

// Option 2: Direct Token (Development only)
client.login('your_bot_token_here');
```

### Channel Setup Requirements
Create the following channels in your Discord server:
- **💎-daily-claims**: For daily diamond claiming
- **🎲-gambling**: For casino games
- **🎁-gift-cards**: For gift card management
- **🔍-verification**: For admin gift card operations
- **📊-transfers**: For point transfers
- **🏆-leaderboard**: For rankings display
- **ℹ️-information**: For bot help and commands

### Admin Configuration
```javascript
const ADMIN_ROLE_ID = "your_admin_role_id";
const ADMIN_USER_IDS = [
    "admin_user_id_1",
    "admin_user_id_2",
    "admin_user_id_3"
];
```

## 📊 Data Structure

### User Data Schema
```json
{
  "users": {
    "user_id": {
      "points": 0,
      "last_claim": null,
      "streak": 0,
      "total_earned": 0,
      "total_spent": 0,
      "inventory": [],
      "gift_cards_redeemed": []
    }
  }
}
```

### Gift Card Schema
```json
{
  "generated_gift_cards": {
    "GC-CODE": {
      "value": 5600,
      "status": "valid",
      "created_at": "2025-06-24T17:53:45.227Z",
      "created_by": "user_id",
      "claimed_by": null,
      "claimed_at": null,
      "void_reason": null,
      "admin_generated": false
    }
  }
}
```

## 🎯 Economy Balance Design

### Earning Opportunities
- **Daily Claims**: 50-150 💎 (base + streak multiplier)
- **Point Transfers**: Receive from other community members
- **Future Features**: Special events, giveaways, activity rewards

### Spending Options
- **Casino Games**: Risk diamonds for potential multipliers
- **Gift Cards**: Convert to real-world value (PCRP system)
- **Point Transfers**: Share with friends and community
- **Future Features**: Special roles, exclusive access, server perks

### Conversion Economics
- **Base Rate**: 100 Diamonds = 1 Rupee
- **Purpose**: PCRP (virtual) reward system integration
- **Example**: 5,600 💎 gift card = 56 Rupees value
- **Range**: 500-100,000 💎 per gift card

## 🔧 Advanced Features

### Startup Behavior
1. **Data Loading**: Restores all user data from `bot_data.json`
2. **Command Registration**: Automatically registers 16 slash commands
3. **Panel Deployment**: Sends interactive panels to all configured channels
4. **Cleanup Process**: Removes old bot messages to prevent duplicates
5. **Auto-Recovery**: Restores all functionality after restarts

### Auto-Management Systems
- **5-Minute Auto-Save**: Continuous data persistence
- **Expired Gift Card Cleanup**: Automatic status updates
- **Message Cleanup**: Auto-deletion of temporary responses
- **Panel Refresh**: 24-hour daily claim panel updates
- **Error Recovery**: Graceful handling of Discord API issues

### Interactive Components
- **Buttons**: 15+ interactive buttons across all panels
- **Modals**: 5 different modal forms for user input
- **Select Menus**: Gift card selection dropdowns
- **Embeds**: Rich, colorful message formatting throughout
- **Ephemeral Responses**: Private error messages and confirmations

## 🛡️ Security & Best Practices

### Access Control
- **Role Verification**: Admin commands require specific role
- **User ID Whitelist**: Backup admin access via user IDs
- **Channel Restrictions**: Commands locked to appropriate channels
- **Input Sanitization**: All user inputs validated and sanitized

### Data Protection
- **Secure Token Storage**: Environment variable usage recommended
- **DM Privacy**: Gift card codes delivered privately
- **Auto-Deletion**: Sensitive information auto-removed
- **Backup Strategy**: JSON file provides easy backup/restore

### Performance Optimization
- **Efficient Data Queries**: Optimized user data lookups
- **Memory Management**: Proper cleanup of temporary data
- **Rate Limiting**: Built-in Discord API rate limiting
- **Error Handling**: Comprehensive try-catch blocks throughout

## 🔍 Troubleshooting Guide

### Common Issues
1. **Bot Not Responding**: Check token validity and bot permissions
2. **Commands Not Working**: Verify channel IDs in configuration
3. **DM Delivery Fails**: Ensure users have DMs enabled from server members
4. **Data Not Saving**: Check file write permissions for `bot_data.json`
5. **Admin Commands Blocked**: Verify role IDs and user permissions

### Debug Information
- **Console Logging**: Comprehensive startup and error logging
- **Status Messages**: Real-time feedback for all operations
- **Error Embeds**: User-friendly error messages with guidance
- **Development Mode**: Test DM functionality before deployment

### Performance Monitoring
- **Memory Usage**: Monitor for memory leaks in long-running instances
- **API Limits**: Discord rate limiting handled automatically
- **Data Growth**: Monitor `bot_data.json` file size over time
- **User Activity**: Track command usage patterns

## 🚀 Deployment on Replit

### Step 1: Environment Setup
1. Create a new Node.js Repl or fork this template
2. Ensure all dependencies are installed via `npm install`
3. Configure your Discord bot token in Replit Secrets as `DISCORD_TOKEN`

### Step 2: Configuration
1. Update channel IDs in the `CHANNELS` object
2. Set your admin role ID and authorized user IDs
3. Test the bot in development mode using the Run button

### Step 3: Production Deployment
1. Click **Deploy** in the Replit workspace header
2. Choose **Reserved VM Deployment** for 24/7 operation
3. Configure deployment settings and click **Deploy**
4. Monitor the console output for successful startup

### Step 4: Verification
1. Test all commands in their respective channels
2. Verify admin panel access and functionality
3. Test gift card generation and DM delivery
4. Monitor the leaderboard and data persistence

## 📈 Future Roadmap

### Planned Features
- **Point Drop System**: Community-wide diamond events
- **Enhanced Casino**: Additional games and tournament modes
- **Achievement System**: Badges and milestones for users
- **Economy Analytics**: Detailed statistics and reports
- **Mobile Integration**: Enhanced mobile Discord experience

### Expansion Possibilities
- **Multi-Server Support**: Cross-server diamond economy
- **API Integration**: External reward system connections
- **Advanced Analytics**: User behavior and engagement metrics
- **Seasonal Events**: Holiday-themed activities and bonuses
- **Community Features**: Guilds, teams, and collaborative challenges

## 📄 License & Support

### License
This project is provided as-is for educational and community use. Please ensure compliance with Discord's Terms of Service and Community Guidelines when deploying.

### Support
- **Documentation**: This comprehensive README
- **Code Comments**: Extensive inline documentation
- **Error Messages**: User-friendly guidance throughout
- **Community**: Share improvements and customizations

### Contributing
1. Fork the repository
2. Create feature branches for new functionality
3. Test thoroughly in development environment
4. Submit pull requests with detailed descriptions

---

**Bot Version**: 2.0  
**Discord.js Version**: 14.20.0  
**Node.js Requirement**: 16+  
**Last Updated**: June 24, 2025  
**Developer**: PRIMOIX  

**Deployed on**: [Replit](https://replit.com) - The collaborative browser-based IDE for building and deploying applications.
