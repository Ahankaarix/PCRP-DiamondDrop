
# 🤖 PCRP Discord Diamond Points Bot

> **A comprehensive Discord economy bot with advanced diamond mining, casino games, gift card system, and point drop events**

```
    💎 DIAMOND ECONOMY SYSTEM 💎
  ╔═══════════════════════════════╗
  ║ 🎮 Gaming • 🎁 Rewards • 🏆 Leaderboards ║
  ║ 📊 Analytics • 🎯 Events • 💎 Mining    ║
  ╚═══════════════════════════════╝
```

## 📊 Bot Architecture & Flow Diagram

```mermaid
graph TD
    A[Discord User] --> B[Bot Commands/Interactions]
    B --> C{Command Router}
    
    C --> D[Daily Claims System]
    C --> E[Casino Games]
    C --> F[Gift Card System]
    C --> G[Point Drop Events]
    C --> H[Transfer System]
    C --> I[Leaderboard System]
    
    D --> J[Points Database]
    E --> J
    F --> K[Gift Card Database]
    G --> L[Mining Events]
    H --> J
    I --> J
    
    J --> M[Auto-Save System]
    K --> M
    
    N[Admin Panel] --> O[Admin Commands]
    O --> P[Event Management]
    O --> Q[Gift Card Generation]
    
    R[Auto-Cleanup] --> S[Message Cleanup]
    R --> T[Data Cleanup]
    R --> U[Expired Cards Cleanup]
```

## 🚀 Quick Start Guide

### 📋 Prerequisites
- Discord Server with Admin permissions
- Discord Bot Token
- Node.js environment 

### 🔧 Setup Steps

#### Step 1: Bot Creation & Token Setup
1. **Create Discord Application**
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Click "New Application" → Enter bot name → Create
   - Navigate to "Bot" section → Reset Token → Copy token
   
2. **Configure Bot Token**
   ```javascript
   // Option 1: Environment Variable (Recommended)
   client.login(process.env.DISCORD_TOKEN);
   
   // Option 2: Direct Token (Development)
   client.login('YOUR_BOT_TOKEN_HERE');
   ```

#### Step 2: Server Channel Setup
Create these channels in your Discord server:

```
📋 REQUIRED CHANNELS STRUCTURE
╔═══════════════════════════════════════╗
║ 💎 daily-claims     - Daily rewards   ║
║ 🎲 gambling         - Casino games    ║
║ 🎁 gift-cards       - Gift management ║
║ 🔍 verification     - Admin panel     ║
║ 📊 transfers        - Point transfers ║
║ 🏆 leaderboard      - Rankings        ║
║ ℹ️ information      - Help & commands  ║
║ 🎯 point-drops      - Mining events   ║
╚═══════════════════════════════════════╝
```

#### Step 3: Configuration Update
Update channel IDs in `index.js`:

```javascript
const CHANNELS = {
    daily_claims: "YOUR_DAILY_CLAIMS_CHANNEL_ID",
    gambling: "YOUR_GAMBLING_CHANNEL_ID",
    gift_cards: "YOUR_GIFT_CARDS_CHANNEL_ID",
    gift_card_verification: "YOUR_VERIFICATION_CHANNEL_ID",
    transfers: "YOUR_TRANSFERS_CHANNEL_ID",
    leaderboard: "YOUR_LEADERBOARD_CHANNEL_ID",
    information: "YOUR_INFORMATION_CHANNEL_ID",
    point_drops: "YOUR_POINT_DROPS_CHANNEL_ID"
};
```

#### Step 4: Admin Configuration
```javascript
const ADMIN_ROLE_ID = "YOUR_ADMIN_ROLE_ID";
const ADMIN_USER_IDS = [
    "ADMIN_USER_ID_1",
    "ADMIN_USER_ID_2", 
    "ADMIN_USER_ID_3"
];
```

#### Step 5: Deployment on Replit
1. **Fork Template** - Click "Use Template" on this Repl
2. **Install Dependencies** - Run `npm install`
3. **Configure Secrets** - Add `DISCORD_TOKEN` in Replit Secrets
4. **Test Bot** - Click "Run" to test functionality
5. **Deploy Production** - Click "Deploy" → "Reserved VM Deployment"

---

## 📚 Complete Command Reference

### 💎 **Daily & Points Commands**

| Command | Channel | Syntax | Description |
|---------|---------|--------|-------------|
| `/claim_daily` | daily-claims | `/claim_daily` | Claim daily diamonds with streak bonus |
| `/get_points` | transfers | `/get_points [user]` | Check your or another user's balance |
| `/transfer_points` | transfers | `/transfer_points <user> <amount>` | Send diamonds to another user |

**Example Usage:**
```
/claim_daily
/get_points @username
/transfer_points @friend 100
```

### 🎲 **Gaming Commands**

| Command | Channel | Description | Payout |
|---------|---------|-------------|---------|
| `/gambling_menu` | gambling | Access casino games menu | - |
| **Dice Game** | gambling | Guess number 1-6 (min bet: 10💎) | 5x multiplier |
| **Coinflip** | gambling | Pick heads/tails (min bet: 10💎) | 2x multiplier |
| **Lucky Slots** | gambling | Auto-spin reels (fixed bet: 30💎) | Up to 12x multiplier |

**Gaming Flow:**
```
1. Use /gambling_menu
2. Click game button
3. Fill modal form
4. Results auto-delete in 3 minutes
```

### 🎁 **Gift Card Commands**

| Command | Channel | Syntax | Description |
|---------|---------|--------|-------------|
| `/generate_gift_card` | gift-cards | `/generate_gift_card <amount>` | Create gift card (500-100k💎) |
| `/check_gift_card` | gift-cards/verification | `/check_gift_card <code>` | Verify gift card status |
| `/redeem_gift_card` | gift-cards | `/redeem_gift_card` | Legacy PCRP system |
| `/convert_points` | gift-cards | `/convert_points` | Same as redeem_gift_card |

**Gift Card Flow:**
```
💎 User Flow:
1. /generate_gift_card 5000
2. Pay 5000💎 → Get code via DM
3. Share/use code (7-day validity)

🛡️ Admin Flow:
1. Admin panel → Generate gift card
2. No cost → Code via DM
3. Distribute to community
```

### 📊 **Information Commands**

| Command | Channel | Description |
|---------|---------|-------------|
| `/leaderboard` | leaderboard/general | View top 10 diamond holders |
| `/test_dm` | any | Test bot's DM capability |
| `/info` | information | Show comprehensive bot info |

### 🛡️ **Admin Commands**

| Command | Access | Description |
|---------|--------|-------------|
| `/send_daily_claim` | Admin | Deploy daily claim panel |
| `/send_gift_card_panel` | Admin | Deploy gift card panel |
| `/send_info_panel` | Admin | Deploy information panel |
| `/send_point_drop_panel` | Admin | Deploy point drop panel |
| `/cleanup_old_messages` | Admin | Clean all old messages/interactions |

### 🎯 **Point Drop System Commands**

| Command | Access | Description |
|---------|--------|-------------|
| **Create Ticket** | Restricted Users | Request point drop event (100-10k💎) |
| `/approve_point_drop` | Admin | Approve ticket by ID |
| `/reject_point_drop` | Admin | Reject ticket by ID |

---

## 🎮 Interactive Systems

### 💎 **Daily Claim System**
```
🔥 STREAK MULTIPLIER SYSTEM
╔══════════════════════════╗
║ Day 1-3:   1.1x - 1.3x  ║
║ Day 4-7:   1.4x - 1.7x  ║
║ Day 8-15:  1.8x - 2.5x  ║
║ Day 16+:   3.0x MAX     ║
╚══════════════════════════╝

Base: 50💎 × Streak = Final Reward
Cooldown: 24 hours
Reset: 36+ hours breaks streak
```

### 🎰 **Casino Games Deep Dive**

#### 🎲 Dice Game
```
📊 DICE GAME MECHANICS
╔════════════════════════╗
║ Guess: 1-6            ║
║ Min Bet: 10💎         ║
║ Win Rate: 16.67%      ║
║ Payout: 5x bet        ║
║ House Edge: 16.67%    ║
╚════════════════════════╝
```

#### 🪙 Coinflip Game
```
📊 COINFLIP MECHANICS
╔════════════════════════╗
║ Choice: Heads/Tails   ║
║ Min Bet: 10💎         ║
║ Win Rate: 50%         ║
║ Payout: 2x bet        ║
║ House Edge: 0%        ║
╚════════════════════════╝
```

#### 🎰 Lucky Slots
```
📊 SLOTS PAYOUT TABLE
╔═══════════════════════════════╗
║ 🍀🍀🍀 = 12x (JACKPOT!)     ║
║ 💎💎💎 = 10x (MEGA WIN!)     ║
║ ⭐⭐⭐ = 8x  (BIG WIN!)      ║
║ 🍒🍒🍒 = 3x  (WIN!)         ║
║ 🍋🍋🍋 = 3x  (WIN!)         ║
║ 🍊🍊🍊 = 3x  (WIN!)         ║
║ Any 2 Match = 1.5x           ║
╚═══════════════════════════════╝

Symbol Weights:
🍒: 30% | 🍋: 25% | 🍊: 20%
💎: 15% | ⭐: 8%  | 🍀: 2%
```

### 🎁 **Gift Card Economy**

```
💱 CONVERSION RATES
╔══════════════════════════╗
║ 100 Diamonds = 1 Rupee  ║
║ Min: 500💎 = 5 Rupees   ║
║ Max: 100k💎 = 1000 Rupees║
║ Validity: 7 Days        ║
╚══════════════════════════╝

📊 GIFT CARD STATES
Valid → Active, can be used
Claimed → Used, shows claimer
Void → Expired after 7 days
```

### 🎯 **Point Drop Mining System**

```
⛏️ MINING EVENT FLOW
╔═══════════════════════════════╗
║ 1. Restricted users create    ║
║    tickets (100-10k💎)       ║
║ 2. Admin reviews & approves   ║
║ 3. Mining event auto-starts   ║
║ 4. Unlimited claims until:    ║
║    • Time expires             ║
║    • Diamonds depleted        ║
║ 5. Top miners get recognition ║
╚═══════════════════════════════╝

🎫 TICKET REQUIREMENTS
• Title (max 100 chars)
• Diamond amount (100-10k)
• Duration (1-60 minutes)
• Description (max 500 chars)
• Reason (max 300 chars)
```

---

## 🏗️ Technical Architecture

### 📊 **Data Structure**

```json
{
  "users": {
    "user_id": {
      "points": 0,
      "last_claim": "ISO_date",
      "streak": 0,
      "total_earned": 0,
      "total_spent": 0,
      "inventory": [],
      "gift_cards_redeemed": []
    }
  },
  "generated_gift_cards": {
    "GC-CODE": {
      "value": 5600,
      "status": "valid|claimed|void",
      "created_at": "ISO_date",
      "created_by": "user_id",
      "claimed_by": "user_id",
      "claimed_at": "ISO_date",
      "void_reason": "expired",
      "admin_generated": false
    }
  },
  "settings": {
    "daily_reward": 50,
    "max_streak_multiplier": 3.0,
    "conversion_rate": 100
  }
}
```

### 🔄 **Auto-Management Systems**

```
⚙️ AUTOMATED PROCESSES
╔═══════════════════════════════╗
║ 🕐 5-Min Auto-Save           ║
║ 🧹 Hourly Message Cleanup    ║
║ ⏰ Gift Card Expiry Check    ║
║ 🗑️ Old Ticket Cleanup       ║
║ 📱 Panel Refresh System      ║
╚═══════════════════════════════╝
```

### 🛡️ **Security Features**

```
🔒 SECURITY MEASURES
╔═══════════════════════════════╗
║ ✅ Role-based admin access    ║
║ ✅ Channel command limits     ║
║ ✅ Input validation          ║
║ ✅ Rate limiting protection  ║
║ ✅ DM privacy for codes      ║
║ ✅ Auto-deletion sensitive   ║
╚═══════════════════════════════╝
```

---

## 📱 Bot Connectivity & Integration

### 🔗 **Discord Integration Flow**

```
📡 BOT CONNECTION FLOW
╔════════════════════════════════════╗
║ 1. Bot connects to Discord API    ║
║ 2. Registers 20 slash commands    ║
║ 3. Deploys interactive panels     ║
║ 4. Listens for interactions       ║
║ 5. Processes commands/buttons     ║
║ 6. Updates database & responds    ║
║ 7. Auto-cleanup & maintenance     ║
╚════════════════════════════════════╝
```

### 🎯 **Command Processing Pipeline**

```mermaid
sequenceDiagram
    participant U as User
    participant D as Discord
    participant B as Bot
    participant DB as Database
    
    U->>D: /command or button click
    D->>B: Interaction received
    B->>B: Validate permissions
    B->>B: Check channel restrictions
    B->>DB: Read/Write data
    B->>D: Send response
    D->>U: Display result
    B->>B: Auto-cleanup timer
```

### 📊 **Interaction Types**

| Type | Examples | Auto-Cleanup |
|------|----------|--------------|
| **Slash Commands** | `/claim_daily`, `/transfer_points` | Varies |
| **Button Interactions** | Casino games, panels | 1-5 minutes |
| **Modal Submissions** | Game forms, tickets | 3-10 minutes |
| **Select Menus** | Gift card selection | 5 minutes |

---

## 🎮 User Experience Flow

### 👤 **New User Journey**
```
🆕 NEW USER ONBOARDING
╔══════════════════════════════════════╗
║ 1. Join server → See bot panels     ║
║ 2. /info → Learn about commands     ║
║ 3. /claim_daily → Get first diamonds ║
║ 4. /gambling_menu → Try casino      ║
║ 5. Build streak → Increase rewards  ║
║ 6. /generate_gift_card → Get rewards ║
╚══════════════════════════════════════╝
```

### 🎯 **Advanced User Features**
```
🚀 POWER USER FEATURES
╔══════════════════════════════════════╗
║ • Point drop ticket system          ║
║ • Mining event participation        ║
║ • Gift card trading/sharing         ║
║ • Leaderboard competition           ║
║ • Casino strategy development       ║
║ • Community event organization      ║
╚══════════════════════════════════════╝
```

---

## 🎛️ Admin Panel Guide

### 🛡️ **Admin Capabilities**

```
👑 ADMIN CONTROL CENTER
╔══════════════════════════════════════╗
║ 📋 Panel Management                  ║
║ • Deploy/refresh all panels         ║
║ • Clean up old messages             ║
║                                     ║
║ 🎁 Gift Card System                 ║
║ • Generate unlimited gift cards     ║
║ • No diamond cost for admin         ║
║                                     ║
║ 🎯 Point Drop Events                ║
║ • Review and approve tickets        ║
║ • Manually trigger mining events    ║
║                                     ║
║ 📊 System Monitoring                ║
║ • View all user statistics          ║
║ • Monitor bot performance           ║
╚══════════════════════════════════════╝
```

### 🎫 **Point Drop Ticket Management**

```
📋 TICKET REVIEW PROCESS
╔══════════════════════════════════════╗
║ 1. User submits ticket              ║
║ 2. Appears in admin verification    ║
║ 3. Admin reviews content            ║
║ 4. ✅ Approve → Event starts        ║
║ 5. ❌ Reject → User notified        ║
║ 6. Auto-cleanup after 7 days        ║
╚══════════════════════════════════════╝
```

---

## 🔧 Troubleshooting Guide

### ❌ **Common Issues & Solutions**

| Issue | Cause | Solution |
|-------|-------|----------|
| **Bot not responding** | Invalid token | Check `DISCORD_TOKEN` in secrets |
| **Commands not working** | Wrong channel | Use commands in designated channels |
| **DM delivery fails** | User DMs disabled | User: Enable DMs from server members |
| **Admin commands blocked** | Missing permissions | Check role IDs and user permissions |


### 🔍 **Debug Commands**

```bash
# Test DM functionality
/test_dm

# Check user permissions
/get_points @admin_user

# Verify panel deployment
/send_daily_claim (admin only)

# Clean up issues
/cleanup_old_messages (admin only)
```

---

## 📈 Performance & Scaling

### 📊 **Current Specifications**

```
⚡ PERFORMANCE METRICS
╔══════════════════════════════════════╗
║ Users Supported: Unlimited          ║
║ Commands/Second: 50+                 ║
║ Data Storage: JSON (scalable)       ║
║ Memory Usage: ~50-100MB              ║
║ Response Time: <1 second             ║
║ Uptime: 99.9% (Reserved VM)         ║
╚══════════════════════════════════════╝
```

### 🚀 **Scaling Considerations**

- **Database**: Can migrate to PostgreSQL for large servers
- **Memory**: Auto-cleanup prevents memory leaks
- **Rate Limits**: Built-in Discord API rate limiting
- **Storage**: JSON scales to thousands of users

---

## 🎯 Future Roadmap

### 🔮 **Planned Features**

```
🚧 COMING SOON
╔══════════════════════════════════════╗
║ 🏆 Achievement System               ║
║ 🎪 Seasonal Events                  ║
║ 📱 Web Dashboard                    ║
║ 🔄 Multi-Server Support             ║
║ 📊 Advanced Analytics               ║
║ 🎮 New Casino Games                 ║
║ 🤝 Trading System                   ║
║ 🎨 Customizable Rewards             ║
╚══════════════════════════════════════╝
```

---

## 📝 Version Information

```
🔖 VERSION DETAILS
╔══════════════════════════════════════╗
║ Bot Version: 3.0                    ║
║ Discord.js: 14.20.0                 ║
║ Node.js: 16+                        ║
║ Last Updated: January 2025          ║
║ Developer: PRIMOIX                  ║
╚══════════════════════════════════════╝
```

## 📞 Support & Contributing

### 🆘 **Getting Help**
- Check this documentation first
- Use `/info` command in Discord
- Contact admin team in server
- Review console logs for errors


---

**🎮 Ready to start your diamond empire? Deploy the bot and watch your community engagement soar! 💎**

