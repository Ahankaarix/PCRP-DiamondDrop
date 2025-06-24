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
    } catch (error) {
        console.error("Error handling button interaction:", error);
    }
}

async function handleSelectMenuInteraction(interaction) {
    if (interaction.customId === "gift_card_select") {
        await handleGiftCardSelection(interaction);
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

    // Auto-delete the result message after 3 minutes
    setTimeout(
        async () => {
            try {
                await reply.delete();
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

    // Auto-delete the result message after 3 minutes
    setTimeout(
        async () => {
            try {
                await reply.delete();
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

    // Auto-delete the result message after 3 minutes
    setTimeout(
        async () => {
            try {
                await reply.delete();
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

    // Point drop functionality - admin only
    const embed = new EmbedBuilder()
        .setTitle("🎯 Point Drop Coming Soon!")
        .setDescription(
            "Point drop system will be implemented in a future update.",
        )
        .setColor(0x0099ff);
    await interaction.reply({ embeds: [embed], ephemeral: true });
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

// Startup functions
async function sendStartupPanels() {
    await cleanupOldPanels();
    await sendDailyClaimPanel();
    await sendGamblingPanel();
    await sendGiftCardPanel();
    await sendLeaderboardPanel();
    await sendInfoPanel();
    await sendAdminGiftCardPanel();
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
            .setTitle("ℹ️ Diamond Points Bot Information Center")
            .setDescription(
                `**Welcome to the Complete Bot Guide!**\n\`\`\`\n    ℹ️ HELP CENTER ℹ️\n  ╔═══════════════════╗\n  ║ 📖 USER COMMANDS  ║\n  ║ 🛡️ ADMIN COMMANDS ║\n  ║ 💎 BOT FEATURES   ║\n  ╚═══════════════════╝\n\`\`\`\n\n**Quick Start Guide:**\n💎 **New Users:** Start with \`/claim_daily\` in <#${CHANNELS.daily_claims}>\n🎲 **Gaming:** Visit <#${CHANNELS.gambling}> for casino games\n🎁 **Rewards:** Use <#${CHANNELS.gift_cards}> to redeem prizes\n🏆 **Rankings:** Check <#${CHANNELS.leaderboard}> for top players\n\n**Bot Economy:**\n• Base Daily Reward: 50 💎\n• Streak Multiplier: Up to 3x\n• Gift Card Range: 500-100,000 💎\n• Conversion Rate: 100 💎 = 1 Rupee\n\n**Commands Available:**\n• \`/info\` - Show this panel\n• Use buttons below for detailed command lists\n\nClick a button below to view command details!`,
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
                `**Admin-Only Gift Card System**\n\`\`\`\n  🛡️ ADMIN PANEL 🛡️\n╔══════════════════════╗\n║ 💎 Generate Cards    ║\n║ 🔒 Admin Access Only ║\n║ 📧 DM Delivery       ║\n╚══════════════════════╝\n\`\`\`\n\n**Features:**\n💎 **Generate Gift Cards** - Create cards with custom amounts\n📧 **Auto DM Delivery** - Codes sent directly to your DMs\n🔒 **Admin Only Access** - Restricted to authorized users\n⏰ **7-Day Validity** - All cards expire after 7 days\n\n**Usage:**\n1. Click the "Generate Gift Card" button below\n2. Enter diamond amount (500-100,000)\n3. Card will be generated and sent to your DMs\n4. Share the code or use it yourself\n\n**Access Requirements:**\n• Admin role: <@&${ADMIN_ROLE_ID}>\n• Authorized user IDs: ${ADMIN_USER_IDS.join(", ")}\n\nOnly authorized admins can use this panel!`,
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
    // Function to cleanup old bot messages to prevent duplicates
    const channels = [
        CHANNELS.daily_claims,
        CHANNELS.gambling,
        CHANNELS.gift_cards,
        CHANNELS.leaderboard,
        CHANNELS.information,
        CHANNELS.gift_card_verification,
    ];

    for (const channelId of channels) {
        const channel = client.channels.cache.get(channelId);
        if (channel) {
            try {
                const messages = await channel.messages.fetch({ limit: 10 });
                const botMessages = messages.filter(
                    (msg) => msg.author.id === client.user.id,
                );
                if (botMessages.size > 0) {
                    await channel.bulkDelete(botMessages);
                }
            } catch (error) {
                console.log(
                    `Could not cleanup channel ${channelId}:`,
                    error.message,
                );
            }
        }
    }
}

// With this (hardcoded, as requested):
client.login(
    "MTM4NjM2MzcyNjM0MDQyMzgyMQ.GLpFX4.OyDGG2BqgF93XlF6mkk7iFKA9D4zlPy8_I30sg",
);

// Recommended secure approach (using environment variable):
client.login(process.env.DISCORD_TOKEN);

///
