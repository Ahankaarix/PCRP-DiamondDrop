const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder,
    SlashCommandBuilder,
    PermissionFlagsBits,
} = require("discord.js");
const fs = require("fs").promises;
const path = require("path");

// Bot configuration
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// Data file path
const DATA_FILE = "bot_data.json";

// Channel configuration - Update these with your channel IDs
const CHANNELS = {
    daily_claims: "1387023026301960212",
    point_drops: "1387023237782962248",
    leaderboard: "1387023490649034782",
    transfers: "1387023571368415292",
    gambling: "1387023670634872873",
    gift_cards: "1387023764012797972", // Gift Card Redemption Center
    gift_card_verification: "1387119676961849464", // Gift Card Verification Panel
    information: "1387120060870688788", // Information Panel
    system_commands: "1387120060870688789", // System Commands Panel
    general: null, // Can be set to allow leaderboard from general channel
};

// Admin role configuration
const ADMIN_ROLE_ID = "1210529712926105661";
const ADMIN_USER_IDS = [
    "959692217885294632",
    "879396413010743337",
    "1054207830292447324",
];

// Function to check if user has admin role
function hasAdminRole(interaction) {
    if (!interaction.member) return false;

    // Check if user has admin role
    if (interaction.member.roles.cache.has(ADMIN_ROLE_ID)) {
        return true;
    }

    // Check if user is in admin user IDs list
    return ADMIN_USER_IDS.includes(interaction.user.id);
}

// Gift card options
const GIFT_CARDS = {
    pcrp: { name: "PCRP Gift Card", cost: 500, emoji: "🎁" },
};

// Gift card generation settings
const GIFT_CARD_SETTINGS = {
    min_conversion: 500,
    max_conversion: 100000,
    validity_days: 7,
    code_length: 12,
};

class PointsBot {
    constructor() {
        this.data = {
            users: {},
            settings: {
                daily_reward: 50,
                max_streak_multiplier: 3.0,
                conversion_rate: 100,
                drop_channel_id: null,
            },
            gift_card_requests: {},
            generated_gift_cards: {}, // Store generated gift cards
        };
        this.loadData();
    }

    async saveData() {
        try {
            await fs.writeFile(DATA_FILE, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error("Error saving data:", error);
        }
    }

    async loadData() {
        try {
            const data = await fs.readFile(DATA_FILE, "utf8");
            const loadedData = JSON.parse(data);
            this.data = { ...this.data, ...loadedData };
            console.log(
                `Loaded data for ${Object.keys(this.data.users).length} users`,
            );
        } catch (error) {
            if (error.code === "ENOENT") {
                console.log("No existing data file found, starting fresh");
            } else {
                console.error("Error loading data:", error);
            }
        }
    }

    getUserData(userId) {
        const userIdStr = userId.toString();
        if (!this.data.users[userIdStr]) {
            this.data.users[userIdStr] = {
                points: 0,
                last_claim: null,
                streak: 0,
                total_earned: 0,
                total_spent: 0,
                inventory: [],
                gift_cards_redeemed: [],
            };
        }
        return this.data.users[userIdStr];
    }

    calculateStreakMultiplier(streak) {
        const maxMultiplier = this.data.settings.max_streak_multiplier;
        return Math.min(1 + streak * 0.1, maxMultiplier);
    }

    generateGiftCardCode() {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let result = "GC-";
        for (let i = 0; i < GIFT_CARD_SETTINGS.code_length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    cleanupExpiredGiftCards() {
        const now = new Date();
        for (const [code, card] of Object.entries(
            this.data.generated_gift_cards,
        )) {
            const expiryDate = new Date(card.created_at);
            expiryDate.setDate(
                expiryDate.getDate() + GIFT_CARD_SETTINGS.validity_days,
            );

            if (now > expiryDate && card.status === "valid") {
                card.status = "void";
                card.void_reason = "expired";
            }
        }
    }
}

const pointsSystem = new PointsBot();

// Auto-save every 5 minutes and cleanup expired gift cards
setInterval(
    async () => {
        pointsSystem.cleanupExpiredGiftCards();
        await pointsSystem.saveData();
    },
    5 * 60 * 1000,
);

// Auto-cleanup old messages every hour
setInterval(
    async () => {
        console.log("🧹 Hourly auto-cleanup starting...");
        try {
            // Clean up old user-generated gift cards
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            let cleanedCards = 0;

            for (const [code, card] of Object.entries(
                pointsSystem.data.generated_gift_cards,
            )) {
                const cardDate = new Date(card.created_at);
                if (
                    cardDate < oneDayAgo &&
                    (card.status === "void" || card.status === "claimed")
                ) {
                    delete pointsSystem.data.generated_gift_cards[code];
                    cleanedCards++;
                }
            }

            // Clean up old point drop tickets
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            let cleanedTickets = 0;

            for (const [ticketId, ticket] of Object.entries(pointDropTickets)) {
                const ticketDate = new Date(ticket.createdAt);
                if (ticketDate < sevenDaysAgo) {
                    delete pointDropTickets[ticketId];
                    cleanedTickets++;
                }
            }

            if (cleanedCards > 0 || cleanedTickets > 0) {
                console.log(
                    `🧹 Auto-cleanup: ${cleanedCards} cards, ${cleanedTickets} tickets removed`,
                );
                if (cleanedCards > 0) await pointsSystem.saveData();
            }
        } catch (error) {
            console.error("Error during auto-cleanup:", error);
        }
    },
    60 * 60 * 1000, // Every hour
);

// UNO Game System
let activeUnoGames = new Map();
let unoTickets = new Map(); // Store UNO tickets

// AI Bot Players
const aiBotPlayers = [
    { id: "ai_bot_1", name: "🤖 UNO Master", difficulty: "expert" },
    { id: "ai_bot_2", name: "🎮 Card Shark", difficulty: "hard" },
    { id: "ai_bot_3", name: "🎯 Lucky Player", difficulty: "medium" },
    { id: "ai_bot_4", name: "🎲 Rookie Bot", difficulty: "easy" },
];

// UNO Ticket System
function generateUnoTicketId() {
    return "UNO-" + Math.random().toString(36).substring(2, 10).toUpperCase();
}

function createUnoTicketPanel() {
    const embed = new EmbedBuilder()
        .setTitle("🃏 UNO Game Ticket System")
        .setDescription(
            `**Create Your UNO Gaming Session!**\n\`\`\`\n` +
            `    🃏 UNO TICKETS 🃏\n` +
            `  ╔═══════════════════╗\n` +
            `  ║ 🎫 Create Ticket  ║\n` +
            `  ║ 💎 Set Bet Amount ║\n` +
            `  ║ 🤖 Choose AI Mode ║\n` +
            `  ║ 👥 Play with Users║\n` +
            `  ╚═══════════════════╝\n` +
            `\`\`\`\n\n` +
            `**How to Start:**\n` +
            `1. 🎫 **Create Ticket** - Set up your game session\n` +
            `2. 💎 **Set Bet** - Choose diamond amount (10-1000 💎)\n` +
            `3. 🤖 **AI Options** - Choose difficulty or human-only\n` +
            `4. 🎮 **Start Game** - Begin your UNO showdown!\n\n` +
            `**Game Features:**\n` +
            `• 💎 **Diamond Betting** - Win prizes based on placement\n` +
            `• 🤖 **AI Players** - 4 difficulty levels available\n` +
            `• 🏆 **Prize Distribution** - 50%/30%/20% for top 3\n` +
            `• ⚡ **Auto-cleanup** - Games clean up if inactive\n\n` +
            `**Betting Ranges:**\n` +
            `• Minimum Bet: 10 💎 per player\n` +
            `• Maximum Bet: 1000 💎 per player\n` +
            `• Winner gets 50% of total prize pool\n\n` +
            `**AI Difficulty Levels:**\n` +
            `🎲 **EASY** - 70% play rate, basic strategy\n` +
            `🎯 **MEDIUM** - 85% play rate, prefers action cards\n` +
            `🎮 **HARD** - 90% play rate, strategic choices\n` +
            `🤖 **EXPERT** - 95% play rate, optimal strategy\n\n` +
            `Click **Create UNO Ticket** to start your gaming session!`,
        )
        .setColor(0x9932cc)
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("create_uno_ticket")
            .setLabel("🎫 Create UNO Ticket")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("🃏"),
        new ButtonBuilder()
            .setCustomId("uno_rules_guide")
            .setLabel("📋 Rules & Guide")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("📖"),
        new ButtonBuilder()
            .setCustomId("uno_active_games")
            .setLabel("🎮 Active Games")
            .setStyle(ButtonStyle.Success)
            .setEmoji("👀"),
    );

    return { embeds: [embed], components: [row] };
}

class UnoGame {
    constructor(channelId, creatorId) {
        this.gameId = `uno_${Date.now()}`;
        this.channelId = channelId;
        this.creatorId = creatorId;
        this.players = [creatorId];
        this.status = "lobby";
        this.deck = this.createDeck();
        this.hands = new Map();
        this.discardPile = [];
        this.currentPlayerIndex = 0;
        this.direction = 1;
        this.autoCleanupTimer = null;
        this.betAmount = 0;
        this.totalPrizePool = 0;
        this.playerBets = new Map();
        this.finishedPlayers = [];
        this.aiPlayers = new Map(); // Track AI players
        this.gameStartTime = null;
        this.prizeDistribution = {
            1: 0.5, // Winner gets 50%
            2: 0.3, // Second place gets 30%
            3: 0.2, // Third place gets 20%
        };
    }

    addAIPlayer() {
        if (this.players.length >= 10) return false;

        const availableAI = aiBotPlayers.filter(
            (bot) => !this.players.includes(bot.id),
        );
        if (availableAI.length === 0) return false;

        const aiBot =
            availableAI[Math.floor(Math.random() * availableAI.length)];
        this.players.push(aiBot.id);
        this.aiPlayers.set(aiBot.id, aiBot);

        // AI doesn't need to pay bet, but add to prize pool for balance
        if (this.betAmount > 0) {
            this.totalPrizePool += this.betAmount;
        }

        return aiBot;
    }

    async makeAIMove(aiPlayerId) {
        const aiData = this.aiPlayers.get(aiPlayerId);
        if (!aiData) return false;

        const hand = this.hands.get(aiPlayerId);
        const topCard = this.discardPile[this.discardPile.length - 1];
        const playableCards = hand.filter((card) =>
            this.canPlayCard(card, topCard),
        );

        // AI decision making based on difficulty
        let cardToPlay = null;

        if (playableCards.length > 0) {
            switch (aiData.difficulty) {
                case "easy":
                    // 70% chance to play first playable card
                    if (Math.random() < 0.7) {
                        cardToPlay = playableCards[0];
                    }
                    break;
                case "medium":
                    // 85% chance to play, prefers action cards
                    if (Math.random() < 0.85) {
                        const actionCards = playableCards.filter((card) =>
                            [
                                "skip",
                                "reverse",
                                "draw2",
                                "wild",
                                "wild_draw4",
                            ].includes(card.value),
                        );
                        cardToPlay =
                            actionCards.length > 0
                                ? actionCards[0]
                                : playableCards[0];
                    }
                    break;
                case "hard":
                    // 90% chance to play, strategic card choice
                    if (Math.random() < 0.9) {
                        if (hand.length === 2) {
                            // Save wild cards for last
                            const nonWild = playableCards.filter(
                                (card) => card.color !== "wild",
                            );
                            cardToPlay =
                                nonWild.length > 0
                                    ? nonWild[0]
                                    : playableCards[0];
                        } else {
                            cardToPlay = playableCards[0];
                        }
                    }
                    break;
                case "expert":
                    // 95% chance to play, very strategic
                    if (Math.random() < 0.95) {
                        // Complex AI logic here
                        cardToPlay = this.getOptimalAICard(
                            playableCards,
                            hand,
                            topCard,
                        );
                    }
                    break;
            }
        }

        if (cardToPlay) {
            const handIndex = hand.indexOf(cardToPlay);
            hand.splice(handIndex, 1);
            this.discardPile.push(cardToPlay);
            return { action: "play", card: cardToPlay };
        } else {
            // Draw a card
            if (this.deck.length > 0) {
                const drawnCard = this.deck.pop();
                hand.push(drawnCard);
                return { action: "draw", card: drawnCard };
            }
        }

        return false;
    }

    getOptimalAICard(playableCards, hand, topCard) {
        // Expert AI strategy
        if (hand.length === 2) {
            // Try to play non-wild cards when close to winning
            const nonWild = playableCards.filter(
                (card) => card.color !== "wild",
            );
            if (nonWild.length > 0) return nonWild[0];
        }

        // Prefer action cards to disrupt opponents
        const actionCards = playableCards.filter((card) =>
            ["skip", "reverse", "draw2"].includes(card.value),
        );
        if (actionCards.length > 0) return actionCards[0];

        // Save wild cards for strategic moments
        const wildCards = playableCards.filter((card) => card.color === "wild");
        const regularCards = playableCards.filter(
            (card) => card.color !== "wild",
        );

        return regularCards.length > 0 ? regularCards[0] : wildCards[0];
    }

    createDeck() {
        const colors = ["red", "blue", "green", "yellow"];
        const values = [
            "0",
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7",
            "8",
            "9",
            "skip",
            "reverse",
            "draw2",
        ];
        const deck = [];

        // Number cards and action cards
        for (const color of colors) {
            for (const value of values) {
                const cardDisplay = this.getCardEmoji(color, value);
                deck.push({
                    color,
                    value,
                    emoji: cardDisplay.emoji,
                    image: cardDisplay.image,
                });
                if (value !== "0") {
                    // Add second copy except for 0
                    deck.push({
                        color,
                        value,
                        emoji: cardDisplay.emoji,
                        image: cardDisplay.image,
                    });
                }
            }
        }

        // Wild cards
        for (let i = 0; i < 4; i++) {
            const wildDisplay = this.getCardEmoji("wild", "wild");
            const wildDraw4Display = this.getCardEmoji("wild", "wild_draw4");
            deck.push({
                color: "wild",
                value: "wild",
                emoji: wildDisplay.emoji,
                image: wildDisplay.image,
            });
            deck.push({
                color: "wild",
                value: "wild_draw4",
                emoji: wildDraw4Display.emoji,
                image: wildDraw4Display.image,
            });
        }

        return this.shuffleDeck(deck);
    }

    getCardEmoji(color, value) {
        // Use online UNO card images
        const cardImages = {
            // Red cards
            red_0: "https://i.imgur.com/8XqvYjK.png",
            red_1: "https://i.imgur.com/mKJ2VHt.png",
            red_2: "https://i.imgur.com/7Nf9sZM.png",
            red_3: "https://i.imgur.com/vGq8fJp.png",
            red_4: "https://i.imgur.com/2Mz7Xjq.png",
            red_5: "https://i.imgur.com/8tHvBjM.png",
            red_6: "https://i.imgur.com/Kq3mJtP.png",
            red_7: "https://i.imgur.com/9Pv6LjN.png",
            red_8: "https://i.imgur.com/HtVq2mK.png",
            red_9: "https://i.imgur.com/LmP9VjQ.png",
            red_skip: "https://i.imgur.com/QmV7JtK.png",
            red_reverse: "https://i.imgur.com/RtN8MjL.png",
            red_draw2: "https://i.imgur.com/VmQ9LtP.png",

            // Blue cards
            blue_0: "https://i.imgur.com/NtP8VjM.png",
            blue_1: "https://i.imgur.com/MtQ7VjK.png",
            blue_2: "https://i.imgur.com/PtR9VjL.png",
            blue_3: "https://i.imgur.com/QtS8VjN.png",
            blue_4: "https://i.imgur.com/RtT9VjP.png",
            blue_5: "https://i.imgur.com/StU8VjQ.png",
            blue_6: "https://i.imgur.com/TtV9VjR.png",
            blue_7: "https://i.imgur.com/UtW8VjS.png",
            blue_8: "https://i.imgur.com/VtX9VjT.png",
            blue_9: "https://i.imgur.com/WtY8VjU.png",
            blue_skip: "https://i.imgur.com/XtZ9VjV.png",
            blue_reverse: "https://i.imgur.com/YtA8VjW.png",
            blue_draw2: "https://i.imgur.com/ZtB9VjX.png",

            // Green cards
            green_0: "https://i.imgur.com/AtC8VjY.png",
            green_1: "https://i.imgur.com/BtD9VjZ.png",
            green_2: "https://i.imgur.com/CtE8Vja.png",
            green_3: "https://i.imgur.com/DtF9Vjb.png",
            green_4: "https://i.imgur.com/EtG8Vjc.png",
            green_5: "https://i.imgur.com/FtH9Vjd.png",
            green_6: "https://i.imgur.com/GtI8Vje.png",
            green_7: "https://i.imgur.com/HtJ9Vjf.png",
            green_8: "https://i.imgur.com/ItK8Vjg.png",
            green_9: "https://i.imgur.com/JtL9Vjh.png",
            green_skip: "https://i.imgur.com/KtM8Vji.png",
            green_reverse: "https://i.imgur.com/LtN9Vjj.png",
            green_draw2: "https://i.imgur.com/MtO8Vjk.png",

            // Yellow cards
            yellow_0: "https://i.imgur.com/NtP9Vjl.png",
            yellow_1: "https://i.imgur.com/OtQ8Vjm.png",
            yellow_2: "https://i.imgur.com/PtR9Vjn.png",
            yellow_3: "https://i.imgur.com/QtS8Vjo.png",
            yellow_4: "https://i.imgur.com/RtT9Vjp.png",
            yellow_5: "https://i.imgur.com/StU8Vjq.png",
            yellow_6: "https://i.imgur.com/TtV9Vjr.png",
            yellow_7: "https://i.imgur.com/UtW8Vjs.png",
            yellow_8: "https://i.imgur.com/VtX9Vjt.png",
            yellow_9: "https://i.imgur.com/WtY8Vju.png",
            yellow_skip: "https://i.imgur.com/XtZ9Vjv.png",
            yellow_reverse: "https://i.imgur.com/YtA8Vjw.png",
            yellow_draw2: "https://i.imgur.com/ZtB9Vjx.png",

            // Wild cards
            wild: "https://i.imgur.com/AtC9Vjy.png",
            wild_draw4: "https://i.imgur.com/BtD8Vjz.png",
        };

        const cardKey = color === "wild" ? value : `${color}_${value}`;
        const imageUrl = cardImages[cardKey];

        // Fallback to emoji if image not found
        const colorEmojis = {
            red: "🔴",
            blue: "🔵",
            green: "🟢",
            yellow: "🟡",
        };

        const valueEmojis = {
            skip: "⏭️",
            reverse: "🔄",
            draw2: "➕2️⃣",
            wild: "🌈",
            wild_draw4: "🌈⚡",
        };

        if (color === "wild") {
            return { emoji: valueEmojis[value] || "🌈", image: imageUrl };
        }

        const emoji = valueEmojis[value]
            ? `${colorEmojis[color]}${valueEmojis[value]}`
            : `${colorEmojis[color]}${value}`;

        return { emoji, image: imageUrl };
    }

    shuffleDeck(deck) {
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    }

    dealCards() {
        for (const playerId of this.players) {
            this.hands.set(playerId, []);
            for (let i = 0; i < 7; i++) {
                this.hands.get(playerId).push(this.deck.pop());
            }
        }
        // Start discard pile
        this.discardPile.push(this.deck.pop());
    }

    addPlayer(userId) {
        if (!this.players.includes(userId) && this.players.length < 10) {
            this.players.push(userId);
            return true;
        }
        return false;
    }

    getCurrentPlayer() {
        return this.players[this.currentPlayerIndex];
    }

    nextTurn() {
        this.currentPlayerIndex =
            (this.currentPlayerIndex + this.direction + this.players.length) %
            this.players.length;
    }

    canPlayCard(card, topCard) {
        if (card.color === "wild") return true;
        return card.color === topCard.color || card.value === topCard.value;
    }

    startAutoCleanup(message) {
        this.autoCleanupTimer = setTimeout(async () => {
            try {
                await message.delete();
                activeUnoGames.delete(this.gameId);
                console.log(`🧹 Auto-cleaned UNO game ${this.gameId}`);
            } catch (error) {
                console.log("Could not auto-clean UNO game:", error.message);
            }
        }, 10 * 1000); // 10 seconds
    }

    cancelAutoCleanup() {
        if (this.autoCleanupTimer) {
            clearTimeout(this.autoCleanupTimer);
            this.autoCleanupTimer = null;
        }
    }

    setBetAmount(amount) {
        this.betAmount = amount;
        this.totalPrizePool = amount * this.players.length;
    }

    addPlayerBet(userId, amount) {
        this.playerBets.set(userId, amount);
        this.totalPrizePool += amount;
    }

    finishPlayer(userId) {
        if (!this.finishedPlayers.includes(userId)) {
            this.finishedPlayers.push(userId);
        }
    }

    calculatePrizeDistribution() {
        const prizes = {};
        let remainingPool = this.totalPrizePool;

        for (let i = 0; i < Math.min(this.finishedPlayers.length, 3); i++) {
            const playerId = this.finishedPlayers[i];
            const position = i + 1;
            const percentage = this.prizeDistribution[position] || 0;
            const prize = Math.floor(this.totalPrizePool * percentage);
            prizes[playerId] = prize;
            remainingPool -= prize;
        }

        return prizes;
    }

    getCardImageEmbed(card) {
        if (card.image) {
            return {
                image: { url: card.image },
                description: `**Card:** ${card.emoji}`,
            };
        }
        return null;
    }
}

function createUnoLobbyButtons(gameId) {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`uno_join_${gameId}`)
            .setLabel("🎮 Join Game")
            .setStyle(ButtonStyle.Success)
            .setEmoji("🃏"),
        new ButtonBuilder()
            .setCustomId(`uno_add_ai_${gameId}`)
            .setLabel("🤖 Add AI Bot")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("🎯"),
        new ButtonBuilder()
            .setCustomId(`uno_start_${gameId}`)
            .setLabel("▶️ Start Game")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("🚀"),
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`uno_cancel_${gameId}`)
            .setLabel("❌ Cancel")
            .setStyle(ButtonStyle.Danger),
    );

    return [row1, row2];
}

function createUnoGameButtons(gameId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`uno_play_${gameId}`)
            .setLabel("🎴 Play Card")
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`uno_draw_${gameId}`)
            .setLabel("📥 Draw Card")
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`uno_call_${gameId}`)
            .setLabel("🗣️ Call UNO!")
            .setStyle(ButtonStyle.Danger),
    );
}

async function startUnoGame(channelId, creatorId, betAmount = 0) {
    const game = new UnoGame(channelId, creatorId);
    if (betAmount > 0) {
        game.setBetAmount(betAmount);
        // Deduct bet from creator
        const userData = pointsSystem.getUserData(creatorId);
        userData.points -= betAmount;
        userData.total_spent += betAmount;
        game.addPlayerBet(creatorId, betAmount);
        await pointsSystem.saveData();
    }

    activeUnoGames.set(game.gameId, game);

    const channel = client.channels.cache.get(channelId);
    if (!channel) return;

    try {
        const creator = await client.users.fetch(creatorId);

        const bettingInfo =
            betAmount > 0
                ? `💎 **Diamond Betting:** ${betAmount} 💎 per player\n` +
                  `🏆 **Prize Pool:** ${game.totalPrizePool} 💎\n` +
                  `🥇 **1st Place:** ${Math.floor(game.totalPrizePool * 0.5)} 💎 (50%)\n` +
                  `🥈 **2nd Place:** ${Math.floor(game.totalPrizePool * 0.3)} 💎 (30%)\n` +
                  `🥉 **3rd Place:** ${Math.floor(game.totalPrizePool * 0.2)} 💎 (20%)\n\n`
                : "";

        const embed = new EmbedBuilder()
            .setTitle("🃏 UNO Showdown 3D - Diamond Betting Lobby")
            .setDescription(
                `**Game Creator:** ${creator.displayName}\n\n` +
                    `**🎮 UNO BETTING LOBBY 🎮**\n` +
                    `\`\`\`\n` +
                    `    🃏 UNO SHOWDOWN 🃏\n` +
                    `  ╔═══════════════════╗\n` +
                    `  ║ 🎮 Players: 1/10  ║\n` +
                    `  ║ 💎 Betting: ${betAmount} 💎   ║\n` +
                    `  ║ 🚀 Ready to Start ║\n` +
                    `  ╚═══════════════════╝\n` +
                    `\`\`\`\n\n` +
                    bettingInfo +
                    `**Players (1):** ${creator.displayName} ✅\n\n` +
                    `**Rules:**\n` +
                    `• 2-10 players can join\n` +
                    `• Each player must bet ${betAmount} 💎 to join\n` +
                    `• Match color or number to play\n` +
                    `• Call UNO when you have 1 card!\n` +
                    `• Winners get prize distribution!\n\n` +
                    `**Special Cards:**\n` +
                    `🔄 Reverse • ⏭️ Skip • ➕2️⃣ Draw 2\n` +
                    `🌈 Wild • 🌈⚡ Wild Draw 4\n\n` +
                    `⚠️ **Auto-cleanup in 10 seconds!**`,
            )
            .setColor(0xffd700)
            .setThumbnail("https://i.imgur.com/AtC9Vjy.png")
            .setTimestamp();

        const components = createUnoLobbyButtons(game.gameId);
        const message = await channel.send({
            embeds: [embed],
            components: [components],
        });

        // Start auto-cleanup timer
        game.startAutoCleanup(message);

        return message;
    } catch (error) {
        console.error("Error starting UNO game:", error);
        activeUnoGames.delete(game.gameId);
    }
}

async function handleUnoJoin(interaction, gameId) {
    const game = activeUnoGames.get(gameId);
    if (!game) {
        return await interaction.reply({
            content: "❌ This game no longer exists!",
            ephemeral: true,
        });
    }

    if (game.status !== "lobby") {
        return await interaction.reply({
            content: "❌ This game has already started!",
            ephemeral: true,
        });
    }

    // Check betting requirements
    if (game.betAmount > 0) {
        const userData = pointsSystem.getUserData(interaction.user.id);
        if (userData.points < game.betAmount) {
            return await interaction.reply({
                content: `❌ You need ${game.betAmount} 💎 to join this betting game! You have ${userData.points} 💎`,
                ephemeral: true,
            });
        }
    }

    if (game.addPlayer(interaction.user.id)) {
        // Deduct bet if required
        if (game.betAmount > 0) {
            const userData = pointsSystem.getUserData(interaction.user.id);
            userData.points -= game.betAmount;
            userData.total_spent += game.betAmount;
            game.addPlayerBet(interaction.user.id, game.betAmount);
            await pointsSystem.saveData();
        }

        // Cancel auto-cleanup when someone joins
        game.cancelAutoCleanup();

        await updateUnoLobbyDisplay(interaction, game);

        await interaction.followUp({
            content: `🎮 ${interaction.user.displayName} joined the UNO betting game and paid ${game.betAmount} 💎!`,
            ephemeral: false,
        });
    } else {
        await interaction.reply({
            content: "❌ You're already in this game or it's full!",
            ephemeral: true,
        });
    }
}

async function handleUnoAddAI(interaction, gameId) {
    const game = activeUnoGames.get(gameId);
    if (!game) {
        return await interaction.reply({
            content: "❌ This game no longer exists!",
            ephemeral: true,
        });
    }

    if (game.status !== "lobby") {
        return await interaction.reply({
            content: "❌ This game has already started!",
            ephemeral: true,
        });
    }

    if (interaction.user.id !== game.creatorId) {
        return await interaction.reply({
            content: "❌ Only the game creator can add AI bots!",
            ephemeral: true,
        });
    }

    const aiBot = game.addAIPlayer();
    if (aiBot) {
        game.cancelAutoCleanup();
        await updateUnoLobbyDisplay(interaction, game);

        await interaction.followUp({
            content: `🤖 ${aiBot.name} (${aiBot.difficulty.toUpperCase()} AI) joined the game!`,
            ephemeral: false,
        });
    } else {
        await interaction.reply({
            content:
                "❌ Cannot add more AI bots (game full or no AI available)!",
            ephemeral: true,
        });
    }
}

async function updateUnoLobbyDisplay(interaction, game) {
    const playerList = await Promise.all(
        game.players.map(async (id) => {
            if (game.aiPlayers.has(id)) {
                const aiData = game.aiPlayers.get(id);
                return `${aiData.name} ✅ (${aiData.difficulty.toUpperCase()} AI)`;
            }
            try {
                const user = await client.users.fetch(id);
                return user.displayName + " ✅";
            } catch {
                return `User ${id} ✅`;
            }
        }),
    );

    const bettingInfo =
        game.betAmount > 0
            ? `💎 **Diamond Betting:** ${game.betAmount} 💎 per player\n` +
              `🏆 **Prize Pool:** ${game.totalPrizePool} 💎\n` +
              `🥇 **1st Place:** ${Math.floor(game.totalPrizePool * 0.5)} 💎 (50%)\n` +
              `🥈 **2nd Place:** ${Math.floor(game.totalPrizePool * 0.3)} 💎 (30%)\n` +
              `🥉 **3rd Place:** ${Math.floor(game.totalPrizePool * 0.2)} 💎 (20%)\n\n`
            : "";

    const embed = new EmbedBuilder()
        .setTitle("🃏 UNO Showdown 3D - Diamond Betting Lobby")
        .setDescription(
            `**Game Creator:** ${playerList[0].replace(" ✅", "").replace(" (EASY AI)", "").replace(" (MEDIUM AI)", "").replace(" (HARD AI)", "").replace(" (EXPERT AI)", "")}\n\n` +
                `**🎮 UNO BETTING LOBBY 🎮**\n` +
                `\`\`\`\n` +
                `    🃏 UNO SHOWDOWN 🃏\n` +
                `  ╔═══════════════════╗\n` +
                `  ║ 🎮 Players: ${game.players.length}/10  ║\n` +
                `  ║ 💎 Betting: ${game.betAmount} 💎   ║\n` +
                `  ║ 🤖 AI Support: ON ║\n` +
                `  ║ 🚀 Ready to Start ║\n` +
                `  ╚═══════════════════╝\n` +
                `\`\`\`\n\n` +
                bettingInfo +
                `**Players (${game.players.length}):** ${playerList.join(", ")}\n\n` +
                `**Rules:**\n` +
                `• 2-10 players can join\n` +
                `• 🤖 AI bots can fill empty slots\n` +
                `• Each player must bet ${game.betAmount} 💎\n` +
                `• Match color or number to play\n` +
                `• Call UNO when you have 1 card!\n` +
                `• Winners get prize distribution!\n\n` +
                `**AI Difficulty Levels:**\n` +
                `🎲 EASY • 🎯 MEDIUM • 🎮 HARD • 🤖 EXPERT\n\n` +
                `**Special Cards:**\n` +
                `🔄 Reverse • ⏭️ Skip • ➕2️⃣ Draw 2\n` +
                `🌈 Wild • 🌈⚡ Wild Draw 4\n\n` +
                `✅ **Game active - auto-cleanup disabled**`,
        )
        .setColor(0x00ff00)
        .setTimestamp();

    const components = createUnoLobbyButtons(game.gameId);
    await interaction.update({ embeds: [embed], components });
}

async function handleUnoStart(interaction, gameId) {
    const game = activeUnoGames.get(gameId);
    if (!game) {
        return await interaction.reply({
            content: "❌ This game no longer exists!",
            ephemeral: true,
        });
    }

    if (interaction.user.id !== game.creatorId) {
        return await interaction.reply({
            content: "❌ Only the game creator can start the game!",
            ephemeral: true,
        });
    }

    if (game.players.length < 2) {
        return await interaction.reply({
            content: "❌ Need at least 2 players to start!",
            ephemeral: true,
        });
    }

    game.status = "active";
    game.dealCards();

    const currentPlayer = await client.users.fetch(game.getCurrentPlayer());
    const topCard = game.discardPile[game.discardPile.length - 1];

    const embed = new EmbedBuilder()
        .setTitle("🃏 UNO Showdown 3D - Game Started!")
        .setDescription(
            `**🎮 GAME ACTIVE 🎮**\n` +
                `\`\`\`\n` +
                `    🃏 UNO IN PROGRESS 🃏\n` +
                `  ╔═══════════════════════╗\n` +
                `  ║ Players: ${game.players.length}           ║\n` +
                `  ║ Current: ${currentPlayer.displayName.substring(0, 10)}    ║\n` +
                `  ╚═══════════════════════╝\n` +
                `\`\`\`\n\n` +
                `**Current Player:** ${currentPlayer.displayName}\n` +
                `**Top Card:** ${topCard.emoji}\n` +
                `**Direction:** ${game.direction === 1 ? "➡️ Clockwise" : "⬅️ Counter-clockwise"}\n\n` +
                `**Players:**\n` +
                (
                    await Promise.all(
                        game.players.map(async (id, index) => {
                            const user = await client.users.fetch(id);
                            const cards = game.hands.get(id).length;
                            const indicator =
                                index === game.currentPlayerIndex ? "👉" : "  ";
                            return `${indicator} ${user.displayName}: ${cards} cards`;
                        }),
                    )
                ).join("\n") +
                `\n\n**Instructions:**\n` +
                `• Use buttons to play, draw, or call UNO\n` +
                `• Match the color or number\n` +
                `• Call UNO when you have 1 card left!\n\n` +
                `⚠️ **Auto-cleanup in 10 seconds if no activity!**`,
        )
        .setColor(0x00ff00)
        .setTimestamp();

    const components = createUnoGameButtons(game.gameId);
    await interaction.update({ embeds: [embed], components: [components] });

    // Restart auto-cleanup for the active game
    game.startAutoCleanup(interaction.message);
}

async function handleUnoCancel(interaction, gameId) {
    const game = activeUnoGames.get(gameId);
    if (!game) {
        return await interaction.reply({
            content: "❌ This game no longer exists!",
            ephemeral: true,
        });
    }

    if (interaction.user.id !== game.creatorId) {
        return await interaction.reply({
            content: "❌ Only the game creator can cancel the game!",
            ephemeral: true,
        });
    }

    game.cancelAutoCleanup();
    activeUnoGames.delete(gameId);

    const embed = new EmbedBuilder()
        .setTitle("❌ UNO Game Cancelled")
        .setDescription("The game has been cancelled by the creator.")
        .setColor(0xff0000);

    await interaction.update({ embeds: [embed], components: [] });

    // Auto-delete cancellation message
    setTimeout(async () => {
        try {
            await interaction.message.delete();
        } catch (error) {
            console.log(
                "Could not delete cancelled UNO message:",
                error.message,
            );
        }
    }, 5000);
}

// Utility functions
function createDailyClaimButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("claim_daily")
            .setLabel("Claim Daily Diamonds")
            .setStyle(ButtonStyle.Success)
            .setEmoji("💎"),
    );
}

function createGamblingButtons() {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("dice_game")
            .setLabel("🎲 Dice Game")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("🎲"),
        new ButtonBuilder()
            .setCustomId("coinflip_game")
            .setLabel("🪙 Coinflip Game")
            .setStyle(ButtonStyle.Success)
            .setEmoji("🪙"),
        new ButtonBuilder()
            .setCustomId("slots_game")
            .setLabel("🎰 Lucky Slots")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("🎰"),
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("game_details")
            .setLabel("📊 Game Details")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("📊"),
    );

    return [row1, row2];
}

function createGiftCardSelect() {
    const options = Object.entries(GIFT_CARDS).map(([type, card]) => ({
        label: `${card.name} - ${card.cost} 💎`,
        description: `Cost: ${card.cost} Diamonds`,
        emoji: card.emoji,
        value: type,
    }));

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId("gift_card_select")
            .setPlaceholder("🎁 Choose a gift card to redeem...")
            .addOptions(options),
    );
}

function createGiftCardPanelButtons() {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("open_gift_ticket")
            .setLabel("🎫 Open Gift Card Ticket")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("🎁"),
        new ButtonBuilder()
            .setCustomId("dm_test_button")
            .setLabel("📧 Test DM")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("🔔"),
        new ButtonBuilder()
            .setCustomId("check_gift_card")
            .setLabel("🔘 Check Gift Card")
            .setStyle(ButtonStyle.Success)
            .setEmoji("🔍"),
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("generate_gift_card")
            .setLabel("💎 Generate Gift Card")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("🎁"),
    );

    return [row1, row2];
}

function createInfoPanelButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("user_commands")
            .setLabel("👥 User Commands")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("ℹ️"),
        new ButtonBuilder()
            .setCustomId("admin_commands")
            .setLabel("🛡️ Admin Commands")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("⚙️"),
    );
}

// Event handlers
client.once("ready", async () => {
    console.log(`${client.user.tag} has connected to Discord!`);
    console.log(`Bot is in ${client.guilds.cache.size} guilds`);

    // Register slash commands
    const commands = [
        new SlashCommandBuilder()
            .setName("claim_daily")
            .setDescription("Claim your daily reward and streak bonus"),

        new SlashCommandBuilder()
            .setName("get_points")
            .setDescription("Check your points or another user's points")
            .addUserOption((option) =>
                option
                    .setName("user")
                    .setDescription("User to check points for")
                    .setRequired(false),
            ),

        new SlashCommandBuilder()
            .setName("transfer_points")
            .setDescription("Send points to another user")
            .addUserOption((option) =>
                option
                    .setName("recipient")
                    .setDescription("User to send points to")
                    .setRequired(true),
            )
            .addIntegerOption((option) =>
                option
                    .setName("amount")
                    .setDescription("Amount of points to send")
                    .setRequired(true)
                    .setMinValue(1),
            ),

        new SlashCommandBuilder()
            .setName("gambling_menu")
            .setDescription(
                "Access the 3D gambling menu with all game options",
            ),

        new SlashCommandBuilder()
            .setName("redeem_gift_card")
            .setDescription("Convert your diamonds to gift cards"),

        new SlashCommandBuilder()
            .setName("leaderboard")
            .setDescription("View the points leaderboard"),

        new SlashCommandBuilder()
            .setName("drop_points")
            .setDescription("Admin: Start a point drop session")
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

        new SlashCommandBuilder()
            .setName("send_daily_claim")
            .setDescription(
                "Admin: Manually send daily claim button to channel",
            )
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

        new SlashCommandBuilder()
            .setName("test_dm")
            .setDescription(
                "Test if the bot can send you a DM for gift card rewards",
            ),

        new SlashCommandBuilder()
            .setName("convert_points")
            .setDescription("Convert your points into a gift card"),

        new SlashCommandBuilder()
            .setName("convert_giftcard")
            .setDescription("Convert your gift card back into points"),

        new SlashCommandBuilder()
            .setName("send_gift_card_panel")
            .setDescription("Admin: Send the gift card redemption panel")
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

        new SlashCommandBuilder()
            .setName("check_gift_card")
            .setDescription("Check the status of a gift card")
            .addStringOption((option) =>
                option
                    .setName("code")
                    .setDescription("Gift card code to check")
                    .setRequired(true),
            ),

        new SlashCommandBuilder()
            .setName("generate_gift_card")
            .setDescription("Convert diamonds to a gift card")
            .addIntegerOption((option) =>
                option
                    .setName("amount")
                    .setDescription(
                        "Amount of diamonds to convert (500-100000)",
                    )
                    .setRequired(true)
                    .setMinValue(500)
                    .setMaxValue(100000),
            ),

        new SlashCommandBuilder()
            .setName("info")
            .setDescription("View bot information and help"),

        new SlashCommandBuilder()
            .setName("send_info_panel")
            .setDescription("Admin: Send the information panel")
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

        new SlashCommandBuilder()
            .setName("send_point_drop_panel")
            .setDescription("Admin: Send the point drop ticket panel")
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

        new SlashCommandBuilder()
            .setName("cleanup_old_messages")
            .setDescription(
                "Admin: Clean up old bot messages and user interactions",
            )
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

        new SlashCommandBuilder()
            .setName("approve_point_drop")
            .setDescription("Admin: Approve a point drop ticket")
            .addStringOption((option) =>
                option
                    .setName("ticket_id")
                    .setDescription("Ticket ID to approve")
                    .setRequired(true),
            )
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

        new SlashCommandBuilder()
            .setName("reject_point_drop")
            .setDescription("Admin: Reject a point drop ticket")
            .addStringOption((option) =>
                option
                    .setName("ticket_id")
                    .setDescription("Ticket ID to reject")
                    .setRequired(true),
            )
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

        new SlashCommandBuilder()
            .setName("uno")
            .setDescription("Start a UNO Showdown 3D game")
            .addChannelOption((option) =>
                option
                    .setName("channel")
                    .setDescription("Channel to start the game in (optional)")
                    .setRequired(false),
            ),

        new SlashCommandBuilder()
            .setName("send_system_panel")
            .setDescription(
                "Admin: Send the comprehensive system commands panel",
            )
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

        new SlashCommandBuilder()
            .setName("send_uno_ticket_panel")
            .setDescription("Admin: Send the UNO ticket system panel")
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    ];

    try {
        await client.application.commands.set(commands);
        console.log(`Registered ${commands.length} slash commands`);
    } catch (error) {
        console.error("Failed to register commands:", error);
    }

    // Send startup panels
    setTimeout(sendStartupPanels, 10000);
});

// Interaction handlers
client.on("interactionCreate", async (interaction) => {
    if (interaction.isCommand()) {
        await handleSlashCommand(interaction);
    } else if (interaction.isButton()) {
        await handleButtonInteraction(interaction);
    } else if (interaction.isStringSelectMenu()) {
        await handleSelectMenuInteraction(interaction);
    } else if (interaction.isModalSubmit()) {
        await handleModalSubmit(interaction);
    }
});

async function handleSlashCommand(interaction) {
    const { commandName } = interaction;

    try {
        switch (commandName) {
            case "claim_daily":
                await handleDailyClaim(interaction);
                break;
            case "get_points":
                await handleGetPoints(interaction);
                break;
            case "transfer_points":
                await handleTransferPoints(interaction);
                break;
            case "gambling_menu":
                await handleGamblingMenu(interaction);
                break;
            case "redeem_gift_card":
                await handleRedeemGiftCard(interaction);
                break;
            case "leaderboard":
                await handleLeaderboard(interaction);
                break;
            case "drop_points":
                await handleDropPoints(interaction);
                break;
            case "send_daily_claim":
                await handleSendDailyClaim(interaction);
                break;
            case "test_dm":
                await handleTestDM(interaction);
                break;
            case "convert_points":
                await handleConvertPoints(interaction);
                break;
            case "convert_giftcard":
                await handleConvertGiftCard(interaction);
                break;
            case "send_gift_card_panel":
                await handleSendGiftCardPanel(interaction);
                break;
            case "check_gift_card":
                await handleCheckGiftCard(interaction);
                break;
            case "generate_gift_card":
                await handleGenerateGiftCard(interaction);
                break;
            case "info":
                await handleInfo(interaction);
                break;
            case "send_info_panel":
                await handleSendInfoPanel(interaction);
                break;
            case "send_point_drop_panel":
                await handleSendPointDropPanel(interaction);
                break;
            case "approve_point_drop":
                await handleApprovePointDrop(interaction);
                break;
            case "reject_point_drop":
                await handleRejectPointDrop(interaction);
                break;
            case "cleanup_old_messages":
                await handleCleanupOldMessages(interaction);
                break;
            case "uno":
                await handleUnoCommand(interaction);
                break;
            case "send_system_panel":
                await handleSendSystemPanel(interaction);
                break;
            case "send_uno_ticket_panel":
                await handleSendUnoTicketPanel(interaction);
                break;
        }
    } catch (error) {
        console.error("Error handling slash command:", error);
        const embed = new EmbedBuilder()
            .setTitle("❌ Error")
            .setDescription("An error occurred while processing your command.")
            .setColor(0xff0000);

        if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ embeds: [embed] });
        } else {
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
}

async function handleButtonInteraction(interaction) {
    const { customId } = interaction;

    try {
        switch (customId) {
            case "claim_daily":
                await handleDailyClaimButton(interaction);
                break;
            case "dice_game":
                await showDiceModal(interaction);
                break;
            case "coinflip_game":
                await showCoinflipModal(interaction);
                break;
            case "slots_game":
                await handleSlotsGame(interaction);
                break;
            case "game_details":
                await showGameDetails(interaction);
                break;
            case "open_gift_ticket":
                await handleOpenGiftTicket(interaction);
                break;
            case "dm_test_button":
                await handleTestDM(interaction);
                break;
            case "confirm_convert_back":
                await handleConfirmConvertBack(interaction);
                break;
            case "check_gift_card":
                if (
                    interaction.channelId !== CHANNELS.gift_cards &&
                    interaction.channelId !== CHANNELS.gift_card_verification
                ) {
                    const embed = new EmbedBuilder()
                        .setTitle("❌ Wrong Channel")
                        .setDescription(
                            `Please use this button in <#${CHANNELS.gift_cards}> or <#${CHANNELS.gift_card_verification}>`,
                        )
                        .setColor(0xff0000);
                    return await interaction.reply({
                        embeds: [embed],
                        ephemeral: true,
                    });
                }
                await showGiftCardCheckModal(interaction);
                break;
            case "generate_gift_card":
                if (!hasAdminRole(interaction)) {
                    const embed = new EmbedBuilder()
                        .setTitle("❌ Access Denied")
                        .setDescription(
                            "You need the admin role to use this feature.",
                        )
                        .setColor(0xff0000);
                    return await interaction.reply({
                        embeds: [embed],
                        ephemeral: true,
                    });
                }
                await showGenerateGiftCardModal(interaction);
                break;
            case "user_commands":
                await showUserCommands(interaction);
                break;
            case "admin_commands":
                await showAdminCommands(interaction);
                break;
            case "admin_generate_gift_card":
                if (!hasAdminRole(interaction)) {
                    const embed = new EmbedBuilder()
                        .setTitle("❌ Access Denied")
                        .setDescription(
                            "You need admin privileges to use this feature.",
                        )
                        .setColor(0xff0000);
                    return await interaction.reply({
                        embeds: [embed],
                        ephemeral: true,
                    });
                }
                await showAdminGenerateGiftCardModal(interaction);
                break;
        }

        // Handle ticket approval/rejection
        if (customId.startsWith("approve_ticket_")) {
            const ticketId = customId.replace("approve_ticket_", "");
            await handleTicketApproval(interaction, ticketId, true);
        } else if (customId.startsWith("reject_ticket_")) {
            const ticketId = customId.replace("reject_ticket_", "");
            await handleTicketApproval(interaction, ticketId, false);
        }

        switch (customId) {
            case "create_point_drop_ticket":
                if (interaction.channelId !== CHANNELS.point_drops) {
                    const embed = new EmbedBuilder()
                        .setTitle("❌ Wrong Channel")
                        .setDescription(
                            `Please use this button in <#${CHANNELS.point_drops}>`,
                        )
                        .setColor(0xff0000);
                    return await interaction.reply({
                        embeds: [embed],
                        ephemeral: true,
                    });
                }
                await showPointDropTicketModal(interaction);
                break;
            case "point_drop_guidelines":
                await showPointDropGuidelines(interaction);
                break;

            case "point_drop_history":
                await showPointDropHistory(interaction);
                break;
        }

        // Handle diamond mining buttons
        if (customId.startsWith("mine_diamonds_")) {
            const eventId = customId.replace("mine_diamonds_", "");
            await handleDiamondMining(interaction, eventId);
        }

        // Handle UNO ticket system buttons
        switch (customId) {
            case "create_uno_ticket":
                await handleCreateUnoTicket(interaction);
                break;
            case "uno_rules_guide":
                await handleUnoRulesGuide(interaction);
                break;
            case "uno_active_games":
                await handleUnoActiveGames(interaction);
                break;
        }

        // Handle UNO ticket submission
        if (customId === "uno_ticket_submit") {
            await handleUnoTicketSubmit(interaction);
        }

        // Handle UNO ticket actions
        if (customId.startsWith("uno_ticket_")) {
            const parts = customId.split("_");
            const action = parts[2];
            const ticketId = parts[3];
            
            switch (action) {
                case "join":
                    await handleUnoTicketJoin(interaction, ticketId);
                    break;
                case "start":
                    await handleUnoTicketStart(interaction, ticketId);
                    break;
                case "addai":
                    await handleUnoTicketAddAI(interaction, ticketId);
                    break;
                case "cancel":
                    await handleUnoTicketCancel(interaction, ticketId);
                    break;
            }
        }

        // Handle UNO game buttons
        if (customId.startsWith("uno_join_")) {
            const gameId = customId.replace("uno_join_", "");
            await handleUnoJoin(interaction, gameId);
        } else if (customId.startsWith("uno_add_ai_")) {
            const gameId = customId.replace("uno_add_ai_", "");
            await handleUnoAddAI(interaction, gameId);
        } else if (customId.startsWith("uno_start_")) {
            const gameId = customId.replace("uno_start_", "");
            await handleUnoStart(interaction, gameId);
        } else if (customId.startsWith("uno_cancel_")) {
            const gameId = customId.replace("uno_cancel_", "");
            await handleUnoCancel(interaction, gameId);
        } else if (customId.startsWith("uno_play_")) {
            const gameId = customId.replace("uno_play_", "");
            await handleUnoPlay(interaction, gameId);
        } else if (customId.startsWith("uno_draw_")) {
            const gameId = customId.replace("uno_draw_", "");
            await handleUnoDraw(interaction, gameId);
        } else if (customId.startsWith("uno_call_")) {
            const gameId = customId.replace("uno_call_", "");
            await handleUnoCall(interaction, gameId);
        }
    } catch (error) {
        console.error("Error handling button interaction:", error);
    }
}

async function handleSelectMenuInteraction(interaction) {
    if (interaction.customId === "gift_card_select") {
        await handleGiftCardSelection(interaction);
    } else if (interaction.customId === "uno_ai_mode_select") {
        await handleUnoAIModeSelect(interaction);
    } else if (interaction.customId === "uno_max_players_select") {
        await handleUnoMaxPlayersSelect(interaction);
    }
}

async function handleModalSubmit(interaction) {
    const { customId } = interaction;

    try {
        if (customId === "dice_modal") {
            await handleDiceGame(interaction);
        } else if (customId === "coinflip_modal") {
            await handleCoinflipGame(interaction);
        } else if (customId === "gift_card_check_modal") {
            await handleGiftCardCheck(interaction);
        } else if (customId === "gift_card_generate_modal") {
            await handleGiftCardGeneration(interaction);
        } else if (customId === "admin_gift_card_generate_modal") {
            await handleAdminGiftCardGeneration(interaction);
        } else if (customId === "point_drop_ticket_modal") {
            await handlePointDropTicketSubmission(interaction);
        } else if (customId.startsWith("uno_bet_modal_")) {
            await handleUnoBetModal(interaction);
        } else if (customId === "uno_ticket_modal") {
            await handleUnoTicketModal(interaction);
        }
    } catch (error) {
        console.error("Error handling modal submit:", error);
    }
}

// Command implementations
async function handleDailyClaim(interaction) {
    if (interaction.channelId !== CHANNELS.daily_claims) {
        const embed = new EmbedBuilder()
            .setTitle("❌ Wrong Channel")
            .setDescription(
                `Please use this command in <#${CHANNELS.daily_claims}>`,
            )
            .setColor(0xff0000);
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    await processDailyClaim(interaction);
}

async function handleDailyClaimButton(interaction) {
    await processDailyClaim(interaction);
}

async function processDailyClaim(interaction) {
    const userData = pointsSystem.getUserData(interaction.user.id);
    const now = new Date();

    if (userData.last_claim) {
        const lastClaim = new Date(userData.last_claim);
        const timeDiff = now - lastClaim;
        const hoursDiff = timeDiff / (1000 * 60 * 60);

        if (hoursDiff < 24) {
            const nextClaim = new Date(
                lastClaim.getTime() + 24 * 60 * 60 * 1000,
            );
            const embed = new EmbedBuilder()
                .setTitle("⏰ Daily Claim Cooldown")
                .setDescription(
                    `You can claim again <t:${Math.floor(nextClaim.getTime() / 1000)}:R>`,
                )
                .setColor(0xff0000);
            return await interaction.reply({
                embeds: [embed],
                ephemeral: true,
            });
        }

        if (hoursDiff <= 36) {
            userData.streak += 1;
        } else {
            userData.streak = 1;
        }
    } else {
        userData.streak = 1;
    }

    const baseReward = pointsSystem.data.settings.daily_reward;
    const multiplier = pointsSystem.calculateStreakMultiplier(userData.streak);
    const totalReward = Math.floor(baseReward * multiplier);

    userData.points += totalReward;
    userData.total_earned += totalReward;
    userData.last_claim = now.toISOString();

    const embed = new EmbedBuilder()
        .setTitle("💎 Daily Diamond Claim!")
        .setDescription(
            `**Reward:** ${totalReward} 💎\n${interaction.user} claimed their daily diamonds!`,
        )
        .addFields(
            { name: "💰 Reward", value: `${totalReward} 💎`, inline: true },
            {
                name: "🔥 Streak",
                value: `${userData.streak} days`,
                inline: true,
            },
            {
                name: "📈 Multiplier",
                value: `${multiplier.toFixed(1)}x`,
                inline: true,
            },
        )
        .setColor(0xffd700);

    await interaction.reply({ embeds: [embed] });
    await pointsSystem.saveData();
}

async function handleGetPoints(interaction) {
    if (interaction.channelId !== CHANNELS.transfers) {
        const embed = new EmbedBuilder()
            .setTitle("❌ Wrong Channel")
            .setDescription(
                `Please use this command in <#${CHANNELS.transfers}>`,
            )
            .setColor(0xff0000);
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const targetUser = interaction.options.getUser("user") || interaction.user;
    const userData = pointsSystem.getUserData(targetUser.id);

    const embed = new EmbedBuilder()
        .setTitle(`💎 ${targetUser.displayName}'s Points`)
        .setDescription(
            `**3D Wallet:**\n\`\`\`\n╔══════════════╗\n║ 💎 ${userData.points.toLocaleString()} Diamonds ║\n║══════════════║\n║ 🔥 ${userData.streak} Day Streak ║\n╚══════════════╝\n\`\`\``,
        )
        .addFields(
            {
                name: "📊 Total Earned",
                value: `${userData.total_earned.toLocaleString()} 💎`,
                inline: true,
            },
            {
                name: "💸 Total Spent",
                value: `${userData.total_spent.toLocaleString()} 💎`,
                inline: true,
            },
            {
                name: "🎁 Gift Cards",
                value: `${userData.gift_cards_redeemed?.length || 0}`,
                inline: true,
            },
        )
        .setColor(0x0099ff);

    await interaction.reply({ embeds: [embed] });
}

async function handleTransferPoints(interaction) {
    if (interaction.channelId !== CHANNELS.transfers) {
        const embed = new EmbedBuilder()
            .setTitle("❌ Wrong Channel")
            .setDescription(
                `Please use this command in <#${CHANNELS.transfers}>`,
            )
            .setColor(0xff0000);
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const recipient = interaction.options.getUser("recipient");
    const amount = interaction.options.getInteger("amount");

    if (recipient.id === interaction.user.id) {
        return await interaction.reply({
            content: "❌ You can't transfer points to yourself!",
            ephemeral: true,
        });
    }

    const senderData = pointsSystem.getUserData(interaction.user.id);

    if (senderData.points < amount) {
        return await interaction.reply({
            content: `❌ Insufficient points! You have ${senderData.points} Diamonds.`,
            ephemeral: true,
        });
    }

    const recipientData = pointsSystem.getUserData(recipient.id);

    senderData.points -= amount;
    senderData.total_spent += amount;
    recipientData.points += amount;
    recipientData.total_earned += amount;

    const embed = new EmbedBuilder()
        .setTitle("💸 Points Transferred!")
        .setDescription(
            `**3D Transfer Animation:**\n\`\`\`\n${interaction.user.displayName.substring(0, 8)}\n    ↓ ${amount} 💎\n${recipient.displayName.substring(0, 8)}\n\`\`\`\nTransfer complete!`,
        )
        .setColor(0x00ff00);

    await interaction.reply({ embeds: [embed] });
    await pointsSystem.saveData();
}

async function handleGamblingMenu(interaction) {
    if (interaction.channelId !== CHANNELS.gambling) {
        const embed = new EmbedBuilder()
            .setTitle("❌ Wrong Channel")
            .setDescription(
                `Please use this command in <#${CHANNELS.gambling}>`,
            )
            .setColor(0xff0000);
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const userData = pointsSystem.getUserData(interaction.user.id);

    const embed = new EmbedBuilder()
        .setTitle("🎰 3D Casino Menu")
        .setDescription(
            `**Welcome to the Diamond Casino!**\n\`\`\`\n    🎰 CASINO 🎰\n  ╔═══════════════╗\n  ║ 🎲  🪙  🎰 ║\n  ║ Dice Coin Slot ║\n  ╚═══════════════╝\n\`\`\`\n**Your Balance:** ${userData.points} 💎\n\nClick a button below to play!`,
        )
        .setColor(0x800080);

    const components = createGamblingButtons();
    await interaction.reply({ embeds: [embed], components });
}

async function showDiceModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId("dice_modal")
        .setTitle("🎲 Dice Game Setup");

    const guessInput = new TextInputBuilder()
        .setCustomId("guess")
        .setLabel("Your Guess (1-6)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Enter a number between 1 and 6...")
        .setRequired(true)
        .setMaxLength(1);

    const betInput = new TextInputBuilder()
        .setCustomId("bet")
        .setLabel("Bet Amount (Minimum 10 Diamonds)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Enter your bet amount (min 10)...")
        .setRequired(true)
        .setMaxLength(10);

    modal.addComponents(
        new ActionRowBuilder().addComponents(guessInput),
        new ActionRowBuilder().addComponents(betInput),
    );

    await interaction.showModal(modal);
}

async function showCoinflipModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId("coinflip_modal")
        .setTitle("🪙 Coinflip Game Setup");

    const choiceInput = new TextInputBuilder()
        .setCustomId("choice")
        .setLabel("Your Choice (heads/tails or H/T)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Enter heads, tails, H, or T...")
        .setRequired(true)
        .setMaxLength(5);

    const betInput = new TextInputBuilder()
        .setCustomId("bet")
        .setLabel("Bet Amount (Minimum 10 Diamonds)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Enter your bet amount (min 10)...")
        .setRequired(true)
        .setMaxLength(10);

    modal.addComponents(
        new ActionRowBuilder().addComponents(choiceInput),
        new ActionRowBuilder().addComponents(betInput),
    );

    await interaction.showModal(modal);
}

async function handleDiceGame(interaction) {
    const guess = parseInt(interaction.fields.getTextInputValue("guess"));
    const bet = parseInt(interaction.fields.getTextInputValue("bet"));

    if (isNaN(guess) || guess < 1 || guess > 6) {
        return await interaction.reply({
            content: "❌ Guess must be between 1 and 6!",
            ephemeral: true,
        });
    }

    if (isNaN(bet) || bet < 10) {
        return await interaction.reply({
            content: "❌ Minimum bet is 10 diamonds!",
            ephemeral: true,
        });
    }

    const userData = pointsSystem.getUserData(interaction.user.id);

    if (userData.points < bet) {
        return await interaction.reply({
            content: `❌ Insufficient points! You have ${userData.points} 💎 but need ${bet} 💎`,
            ephemeral: true,
        });
    }

    const result = Math.floor(Math.random() * 6) + 1;
    const won = guess === result;

    const diceFaces = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

    let embed;
    if (won) {
        const winnings = bet * 5;
        userData.points += winnings;
        userData.total_earned += winnings;
        embed = new EmbedBuilder()
            .setTitle("🎲 LUCKY DICE! You Won!")
            .setDescription(
                `**🎲 Dice Game Result 🎲**\n**Your Guess:** ${guess} ${diceFaces[guess - 1]} ✅\n**Dice Result:** ${result} ${diceFaces[result - 1]}\n**Won:** ${winnings} 💎 (5x multiplier!)`,
            )
            .addFields(
                {
                    name: "💰 New Balance",
                    value: `${userData.points} 💎`,
                    inline: true,
                },
                { name: "🎯 Bet Amount", value: `${bet} 💎`, inline: true },
            )
            .setColor(0x00ff00);
    } else {
        userData.points -= bet;
        userData.total_spent += bet;
        embed = new EmbedBuilder()
            .setTitle("🎲 Dice Roll - Try Again!")
            .setDescription(
                `**🎲 Dice Game Result 🎲**\n**Your Guess:** ${guess} ${diceFaces[guess - 1]} ❌\n**Dice Result:** ${result} ${diceFaces[result - 1]}\n**Lost:** ${bet} 💎`,
            )
            .addFields(
                {
                    name: "💰 New Balance",
                    value: `${userData.points} 💎`,
                    inline: true,
                },
                { name: "🎯 Bet Amount", value: `${bet} 💎`, inline: true },
            )
            .setColor(0xff0000);
    }

    const reply = await interaction.reply({ embeds: [embed] });

    // Auto-delete the result message after 3 minutes and try to delete user's triggering message
    setTimeout(
        async () => {
            try {
                await reply.delete();
                // Also try to delete the original interaction message if it exists
                if (interaction.message && interaction.message.deletable) {
                    await interaction.message.delete();
                }
            } catch (error) {
                console.log(
                    "Could not delete gambling result message:",
                    error.message,
                );
            }
        },
        3 * 60 * 1000,
    ); // 3 minutes

    await pointsSystem.saveData();
}

async function handleCoinflipGame(interaction) {
    const choiceInput = interaction.fields
        .getTextInputValue("choice")
        .toLowerCase()
        .trim();
    const bet = parseInt(interaction.fields.getTextInputValue("bet"));

    let userChoice;
    if (["heads", "h"].includes(choiceInput)) {
        userChoice = "heads";
    } else if (["tails", "t"].includes(choiceInput)) {
        userChoice = "tails";
    } else {
        return await interaction.reply({
            content:
                "❌ Choice must be 'heads', 'tails', 'H', or 'T'!\n**Suggestions:** H (Heads) or T (Tails)",
            ephemeral: true,
        });
    }

    if (isNaN(bet) || bet < 10) {
        return await interaction.reply({
            content: "❌ Minimum bet is 10 diamonds!",
            ephemeral: true,
        });
    }

    const userData = pointsSystem.getUserData(interaction.user.id);

    if (userData.points < bet) {
        return await interaction.reply({
            content: `❌ Insufficient points! You have ${userData.points} 💎`,
            ephemeral: true,
        });
    }

    const result = Math.random() < 0.5 ? "heads" : "tails";
    const won = userChoice === result;

    const choiceIcons = { heads: "👑", tails: "💰" };
    const choiceLetters = { heads: "H", tails: "T" };

    let embed;
    if (won) {
        const winnings = bet * 2;
        userData.points += winnings;
        userData.total_earned += winnings;
        embed = new EmbedBuilder()
            .setTitle("🪙 PERFECT FLIP! You Won!")
            .setDescription(
                `**🪙 Coinflip Game Result 🪙**\n**Your Choice:** ${choiceLetters[userChoice]} (${userChoice.charAt(0).toUpperCase() + userChoice.slice(1)}) ${choiceIcons[userChoice]} ✅\n**Coin Result:** ${choiceLetters[result]} (${result.charAt(0).toUpperCase() + result.slice(1)}) ${choiceIcons[result]}\n**Won:** ${winnings} 💎 (2x multiplier!)`,
            )
            .addFields(
                {
                    name: "💰 New Balance",
                    value: `${userData.points} 💎`,
                    inline: true,
                },
                { name: "🎯 Bet Amount", value: `${bet} 💎`, inline: true },
            )
            .setColor(0x00ff00);
    } else {
        userData.points -= bet;
        userData.total_spent += bet;
        embed = new EmbedBuilder()
            .setTitle("🪙 Coin Flip - Next Time!")
            .setDescription(
                `**🪙 Coinflip Game Result 🪙**\n**Your Choice:** ${choiceLetters[userChoice]} (${userChoice.charAt(0).toUpperCase() + userChoice.slice(1)}) ${choiceIcons[userChoice]} ❌\n**Coin Result:** ${choiceLetters[result]} (${result.charAt(0).toUpperCase() + result.slice(1)}) ${choiceIcons[result]}\n**Lost:** ${bet} 💎`,
            )
            .addFields(
                {
                    name: "💰 New Balance",
                    value: `${userData.points} 💎`,
                    inline: true,
                },
                { name: "🎯 Bet Amount", value: `${bet} 💎`, inline: true },
            )
            .setColor(0xff0000);
    }

    const reply = await interaction.reply({ embeds: [embed] });

    // Auto-delete the result message after 3 minutes and try to delete user's triggering message
    setTimeout(
        async () => {
            try {
                await reply.delete();
                // Also try to delete the original interaction message if it exists
                if (interaction.message && interaction.message.deletable) {
                    await interaction.message.delete();
                }
            } catch (error) {
                console.log(
                    "Could not delete coinflip result message:",
                    error.message,
                );
            }
        },
        3 * 60 * 1000,
    ); // 3 minutes

    await pointsSystem.saveData();
}

async function handleSlotsGame(interaction) {
    const userData = pointsSystem.getUserData(interaction.user.id);
    const bet = 30;

    if (userData.points < bet) {
        return await interaction.reply({
            content: `❌ You need ${bet} 💎 to play! You have ${userData.points} 💎`,
            ephemeral: true,
        });
    }

    const symbols = ["🍒", "🍋", "🍊", "💎", "⭐", "🍀"];
    const weights = [30, 25, 20, 15, 8, 2];

    function weightedRandom() {
        const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
        let random = Math.random() * totalWeight;

        for (let i = 0; i < symbols.length; i++) {
            random -= weights[i];
            if (random <= 0) {
                return symbols[i];
            }
        }
        return symbols[0];
    }

    const reels = [weightedRandom(), weightedRandom(), weightedRandom()];

    let multiplier = 0;
    if (reels[0] === reels[1] && reels[1] === reels[2]) {
        if (reels[0] === "💎") multiplier = 10;
        else if (reels[0] === "⭐") multiplier = 8;
        else if (reels[0] === "🍀") multiplier = 12;
        else multiplier = 3;
    } else if (
        reels[0] === reels[1] ||
        reels[1] === reels[2] ||
        reels[0] === reels[2]
    ) {
        multiplier = 1.5;
    }

    const winnings = Math.floor(bet * multiplier);

    let embed;
    if (winnings > 0) {
        userData.points += winnings - bet;
        userData.total_earned += winnings;
        embed = new EmbedBuilder()
            .setTitle(multiplier >= 8 ? "🎰 JACKPOT!" : "🎰 Slots Winner!")
            .setDescription(
                `**Slot Result:** ${reels[0]} ${reels[1]} ${reels[2]}\n**Won:** ${winnings} 💎 (${multiplier}x!)`,
            )
            .addFields({
                name: "💰 Balance",
                value: `${userData.points} 💎`,
                inline: true,
            })
            .setColor(0x00ff00);
    } else {
        userData.points -= bet;
        userData.total_spent += bet;
        embed = new EmbedBuilder()
            .setTitle("🎰 Slots - Spin Again!")
            .setDescription(
                `**Slot Result:** ${reels[0]} ${reels[1]} ${reels[2]}\n**Lost:** ${bet} 💎`,
            )
            .addFields({
                name: "💰 Balance",
                value: `${userData.points} 💎`,
                inline: true,
            })
            .setColor(0xff0000);
    }

    const reply = await interaction.reply({ embeds: [embed] });

    // Auto-delete the result message after 3 minutes and try to delete user's triggering message
    setTimeout(
        async () => {
            try {
                await reply.delete();
                // Also try to delete the original interaction message if it exists
                if (interaction.message && interaction.message.deletable) {
                    await interaction.message.delete();
                }
            } catch (error) {
                console.log(
                    "Could not delete slots result message:",
                    error.message,
                );
            }
        },
        3 * 60 * 1000,
    ); // 3 minutes

    await pointsSystem.saveData();
}

async function showGameDetails(interaction) {
    const embed = new EmbedBuilder()
        .setTitle("🎮 Casino Games Details")
        .setDescription("**Choose Your Stakes!**")
        .addFields(
            {
                name: "🎲 Dice Game",
                value: "• Choose number 1-6\n• Minimum bet: 10 💎\n• Win: 5x your bet\n• Form opens on click",
                inline: true,
            },
            {
                name: "🪙 Coinflip Game",
                value: "• Pick H/T or heads/tails\n• Minimum bet: 10 💎\n• Win: 2x your bet\n• Form opens on click",
                inline: true,
            },
            {
                name: "🎰 Lucky Slots",
                value: "• Auto-spin reels\n• Fixed bet: 30 💎\n• Win: Up to 12x bet\n• Instant play",
                inline: true,
            },
        )
        .setColor(0x0099ff);

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleRedeemGiftCard(interaction) {
    // Check if in gift cards channel
    if (interaction.channelId !== CHANNELS.gift_cards) {
        const embed = new EmbedBuilder()
            .setTitle("❌ Wrong Channel")
            .setDescription(
                `Please use this command in <#${CHANNELS.gift_cards}>`,
            )
            .setColor(0xff0000);
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const userData = pointsSystem.getUserData(interaction.user.id);

    const embed = new EmbedBuilder()
        .setTitle("🎁 Gift Card Redemption Center")
        .setDescription(
            `**Your Balance:** ${userData.points} 💎\n\n**Available Gift Cards:**\n\n\`\`\`\n🎁 GIFT CARD STORE 🎁\n╔══════════════════╗\n║ Choose your reward! ║\n╚══════════════════╝\n\`\`\`\nSelect a gift card from the dropdown below:`,
        )
        .setColor(0xffd700); // Show available gift cards
    const selectMenu = createGiftCardSelect();
    await interaction.reply({
        embeds: [embed],
        components: [selectMenu],
        ephemeral: true,
    });
}

async function handleGiftCardSelection(interaction) {
    const cardType = interaction.values[0];
    const card = GIFT_CARDS[cardType];

    if (!card) {
        return await interaction.reply({
            content: "❌ Invalid gift card selected!",
            ephemeral: true,
        });
    }

    const userData = pointsSystem.getUserData(interaction.user.id);

    if (userData.points < card.cost) {
        const embed = new EmbedBuilder()
            .setTitle("❌ Insufficient Diamonds")
            .setDescription(
                `You need ${card.cost} 💎 but only have ${userData.points} 💎`,
            )
            .setColor(0xff0000);

        const reply = await interaction.reply({
            embeds: [embed],
            ephemeral: true,
        });

        // Auto-delete the insufficient funds message after 5 minutes
        setTimeout(
            async () => {
                try {
                    await reply.delete();
                } catch (error) {
                    console.log(
                        "Could not delete insufficient funds message:",
                        error.message,
                    );
                }
            },
            5 * 60 * 1000,
        ); // 5 minutes

        return;
    }

    userData.points -= card.cost;
    userData.total_spent += card.cost;
    userData.gift_cards_redeemed = userData.gift_cards_redeemed || [];
    userData.gift_cards_redeemed.push(cardType);

    const requestId =
        Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15);
    pointsSystem.data.gift_card_requests[requestId] = {
        user_id: interaction.user.id,
        card_type: cardType,
        status: "pending",
        timestamp: new Date().toISOString(),
    };

    const embed = new EmbedBuilder()
        .setTitle("🎁 Gift Card Purchase Successful!")
        .setDescription(
            `**${card.name}** purchased for ${card.cost} 💎\n\n**Request ID:** \`${requestId}\`\n\nYour gift card request has been submitted! An admin will process it soon.`,
        )
        .addFields(
            {
                name: "💰 New Balance",
                value: `${userData.points} 💎`,
                inline: true,
            },
            {
                name: "📊 Total Spent",
                value: `${userData.total_spent} 💎`,
                inline: true,
            },
        )
        .setColor(0x00ff00);

    const reply = await interaction.update({ embeds: [embed], components: [] });

    // Auto-delete the gift card purchase result after 5 minutes
    setTimeout(
        async () => {
            try {
                await reply.delete();
            } catch (error) {
                console.log(
                    "Could not delete gift card purchase result:",
                    error.message,
                );
            }
        },
        5 * 60 * 1000,
    ); // 5 minutes

    await pointsSystem.saveData();
}

async function handleLeaderboard(interaction) {
    if (
        CHANNELS.general === null &&
        interaction.channelId !== CHANNELS.leaderboard
    ) {
        const embed = new EmbedBuilder()
            .setTitle("❌ Wrong Channel")
            .setDescription(
                `Please use this command in <#${CHANNELS.leaderboard}>`,
            )
            .setColor(0xff0000);
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const sortedUsers = Object.entries(pointsSystem.data.users).sort(
        ([, a], [, b]) => b.points - a.points,
    );

    const embed = new EmbedBuilder()
        .setTitle("🏆 Diamond Points Leaderboard")
        .setDescription(
            "**Top Diamond Elites:**\n```\n🏆 LEADERBOARD 🏆\n  ╔═══════════════════╗\n  ║ 👑 DIAMOND ELITE 👑 ║\n  ╚═══════════════════╝\n```",
        )
        .setColor(0xffd700);

    const medals = ["🥇", "🥈", "🥉"];
    const trophyDesign = ["👑", "💎", "⭐"];

    for (let i = 0; i < Math.min(sortedUsers.length, 10); i++) {
        const [userId, data] = sortedUsers[i];
        let userDisplay;

        try {
            const user = await client.users.fetch(userId);
            userDisplay = `@${user.username}`;
        } catch {
            userDisplay = `User ${userId}`;
        }

        const position = i + 1;
        const positionEmoji =
            position <= 3 ? medals[position - 1] : `${position}.`;
        const decoration = position <= 3 ? trophyDesign[position - 1] : "💎";

        embed.addFields({
            name: `${positionEmoji} ${userDisplay}`,
            value: `${decoration} ${data.points.toLocaleString()} Diamonds\n🔥 ${data.streak} day streak`,
            inline: false,
        });
    }

    await interaction.reply({ embeds: [embed] });
}

async function handleDropPoints(interaction) {
    if (!hasAdminRole(interaction)) {
        const embed = new EmbedBuilder()
            .setTitle("❌ Access Denied")
            .setDescription("You need the admin role to use this command.")
            .setColor(0xff0000);
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const dropChannel = client.channels.cache.get(CHANNELS.point_drops);
    if (!dropChannel) {
        return await interaction.reply({
            content: "❌ Point drops channel not found!",
            ephemeral: true,
        });
    }

    const embed = new EmbedBuilder()
        .setTitle("💎 Diamond Mining Event Starting!")
        .setDescription(
            `**💎 DIAMOND MINING 💎**\n\`\`\`\n     💎💎💎\n    ╱ ╲ ╱ ╲\n   ╱   ╲   ╲\n  ╱_____╲___╲\n\`\`\`\n\n⏰ **Mining starts in 5 seconds!**\n💰 **Reward:** 10 💎 per claim\n⏱️ **Duration:** 60 seconds\n🎯 **Get ready to mine diamonds!**`,
        )
        .setColor(0xffd700)
        .setTimestamp();

    const message = await dropChannel.send({ embeds: [embed] });

    // Start countdown after 5 seconds
    setTimeout(async () => {
        await startDiamondMining(message, dropChannel);
    }, 5000);

    await interaction.reply({
        content: `✅ Diamond mining event started in <#${CHANNELS.point_drops}>!`,
        ephemeral: true,
    });
}

async function handleSendDailyClaim(interaction) {
    if (!hasAdminRole(interaction)) {
        const embed = new EmbedBuilder()
            .setTitle("❌ Access Denied")
            .setDescription("You need the admin role to use this command.")
            .setColor(0xff0000);
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    await sendDailyClaimPanel();
    await interaction.reply({
        content: "✅ Daily claim panel sent!",
        ephemeral: true,
    });
}

async function handleTestDM(interaction) {
    try {
        const embed = new EmbedBuilder()
            .setTitle("🔔 DM Test Successful!")
            .setDescription(
                "I can send you DMs! Your gift card rewards will be delivered here.",
            )
            .setColor(0x00ff00);

        await interaction.user.send({ embeds: [embed] });
        await interaction.reply({
            content: "✅ DM test successful! Check your DMs.",
            ephemeral: true,
        });
    } catch (error) {
        await interaction.reply({
            content:
                "❌ Cannot send you DMs! Please enable DMs from server members.",
            ephemeral: true,
        });
    }
}

async function handleConvertPoints(interaction) {
    if (interaction.channelId !== CHANNELS.gift_cards) {
        const embed = new EmbedBuilder()
            .setTitle("❌ Wrong Channel")
            .setDescription(
                `Please use this command in <#${CHANNELS.gift_cards}>`,
            )
            .setColor(0xff0000);
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    await handleRedeemGiftCard(interaction);
}

async function handleConvertGiftCard(interaction) {
    if (interaction.channelId !== CHANNELS.gift_cards) {
        const embed = new EmbedBuilder()
            .setTitle("❌ Wrong Channel")
            .setDescription(
                `Please use this command in <#${CHANNELS.gift_cards}>`,
            )
            .setColor(0xff0000);
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle("🔄 Convert Gift Card to Points")
        .setDescription(
            "This feature allows you to convert unused gift cards back to diamonds.\n\n**Note:** This feature is coming soon!",
        )
        .setColor(0x0099ff);

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleOpenGiftTicket(interaction) {
    const embed = new EmbedBuilder()
        .setTitle("🎫 Gift Card Support Ticket")
        .setDescription(
            "**How to get your gift card:**\n\n1. Use `/convert_points` to purchase a gift card\n2. Wait for admin approval\n3. Receive your gift card code via DM\n\n**Need help?** Contact an admin!",
        )
        .setColor(0x0099ff);

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleSendGiftCardPanel(interaction) {
    if (!hasAdminRole(interaction)) {
        const embed = new EmbedBuilder()
            .setTitle("❌ Access Denied")
            .setDescription("You need the admin role to use this command.")
            .setColor(0xff0000);
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    await sendGiftCardPanel();
    await interaction.reply({
        content: "✅ Gift card panel sent!",
        ephemeral: true,
    });
}

async function handleConfirmConvertBack(interaction) {
    const embed = new EmbedBuilder()
        .setTitle("🔄 Convert Gift Card Back")
        .setDescription(
            "This feature is coming soon! You will be able to convert unused gift cards back to diamonds.",
        )
        .setColor(0x0099ff);

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function showGiftCardCheckModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId("gift_card_check_modal")
        .setTitle("🔍 Check Gift Card Status");

    const codeInput = new TextInputBuilder()
        .setCustomId("gift_card_code")
        .setLabel("Gift Card Code")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Enter gift card code (e.g., GC-ABCD1234EFGH)")
        .setRequired(true)
        .setMaxLength(20);

    modal.addComponents(new ActionRowBuilder().addComponents(codeInput));

    await interaction.showModal(modal);
}

async function showGenerateGiftCardModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId("gift_card_generate_modal")
        .setTitle("💎 Generate Gift Card");

    const amountInput = new TextInputBuilder()
        .setCustomId("diamond_amount")
        .setLabel("Diamond Amount (500-100,000)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Enter amount of diamonds to convert...")
        .setRequired(true)
        .setMaxLength(6);

    modal.addComponents(new ActionRowBuilder().addComponents(amountInput));

    await interaction.showModal(modal);
}

async function showAdminGenerateGiftCardModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId("admin_gift_card_generate_modal")
        .setTitle("🛡️ Admin Generate Gift Card");

    const amountInput = new TextInputBuilder()
        .setCustomId("admin_diamond_amount")
        .setLabel("Diamond Amount (500-100,000)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Enter amount of diamonds for gift card...")
        .setRequired(true)
        .setMaxLength(6);

    modal.addComponents(new ActionRowBuilder().addComponents(amountInput));

    await interaction.showModal(modal);
}

async function handleGiftCardCheck(interaction) {
    const giftCardCode = interaction.fields
        .getTextInputValue("gift_card_code")
        .trim()
        .toUpperCase();

    // Clean up expired cards first
    pointsSystem.cleanupExpiredGiftCards();

    const giftCard = pointsSystem.data.generated_gift_cards[giftCardCode];

    let embed;
    if (!giftCard) {
        embed = new EmbedBuilder()
            .setTitle("❌ Invalid Gift Card")
            .setDescription(
                `**Gift Card Code:** \`${giftCardCode}\`\n\n**Status:** ❌ **Invalid**\n\nThis gift card code does not exist in our system.`,
            )
            .setColor(0xff0000);
    } else {
        const createdDate = new Date(giftCard.created_at);
        const expiryDate = new Date(createdDate);
        expiryDate.setDate(
            expiryDate.getDate() + GIFT_CARD_SETTINGS.validity_days,
        );

        let statusEmoji, statusText, statusColor;
        let claimedInfo = "";

        switch (giftCard.status) {
            case "valid":
                statusEmoji = "✅";
                statusText = "Valid";
                statusColor = 0x00ff00;
                break;
            case "claimed":
                statusEmoji = "🟡";
                statusText = "Claimed";
                statusColor = 0xffff00;
                if (giftCard.claimed_by) {
                    try {
                        const user = await client.users.fetch(
                            giftCard.claimed_by,
                        );
                        claimedInfo = `\n**Claimed by:** @${user.username}\n**Claimed on:** <t:${Math.floor(new Date(giftCard.claimed_at).getTime() / 1000)}:F>`;
                    } catch {
                        claimedInfo = `\n**Claimed by:** User ${giftCard.claimed_by}\n**Claimed on:** <t:${Math.floor(new Date(giftCard.claimed_at).getTime() / 1000)}:F>`;
                    }
                }
                break;
            case "void":
                statusEmoji = "❌";
                statusText = "Void";
                statusColor = 0xff0000;
                if (giftCard.void_reason === "expired") {
                    statusText += " (Expired)";
                }
                break;
            default:
                statusEmoji = "❓";
                statusText = "Unknown";
                statusColor = 0x808080;
        }

        embed = new EmbedBuilder()
            .setTitle("🔍 Gift Card Status Check")
            .setDescription(
                `**Gift Card Code:** \`${giftCardCode}\`\n\n**Status:** ${statusEmoji} **${statusText}**\n**Value:** ${giftCard.value} 💎\n**Created:** <t:${Math.floor(createdDate.getTime() / 1000)}:F>\n**Expires:** <t:${Math.floor(expiryDate.getTime() / 1000)}:F>${claimedInfo}`,
            )
            .setColor(statusColor);
    }

    const reply = await interaction.reply({ embeds: [embed], ephemeral: true });

    // Auto-delete after 5 minutes
    setTimeout(
        async () => {
            try {
                await reply.delete();
            } catch (error) {
                console.log(
                    "Could not delete gift card check result:",
                    error.message,
                );
            }
        },
        5 * 60 * 1000,
    );
}

async function handleGiftCardGeneration(interaction) {
    const diamondAmount = parseInt(
        interaction.fields.getTextInputValue("diamond_amount"),
    );

    if (
        isNaN(diamondAmount) ||
        diamondAmount < GIFT_CARD_SETTINGS.min_conversion ||
        diamondAmount > GIFT_CARD_SETTINGS.max_conversion
    ) {
        return await interaction.reply({
            content: `❌ Invalid amount! Must be between ${GIFT_CARD_SETTINGS.min_conversion.toLocaleString()} and ${GIFT_CARD_SETTINGS.max_conversion.toLocaleString()} diamonds.`,
            ephemeral: true,
        });
    }

    const userData = pointsSystem.getUserData(interaction.user.id);

    if (userData.points < diamondAmount) {
        return await interaction.reply({
            content: `❌ Insufficient diamonds! You have ${userData.points.toLocaleString()} 💎 but need ${diamondAmount.toLocaleString()} 💎`,
            ephemeral: true,
        });
    }

    // Generate unique gift card code
    let giftCardCode;
    do {
        giftCardCode = pointsSystem.generateGiftCardCode();
    } while (pointsSystem.data.generated_gift_cards[giftCardCode]);

    // Deduct diamonds
    userData.points -= diamondAmount;
    userData.total_spent += diamondAmount;

    // Create gift card
    const giftCard = {
        value: diamondAmount,
        status: "valid",
        created_at: new Date().toISOString(),
        created_by: interaction.user.id,
        claimed_by: null,
        claimed_at: null,
        void_reason: null,
    };

    pointsSystem.data.generated_gift_cards[giftCardCode] = giftCard;

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + GIFT_CARD_SETTINGS.validity_days);

    const embed = new EmbedBuilder()
        .setTitle("🎁 Gift Card Generated Successfully!")
        .setDescription(
            `**Gift Card Code:** \`${giftCardCode}\`\n\n**Value:** ${diamondAmount.toLocaleString()} 💎\n**Status:** ✅ Valid\n**Expires:** <t:${Math.floor(expiryDate.getTime() / 1000)}:F>\n\n⚠️ **Important:** Save this code securely! You can check its status anytime using the "Check Gift Card" button.`,
        )
        .addFields(
            {
                name: "💰 New Balance",
                value: `${userData.points.toLocaleString()} 💎`,
                inline: true,
            },
            {
                name: "📊 Total Spent",
                value: `${userData.total_spent.toLocaleString()} 💎`,
                inline: true,
            },
        )
        .setColor(0x00ff00);

    // Try to send DM with gift card code
    try {
        const dmEmbed = new EmbedBuilder()
            .setTitle("🎁 Your Generated Gift Card")
            .setDescription(
                `**Gift Card Code:** \`${giftCardCode}\`\n**Value:** ${diamondAmount.toLocaleString()} 💎\n**Expires:** <t:${Math.floor(expiryDate.getTime() / 1000)}:F>\n\nKeep this code safe! You can share it with others or use it yourself.`,
            )
            .setColor(0x00ff00);

        await interaction.user.send({ embeds: [dmEmbed] });
        embed.addFields({
            name: "📧 DM Sent",
            value: "Gift card code sent to your DMs!",
            inline: false,
        });
    } catch (error) {
        embed.addFields({
            name: "⚠️ DM Failed",
            value: "Could not send DM. Please save the code above!",
            inline: false,
        });
    }

    const reply = await interaction.reply({ embeds: [embed], ephemeral: true });

    // Auto-delete after 10 minutes for security
    setTimeout(
        async () => {
            try {
                await reply.delete();
            } catch (error) {
                console.log(
                    "Could not delete gift card generation result:",
                    error.message,
                );
            }
        },
        10 * 60 * 1000,
    );

    await pointsSystem.saveData();
}

async function handleCheckGiftCard(interaction) {
    if (
        interaction.channelId !== CHANNELS.gift_cards &&
        interaction.channelId !== CHANNELS.gift_card_verification
    ) {
        const embed = new EmbedBuilder()
            .setTitle("❌ Wrong Channel")
            .setDescription(
                `Please use this command in <#${CHANNELS.gift_cards}> or <#${CHANNELS.gift_card_verification}>`,
            )
            .setColor(0xff0000);
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const giftCardCode = interaction.options
        .getString("code")
        .trim()
        .toUpperCase();

    // Clean up expired cards first
    pointsSystem.cleanupExpiredGiftCards();

    const giftCard = pointsSystem.data.generated_gift_cards[giftCardCode];

    let embed;
    if (!giftCard) {
        embed = new EmbedBuilder()
            .setTitle("❌ Invalid Gift Card")
            .setDescription(
                `**Gift Card Code:** \`${giftCardCode}\`\n\n**Status:** ❌ **Invalid**\n\nThis gift card code does not exist in our system.`,
            )
            .setColor(0xff0000);
    } else {
        const createdDate = new Date(giftCard.created_at);
        const expiryDate = new Date(createdDate);
        expiryDate.setDate(
            expiryDate.getDate() + GIFT_CARD_SETTINGS.validity_days,
        );

        let statusEmoji, statusText, statusColor;
        let claimedInfo = "";

        switch (giftCard.status) {
            case "valid":
                statusEmoji = "✅";
                statusText = "Valid";
                statusColor = 0x00ff00;
                break;
            case "claimed":
                statusEmoji = "🟡";
                statusText = "Claimed";
                statusColor = 0xffff00;
                if (giftCard.claimed_by) {
                    try {
                        const user = await client.users.fetch(
                            giftCard.claimed_by,
                        );
                        claimedInfo = `\n**Claimed by:** @${user.username}\n**Claimed on:** <t:${Math.floor(new Date(giftCard.claimed_at).getTime() / 1000)}:F>`;
                    } catch {
                        claimedInfo = `\n**Claimed by:** User ${giftCard.claimed_by}\n**Claimed on:** <t:${Math.floor(new Date(giftCard.claimed_at).getTime() / 1000)}:F>`;
                    }
                }
                break;
            case "void":
                statusEmoji = "❌";
                statusText = "Void";
                statusColor = 0xff0000;
                if (giftCard.void_reason === "expired") {
                    statusText += " (Expired)";
                }
                break;
            default:
                statusEmoji = "❓";
                statusText = "Unknown";
                statusColor = 0x808080;
        }

        embed = new EmbedBuilder()
            .setTitle("🔍 Gift Card Status Check")
            .setDescription(
                `**Gift Card Code:** \`${giftCardCode}\`\n\n**Status:** ${statusEmoji} **${statusText}**\n**Value:** ${giftCard.value.toLocaleString()} 💎\n**Created:** <t:${Math.floor(createdDate.getTime() / 1000)}:F>\n**Expires:** <t:${Math.floor(expiryDate.getTime() / 1000)}:F>${claimedInfo}`,
            )
            .setColor(statusColor);
    }

    await interaction.reply({ embeds: [embed] });
}

async function handleGenerateGiftCard(interaction) {
    if (!hasAdminRole(interaction)) {
        const embed = new EmbedBuilder()
            .setTitle("❌ Access Denied")
            .setDescription("You need the admin role to use this command.")
            .setColor(0xff0000);
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.channelId !== CHANNELS.gift_cards) {
        const embed = new EmbedBuilder()
            .setTitle("❌ Wrong Channel")
            .setDescription(
                `Please use this command in <#${CHANNELS.gift_cards}>`,
            )
            .setColor(0xff0000);
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const diamondAmount = interaction.options.getInteger("amount");
    const userData = pointsSystem.getUserData(interaction.user.id);

    if (userData.points < diamondAmount) {
        return await interaction.reply({
            content: `❌ Insufficient diamonds! You have ${userData.points.toLocaleString()} 💎 but need ${diamondAmount.toLocaleString()} 💎`,
            ephemeral: true,
        });
    }

    // Generate unique gift card code
    let giftCardCode;
    do {
        giftCardCode = pointsSystem.generateGiftCardCode();
    } while (pointsSystem.data.generated_gift_cards[giftCardCode]);

    // Deduct diamonds
    userData.points -= diamondAmount;
    userData.total_spent += diamondAmount;

    // Create gift card
    const giftCard = {
        value: diamondAmount,
        status: "valid",
        created_at: new Date().toISOString(),
        created_by: interaction.user.id,
        claimed_by: null,
        claimed_at: null,
        void_reason: null,
    };

    pointsSystem.data.generated_gift_cards[giftCardCode] = giftCard;

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + GIFT_CARD_SETTINGS.validity_days);

    const embed = new EmbedBuilder()
        .setTitle("🎁 Gift Card Generated Successfully!")
        .setDescription(
            `**Gift Card Code:** \`${giftCardCode}\`\n\n**Value:** ${diamondAmount.toLocaleString()} 💎\n**Status:** ✅ Valid\n**Expires:** <t:${Math.floor(expiryDate.getTime() / 1000)}:F>\n\n⚠️ **Important:** Save this code securely! You can check its status anytime using the "Check Gift Card" button.`,
        )
        .addFields(
            {
                name: "💰 New Balance",
                value: `${userData.points.toLocaleString()} 💎`,
                inline: true,
            },
            {
                name: "📊 Total Spent",
                value: `${userData.total_spent.toLocaleString()} 💎`,
                inline: true,
            },
        )
        .setColor(0x00ff00);

    // Try to send DM with gift card code
    try {
        const dmEmbed = new EmbedBuilder()
            .setTitle("🎁 Your Generated Gift Card")
            .setDescription(
                `**Gift Card Code:** \`${giftCardCode}\`\n**Value:** ${diamondAmount.toLocaleString()} 💎\n**Expires:** <t:${Math.floor(expiryDate.getTime() / 1000)}:F>\n\nKeep this code safe! You can share it with others or use it yourself.`,
            )
            .setColor(0x00ff00);

        await interaction.user.send({ embeds: [dmEmbed] });
        embed.addFields({
            name: "📧 DM Sent",
            value: "Gift card code sent to your DMs!",
            inline: false,
        });
    } catch (error) {
        embed.addFields({
            name: "⚠️ DM Failed",
            value: "Could not send DM. Please save the code above!",
            inline: false,
        });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
    await pointsSystem.saveData();
}

async function handleAdminGiftCardGeneration(interaction) {
    const diamondAmount = parseInt(
        interaction.fields.getTextInputValue("admin_diamond_amount"),
    );

    if (
        isNaN(diamondAmount) ||
        diamondAmount < GIFT_CARD_SETTINGS.min_conversion ||
        diamondAmount > GIFT_CARD_SETTINGS.max_conversion
    ) {
        return await interaction.reply({
            content: `❌ Invalid amount! Must be between ${GIFT_CARD_SETTINGS.min_conversion.toLocaleString()} and ${GIFT_CARD_SETTINGS.max_conversion.toLocaleString()} diamonds.`,
            ephemeral: true,
        });
    }

    // Generate unique gift card code
    let giftCardCode;
    do {
        giftCardCode = pointsSystem.generateGiftCardCode();
    } while (pointsSystem.data.generated_gift_cards[giftCardCode]);

    // Create gift card (admin doesn't need to spend diamonds)
    const giftCard = {
        value: diamondAmount,
        status: "valid",
        created_at: new Date().toISOString(),
        created_by: interaction.user.id,
        claimed_by: null,
        claimed_at: null,
        void_reason: null,
        admin_generated: true,
    };

    pointsSystem.data.generated_gift_cards[giftCardCode] = giftCard;

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + GIFT_CARD_SETTINGS.validity_days);

    const embed = new EmbedBuilder()
        .setTitle("🛡️ Admin Gift Card Generated!")
        .setDescription(
            `**Gift Card Code:** \`${giftCardCode}\`\n\n**Value:** ${diamondAmount.toLocaleString()} 💎\n**Status:** ✅ Valid\n**Expires:** <t:${Math.floor(expiryDate.getTime() / 1000)}:F>\n**Generated by:** Admin\n\n⚠️ **Admin Generated:** This gift card was created without deducting diamonds.\n\n🔒 **Security:** This code has been sent to your DMs for secure handling.`,
        )
        .setColor(0xff0000);

    // Send DM with gift card code
    try {
        const dmEmbed = new EmbedBuilder()
            .setTitle("🛡️ Admin Generated Gift Card")
            .setDescription(
                `**Gift Card Code:** \`${giftCardCode}\`\n\n**Value:** ${diamondAmount.toLocaleString()} 💎\n**Expires:** <t:${Math.floor(expiryDate.getTime() / 1000)}:F>\n**Generated by:** Admin Panel\n\n🔒 **Admin Access:** Keep this code secure! You can share it with users or use it for giveaways.\n\n✅ **Features:**\n• Check status with \`/check_gift_card\`\n• Valid for 7 days\n• Can be claimed by any user`,
            )
            .setColor(0xff0000);

        await interaction.user.send({ embeds: [dmEmbed] });
        embed.addFields({
            name: "📧 DM Sent",
            value: "Gift card code sent to your DMs!",
            inline: false,
        });
    } catch (error) {
        embed.addFields({
            name: "⚠️ DM Failed",
            value: "Could not send DM. Please save the code above!",
            inline: false,
        });
    }

    const reply = await interaction.reply({ embeds: [embed], ephemeral: true });

    // Auto-delete after 10 minutes for security
    setTimeout(
        async () => {
            try {
                await reply.delete();
            } catch (error) {
                console.log(
                    "Could not delete admin gift card generation result:",
                    error.message,
                );
            }
        },
        10 * 60 * 1000,
    );

    await pointsSystem.saveData();
}

async function handleInfo(interaction) {
    if (interaction.channelId !== CHANNELS.information) {
        const embed = new EmbedBuilder()
            .setTitle("❌ Wrong Channel")
            .setDescription(
                `Please use this command in <#${CHANNELS.information}>`,
            )
            .setColor(0xff0000);
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle("ℹ️ Diamond Points Bot Information")
        .setDescription(
            `**Welcome to the Diamond Economy System!**\n\`\`\`\n    ℹ️ INFORMATION ℹ️\n  ╔═══════════════════╗\n  ║ 💎 DIAMOND SYSTEM ║\n  ║ 🎮 GAMES & REWARDS ║\n  ╚═══════════════════╝\n\`\`\`\n\n**Bot Features:**\n💎 **Daily Claims** - Earn diamonds with streak bonuses\n🎲 **Casino Games** - Dice, Coinflip, and Slots\n🎁 **Gift Cards** - Convert diamonds to rewards\n🏆 **Leaderboards** - Compete with other users\n📊 **Statistics** - Track your progress\n\nClick the buttons below for detailed command lists!`,
        )
        .setColor(0x00bfff);

    const components = createInfoPanelButtons();
    await interaction.reply({ embeds: [embed], components: [components] });
}

async function handleSendInfoPanel(interaction) {
    if (!hasAdminRole(interaction)) {
        const embed = new EmbedBuilder()
            .setTitle("❌ Access Denied")
            .setDescription("You need the admin role to use this command.")
            .setColor(0xff0000);
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    await sendInfoPanel();
    await interaction.reply({
        content: "✅ Information panel sent!",
        ephemeral: true,
    });
}

async function handleSendPointDropPanel(interaction) {
    if (!hasAdminRole(interaction)) {
        const embed = new EmbedBuilder()
            .setTitle("❌ Access Denied")
            .setDescription("You need the admin role to use this command.")
            .setColor(0xff0000);
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    await sendPointDropTicketPanel();
    await interaction.reply({
        content: "✅ Point drop ticket panel sent!",
        ephemeral: true,
    });
}

async function handleApprovePointDrop(interaction) {
    if (!hasAdminRole(interaction)) {
        const embed = new EmbedBuilder()
            .setTitle("❌ Access Denied")
            .setDescription("You need the admin role to use this command.")
            .setColor(0xff0000);
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const ticketId = interaction.options.getString("ticket_id").toUpperCase();
    const ticket = pointDropTickets[ticketId];

    if (!ticket) {
        return await interaction.reply({
            content: `❌ Ticket \`${ticketId}\` not found!`,
            ephemeral: true,
        });
    }

    if (ticket.status !== "pending") {
        return await interaction.reply({
            content: `❌ Ticket \`${ticketId}\` has already been ${ticket.status}!`,
            ephemeral: true,
        });
    }

    ticket.status = "approved";
    ticket.reviewedBy = interaction.user.id;
    ticket.reviewedAt = new Date().toISOString();

    // Notify user
    try {
        const user = await client.users.fetch(ticket.userId);
        const userEmbed = new EmbedBuilder()
            .setTitle("🎯 Point Drop Ticket Approved!")
            .setDescription(
                `**Ticket ID:** \`${ticketId}\`\n**Event Title:** ${ticket.title}\n\n✅ **Approved!** Your point drop event will be scheduled soon.`,
            )
            .setColor(0x00ff00);
        await user.send({ embeds: [userEmbed] });
    } catch (error) {
        console.log("Could not send approval DM:", error.message);
    }

    await interaction.reply({
        content: `✅ Ticket \`${ticketId}\` approved successfully!`,
        ephemeral: true,
    });
}

async function handleRejectPointDrop(interaction) {
    if (!hasAdminRole(interaction)) {
        const embed = new EmbedBuilder()
            .setTitle("❌ Access Denied")
            .setDescription("You need the admin role to use this command.")
            .setColor(0xff0000);
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const ticketId = interaction.options.getString("ticket_id").toUpperCase();
    const ticket = pointDropTickets[ticketId];

    if (!ticket) {
        return await interaction.reply({
            content: `❌ Ticket \`${ticketId}\` not found!`,
            ephemeral: true,
        });
    }

    if (ticket.status !== "pending") {
        return await interaction.reply({
            content: `❌ Ticket \`${ticketId}\` has already been ${ticket.status}!`,
            ephemeral: true,
        });
    }

    ticket.status = "rejected";
    ticket.reviewedBy = interaction.user.id;
    ticket.reviewedAt = new Date().toISOString();

    // Notify user
    try {
        const user = await client.users.fetch(ticket.userId);
        const userEmbed = new EmbedBuilder()
            .setTitle("🎯 Point Drop Ticket Rejected")
            .setDescription(
                `**Ticket ID:** \`${ticketId}\`\n**Event Title:** ${ticket.title}\n\n❌ **Rejected.** Please try again with a different request.`,
            )
            .setColor(0xff0000);
        await user.send({ embeds: [userEmbed] });
    } catch (error) {
        console.log("Could not send rejection DM:", error.message);
    }

    await interaction.reply({
        content: `❌ Ticket \`${ticketId}\` rejected.`,
        ephemeral: true,
    });
}

async function handleUnoCommand(interaction) {
    const targetChannel =
        interaction.options.getChannel("channel") || interaction.channel;

    // Check if target channel is the specified channel ID
    if (targetChannel.id !== "1387168027027574875") {
        const embed = new EmbedBuilder()
            .setTitle("❌ Wrong Channel")
            .setDescription(
                "UNO games can only be started in the designated gaming channel!",
            )
            .setColor(0xff0000);
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Check if there's already an active game in this channel
    for (const [gameId, game] of activeUnoGames) {
        if (game.channelId === targetChannel.id) {
            const embed = new EmbedBuilder()
                .setTitle("❌ Game Already Active")
                .setDescription(
                    "There's already an UNO game running in this channel!",
                )
                .setColor(0xff0000);
            return await interaction.reply({
                embeds: [embed],
                ephemeral: true,
            });
        }
    }

    // Show betting modal
    const modal = new ModalBuilder()
        .setCustomId(`uno_bet_modal_${targetChannel.id}`)
        .setTitle("🎰 UNO Diamond Betting Setup");

    const betInput = new TextInputBuilder()
        .setCustomId("bet_amount")
        .setLabel("Diamond Bet Amount (10-1000 per player)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Enter diamonds each player must bet...")
        .setRequired(true)
        .setMaxLength(4);

    modal.addComponents(new ActionRowBuilder().addComponents(betInput));
    await interaction.showModal(modal);
}

async function handleCleanupOldMessages(interaction) {
    if (!hasAdminRole(interaction)) {
        const embed = new EmbedBuilder()
            .setTitle("❌ Access Denied")
            .setDescription("You need the admin role to use this command.")
            .setColor(0xff0000);
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    await interaction.reply({
        content:
            "🧹 Starting enhanced cleanup of old messages and user interactions...",
        ephemeral: true,
    });

    try {
        console.log(
            "🧹 Manual cleanup initiated by admin:",
            interaction.user.tag,
        );

        // Clean up data first
        pointsSystem.cleanupExpiredGiftCards();

        // Clean up old gift cards
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        let cleanedCards = 0;

        for (const [code, card] of Object.entries(
            pointsSystem.data.generated_gift_cards,
        )) {
            const cardDate = new Date(card.created_at);
            if (
                cardDate < oneDayAgo &&
                (card.status === "void" || card.status === "claimed")
            ) {
                delete pointsSystem.data.generated_gift_cards[code];
                cleanedCards++;
            }
        }

        if (cleanedCards > 0) {
            await pointsSystem.saveData();
        }

        // Clean up old tickets
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        let cleanedTickets = 0;

        for (const [ticketId, ticket] of Object.entries(pointDropTickets)) {
            const ticketDate = new Date(ticket.createdAt);
            if (ticketDate < sevenDaysAgo) {
                delete pointDropTickets[ticketId];
                cleanedTickets++;
            }
        }

        // Perform enhanced channel cleanup
        await performEnhancedChannelCleanup();

        const embed = new EmbedBuilder()
            .setTitle("🧹 Cleanup Completed!")
            .setDescription(
                `**Enhanced cleanup results:**\n\n` +
                    `💾 **Data Cleanup:**\n` +
                    `• ${cleanedCards} old gift cards removed\n` +
                    `• ${cleanedTickets} old tickets removed\n` +
                    `• Expired gift cards updated\n\n` +
                    `📨 **Message Cleanup:**\n` +
                    `• All bot messages removed\n` +
                    `• Old user interactions cleaned\n` +
                    `• Casino results cleared\n` +
                    `• Old mining events removed\n\n` +
                    `✅ **All channels are now clean and fresh!**`,
            )
            .setColor(0x00ff00)
            .setTimestamp();

        await interaction.followUp({ embeds: [embed], ephemeral: true });
    } catch (error) {
        console.error("Error during manual cleanup:", error);
        const errorEmbed = new EmbedBuilder()
            .setTitle("❌ Cleanup Error")
            .setDescription(
                "An error occurred during cleanup. Check console for details.",
            )
            .setColor(0xff0000);
        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
    }
}

async function showUserCommands(interaction) {
    const embed = new EmbedBuilder()
        .setTitle("👥 User Commands - Diamond Bot")
        .setDescription("**Available Commands for All Users:**")
        .addFields(
            {
                name: "💎 Daily & Points Commands",
                value: "`/claim_daily` - Claim daily diamonds (streak bonus)\n`/get_points [user]` - Check points balance\n`/transfer_points <user> <amount>` - Send diamonds to others",
                inline: false,
            },
            {
                name: "🎲 Gaming Commands",
                value: "`/gambling_menu` - Access casino games\n• Dice Game (5x multiplier)\n• Coinflip (2x multiplier)\n• Lucky Slots (up to 12x)",
                inline: false,
            },
            {
                name: "🎁 Gift Card Commands",
                value: "`/redeem_gift_card` - Legacy gift card system\n`/convert_points` - Same as redeem gift card\n`/generate_gift_card <amount>` - Create gift cards\n`/check_gift_card <code>` - Verify gift card status",
                inline: false,
            },
            {
                name: "🏆 Information Commands",
                value: "`/leaderboard` - View top 10 users\n`/test_dm` - Test if bot can DM you\n`/info` - Show this information panel",
                inline: false,
            },
            {
                name: "📍 Channel Locations",
                value: `💎 Daily Claims: <#${CHANNELS.daily_claims}>\n🎲 Gambling: <#${CHANNELS.gambling}>\n🎁 Gift Cards: <#${CHANNELS.gift_cards}>\n🔍 Verification: <#${CHANNELS.gift_card_verification}>\n📊 Transfers: <#${CHANNELS.transfers}>\n🏆 Leaderboard: <#${CHANNELS.leaderboard}>`,
                inline: false,
            },
        )
        .setColor(0x00ff00);

    const reply = await interaction.reply({ embeds: [embed], ephemeral: true });

    // Auto-delete the user commands information after 5 minutes
    setTimeout(
        async () => {
            try {
                await reply.delete();
            } catch (error) {
                console.log(
                    "Could not delete user commands information:",
                    error.message,
                );
            }
        },
        5 * 60 * 1000,
    ); // 5 minutes
}

async function handleUnoTicketJoin(interaction, ticketId) {
    const ticket = unoTickets.get(ticketId);
    if (!ticket) {
        return await interaction.reply({
            content: "❌ This ticket no longer exists!",
            ephemeral: true,
        });
    }

    if (ticket.status !== "open") {
        return await interaction.reply({
            content: "❌ This ticket is no longer accepting players!",
            ephemeral: true,
        });
    }

    if (ticket.players.includes(interaction.user.id)) {
        return await interaction.reply({
            content: "❌ You're already in this game!",
            ephemeral: true,
        });
    }

    if (ticket.players.length >= ticket.maxPlayers) {
        return await interaction.reply({
            content: "❌ This game is full!",
            ephemeral: true,
        });
    }

    // Check if user has enough diamonds
    const userData = pointsSystem.getUserData(interaction.user.id);
    if (userData.points < ticket.betAmount) {
        return await interaction.reply({
            content: `❌ You need ${ticket.betAmount} 💎 but only have ${userData.points} 💎!`,
            ephemeral: true,
        });
    }

    // Deduct bet and add player
    userData.points -= ticket.betAmount;
    userData.total_spent += ticket.betAmount;
    ticket.players.push(interaction.user.id);
    await pointsSystem.saveData();

    // Update the ticket display
    const playerList = await Promise.all(
        ticket.players.map(async (id) => {
            try {
                const user = await client.users.fetch(id);
                return user.displayName;
            } catch {
                return `User ${id}`;
            }
        })
    );

    const embed = new EmbedBuilder()
        .setTitle("🎫 UNO Game Ticket - Updated!")
        .setDescription(
            `**🃏 UNO GAMING LOBBY 🃏**\n\`\`\`\n` +
            `    🎫 TICKET: ${ticketId}\n` +
            `  ╔═══════════════════╗\n` +
            `  ║ 💎 Bet: ${ticket.betAmount} 💎/player ║\n` +
            `  ║ 🤖 AI: ${ticket.aiMode.toUpperCase()}        ║\n` +
            `  ║ 👥 Players: ${ticket.players.length}/${ticket.maxPlayers}    ║\n` +
            `  ╚═══════════════════╝\n` +
            `\`\`\`\n\n` +
            `**Game Details:**\n` +
            `🎫 **Ticket ID:** \`${ticketId}\`\n` +
            `💎 **Bet Amount:** ${ticket.betAmount} 💎 per player\n` +
            `🤖 **AI Mode:** ${ticket.aiMode.charAt(0).toUpperCase() + ticket.aiMode.slice(1)}\n` +
            `👥 **Max Players:** ${ticket.maxPlayers}\n` +
            `📝 **Description:** ${ticket.description}\n\n` +
            `**Prize Distribution:**\n` +
            `🥇 **1st Place:** ${Math.floor(ticket.betAmount * ticket.maxPlayers * 0.5)} 💎 (50%)\n` +
            `🥈 **2nd Place:** ${Math.floor(ticket.betAmount * ticket.maxPlayers * 0.3)} 💎 (30%)\n` +
            `🥉 **3rd Place:** ${Math.floor(ticket.betAmount * ticket.maxPlayers * 0.2)} 💎 (20%)\n\n` +
            `**Current Players (${ticket.players.length}):** ${playerList.join(", ")}\n\n` +
            `**Status:** ${ticket.players.length >= 2 ? "✅ Ready to start!" : "⏳ Waiting for more players..."}\n`,
        )
        .setColor(ticket.players.length >= 2 ? 0x00ff00 : 0xffaa00)
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`uno_ticket_join_${ticketId}`)
            .setLabel("🎮 Join Game")
            .setStyle(ButtonStyle.Success)
            .setEmoji("🃏")
            .setDisabled(ticket.players.length >= ticket.maxPlayers),
        new ButtonBuilder()
            .setCustomId(`uno_ticket_addai_${ticketId}`)
            .setLabel("🤖 Add AI Bot")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("🎯"),
        new ButtonBuilder()
            .setCustomId(`uno_ticket_start_${ticketId}`)
            .setLabel("▶️ Start Game")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("🚀")
            .setDisabled(ticket.players.length < 2),
        new ButtonBuilder()
            .setCustomId(`uno_ticket_cancel_${ticketId}`)
            .setLabel("❌ Cancel")
            .setStyle(ButtonStyle.Danger),
    );

    await interaction.update({ embeds: [embed], components: [row] });

    await interaction.followUp({
        content: `🎮 ${interaction.user.displayName} joined the UNO game and paid ${ticket.betAmount} 💎!`,
        ephemeral: false,
    });
}

async function handleUnoTicketAddAI(interaction, ticketId) {
    const ticket = unoTickets.get(ticketId);
    if (!ticket) {
        return await interaction.reply({
            content: "❌ This ticket no longer exists!",
            ephemeral: true,
        });
    }

    if (ticket.creatorId !== interaction.user.id) {
        return await interaction.reply({
            content: "❌ Only the ticket creator can add AI bots!",
            ephemeral: true,
        });
    }

    if (ticket.aiMode === "none") {
        return await interaction.reply({
            content: "❌ This ticket is set to human-only mode!",
            ephemeral: true,
        });
    }

    if (ticket.players.length >= ticket.maxPlayers) {
        return await interaction.reply({
            content: "❌ This game is already full!",
            ephemeral: true,
        });
    }

    // Add AI player based on mode
    let aiDifficulty;
    if (ticket.aiMode === "mixed") {
        const difficulties = ["easy", "medium", "hard", "expert"];
        aiDifficulty = difficulties[Math.floor(Math.random() * difficulties.length)];
    } else {
        aiDifficulty = ticket.aiMode;
    }

    const availableAI = aiBotPlayers.filter(
        (bot) => bot.difficulty === aiDifficulty && !ticket.players.includes(bot.id)
    );

    if (availableAI.length === 0) {
        return await interaction.reply({
            content: `❌ No ${aiDifficulty.toUpperCase()} AI bots available!`,
            ephemeral: true,
        });
    }

    const aiBot = availableAI[0];
    ticket.players.push(aiBot.id);

    await interaction.reply({
        content: `🤖 ${aiBot.name} (${aiDifficulty.toUpperCase()}) joined the game!`,
        ephemeral: false,
    });
}

async function handleUnoTicketStart(interaction, ticketId) {
    const ticket = unoTickets.get(ticketId);
    if (!ticket) {
        return await interaction.reply({
            content: "❌ This ticket no longer exists!",
            ephemeral: true,
        });
    }

    if (ticket.creatorId !== interaction.user.id) {
        return await interaction.reply({
            content: "❌ Only the ticket creator can start the game!",
            ephemeral: true,
        });
    }

    if (ticket.players.length < 2) {
        return await interaction.reply({
            content: "❌ Need at least 2 players to start!",
            ephemeral: true,
        });
    }

    // Convert ticket to actual game
    const game = new UnoGame(ticket.channelId, ticket.creatorId);
    game.players = [...ticket.players];
    game.setBetAmount(ticket.betAmount);
    
    // Set up AI players
    for (const playerId of ticket.players) {
        const aiBot = aiBotPlayers.find(bot => bot.id === playerId);
        if (aiBot) {
            game.aiPlayers.set(playerId, aiBot);
        }
    }

    game.status = "active";
    game.dealCards();
    activeUnoGames.set(game.gameId, game);

    // Remove ticket
    ticket.status = "started";
    unoTickets.delete(ticketId);

    // Start the game
    const currentPlayer = await client.users.fetch(game.getCurrentPlayer());
    const topCard = game.discardPile[game.discardPile.length - 1];

    const embed = new EmbedBuilder()
        .setTitle("🃏 UNO Game Started!")
        .setDescription(
            `**🎮 GAME ACTIVE 🎮**\n\`\`\`\n` +
            `    🃏 UNO IN PROGRESS 🃏\n` +
            `  ╔═══════════════════════╗\n` +
            `  ║ Players: ${game.players.length}           ║\n` +
            `  ║ Bet: ${game.betAmount} 💎 each        ║\n` +
            `  ║ Prize Pool: ${game.totalPrizePool} 💎     ║\n` +
            `  ╚═══════════════════════╝\n` +
            `\`\`\`\n\n` +
            `**Current Player:** ${currentPlayer.displayName}\n` +
            `**Top Card:** ${topCard.emoji}\n` +
            `**Direction:** ${game.direction === 1 ? "➡️ Clockwise" : "⬅️ Counter-clockwise"}\n\n` +
            `**Players:**\n` +
            (await Promise.all(
                game.players.map(async (id, index) => {
                    if (game.aiPlayers.has(id)) {
                        const aiData = game.aiPlayers.get(id);
                        const indicator = index === game.currentPlayerIndex ? "👉" : "  ";
                        return `${indicator} ${aiData.name} (AI): ${game.hands.get(id).length} cards`;
                    } else {
                        const user = await client.users.fetch(id);
                        const cards = game.hands.get(id).length;
                        const indicator = index === game.currentPlayerIndex ? "👉" : "  ";
                        return `${indicator} ${user.displayName}: ${cards} cards`;
                    }
                })
            )).join("\n") +
            `\n\n**Prize Distribution:**\n` +
            `🥇 1st: ${Math.floor(game.totalPrizePool * 0.5)} 💎\n` +
            `🥈 2nd: ${Math.floor(game.totalPrizePool * 0.3)} 💎\n` +
            `🥉 3rd: ${Math.floor(game.totalPrizePool * 0.2)} 💎\n\n` +
            `⚠️ **Auto-cleanup in 10 seconds if no activity!**`,
        )
        .setColor(0x00ff00)
        .setTimestamp();

    const components = createUnoGameButtons(game.gameId);
    await interaction.update({ embeds: [embed], components: [components] });

    // Start auto-cleanup for the active game
    game.startAutoCleanup(interaction.message);
}

async function handleUnoTicketCancel(interaction, ticketId) {
    const ticket = unoTickets.get(ticketId);
    if (!ticket) {
        return await interaction.reply({
            content: "❌ This ticket no longer exists!",
            ephemeral: true,
        });
    }

    if (ticket.creatorId !== interaction.user.id) {
        return await interaction.reply({
            content: "❌ Only the ticket creator can cancel the game!",
            ephemeral: true,
        });
    }

    // Refund all players
    for (const playerId of ticket.players) {
        const aiBot = aiBotPlayers.find(bot => bot.id === playerId);
        if (!aiBot) { // Only refund human players
            const userData = pointsSystem.getUserData(playerId);
            userData.points += ticket.betAmount;
            userData.total_spent -= ticket.betAmount;
        }
    }
    await pointsSystem.saveData();

    unoTickets.delete(ticketId);

    const embed = new EmbedBuilder()
        .setTitle("❌ UNO Ticket Cancelled")
        .setDescription(`The UNO game ticket has been cancelled by the creator.\n\nAll ${ticket.betAmount} 💎 bets have been refunded to players.`)
        .setColor(0xff0000);

    await interaction.update({ embeds: [embed], components: [] });

    // Auto-delete cancellation message
    setTimeout(async () => {
        try {
            await interaction.message.delete();
        } catch (error) {
            console.log("Could not delete cancelled ticket message:", error.message);
        }
    }, 10000);
}

async function showUserCommands(interaction) {
    const embed = new EmbedBuilder()
        .setTitle("👥 User Commands - Diamond Bot")
        .setDescription("**Available Commands for All Users:**")
        .addFields(
            {
                name: "💎 Daily & Points Commands",
                value: "`/claim_daily` - Claim daily diamonds (streak bonus)\n`/get_points [user]` - Check points balance\n`/transfer_points <user> <amount>` - Send diamonds to others",
                inline: false,
            },
            {
                name: "🎲 Gaming Commands",
                value: "`/gambling_menu` - Access casino games\n• Dice Game (5x multiplier)\n• Coinflip (2x multiplier)\n• Lucky Slots (up to 12x)",
                inline: false,
            },
            {
                name: "🎁 Gift Card Commands",
                value: "`/redeem_gift_card` - Legacy gift card system\n`/convert_points` - Same as redeem gift card\n`/generate_gift_card <amount>` - Create gift cards\n`/check_gift_card <code>` - Verify gift card status",
                inline: false,
            },
            {
                name: "🏆 Information Commands",
                value: "`/leaderboard` - View top 10 users\n`/test_dm` - Test if bot can DM you\n`/info` - Show this information panel",
                inline: false,
            },
            {
                name: "📍 Channel Locations",
                value: `💎 Daily Claims: <#${CHANNELS.daily_claims}>\n🎲 Gambling: <#${CHANNELS.gambling}>\n🎁 Gift Cards: <#${CHANNELS.gift_cards}>\n🔍 Verification: <#${CHANNELS.gift_card_verification}>\n📊 Transfers: <#${CHANNELS.transfers}>\n🏆 Leaderboard: <#${CHANNELS.leaderboard}>`,
                inline: false,
            },
        )
        .setColor(0x00ff00);

    const reply = await interaction.reply({ embeds: [embed], ephemeral: true });

    // Auto-delete the user commands information after 5 minutes
    setTimeout(
        async () => {
            try {
                await reply.delete();
            } catch (error) {
                console.log(
                    "Could not delete user commands information:",
                    error.message,

async function handleUnoAIModeSelect(interaction) {
    const selectedMode = interaction.values[0];
    
    if (!global.tempUnoTickets) global.tempUnoTickets = new Map();
    const tempData = global.tempUnoTickets.get(interaction.user.id) || {};
    tempData.aiMode = selectedMode;
    global.tempUnoTickets.set(interaction.user.id, tempData);

    const modeNames = {
        "none": "👥 Human Only",
        "easy": "🎲 Easy AI", 
        "medium": "🎯 Medium AI",
        "hard": "🎮 Hard AI",
        "expert": "🤖 Expert AI",
        "mixed": "🎭 Mixed AI"
    };

    await interaction.reply({
        content: `✅ AI Mode set to: ${modeNames[selectedMode]}!`,
        ephemeral: true
    });
}

async function handleUnoMaxPlayersSelect(interaction) {
    const selectedPlayers = parseInt(interaction.values[0]);
    
    if (!global.tempUnoTickets) global.tempUnoTickets = new Map();
    const tempData = global.tempUnoTickets.get(interaction.user.id) || {};
    tempData.maxPlayers = selectedPlayers;
    global.tempUnoTickets.set(interaction.user.id, tempData);

    await interaction.reply({
        content: `✅ Maximum players set to: ${selectedPlayers}!`,
        ephemeral: true
    });
}

async function handleUnoTicketSubmit(interaction) {
    if (!global.tempUnoTickets) global.tempUnoTickets = new Map();
    const tempData = global.tempUnoTickets.get(interaction.user.id);

    if (!tempData || !tempData.betAmount || !tempData.aiMode || !tempData.maxPlayers) {
        return await interaction.reply({
            content: "❌ Please complete all selections: bet amount (modal), AI mode (dropdown), and max players (dropdown)!",
            ephemeral: true
        });
    }

    // Check if user has enough diamonds
    const userData = pointsSystem.getUserData(interaction.user.id);
    if (userData.points < tempData.betAmount) {
        return await interaction.reply({
            content: `❌ You need ${tempData.betAmount} 💎 but only have ${userData.points} 💎!`,
            ephemeral: true,
        });
    }

    // Create ticket
    const ticketId = generateUnoTicketId();
    const ticket = {
        id: ticketId,
        creatorId: interaction.user.id,
        betAmount: tempData.betAmount,
        aiMode: tempData.aiMode,
        maxPlayers: tempData.maxPlayers,
        description: "UNO Game Session",
        players: [interaction.user.id],
        status: "open",
        createdAt: new Date().toISOString(),
        channelId: interaction.channelId,
    };

    unoTickets.set(ticketId, ticket);

    // Deduct bet from creator
    userData.points -= tempData.betAmount;
    userData.total_spent += tempData.betAmount;
    await pointsSystem.saveData();

    // Clear temp data
    global.tempUnoTickets.delete(interaction.user.id);

    const modeNames = {
        "none": "Human Only",
        "easy": "Easy AI", 
        "medium": "Medium AI",
        "hard": "Hard AI",
        "expert": "Expert AI",
        "mixed": "Mixed AI"
    };

    const embed = new EmbedBuilder()
        .setTitle("🎫 UNO Game Ticket Created!")
        .setDescription(
            `**🃏 UNO GAMING LOBBY 🃏**\n\`\`\`\n` +
            `    🎫 TICKET: ${ticketId}\n` +
            `  ╔═══════════════════╗\n` +
            `  ║ 💎 Bet: ${tempData.betAmount} 💎/player ║\n` +
            `  ║ 🤖 AI: ${tempData.aiMode.toUpperCase()}        ║\n` +
            `  ║ 👥 Players: 1/${tempData.maxPlayers}    ║\n` +
            `  ╚═══════════════════╝\n` +
            `\`\`\`\n\n` +
            `**Game Details:**\n` +
            `🎫 **Ticket ID:** \`${ticketId}\`\n` +
            `👑 **Host:** ${interaction.user.displayName}\n` +
            `💎 **Bet Amount:** ${tempData.betAmount} 💎 per player\n` +
            `🤖 **AI Mode:** ${modeNames[tempData.aiMode]}\n` +
            `👥 **Max Players:** ${tempData.maxPlayers}\n\n` +
            `**Prize Distribution:**\n` +
            `🥇 **1st Place:** ${Math.floor(tempData.betAmount * tempData.maxPlayers * 0.5)} 💎 (50%)\n` +
            `🥈 **2nd Place:** ${Math.floor(tempData.betAmount * tempData.maxPlayers * 0.3)} 💎 (30%)\n` +
            `🥉 **3rd Place:** ${Math.floor(tempData.betAmount * tempData.maxPlayers * 0.2)} 💎 (20%)\n\n` +
            `**Current Players (1):** ${interaction.user.displayName} ✅\n\n` +
            `**How to Join:**\n` +
            `• Click "🎮 Join Game" to pay ${tempData.betAmount} 💎 and join\n` +
            `• AI bots will be added based on selected mode\n` +
            `• Game starts when enough players join\n\n` +
            `⚠️ **Note:** Your ${tempData.betAmount} 💎 bet has been deducted!`,
        )
        .setColor(0x00ff00)
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`uno_ticket_join_${ticketId}`)
            .setLabel("🎮 Join Game")
            .setStyle(ButtonStyle.Success)
            .setEmoji("🃏"),
        new ButtonBuilder()
            .setCustomId(`uno_ticket_addai_${ticketId}`)
            .setLabel("🤖 Add AI Bot")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("🎯"),
        new ButtonBuilder()
            .setCustomId(`uno_ticket_start_${ticketId}`)
            .setLabel("▶️ Start Game")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("🚀"),
        new ButtonBuilder()
            .setCustomId(`uno_ticket_cancel_${ticketId}`)
            .setLabel("❌ Cancel")
            .setStyle(ButtonStyle.Danger"),
    );

    await interaction.update({ embeds: [embed], components: [row] });
}


                );
            }
        },
        5 * 60 * 1000,
    ); // 5 minutes
}

async function showAdminCommands(interaction) {
    if (!hasAdminRole(interaction)) {
        const embed = new EmbedBuilder()
            .setTitle("❌ Access Denied")
            .setDescription("You need the admin role to view admin commands.")
            .setColor(0xff0000);
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle("🛡️ Admin Commands - Diamond Bot")
        .setDescription("**Administrator-Only Commands:**")
        .addFields(
            {
                name: "🎛️ Panel Management",
                value: "`/send_daily_claim` - Send daily claim panel\n`/send_gift_card_panel` - Send gift card panel\n`/send_info_panel` - Send information panel",
                inline: false,
            },
            {
                name: "💎 Point Management",
                value: "`/drop_points` - Start point drop event (coming soon)\n• Point drops give community rewards\n• Admin can trigger special events",
                inline: false,
            },
            {
                name: "📊 System Features",
                value: "• Auto-save every 5 minutes\n• Auto-cleanup expired gift cards\n• Auto-delete gambling results (3 min)\n• Auto-delete gift card results (5 min)",
                inline: false,
            },
            {
                name: "🎁 Gift Card System",
                value: "• Users can generate gift cards (500-100k diamonds)\n• 7-day validity period\n• Status tracking (Valid/Claimed/Void)\n• DM delivery system",
                inline: false,
            },
            {
                name: "⚙️ Configuration",
                value: `• Daily Reward: 50 💎 (base)\n• Max Streak: 3x multiplier\n• Conversion Rate: 100 💎 = 1 Rupee\n• Data stored in: \`bot_data.json\``,
                inline: false,
            },
        )
        .setColor(0xff0000);

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

// Point Drop Ticket System
let pointDropTickets = {}; // Store tickets in memory

function generateTicketId() {
    return "PD-" + Math.random().toString(36).substring(2, 10).toUpperCase();
}

function createPointDropTicketButtons() {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("create_point_drop_ticket")
            .setLabel("🎫 Create Point Drop Ticket")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("🎯"),
        new ButtonBuilder()
            .setCustomId("point_drop_guidelines")
            .setLabel("📋 View Guidelines")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("📖"),
        new ButtonBuilder()
            .setCustomId("point_drop_history")
            .setLabel("📋 My Drop History")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("📚"),
    );

    return [row1];
}

async function showPointDropTicketModal(interaction) {
    // Restrict to specific admin user IDs only
    const allowedUserIDs = [
        "879396413010743337",
        "959692217885294632",
        "1054207830292447324",
    ];

    if (!allowedUserIDs.includes(interaction.user.id)) {
        const embed = new EmbedBuilder()
            .setTitle("❌ Access Denied")
            .setDescription(
                "You don't have permission to create point drop tickets.",
            )
            .setColor(0xff0000);

        const reply = await interaction.reply({
            embeds: [embed],
            ephemeral: true,
        });

        // Auto-delete response after 1 minute
        setTimeout(async () => {
            try {
                await reply.delete();
            } catch (error) {
                console.log(
                    "Could not delete access denied message:",
                    error.message,
                );
            }
        }, 60 * 1000); // 1 minute

        return;
    }

    const modal = new ModalBuilder()
        .setCustomId("point_drop_ticket_modal")
        .setTitle("🎯 Point Drop Event Request");

    const titleInput = new TextInputBuilder()
        .setCustomId("event_title")
        .setLabel("Event Title")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Enter a catchy title for your point drop event...")
        .setRequired(true)
        .setMaxLength(100);

    const diamondInput = new TextInputBuilder()
        .setCustomId("diamond_amount")
        .setLabel("Diamond Amount (100-10,000)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Enter total diamonds for the drop...")
        .setRequired(true)
        .setMaxLength(5);

    const durationInput = new TextInputBuilder()
        .setCustomId("event_duration")
        .setLabel("Event Duration (1-60 minutes)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("How long should the event last?")
        .setRequired(true)
        .setMaxLength(2);

    const descriptionInput = new TextInputBuilder()
        .setCustomId("event_description")
        .setLabel("Event Description")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Describe your point drop event in detail...")
        .setRequired(true)
        .setMaxLength(500);

    const reasonInput = new TextInputBuilder()
        .setCustomId("drop_reason")
        .setLabel("Reason for Request")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Why should this point drop be approved?")
        .setRequired(true)
        .setMaxLength(300);

    modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(diamondInput),
        new ActionRowBuilder().addComponents(durationInput),
        new ActionRowBuilder().addComponents(descriptionInput),
        new ActionRowBuilder().addComponents(reasonInput),
    );

    await interaction.showModal(modal);
}

async function handlePointDropTicketSubmission(interaction) {
    const title = interaction.fields.getTextInputValue("event_title");
    const diamondAmount = parseInt(
        interaction.fields.getTextInputValue("diamond_amount"),
    );
    const duration = parseInt(
        interaction.fields.getTextInputValue("event_duration"),
    );
    const description =
        interaction.fields.getTextInputValue("event_description");
    const reason = interaction.fields.getTextInputValue("drop_reason");

    // Validation
    if (isNaN(diamondAmount) || diamondAmount < 100 || diamondAmount > 10000) {
        return await interaction.reply({
            content: "❌ Diamond amount must be between 100 and 10,000!",
            ephemeral: true,
        });
    }

    if (isNaN(duration) || duration < 1 || duration > 60) {
        return await interaction.reply({
            content: "❌ Duration must be between 1 and 60 minutes!",
            ephemeral: true,
        });
    }

    const ticketId = generateTicketId();
    const ticket = {
        id: ticketId,
        userId: interaction.user.id,
        title: title,
        diamondAmount: diamondAmount,
        duration: duration,
        description: description,
        reason: reason,
        status: "pending",
        createdAt: new Date().toISOString(),
        reviewedBy: null,
        reviewedAt: null,
    };

    pointDropTickets[ticketId] = ticket;

    // Send ticket to admin verification channel
    const adminChannel = client.channels.cache.get(
        CHANNELS.gift_card_verification,
    );
    if (adminChannel) {
        const adminEmbed = new EmbedBuilder()
            .setTitle("🎯 New Point Drop Ticket Request")
            .setDescription(
                `**Ticket ID:** \`${ticketId}\`\n**Requested by:** ${interaction.user}\n**User ID:** ${interaction.user.id}`,
            )
            .addFields(
                { name: "🎯 Event Title", value: title, inline: false },
                {
                    name: "💎 Diamond Amount",
                    value: `${diamondAmount.toLocaleString()} 💎`,
                    inline: true,
                },
                {
                    name: "⏱️ Duration",
                    value: `${duration} minutes`,
                    inline: true,
                },
                { name: "📝 Description", value: description, inline: false },
                { name: "❓ Reason", value: reason, inline: false },
            )
            .setColor(0xffaa00)
            .setTimestamp();

        const adminButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`approve_ticket_${ticketId}`)
                .setLabel("✅ Approve")
                .setStyle(ButtonStyle.Success)
                .setEmoji("✅"),
            new ButtonBuilder()
                .setCustomId(`reject_ticket_${ticketId}`)
                .setLabel("❌ Reject")
                .setStyle(ButtonStyle.Danger)
                .setEmoji("❌"),
        );

        await adminChannel.send({
            embeds: [adminEmbed],
            components: [adminButtons],
        });
    }

    // Confirm submission to user
    const confirmEmbed = new EmbedBuilder()
        .setTitle("🎫 Point Drop Ticket Submitted!")
        .setDescription(
            `**Ticket ID:** \`${ticketId}\`\n\n**Event Title:** ${title}\n**Diamond Amount:** ${diamondAmount.toLocaleString()} 💎\n**Duration:** ${duration} minutes\n\n**Status:** 🟡 Pending Review\n\nYour point drop request has been submitted to the admin team for review. You'll receive a notification when it's processed.`,
        )
        .setColor(0x00ff00)
        .setTimestamp();

    const reply = await interaction.reply({
        embeds: [confirmEmbed],
        ephemeral: true,
    });

    // Auto-delete response after 1 minute
    setTimeout(async () => {
        try {
            await reply.delete();
        } catch (error) {
            console.log(
                "Could not delete ticket submission confirmation:",
                error.message,
            );
        }
    }, 60 * 1000); // 1 minute
}

async function handleTicketApproval(interaction, ticketId, approved) {
    if (!hasAdminRole(interaction)) {
        return await interaction.reply({
            content: "❌ You don't have permission to review tickets!",
            ephemeral: true,
        });
    }

    const ticket = pointDropTickets[ticketId];
    if (!ticket) {
        return await interaction.reply({
            content: "❌ Ticket not found!",
            ephemeral: true,
        });
    }

    ticket.status = approved ? "approved" : "rejected";
    ticket.reviewedBy = interaction.user.id;
    ticket.reviewedAt = new Date().toISOString();

    // Update the admin message
    const embed = new EmbedBuilder()
        .setTitle(`🎯 Point Drop Ticket ${approved ? "Approved" : "Rejected"}`)
        .setDescription(
            `**Ticket ID:** \`${ticketId}\`\n**Status:** ${approved ? "✅ Approved" : "❌ Rejected"}\n**Reviewed by:** ${interaction.user}`,
        )
        .addFields(
            { name: "🎯 Event Title", value: ticket.title, inline: false },
            {
                name: "💎 Diamond Amount",
                value: `${ticket.diamondAmount.toLocaleString()} 💎`,
                inline: true,
            },
            {
                name: "⏱️ Duration",
                value: `${ticket.duration} minutes`,
                inline: true,
            },
            {
                name: "📝 Description",
                value: ticket.description,
                inline: false,
            },
        )
        .setColor(approved ? 0x00ff00 : 0xff0000)
        .setTimestamp();

    await interaction.update({ embeds: [embed], components: [] });

    // If approved, start diamond mining event
    if (approved) {
        const dropChannel = client.channels.cache.get(CHANNELS.point_drops);
        if (dropChannel) {
            setTimeout(async () => {
                const miningEmbed = new EmbedBuilder()
                    .setTitle("💎 Diamond Mining Event - Ticket Approved!")
                    .setDescription(
                        `**🎫 Ticket:** \`${ticketId}\`\n**Event:** ${ticket.title}\n\n**💎 DIAMOND MINING 💎**\n\`\`\`\n     ⛏️💎⛏️\n    ╱ ╲ ╱ ╲\n   ╱   ╲   ╲\n  ╱_____╲___╲\n\`\`\`\n\n⏰ **Mining starts in 10 seconds!**\n💰 **Reward:** ${Math.floor(ticket.diamondAmount / 20)} 💎 per claim\n⏱️ **Duration:** ${ticket.duration} minutes\n🎯 **Event approved and starting soon!**`,
                    )
                    .setColor(0xffd700)
                    .setTimestamp();

                const message = await dropChannel.send({
                    embeds: [miningEmbed],
                });

                // Start mining after 10 seconds
                setTimeout(async () => {
                    await startCustomDiamondMining(
                        message,
                        dropChannel,
                        ticket,
                    );
                }, 10000);
            }, 5000);
        }
    }

    // Notify the user
    try {
        const user = await client.users.fetch(ticket.userId);
        const userEmbed = new EmbedBuilder()
            .setTitle(
                `🎯 Point Drop Ticket ${approved ? "Approved" : "Rejected"}`,
            )
            .setDescription(
                `**Ticket ID:** \`${ticketId}\`\n**Event Title:** ${ticket.title}\n\n**Status:** ${approved ? "✅ Approved - Your diamond mining event is starting!" : "❌ Rejected - Please try again with a different request."}`,
            )
            .setColor(approved ? 0x00ff00 : 0xff0000)
            .setTimestamp();

        await user.send({ embeds: [userEmbed] });
    } catch (error) {
        console.log("Could not send DM to user:", error.message);
    }
}

// Diamond Mining System
let activeMiningEvents = new Map();

async function startDiamondMining(message, channel) {
    const eventId = `mining_${Date.now()}`;
    const totalDiamonds = 1000; // Total diamonds available for the event
    const diamondPerClaim = 10;
    const miningData = {
        participants: new Map(), // Track individual user claims
        timeLeft: 60,
        totalClaims: 0,
        diamondReward: diamondPerClaim,
        totalDiamonds: totalDiamonds,
        remainingDiamonds: totalDiamonds,
        maxClaims: Math.floor(totalDiamonds / diamondPerClaim),
    };

    activeMiningEvents.set(eventId, miningData);

    const miningButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`mine_diamonds_${eventId}`)
            .setLabel("⛏️ Mine Diamonds!")
            .setStyle(ButtonStyle.Success)
            .setEmoji("💎"),
    );

    const startEmbed = new EmbedBuilder()
        .setTitle("💎 DIAMOND MINING ACTIVE! ⛏️")
        .setDescription(
            `**💎 DIAMOND MINE 💎**\n\`\`\`\n    ⛏️💎💎💎⛏️\n   ╱ ╲ ╱ ╲ ╱ ╲\n  ╱   ╲   ╲   ╲\n ╱_____╲___╲___╲\n    MINING ZONE\n\`\`\`\n\n⏱️ **Time Remaining:** 60 seconds\n💰 **Reward:** ${diamondPerClaim} 💎 per claim\n💎 **Total Pool:** ${totalDiamonds.toLocaleString()} 💎\n💎 **Remaining:** ${totalDiamonds.toLocaleString()} 💎\n👥 **Active Miners:** 0\n🏆 **Total Claims:** 0 / ${miningData.maxClaims}\n\n**⚡ UNLIMITED CLAIMS! Mine as much as you can until time runs out or diamonds depleted!**`,
        )
        .setColor(0x00ff00)
        .setTimestamp();

    await message.edit({ embeds: [startEmbed], components: [miningButton] });

    // Start countdown
    const countdownInterval = setInterval(async () => {
        miningData.timeLeft--;

        if (miningData.timeLeft <= 0 || miningData.remainingDiamonds <= 0) {
            clearInterval(countdownInterval);
            await endDiamondMining(message, eventId);
            return;
        }

        const countdownEmbed = new EmbedBuilder()
            .setTitle("💎 DIAMOND MINING ACTIVE! ⛏️")
            .setDescription(
                `**💎 DIAMOND MINE 💎**\n\`\`\`\n    ⛏️💎💎💎⛏️\n   ╱ ╲ ╱ ╲ ╱ ╲\n  ╱   ╲   ╲   ╲\n ╱_____╲___╲___╲\n    MINING ZONE\n\`\`\`\n\n⏱️ **Time Remaining:** ${miningData.timeLeft} seconds\n💰 **Reward:** ${miningData.diamondReward} 💎 per claim\n💎 **Total Pool:** ${miningData.totalDiamonds.toLocaleString()} 💎\n💎 **Remaining:** ${miningData.remainingDiamonds.toLocaleString()} 💎\n👥 **Active Miners:** ${miningData.participants.size}\n🏆 **Total Claims:** ${miningData.totalClaims} / ${miningData.maxClaims}\n\n**⚡ UNLIMITED CLAIMS! Mine as much as you can until time runs out or diamonds depleted!**`,
            )
            .setColor(
                miningData.timeLeft <= 10
                    ? 0xff0000
                    : miningData.remainingDiamonds <= 100
                      ? 0xffaa00
                      : 0x00ff00,
            )
            .setTimestamp();

        try {
            await message.edit({
                embeds: [countdownEmbed],
                components: [miningButton],
            });
        } catch (error) {
            console.log("Could not update mining countdown:", error.message);
        }
    }, 1000);
}

async function startCustomDiamondMining(message, channel, ticket) {
    const eventId = `custom_mining_${ticket.id}`;
    const diamondPerClaim = Math.max(5, Math.floor(ticket.diamondAmount / 50)); // Smaller per-claim but unlimited claims
    const miningData = {
        participants: new Map(), // Track individual user claims
        timeLeft: ticket.duration * 60, // Convert minutes to seconds
        totalClaims: 0,
        diamondReward: diamondPerClaim,
        totalDiamonds: ticket.diamondAmount,
        remainingDiamonds: ticket.diamondAmount,
        maxClaims: Math.floor(ticket.diamondAmount / diamondPerClaim),
        ticketId: ticket.id,
    };

    activeMiningEvents.set(eventId, miningData);

    const miningButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`mine_diamonds_${eventId}`)
            .setLabel("⛏️ Mine Diamonds!")
            .setStyle(ButtonStyle.Success)
            .setEmoji("💎"),
    );

    const startEmbed = new EmbedBuilder()
        .setTitle(`💎 ${ticket.title} - DIAMOND MINING! ⛏️`)
        .setDescription(
            `**💎 CUSTOM DIAMOND MINE 💎**\n\`\`\`\n    ⛏️💎💎💎⛏️\n   ╱ ╲ ╱ ╲ ╱ ╲\n  ╱   ╲   ╲   ╲\n ╱_____╲___╲___╲\n   ${ticket.title.substring(0, 13).toUpperCase()}\n\`\`\`\n\n⏱️ **Time Remaining:** ${ticket.duration} minutes\n💰 **Reward:** ${diamondPerClaim} 💎 per claim\n💎 **Total Pool:** ${ticket.diamondAmount.toLocaleString()} 💎\n💎 **Remaining:** ${ticket.diamondAmount.toLocaleString()} 💎\n🎫 **Event:** ${ticket.title}\n👥 **Active Miners:** 0\n🏆 **Total Claims:** 0 / ${miningData.maxClaims}\n\n**⚡ UNLIMITED CLAIMS! Mine continuously until time runs out or diamonds depleted!**`,
        )
        .setColor(0x00ff00)
        .setTimestamp();

    await message.edit({ embeds: [startEmbed], components: [miningButton] });

    // Start countdown
    const countdownInterval = setInterval(async () => {
        miningData.timeLeft--;

        if (miningData.timeLeft <= 0 || miningData.remainingDiamonds <= 0) {
            clearInterval(countdownInterval);
            await endCustomDiamondMining(message, eventId, ticket);
            return;
        }

        const minutes = Math.floor(miningData.timeLeft / 60);
        const seconds = miningData.timeLeft % 60;
        const timeDisplay =
            minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

        const countdownEmbed = new EmbedBuilder()
            .setTitle(`💎 ${ticket.title} - DIAMOND MINING! ⛏️`)
            .setDescription(
                `**💎 CUSTOM DIAMOND MINE 💎**\n\`\`\`\n    ⛏️💎💎💎⛏️\n   ╱ ╲ ╱ ╲ ╱ ╲\n  ╱   ╲   ╲   ╲\n ╱_____╲___╲___╲\n   ${ticket.title.substring(0, 13).toUpperCase()}\n\`\`\`\n\n⏱️ **Time Remaining:** ${timeDisplay}\n💰 **Reward:** ${miningData.diamondReward} 💎 per claim\n💎 **Total Pool:** ${miningData.totalDiamonds.toLocaleString()} 💎\n💎 **Remaining:** ${miningData.remainingDiamonds.toLocaleString()} 💎\n🎫 **Event:** ${ticket.title}\n👥 **Active Miners:** ${miningData.participants.size}\n🏆 **Total Claims:** ${miningData.totalClaims} / ${miningData.maxClaims}\n\n**⚡ UNLIMITED CLAIMS! Mine continuously until time runs out or diamonds depleted!**`,
            )
            .setColor(
                miningData.timeLeft <= 30
                    ? 0xff0000
                    : miningData.remainingDiamonds <=
                        miningData.totalDiamonds * 0.1
                      ? 0xffaa00
                      : 0x00ff00,
            )
            .setTimestamp();

        try {
            await message.edit({
                embeds: [countdownEmbed],
                components: [miningButton],
            });
        } catch (error) {
            console.log(
                "Could not update custom mining countdown:",
                error.message,
            );
        }
    }, 1000);
}

async function endDiamondMining(message, eventId) {
    const miningData = activeMiningEvents.get(eventId);
    if (!miningData) return;

    const diamondsDistributed =
        miningData.totalDiamonds - miningData.remainingDiamonds;
    const endReason =
        miningData.remainingDiamonds <= 0
            ? "All diamonds mined!"
            : "Time expired!";

    // Calculate top miners
    const topMiners = Array.from(miningData.participants.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3);

    let topMinersText = "";
    if (topMiners.length > 0) {
        const medals = ["🥇", "🥈", "🥉"];
        topMinersText = "\n\n**🏆 Top Miners:**\n";
        for (let i = 0; i < topMiners.length; i++) {
            const [userId, claims] = topMiners[i];
            try {
                const user = await client.users.fetch(userId);
                topMinersText += `${medals[i]} @${user.username}: ${claims} claims (${claims * miningData.diamondReward} 💎)\n`;
            } catch {
                topMinersText += `${medals[i]} User ${userId}: ${claims} claims (${claims * miningData.diamondReward} 💎)\n`;
            }
        }
    }

    const finalEmbed = new EmbedBuilder()
        .setTitle("💎 DIAMOND MINING COMPLETED! ⛏️")
        .setDescription(
            `**💎 MINING RESULTS 💎**\n\`\`\`\n    ⛏️💎💎💎⛏️\n   ╱ ╲ ╱ ╲ ╱ ╲\n  ╱   ╲   ╲   ╲\n ╱_____╲___╲___╲\n    MINE CLOSED\n\`\`\`\n\n⏰ **Event Status:** ${endReason}\n👥 **Total Miners:** ${miningData.participants.size}\n🏆 **Total Claims:** ${miningData.totalClaims}\n💎 **Total Pool:** ${miningData.totalDiamonds.toLocaleString()} 💎\n💎 **Diamonds Distributed:** ${diamondsDistributed.toLocaleString()} 💎\n💎 **Remaining:** ${miningData.remainingDiamonds.toLocaleString()} 💎${topMinersText}\n\n**Thanks for participating in the diamond mining event!**`,
        )
        .setColor(0x808080)
        .setTimestamp();

    await message.edit({ embeds: [finalEmbed], components: [] });
    activeMiningEvents.delete(eventId);
}

async function endCustomDiamondMining(message, eventId, ticket) {
    const miningData = activeMiningEvents.get(eventId);
    if (!miningData) return;

    const diamondsDistributed =
        miningData.totalDiamonds - miningData.remainingDiamonds;
    const endReason =
        miningData.remainingDiamonds <= 0
            ? "All diamonds mined!"
            : "Time expired!";

    // Calculate top miners
    const topMiners = Array.from(miningData.participants.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3);

    let topMinersText = "";
    if (topMiners.length > 0) {
        const medals = ["🥇", "🥈", "🥉"];
        topMinersText = "\n\n**🏆 Top Miners:**\n";
        for (let i = 0; i < topMiners.length; i++) {
            const [userId, claims] = topMiners[i];
            try {
                const user = await client.users.fetch(userId);
                topMinersText += `${medals[i]} @${user.username}: ${claims} claims (${claims * miningData.diamondReward} 💎)\n`;
            } catch {
                topMinersText += `${medals[i]} User ${userId}: ${claims} claims (${claims * miningData.diamondReward} 💎)\n`;
            }
        }
    }

    const finalEmbed = new EmbedBuilder()
        .setTitle(`💎 ${ticket.title} - MINING COMPLETED! ⛏️`)
        .setDescription(
            `**💎 MINING RESULTS 💎**\n\`\`\`\n    ⛏️💎💎💎⛏️\n   ╱ ╲ ╱ ╲ ╱ ╲\n  ╱   ╲   ╲   ╲\n ╱_____╲___╲___╲\n    MINE CLOSED\n\`\`\`\n\n⏰ **Event Status:** ${endReason}\n🎫 **Event:** ${ticket.title}\n👥 **Total Miners:** ${miningData.participants.size}\n🏆 **Total Claims:** ${miningData.totalClaims}\n💎 **Total Pool:** ${miningData.totalDiamonds.toLocaleString()} 💎\n💎 **Diamonds Distributed:** ${diamondsDistributed.toLocaleString()} 💎\n💎 **Remaining:** ${miningData.remainingDiamonds.toLocaleString()} 💎\n🎯 **Ticket ID:** \`${ticket.id}\`${topMinersText}\n\n**Thanks for participating in this custom diamond mining event!**`,
        )
        .setColor(0x808080)
        .setTimestamp();

    await message.edit({ embeds: [finalEmbed], components: [] });
    activeMiningEvents.delete(eventId);
}

async function showPointDropGuidelines(interaction) {
    const embed = new EmbedBuilder()
        .setTitle("📋 Point Drop Guidelines & Rules")
        .setDescription("**Requirements for Point Drop Approval:**")
        .addFields(
            {
                name: "💎 Diamond Range",
                value: "• Minimum: 100 💎\n• Maximum: 10,000 💎\n• Must be reasonable for event type",
                inline: true,
            },
            {
                name: "⏱️ Duration Limits",
                value: "• Minimum: 1 minute\n• Maximum: 60 minutes\n• Consider server activity",
                inline: true,
            },
            {
                name: "📝 Event Requirements",
                value: "• Clear, descriptive title\n• Detailed event description\n• Valid reason for request",
                inline: false,
            },
            {
                name: "✅ Approval Criteria",
                value: "• Community benefit\n• Reasonable diamond amount\n• Special occasions/events\n• Active server participation",
                inline: true,
            },
            {
                name: "❌ Rejection Reasons",
                value: "• Excessive diamond requests\n• Insufficient description\n• Too frequent requests\n• Inappropriate content",
                inline: true,
            },
            {
                name: "📊 Process Timeline",
                value: "• Submission: Instant\n• Review: 1-24 hours\n• Notification: Via DM\n• Event: Scheduled by admin",
                inline: false,
            },
        )
        .setColor(0x0099ff)
        .setFooter({
            text: "Follow these guidelines for better approval chances!",
        });

    const reply = await interaction.reply({ embeds: [embed], ephemeral: true });

    // Auto-delete response after 1 minute
    setTimeout(async () => {
        try {
            await reply.delete();
        } catch (error) {
            console.log("Could not delete guidelines message:", error.message);
        }
    }, 60 * 1000); // 1 minute
}

async function showPointDropHistory(interaction) {
    const userTickets = Object.values(pointDropTickets).filter(
        (ticket) => ticket.userId === interaction.user.id,
    );

    if (userTickets.length === 0) {
        const embed = new EmbedBuilder()
            .setTitle("📋 Your Point Drop History")
            .setDescription(
                "You haven't submitted any point drop tickets yet!\n\nClick **Create Point Drop Ticket** to submit your first request.",
            )
            .setColor(0x0099ff);

        const reply = await interaction.reply({
            embeds: [embed],
            ephemeral: true,
        });

        // Auto-delete response after 1 minute
        setTimeout(async () => {
            try {
                await reply.delete();
            } catch (error) {
                console.log(
                    "Could not delete empty history message:",
                    error.message,
                );
            }
        }, 60 * 1000); // 1 minute

        return;
    }

    const embed = new EmbedBuilder()
        .setTitle("📋 Your Point Drop History")
        .setDescription(
            `**Total Tickets:** ${userTickets.length}\n\nShowing your last 5 tickets:`,
        )
        .setColor(0x0099ff);

    const recentTickets = userTickets.slice(-5).reverse();

    for (const ticket of recentTickets) {
        let statusEmoji;
        switch (ticket.status) {
            case "pending":
                statusEmoji = "🟡";
                break;
            case "approved":
                statusEmoji = "✅";
                break;
            case "rejected":
                statusEmoji = "❌";
                break;
            default:
                statusEmoji = "❓";
        }

        embed.addFields({
            name: `${statusEmoji} ${ticket.title}`,
            value: `**ID:** \`${ticket.id}\`\n**Amount:** ${ticket.diamondAmount} 💎\n**Status:** ${ticket.status}\n**Submitted:** <t:${Math.floor(new Date(ticket.createdAt).getTime() / 1000)}:R>`,
            inline: false,
        });
    }

    const reply = await interaction.reply({ embeds: [embed], ephemeral: true });

    // Auto-delete response after 1 minute
    setTimeout(async () => {
        try {
            await reply.delete();
        } catch (error) {
            console.log("Could not delete history message:", error.message);
        }
    }, 60 * 1000); // 1 minute
}

async function handleUnoPlay(interaction, gameId) {
    const game = activeUnoGames.get(gameId);
    if (!game) {
        return await interaction.reply({
            content: "❌ This game no longer exists!",
            ephemeral: true,
        });
    }

    if (game.getCurrentPlayer() !== interaction.user.id) {
        return await interaction.reply({
            content: "❌ It's not your turn!",
            ephemeral: true,
        });
    }

    const playerHand = game.hands.get(interaction.user.id);
    const topCard = game.discardPile[game.discardPile.length - 1];
    const playableCards = playerHand.filter((card) =>
        game.canPlayCard(card, topCard),
    );

    if (playableCards.length === 0) {
        return await interaction.reply({
            content: "❌ You have no playable cards! Draw a card first.",
            ephemeral: true,
        });
    }

    // For simplicity, play the first playable card
    const cardToPlay = playableCards[0];
    const handIndex = playerHand.indexOf(cardToPlay);
    playerHand.splice(handIndex, 1);
    game.discardPile.push(cardToPlay);

    // Reset auto-cleanup timer since there was activity
    game.cancelAutoCleanup();

    // Check for UNO
    if (playerHand.length === 0) {
        // Player wins!
        game.finishPlayer(interaction.user.id);

        let prizeText = "";
        if (game.betAmount > 0) {
            const prizes = game.calculatePrizeDistribution();
            const userPrize = prizes[interaction.user.id] || 0;

            if (userPrize > 0) {
                const userData = pointsSystem.getUserData(interaction.user.id);
                userData.points += userPrize;
                userData.total_earned += userPrize;
                await pointsSystem.saveData();

                prizeText = `\n\n💎 **Prize Won:** ${userPrize} 💎\n🏆 **Prize Pool:** ${game.totalPrizePool} 💎`;
            }
        }

        const topCard = game.discardPile[game.discardPile.length - 1];
        const cardEmbed = topCard.image
            ? {
                  image: { url: topCard.image },
              }
            : null;

        const embed = new EmbedBuilder()
            .setTitle("🏆 UNO SHOWDOWN WINNER!")
            .setDescription(
                `**${interaction.user.displayName} wins the game!**\n\n` +
                    `🎉 **CONGRATULATIONS!** 🎉\n` +
                    `🃏 **Winning Card:** ${cardToPlay.emoji}${prizeText}\n\n` +
                    `**Game Summary:**\n` +
                    `• Players: ${game.players.length}\n` +
                    `• Bet Amount: ${game.betAmount} 💎 per player\n` +
                    `• Total Prize Pool: ${game.totalPrizePool} 💎\n` +
                    `• Winner's Prize: ${Math.floor(game.totalPrizePool * 0.5)} 💎`,
            )
            .setColor(0xffd700)
            .setTimestamp();

        if (cardEmbed) {
            embed.setImage(cardToPlay.image);
        }

        await interaction.update({ embeds: [embed], components: [] });

        // Distribute remaining prizes if there are other finished players
        if (game.finishedPlayers.length > 1) {
            const allPrizes = game.calculatePrizeDistribution();
            for (const [playerId, prize] of Object.entries(allPrizes)) {
                if (playerId !== interaction.user.id && prize > 0) {
                    const userData = pointsSystem.getUserData(playerId);
                    userData.points += prize;
                    userData.total_earned += prize;
                }
            }
            await pointsSystem.saveData();
        }

        activeUnoGames.delete(gameId);
        return;
    }

    game.nextTurn();
    const nextPlayer = await client.users.fetch(game.getCurrentPlayer());

    const embed = new EmbedBuilder()
        .setTitle("🃏 UNO Showdown 3D")
        .setDescription(
            `**${interaction.user.displayName} played:** ${cardToPlay.emoji}\n\n` +
                `**Current Player:** ${nextPlayer.displayName}\n` +
                `**Top Card:** ${cardToPlay.emoji}\n` +
                `**Direction:** ${game.direction === 1 ? "➡️ Clockwise" : "⬅️ Counter-clockwise"}\n\n` +
                `**Players:**\n` +
                (
                    await Promise.all(
                        game.players.map(async (id, index) => {
                            const user = await client.users.fetch(id);
                            const cards = game.hands.get(id).length;
                            const indicator =
                                index === game.currentPlayerIndex ? "👉" : "  ";
                            return `${indicator} ${user.displayName}: ${cards} cards`;
                        }),
                    )
                ).join("\n") +
                `\n\n⚠️ **Auto-cleanup in 10 seconds if no activity!**`,
        )
        .setColor(0x00ff00)
        .setTimestamp();

    const components = createUnoGameButtons(game.gameId);
    await interaction.update({ embeds: [embed], components: [components] });

    // Restart auto-cleanup timer
    game.startAutoCleanup(interaction.message);
}

async function handleUnoDraw(interaction, gameId) {
    const game = activeUnoGames.get(gameId);
    if (!game) {
        return await interaction.reply({
            content: "❌ This game no longer exists!",
            ephemeral: true,
        });
    }

    if (game.getCurrentPlayer() !== interaction.user.id) {
        return await interaction.reply({
            content: "❌ It's not your turn!",
            ephemeral: true,
        });
    }

    if (game.deck.length === 0) {
        return await interaction.reply({
            content: "❌ No more cards in deck!",
            ephemeral: true,
        });
    }

    const drawnCard = game.deck.pop();
    game.hands.get(interaction.user.id).push(drawnCard);

    // Reset auto-cleanup timer
    game.cancelAutoCleanup();
    game.nextTurn();

    const nextPlayer = await client.users.fetch(game.getCurrentPlayer());
    const topCard = game.discardPile[game.discardPile.length - 1];

    const embed = new EmbedBuilder()
        .setTitle("🃏 UNO Showdown 3D")
        .setDescription(
            `**${interaction.user.displayName} drew a card**\n\n` +
                `**Current Player:** ${nextPlayer.displayName}\n` +
                `**Top Card:** ${topCard.emoji}\n` +
                `**Direction:** ${game.direction === 1 ? "➡️ Clockwise" : "⬅️ Counter-clockwise"}\n\n` +
                `**Players:**\n` +
                (
                    await Promise.all(
                        game.players.map(async (id, index) => {
                            const user = await client.users.fetch(id);
                            const cards = game.hands.get(id).length;
                            const indicator =
                                index === game.currentPlayerIndex ? "👉" : "  ";
                            return `${indicator} ${user.displayName}: ${cards} cards`;
                        }),
                    )
                ).join("\n") +
                `\n\n⚠️ **Auto-cleanup in 10 seconds if no activity!**`,
        )
        .setColor(0x0099ff)
        .setTimestamp();

    const components = createUnoGameButtons(game.gameId);
    await interaction.update({ embeds: [embed], components: [components] });

    // Restart auto-cleanup timer
    game.startAutoCleanup(interaction.message);
}

async function handleUnoCall(interaction, gameId) {
    const game = activeUnoGames.get(gameId);
    if (!game) {
        return await interaction.reply({
            content: "❌ This game no longer exists!",
            ephemeral: true,
        });
    }

    const playerHand = game.hands.get(interaction.user.id);
    if (playerHand.length !== 1) {
        return await interaction.reply({
            content: "❌ You can only call UNO when you have exactly 1 card!",
            ephemeral: true,
        });
    }

    await interaction.reply({
        content: `🗣️ **${interaction.user.displayName} called UNO!** (1 card remaining)`,
        ephemeral: false,
    });
}

async function handleUnoBetModal(interaction) {
    const channelId = interaction.customId.replace("uno_bet_modal_", "");
    const betAmount = parseInt(
        interaction.fields.getTextInputValue("bet_amount"),
    );

    if (isNaN(betAmount) || betAmount < 10 || betAmount > 1000) {
        return await interaction.reply({
            content: "❌ Bet amount must be between 10 and 1000 diamonds!",
            ephemeral: true,
        });
    }

    // Check if user has enough diamonds
    const userData = pointsSystem.getUserData(interaction.user.id);
    if (userData.points < betAmount) {
        return await interaction.reply({
            content: `❌ You need ${betAmount} 💎 but only have ${userData.points} 💎!`,
            ephemeral: true,
        });
    }

    await interaction.reply({
        content: `🎮 Creating UNO game with ${betAmount} 💎 bet per player...`,
        ephemeral: true,
    });

    await startUnoGame(channelId, interaction.user.id, betAmount);
}

async function handleDiamondMining(interaction, eventId) {
    const miningData = activeMiningEvents.get(eventId);
    if (!miningData) {
        return await interaction.reply({
            content: "❌ This mining event has ended!",
            ephemeral: true,
        });
    }

    const userId = interaction.user.id;

    // Check if diamonds are depleted
    if (miningData.remainingDiamonds < miningData.diamondReward) {
        return await interaction.reply({
            content:
                "💎 All diamonds have been mined! This event has no more diamonds available.",
            ephemeral: true,
        });
    }

    // Add diamonds to user
    const userData = pointsSystem.getUserData(userId);
    userData.points += miningData.diamondReward;
    userData.total_earned += miningData.diamondReward;

    // Track participation (now tracks individual user claims)
    if (!miningData.participants.has(userId)) {
        miningData.participants.set(userId, 0);
    }
    const userClaims = miningData.participants.get(userId) + 1;
    miningData.participants.set(userId, userClaims);
    miningData.totalClaims++;
    miningData.remainingDiamonds -= miningData.diamondReward;

    await pointsSystem.saveData();
}

async function sendPointDropTicketPanel() {
    const pointDropChannel = client.channels.cache.get(CHANNELS.point_drops);
    if (pointDropChannel) {
        const embed = new EmbedBuilder()
            .setTitle("🎯 Point Drop Ticket System")
            .setDescription(
                `**Request Community Point Drop Events!**\n\`\`\`\n  🎯 POINT DROP SYSTEM 🎯\n╔═══════════════════════════╗\n║ 🎫 Create Event Tickets   ║\n║ 📋 View Guidelines        ║\n║ 📚 View History          ║\n╚═══════════════════════════╝\n\`\`\`\n\n**How it Works:**\n1. 🎫 **Create Ticket** - Submit your point drop event request\n2. 📋 **Follow Guidelines** - Check requirements for approval\n3. ⏳ **Wait for Review** - Admin team reviews your request\n4. 🎉 **Event Scheduled** - Approved events get scheduled\n\n**Request Requirements:**\n💎 **Diamond Range:** 100 - 10,000 diamonds\n⏱️ **Duration:** 1 - 60 minutes\n📝 **Details:** Title, description, and reason required\n\n**Review Process:**\n• All requests reviewed by admin team\n• Approval based on community benefit\n• Notifications sent via DM\n• Approved events scheduled by admins\n\n**Tips for Approval:**\n✅ Special occasions (holidays, milestones)\n✅ Community engagement events\n✅ Reasonable diamond amounts\n✅ Clear event descriptions\n✅ Valid reasons for request\n\nStart by clicking **Create Point Drop Ticket** below!`,
            )
            .setColor(0x00bfff);

        const components = createPointDropTicketButtons();
        await pointDropChannel.send({ embeds: [embed], components });
        console.log("✅ Point drop ticket panel sent");
    }
}

async function handleSendSystemPanel(interaction) {
    if (!hasAdminRole(interaction)) {
        const embed = new EmbedBuilder()
            .setTitle("❌ Access Denied")
            .setDescription("You need the admin role to use this command.")
            .setColor(0xff0000);
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    await sendSystemCommandsPanel();
    await interaction.reply({
        content: "✅ System commands panel sent!",
        ephemeral: true,
    });
}

async function handleSendUnoTicketPanel(interaction) {
    if (!hasAdminRole(interaction)) {
        const embed = new EmbedBuilder()
            .setTitle("❌ Access Denied")
            .setDescription("You need the admin role to use this command.")
            .setColor(0xff0000);
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const unoChannel = client.channels.cache.get("1387168027027574875");
    if (unoChannel) {
        const panelData = createUnoTicketPanel();
        await unoChannel.send(panelData);
        await interaction.reply({
            content: "✅ UNO ticket panel sent to the gaming channel!",
            ephemeral: true,
        });
    } else {
        await interaction.reply({
            content: "❌ UNO gaming channel not found!",
            ephemeral: true,
        });
    }
}

async function handleCreateUnoTicket(interaction) {
    // Check if in correct channel
    if (interaction.channelId !== "1387168027027574875") {
        const embed = new EmbedBuilder()
            .setTitle("❌ Wrong Channel")
            .setDescription("UNO tickets can only be created in the designated gaming channel!")
            .setColor(0xff0000);
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle("🎫 Create UNO Game Ticket")
        .setDescription(
            `**Set up your UNO game with the options below:**\n\n` +
            `💎 **Diamond Bet:** Use the text input to set bet amount (10-1000)\n` +
            `🤖 **AI Mode:** Choose from dropdown (Human-only or AI difficulty)\n` +
            `👥 **Max Players:** Select from dropdown (2-10 players)\n\n` +
            `**Next Steps:**\n` +
            `1. Fill out the diamond bet amount\n` +
            `2. Select your preferred AI mode\n` +
            `3. Choose maximum number of players\n` +
            `4. Submit to create your game ticket!`
        )
        .setColor(0x9932cc);

    const modal = new ModalBuilder()
        .setCustomId("uno_ticket_modal_step1")
        .setTitle("🎫 UNO Ticket - Diamond Bet");

    const betInput = new TextInputBuilder()
        .setCustomId("bet_amount")
        .setLabel("Diamond Bet Amount (10-1000 per player)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Enter diamonds each player must bet...")
        .setRequired(true)
        .setMaxLength(4);

    modal.addComponents(
        new ActionRowBuilder().addComponents(betInput)
    );

    const aiModeSelect = new StringSelectMenuBuilder()
        .setCustomId("uno_ai_mode_select")
        .setPlaceholder("🤖 Choose AI Mode...")
        .addOptions([
            {
                label: "👥 Human Only",
                description: "No AI bots, human players only",
                value: "none",
                emoji: "👥"
            },
            {
                label: "🎲 Easy AI",
                description: "70% play rate, simple strategy",
                value: "easy",
                emoji: "🎲"
            },
            {
                label: "🎯 Medium AI",
                description: "85% play rate, prefers action cards",
                value: "medium",
                emoji: "🎯"
            },
            {
                label: "🎮 Hard AI",
                description: "90% play rate, strategic choices",
                value: "hard",
                emoji: "🎮"
            },
            {
                label: "🤖 Expert AI",
                description: "95% play rate, optimal strategy",
                value: "expert",
                emoji: "🤖"
            },
            {
                label: "🎭 Mixed AI",
                description: "Random AI difficulties",
                value: "mixed",
                emoji: "🎭"
            }
        ]);

    const maxPlayersSelect = new StringSelectMenuBuilder()
        .setCustomId("uno_max_players_select")
        .setPlaceholder("👥 Choose Maximum Players...")
        .addOptions([
            { label: "2 Players", value: "2", emoji: "2️⃣" },
            { label: "3 Players", value: "3", emoji: "3️⃣" },
            { label: "4 Players", value: "4", emoji: "4️⃣" },
            { label: "5 Players", value: "5", emoji: "5️⃣" },
            { label: "6 Players", value: "6", emoji: "6️⃣" },
            { label: "7 Players", value: "7", emoji: "7️⃣" },
            { label: "8 Players", value: "8", emoji: "8️⃣" },
            { label: "9 Players", value: "9", emoji: "9️⃣" },
            { label: "10 Players", value: "10", emoji: "🔟" }
        ]);

    const submitButton = new ButtonBuilder()
        .setCustomId("uno_ticket_submit")
        .setLabel("🎫 Create Ticket")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🃏");

    const components = [
        new ActionRowBuilder().addComponents(aiModeSelect),
        new ActionRowBuilder().addComponents(maxPlayersSelect),
        new ActionRowBuilder().addComponents(submitButton)
    ];

    // Store temporary ticket data
    const tempTicketData = {
        creatorId: interaction.user.id,
        betAmount: null,
        aiMode: null,
        maxPlayers: null,
        timestamp: Date.now()
    };

    // Store in global temp storage (you might want to implement a proper temp storage)
    if (!global.tempUnoTickets) global.tempUnoTickets = new Map();
    global.tempUnoTickets.set(interaction.user.id, tempTicketData);

    await interaction.reply({ embeds: [embed], components, ephemeral: true });
    await interaction.followUp({ modal });
}

async function handleUnoTicketModal(interaction) {
    if (interaction.customId === "uno_ticket_modal_step1") {
        const betAmount = parseInt(interaction.fields.getTextInputValue("bet_amount"));

        // Validation
        if (isNaN(betAmount) || betAmount < 10 || betAmount > 1000) {
            return await interaction.reply({
                content: "❌ Bet amount must be between 10 and 1000 diamonds!",
                ephemeral: true,
            });
        }

        // Check if user has enough diamonds
        const userData = pointsSystem.getUserData(interaction.user.id);
        if (userData.points < betAmount) {
            return await interaction.reply({
                content: `❌ You need ${betAmount} 💎 but only have ${userData.points} 💎!`,
                ephemeral: true,
            });
        }

        // Update temp data
        if (!global.tempUnoTickets) global.tempUnoTickets = new Map();
        const tempData = global.tempUnoTickets.get(interaction.user.id) || {};
        tempData.betAmount = betAmount;
        global.tempUnoTickets.set(interaction.user.id, tempData);

        await interaction.reply({
            content: `✅ Bet amount set to ${betAmount} 💎! Now select AI mode and max players from the dropdowns above, then click "Create Ticket".`,
            ephemeral: true
        });
    }
}

async function handleUnoRulesGuide(interaction) {
    const embed = new EmbedBuilder()
        .setTitle("📋 UNO Rules & Game Guide")
        .setDescription("**Complete UNO Gaming Guide**")
        .addFields(
            {
                name: "🎮 Basic Rules",
                value: "• Match color or number to play\n• Draw cards if you can't play\n• Call UNO when you have 1 card left!\n• First to empty hand wins",
                inline: true,
            },
            {
                name: "🃏 Special Cards",
                value: "🔄 **Reverse** - Change direction\n⏭️ **Skip** - Skip next player\n➕2️⃣ **Draw 2** - Next player draws 2\n🌈 **Wild** - Choose color\n🌈⚡ **Wild +4** - Choose color, +4 cards",
                inline: true,
            },
            {
                name: "💎 Betting System",
                value: "• Set bet amount (10-1000 💎)\n• All players must pay to join\n• Prizes distributed to top 3\n• Winner gets 50% of prize pool",
                inline: false,
            },
            {
                name: "🤖 AI Modes",
                value: "🎲 **EASY** - 70% play rate, basic strategy\n🎯 **MEDIUM** - 85% play rate, prefers action cards\n🎮 **HARD** - 90% play rate, strategic choices\n🤖 **EXPERT** - 95% play rate, optimal strategy\n🎭 **MIXED** - Random AI difficulties",
                inline: false,
            },
            {
                name: "🎫 Ticket System",
                value: "• Create tickets to set up games\n• Choose bet amount and AI mode\n• Players join by paying bet\n• Host controls game start\n• Auto-cleanup if inactive",
                inline: false,
            },
        )
        .setColor(0x0099ff);

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleUnoActiveGames(interaction) {
    const activeTickets = Array.from(unoTickets.values()).filter(ticket => ticket.status === "open");
    const activeGames = Array.from(activeUnoGames.values());

    const embed = new EmbedBuilder()
        .setTitle("🎮 Active UNO Sessions")
        .setColor(0x00ff00);

    if (activeTickets.length === 0 && activeGames.length === 0) {
        embed.setDescription("No active UNO tickets or games at the moment.\n\nCreate a new ticket to start playing!");
    } else {
        let description = "";
        
        if (activeTickets.length > 0) {
            description += "**🎫 Open Tickets:**\n";
            for (const ticket of activeTickets.slice(0, 5)) {
                description += `• \`${ticket.id}\` - ${ticket.betAmount}💎 - ${ticket.players.length}/${ticket.maxPlayers} players\n`;
            }
            description += "\n";
        }

        if (activeGames.length > 0) {
            description += "**🃏 Active Games:**\n";
            for (const game of activeGames.slice(0, 5)) {
                description += `• Game \`${game.gameId.substring(4, 12)}\` - ${game.players.length} players - ${game.betAmount}💎\n`;
            }
        }

        embed.setDescription(description);
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function sendSystemCommandsPanel() {
    const systemChannel =
        client.channels.cache.get(CHANNELS.system_commands) ||
        client.channels.cache.get(CHANNELS.information);

    if (systemChannel) {
        const embed = new EmbedBuilder()
            .setTitle("🎛️ Complete System Commands Reference")
            .setDescription(
                `**🤖 PCRP Diamond Points Bot - Full Command Database**\n\`\`\`\n` +
                    `     🎛️ SYSTEM PANEL 🎛️\n` +
                    `  ╔══════════════════════════╗\n` +
                    `  ║ 📖 ALL COMMANDS         ║\n` +
                    `  ║ 🎮 UNO AI SYSTEM        ║\n` +
                    `  ║ 💎 DIAMOND ECONOMY      ║\n` +
                    `  ║ 🛡️ ADMIN CONTROLS       ║\n` +
                    `  ╚══════════════════════════╝\n` +
                    `\`\`\`\n\n` +
                    `**🎯 Quick Navigation:**\n` +
                    `📍 **Channels:** <#${CHANNELS.daily_claims}> | <#${CHANNELS.gambling}> | <#${CHANNELS.gift_cards}>\n` +
                    `📍 **Systems:** <#${CHANNELS.point_drops}> | <#${CHANNELS.leaderboard}> | <#${CHANNELS.transfers}>\n\n` +
                    `**📋 Complete Commands List Below:**`,
            )
            .setColor(0x9932cc)
            .setTimestamp();

        // User Commands Section
        embed.addFields(
            {
                name: "💎 **Daily & Points Commands**",
                value:
                    `\`/claim_daily\` - Claim daily diamonds with streak bonus\n` +
                    `\`/get_points [user]\` - Check your or another user's balance\n` +
                    `\`/transfer_points <user> <amount>\` - Send diamonds to others\n` +
                    `📍 **Location:** <#${CHANNELS.daily_claims}> | <#${CHANNELS.transfers}>`,
                inline: false,
            },
            {
                name: "🎲 **Gaming & Casino Commands**",
                value:
                    `\`/gambling_menu\` - Access 3D casino games menu\n` +
                    `• **🎲 Dice Game** - Guess 1-6 (5x multiplier, min 10💎)\n` +
                    `• **🪙 Coinflip** - Pick heads/tails (2x multiplier, min 10💎)\n` +
                    `• **🎰 Slots** - Auto-spin reels (12x max, fixed 30💎)\n` +
                    `📍 **Location:** <#${CHANNELS.gambling}>`,
                inline: false,
            },
            {
                name: "🃏 **UNO Showdown 3D Commands**",
                value:
                    `\`/uno [channel]\` - Start UNO game with diamond betting\n` +
                    `🤖 **AI Features:** 4 difficulty levels (Easy/Medium/Hard/Expert)\n` +
                    `💎 **Betting System:** 10-1000 diamonds per player\n` +
                    `🏆 **Prize Distribution:** 50%/30%/20% for top 3 players\n` +
                    `📍 **Location:** Channel ID 1387168027027574875 only`,
                inline: false,
            },
            {
                name: "🎁 **Gift Card System Commands**",
                value:
                    `\`/generate_gift_card <amount>\` - Create gift cards (500-100k💎)\n` +
                    `\`/check_gift_card <code>\` - Verify gift card status\n` +
                    `\`/redeem_gift_card\` - Legacy PCRP system conversion\n` +
                    `\`/convert_points\` - Same as redeem_gift_card\n` +
                    `📍 **Location:** <#${CHANNELS.gift_cards}> | <#${CHANNELS.gift_card_verification}>`,
                inline: false,
            },
            {
                name: "🏆 **Information & Leaderboard Commands**",
                value:
                    `\`/leaderboard\` - View top 10 diamond holders\n` +
                    `\`/info\` - Show comprehensive bot information\n` +
                    `\`/test_dm\` - Test bot's DM capability for rewards\n` +
                    `📍 **Location:** <#${CHANNELS.leaderboard}> | <#${CHANNELS.information}>`,
                inline: false,
            },
            {
                name: "🎯 **Point Drop System Commands**",
                value:
                    `**User Commands (Restricted Access):**\n` +
                    `• Create Point Drop Tickets (100-10k💎, 1-60min duration)\n` +
                    `• View ticket guidelines and history\n` +
                    `**Admin Commands:**\n` +
                    `\`/approve_point_drop <ticket_id>\` - Approve tickets\n` +
                    `\`/reject_point_drop <ticket_id>\` - Reject tickets\n` +
                    `📍 **Location:** <#${CHANNELS.point_drops}>`,
                inline: false,
            },
        );

        // Admin Commands Section
        embed.addFields(
            {
                name: "🛡️ **Admin Panel Management Commands**",
                value:
                    `\`/send_daily_claim\` - Deploy daily claim panel\n` +
                    `\`/send_gift_card_panel\` - Deploy gift card panel\n` +
                    `\`/send_info_panel\` - Deploy information panel\n` +
                    `\`/send_point_drop_panel\` - Deploy point drop panel\n` +
                    `\`/send_system_panel\` - Deploy this system panel`,
                inline: false,
            },
            {
                name: "🧹 **System Maintenance Commands**",
                value:
                    `\`/cleanup_old_messages\` - Clean all old messages/interactions\n` +
                    `• Removes expired gift cards from database\n` +
                    `• Cleans old point drop tickets (7+ days)\n` +
                    `• Bulk deletes bot messages and user interactions\n` +
                    `• Enhanced cleanup for fresh channel state`,
                inline: false,
            },
        );

        

        await systemChannel.send({ embeds: [embed] });
        console.log("✅ System commands panel sent");
    }
}

// Startup functions
async function sendStartupPanels() {
    console.log("🚀 Bot startup sequence initiated...");
    console.log("🧹 Phase 1: Complete channel cleanup");
    await cleanupOldPanels();

    console.log("📋 Phase 2: Deploying fresh panels");
    await sendDailyClaimPanel();
    await sendGamblingPanel();
    await sendGiftCardPanel();
    await sendLeaderboardPanel();
    await sendInfoPanel();
    await sendAdminGiftCardPanel();
    await sendPointDropTicketPanel();
    await sendSystemCommandsPanel();

    console.log(
        "✅ Bot startup sequence completed - All systems fresh and operational!",
    );
}

async function sendDailyClaimPanel() {
    const dailyClaimChannel = client.channels.cache.get(CHANNELS.daily_claims);
    if (dailyClaimChannel) {
        const embed = new EmbedBuilder()
            .setTitle("💎 Daily Diamond Claims")
            .setDescription(
                `**Welcome to the Diamond Mine!**\n\`\`\`\n    💎 DAILY CLAIMS 💎\n  ╔═══════════════════╗\n  ║  🔥 STREAK BONUS 🔥 ║\n  ║     50 + Bonus     ║\n  ╚═══════════════════╝\n\`\`\`\n**Base Reward:** 50 💎\n**Streak Bonus:** Up to 3x multiplier!\n\nClick the button below to claim your daily diamonds!`,
            )
            .setColor(0xffd700);

        const components = createDailyClaimButtons();
        await dailyClaimChannel.send({
            embeds: [embed],
            components: [components],
        });
        console.log("✅ Daily claim panel sent");
    }
}

async function sendGamblingPanel() {
    const gamblingChannel = client.channels.cache.get(CHANNELS.gambling);
    if (gamblingChannel) {
        const embed = new EmbedBuilder()
            .setTitle("🎰 3D Diamond Casino")
            .setDescription(
                `**Welcome to the Diamond Casino!**\n\`\`\`\n    🎰 CASINO 🎰\n  ╔═══════════════╗\n  ║ 🎲  🪙  🎰 ║\n  ║ Dice Coin Slot ║\n  ╚═══════════════╝\n\`\`\`\n\n**Available Games:**\n🎲 **Dice Game** - Guess the dice (5x win)\n🪙 **Coinflip** - Pick heads/tails (2x win)\n🎰 **Lucky Slots** - Auto-spin reels (up to 12x win)\n\nClick a game button below to start!`,
            )
            .setColor(0x800080);

        const components = createGamblingButtons();
        await gamblingChannel.send({ embeds: [embed], components });
        console.log("✅ Gambling panel sent");
    }
}

async function sendGiftCardPanel() {
    const giftCardChannel = client.channels.cache.get(CHANNELS.gift_cards);
    if (giftCardChannel) {
        const embed = new EmbedBuilder()
            .setTitle("🎁 Gift Card Management Center")
            .setDescription(
                `**Convert Your Diamonds to Gift Cards!**\n\`\`\`\n  🎁 GIFT CARD STORE 🎁\n╔══════════════════════╗\n║ 💎 Generate Cards    ║\n║ 🔍 Check Status      ║\n║ 🎮 PCRP Gift Card    ║\n║      💎 500          ║\n╚══════════════════════╝\n\`\`\`\n\n**Gift Card System:**\n💎 **Generate Gift Card** - Convert 500-100,000 💎\n🔘 **Check Gift Card** - Verify code status\n🎁 **PCRP Gift Card** - 500 💎 (Legacy system)\n\n**Commands Available:**\n• \`/generate_gift_card <amount>\` - Create a gift card\n• \`/check_gift_card <code>\` - Check gift card status\n• \`/test_dm\` - Test if bot can DM you\n• \`/convert_points\` - Legacy gift card system`,
            )
            .setColor(0xffd700);

        const components = createGiftCardPanelButtons();
        await giftCardChannel.send({ embeds: [embed], components });
        console.log("✅ Gift card panel sent");
    }
}

async function sendLeaderboardPanel() {
    const leaderboardChannel = client.channels.cache.get(CHANNELS.leaderboard);
    if (leaderboardChannel) {
        const sortedUsers = Object.entries(pointsSystem.data.users).sort(
            ([, a], [, b]) => b.points - a.points,
        );

        const embed = new EmbedBuilder()
            .setTitle("🏆 Diamond Points Leaderboard")
            .setDescription(
                "**Top Diamond Elites:**\n```\n    🏆 LEADERBOARD 🏆\n  ╔═══════════════════╗\n  ║ 👑 DIAMOND ELITE 👑 ║\n  ╚═══════════════════╝\n```",
            )
            .setColor(0xffd700);

        const medals = ["🥇", "🥈", "🥉"];
        const trophyDesign = ["👑", "💎", "⭐"];

        for (let i = 0; i < Math.min(sortedUsers.length, 10); i++) {
            const [userId, data] = sortedUsers[i];
            let userDisplay;

            try {
                const user = await client.users.fetch(userId);
                userDisplay = `@${user.username}`;
            } catch {
                userDisplay = `User ${userId}`;
            }

            const position = i + 1;
            const positionEmoji =
                position <= 3 ? medals[position - 1] : `${position}.`;
            const decoration =
                position <= 3 ? trophyDesign[position - 1] : "💎";

            embed.addFields({
                name: `${positionEmoji} ${userDisplay}`,
                value: `${decoration} ${data.points.toLocaleString()} Diamonds\n🔥 ${data.streak} day streak`,
                inline: false,
            });
        }

        await leaderboardChannel.send({ embeds: [embed] });
        console.log("✅ Leaderboard panel sent");
    }
}

async function sendInfoPanel() {
    const infoChannel = client.channels.cache.get(CHANNELS.information);
    if (infoChannel) {
        const embed = new EmbedBuilder()
            .setTitle("ℹ️ Diamond Points Bot Information")
            .setDescription(
                `**Welcome to the Diamond Bot!**\n\`\`\`\n    ℹ️ HELP CENTER ℹ️\n  ╔═══════════════════╗\n  ║ 💎 DIAMOND SYSTEM ║\n  ║ 🎮 GAMES & REWARDS ║\n  ╚═══════════════════╝\n\`\`\`\n\n**How to Start:**\n💎 **Daily Claims:** Use \`/claim_daily\` to earn diamonds\n🎲 **Casino Games:** Try your luck with dice, coinflip, and slots\n🎁 **Gift Cards:** Convert diamonds to rewards\n🏆 **Leaderboard:** Compete with other players\n\n**Basic Commands:**\n• \`/claim_daily\` - Get daily diamonds\n• \`/gambling_menu\` - Play casino games\n• \`/leaderboard\` - View rankings\n• \`/get_points\` - Check your balance\n\nClick the buttons below for more command details!`,
            )
            .setColor(0x00bfff);

        const components = createInfoPanelButtons();
        await infoChannel.send({ embeds: [embed], components: [components] });
        console.log("✅ Information panel sent");
    }
}

async function sendAdminGiftCardPanel() {
    const adminChannel = client.channels.cache.get(
        CHANNELS.gift_card_verification,
    );
    if (adminChannel) {
        const embed = new EmbedBuilder()
            .setTitle("🛡️ Admin Gift Card Generation Panel")
            .setDescription(
                `**Admin-Only Gift Card System**\n\`\`\`\n  🛡️ ADMIN PANEL 🛡️\n╔══════════════════════╗\n║ 💎 Generate Cards    ║\n║ 🔒 Admin Access Only ║\n║ 📧 DM Delivery       ║\n╚══════════════════════╝\n\`\`\`\n\n**Features:**\n💎 **Generate Gift Cards** - Create cards with custom amounts\n📧 **Auto DM Delivery** - Codes sent directly to your DMs\n🔒 **Admin Only Access** - Restricted to authorized users\n⏰ **7-Day Validity** - All cards expire after 7 days\n\n**Usage:**\n1. Click the "Generate Gift Card" button below\n2. Enter diamond amount (500-100,000)\n3. Card will be generated and sent to your DMs\n4. Share the code or use it yourself\n\n**Access Requirements:**\n• Admin role: <@&${ADMIN_ROLE_ID}>\n\nOnly authorized admins can use this panel!`,
            )
            .setColor(0xff0000);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("admin_generate_gift_card")
                .setLabel("🛡️ Generate Gift Card (Admin)")
                .setStyle(ButtonStyle.Danger)
                .setEmoji("💎"),
        );

        await adminChannel.send({ embeds: [embed], components: [row] });
        console.log("✅ Admin gift card panel sent");
    }
}

async function cleanupOldPanels() {
    // Function to cleanup ALL bot messages AND user interaction messages from ALL channels for fresh start
    console.log("🧹 Starting comprehensive channel cleanup...");

    // Clean up expired gift cards and user data first
    console.log("🧹 Cleaning up expired gift cards and old data...");
    pointsSystem.cleanupExpiredGiftCards();

    // Clean up old user-generated gift cards (older than 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    let cleanedCards = 0;

    for (const [code, card] of Object.entries(
        pointsSystem.data.generated_gift_cards,
    )) {
        const cardDate = new Date(card.created_at);
        if (
            cardDate < oneDayAgo &&
            (card.status === "void" || card.status === "claimed")
        ) {
            delete pointsSystem.data.generated_gift_cards[code];
            cleanedCards++;
        }
    }

    if (cleanedCards > 0) {
        console.log(
            `🧹 Cleaned up ${cleanedCards} old gift cards from database`,
        );
        await pointsSystem.saveData();
    }

    // Clean up old point drop tickets (older than 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    let cleanedTickets = 0;

    for (const [ticketId, ticket] of Object.entries(pointDropTickets)) {
        const ticketDate = new Date(ticket.createdAt);
        if (ticketDate < sevenDaysAgo) {
            delete pointDropTickets[ticketId];
            cleanedTickets++;
        }
    }

    if (cleanedTickets > 0) {
        console.log(`🧹 Cleaned up ${cleanedTickets} old point drop tickets`);
    }

    await performEnhancedChannelCleanup();
}

async function performEnhancedChannelCleanup() {
    const channels = [
        CHANNELS.daily_claims,
        CHANNELS.gambling,
        CHANNELS.gift_cards,
        CHANNELS.leaderboard,
        CHANNELS.information,
        CHANNELS.gift_card_verification,
        CHANNELS.point_drops,
        CHANNELS.system_commands,
    ];

    for (const channelId of channels) {
        const channel = client.channels.cache.get(channelId);
        if (channel) {
            try {
                console.log(
                    `🧹 Deep cleaning channel: ${channel.name || channelId}`,
                );

                let totalCleanedMessages = 0;
                let lastMessageId = null;

                // Enhanced cleanup - fetch ALL messages, not just recent ones
                while (true) {
                    const fetchOptions = { limit: 100 };
                    if (lastMessageId) {
                        fetchOptions.before = lastMessageId;
                    }

                    const fetched = await channel.messages.fetch(fetchOptions);

                    if (fetched.size === 0) break;

                    // Filter messages to delete: bot messages + user interaction responses + old casino results
                    const messagesToDelete = fetched.filter((msg) => {
                        const messageAge = Date.now() - msg.createdTimestamp;
                        const isOld = messageAge > 14 * 24 * 60 * 60 * 1000; // Older than 14 days

                        // Always delete bot messages
                        if (msg.author.id === client.user.id) {
                            return true;
                        }

                        // Delete user messages that contain bot interaction patterns
                        if (msg.author.bot === false) {
                            const content = msg.content.toLowerCase();
                            const hasEmbeds = msg.embeds.length > 0;
                            const hasComponents = msg.components.length > 0;

                            // Check for bot interaction indicators
                            const botPatterns = [
                                "💎",
                                "diamonds",
                                "claimed",
                                "gift card",
                                "casino",
                                "mining",
                                "leaderboard",
                                "streak",
                                "coinflip",
                                "dice",
                                "slots",
                                "won",
                                "lost",
                                "jackpot",
                                "balance",
                                "points",
                                "🎲",
                                "🪙",
                                "🎰",
                                "🎁",
                                "🏆",
                                "⛏️",
                                "🔥",
                            ];

                            const hasBotPattern = botPatterns.some((pattern) =>
                                content.includes(pattern),
                            );

                            // Delete if has bot patterns, embeds, components, or is old user interaction
                            if (
                                hasBotPattern ||
                                hasEmbeds ||
                                hasComponents ||
                                isOld
                            ) {
                                return true;
                            }
                        }

                        return false;
                    });

                    if (messagesToDelete.size > 0) {
                        // Group messages by age for bulk delete (Discord only allows bulk delete for messages < 14 days)
                        const recentMessages = [];
                        const oldMessages = [];

                        messagesToDelete.forEach((msg) => {
                            const messageAge =
                                Date.now() - msg.createdTimestamp;
                            if (messageAge < 14 * 24 * 60 * 60 * 1000) {
                                recentMessages.push(msg);
                            } else {
                                oldMessages.push(msg);
                            }
                        });

                        // Bulk delete recent messages
                        if (recentMessages.length > 1) {
                            // Split into chunks of 100 for bulk delete
                            for (
                                let i = 0;
                                i < recentMessages.length;
                                i += 100
                            ) {
                                const chunk = recentMessages.slice(i, i + 100);
                                if (chunk.length > 1) {
                                    await channel.bulkDelete(chunk);
                                } else if (chunk.length === 1) {
                                    await chunk[0].delete().catch(() => {});
                                }
                                await new Promise((resolve) =>
                                    setTimeout(resolve, 1000),
                                ); // Rate limit protection
                            }
                        } else if (recentMessages.length === 1) {
                            await recentMessages[0].delete().catch(() => {});
                        }

                        // Individual delete for old messages
                        for (const msg of oldMessages) {
                            try {
                                await msg.delete();
                                await new Promise((resolve) =>
                                    setTimeout(resolve, 500),
                                ); // Rate limit protection
                            } catch (error) {
                                // Ignore delete errors for old messages
                            }
                        }

                        totalCleanedMessages += messagesToDelete.size;
                    }

                    // Set lastMessageId for next iteration
                    lastMessageId = fetched.last()?.id;

                    // Break if we didn't fetch a full batch
                    if (fetched.size < 100) break;

                    // Small delay to avoid rate limits
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                }

                if (totalCleanedMessages > 0) {
                    console.log(
                        `✅ Deep cleaned ${totalCleanedMessages} messages (including old interactions) from ${channel.name || channelId}`,
                    );
                } else {
                    console.log(
                        `✅ Channel ${channel.name || channelId} was already clean`,
                    );
                }
            } catch (error) {
                console.log(
                    `❌ Could not cleanup channel ${channelId}:`,
                    error.message,
                );
            }
        }
    }

    console.log(
        "✅ Enhanced channel cleanup completed - All old interactions removed!",
    );
}

// With this (hardcoded, as requested):
client.login(
    "MTM4NjM2MzcyNjM0MDQyMzgyMQ.G6lMP7.yLjBqvpgH8zyLuT9XJTzZ5PHq8_asZM1mNGyO4",
);
//
// Recommended secure approach (using environment variable):
// client.login(process.env.DISCORD_TOKEN);

///
