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
        GatewayIntentBits.GuildPresences, // Added for real-time presence monitoring
        GatewayIntentBits.GuildMembers, // Added for member status checking
    ],
});

// Data file path
const DATA_FILE = "bot_data.json";

// Channel configuration - Update these with your channel IDs
const CHANNELS = {
    daily_claims: "",
    point_drops: "",
    leaderboard: "",
    transfers: "",
    gambling: "",
    gift_cards: "", // Gift Card Redemption Center
    gift_card_verification: "", // Gift Card Verification Panel
    information: "", // Information Panel
    admin_reports: "", // Admin Reports Channel - AUTO DEEP CLEAN ON RESTART
    general: "", // Can be set to allow leaderboard from general channel
    tickets: "", // Ticket System Channel
    ticket_logs: "", // Ticket Logs Channel
    ticket_category: "", // Support Tickets category
};

// Admin role configuration - Only valid role IDs
const ADMIN_ROLE_IDS = [
    "", // Original admin role
];
// Admin user IDs with direct access
const ADMIN_USER_IDS = [
    "", // Admin user 1
    "", // Admin user 2
    "", // Admin user 3
];

// Function to check if user has admin role
function hasAdminRole(interaction) {
    if (!interaction.member) return false;

    // Check if user is in admin user IDs list first
    if (ADMIN_USER_IDS.includes(interaction.user.id)) {
        return true;
    }

    // Check if user has any of the admin roles
    for (const roleId of ADMIN_ROLE_IDS) {
        if (roleId && roleId !== "ROLE ID" && interaction.member.roles.cache.has(roleId)) {
            return true;
        }
    }

    return false;
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

// Ticket system configuration
const TICKET_TYPES = {
    report_user: {
        name: "Report a user",
        emoji: "💬",
        color: 0xff4757,
        category: "Moderation",
    },
    ban_appeal: {
        name: "Ban Appeal",
        emoji: "👁️",
        color: 0x5352ed,
        category: "Appeals",
    },
    questions: {
        name: "Questions!",
        emoji: "❓",
        color: 0x2ed573,
        category: "General Support",
    },
    billing_support: {
        name: "Billing Support",
        emoji: "💳",
        color: 0xffa502,
        category: "Billing",
    },
    account_issues: {
        name: "Account Issues",
        emoji: "📧",
        color: 0x3742fa,
        category: "Account",
    },
    general_support: {
        name: "General Support",
        emoji: "🛠️",
        color: 0x747d8c,
        category: "General",
    },
};

// Store active tickets in persistent storage
let activeTickets = new Map();
let ticketCounter = 1;

// Load ticket data from persistent storage
function loadTicketData() {
    if (pointsSystem.data.tickets) {
        activeTickets = new Map(
            Object.entries(pointsSystem.data.tickets.active || {}),
        );
        ticketCounter = pointsSystem.data.tickets.counter || 1;
    } else {
        pointsSystem.data.tickets = {
            active: {},
            counter: 1,
            history: [],
        };
    }
}

// Save ticket data to persistent storage
async function saveTicketData() {
    if (!pointsSystem.data.tickets) {
        pointsSystem.data.tickets = {
            active: {},
            counter: ticketCounter,
            history: [],
        };
    }

    pointsSystem.data.tickets.active = Object.fromEntries(activeTickets);
    pointsSystem.data.tickets.counter = ticketCounter;
    await pointsSystem.saveData();
}

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
            admin_sessions: {}, // Store admin login sessions
            admin_tracking: {}, // Store admin tracking data
            tickets: {
                active: {},
                counter: 1,
                history: [],
            },
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

    getAdminData(userId) {
        const userIdStr = userId.toString();
        if (!this.data.admin_tracking[userIdStr]) {
            this.data.admin_tracking[userIdStr] = {
                totalHours: 0,
                sessions: [],
                currentSession: null,
                lastActivity: null,
            };
        }
        return this.data.admin_tracking[userIdStr];
    }

    startAdminSession(userId) {
        const adminData = this.getAdminData(userId);
        const now = new Date();

        // End any existing session first
        if (adminData.currentSession) {
            this.endAdminSession(userId);
        }

        adminData.currentSession = {
            loginTime: now.toISOString(),
            logoutTime: null,
            duration: 0,
            isActive: true,
        };
        adminData.lastActivity = now.toISOString();
    }

    endAdminSession(userId) {
        const adminData = this.getAdminData(userId);
        if (!adminData.currentSession) return null;

        const now = new Date();
        const loginTime = new Date(adminData.currentSession.loginTime);
        const duration = Math.floor((now - loginTime) / 1000 / 60); // Duration in minutes

        adminData.currentSession.logoutTime = now.toISOString();
        adminData.currentSession.duration = duration;
        adminData.currentSession.isActive = false;

        // Add to sessions history
        adminData.sessions.push({ ...adminData.currentSession });
        adminData.totalHours += duration / 60; // Convert to hours

        const sessionData = adminData.currentSession;
        adminData.currentSession = null;

        // Clean old sessions (older than 30 days)
        const thirtyDaysAgo = new Date(
            now.getTime() - 30 * 24 * 60 * 60 * 1000,
        );
        adminData.sessions = adminData.sessions.filter(
            (session) => new Date(session.loginTime) > thirtyDaysAgo,
        );

        return sessionData;
    }

    cleanupOldAdminData() {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        for (const [userId, data] of Object.entries(this.data.admin_tracking)) {
            // Clean old sessions
            data.sessions = data.sessions.filter(
                (session) => new Date(session.loginTime) > thirtyDaysAgo,
            );

            // Recalculate total hours from remaining sessions
            data.totalHours = data.sessions.reduce(
                (total, session) => total + session.duration / 60,
                0,
            );
        }
    }
}

const pointsSystem = new PointsBot();

// Auto-save every 5 minutes and cleanup expired gift cards
setInterval(
    async () => {
        pointsSystem.cleanupExpiredGiftCards();
        pointsSystem.cleanupOldAdminData();
        await pointsSystem.saveData();
    },
    5 * 60 * 1000,
);

// Enhanced admin status monitoring every minute
setInterval(async () => {
    try {
        for (const [userId, data] of Object.entries(
            pointsSystem.data.admin_tracking,
        )) {
            if (data.currentSession && data.currentSession.isActive) {
                try {
                    const user = await client.users.fetch(userId);
                    const guild = client.guilds.cache.first();
                    const member = guild?.members.cache.get(userId);

                    let isUserOffline = false;
                    let offlineReason = "";

                    // Enhanced offline detection
                    if (!member) {
                        isUserOffline = true;
                        offlineReason = "User not found in server";
                    } else if (!member.presence) {
                        isUserOffline = true;
                        offlineReason =
                            "No presence data (Discord likely closed)";
                    } else if (member.presence.status === "offline") {
                        isUserOffline = true;
                        offlineReason = "User status: offline";
                    } else if (member.presence.status === "invisible") {
                        // For invisible users, check if they've been inactive for longer
                        const lastActivity = new Date(data.lastActivity);
                        const now = new Date();
                        const timeSinceActivity =
                            (now - lastActivity) / 1000 / 60; // minutes

                        if (timeSinceActivity > 3) {
                            // Shorter timeout for invisible users
                            isUserOffline = true;
                            offlineReason =
                                "User invisible and inactive for >3 minutes";
                        }
                    }

                    if (isUserOffline) {
                        const lastActivity = new Date(data.lastActivity);
                        const now = new Date();
                        const timeSinceActivity =
                            (now - lastActivity) / 1000 / 60; // minutes

                        // Auto-logout if offline for more than 2 minutes (reduced from 5)
                        if (timeSinceActivity > 2) {
                            console.log(
                                `🔄 Auto-logout admin ${user?.username || userId}: ${offlineReason}`,
                            );

                            const sessionData =
                                pointsSystem.endAdminSession(userId);
                            await pointsSystem.saveData();

                            // Send auto-logout notification to admin reports channel
                            try {
                                const adminChannel = client.channels.cache.get(
                                    CHANNELS.admin_reports,
                                );
                                if (adminChannel && sessionData) {
                                    const hours = Math.floor(
                                        sessionData.duration / 60,
                                    );
                                    const minutes = sessionData.duration % 60;
                                    const timeString =
                                        hours > 0
                                            ? `${hours}h ${minutes}m`
                                            : `${minutes}m`;

                                    const embed = new EmbedBuilder()
                                        .setTitle("🔴 Automatic Admin Logout")
                                        .setDescription(
                                            `**${user.displayName}** was automatically logged out\n\n🔐 **Reason:** ${offlineReason}\n⏱️ **Session Duration:** ${timeString}\n🔓 **Auto-Logout:** <t:${Math.floor(Date.now() / 1000)}:F>\n\n⚙️ **System:** Session ended due to offline detection`,
                                        )
                                        .setColor(0xff6600)
                                        .setTimestamp();

                                    await adminChannel.send({
                                        embeds: [embed],
                                    });
                                }
                            } catch (notifyError) {
                                console.log(
                                    "Could not send auto-logout notification:",
                                    notifyError.message,
                                );
                            }

                            // Try to notify the user via DM if possible
                            try {
                                if (sessionData) {
                                    const hours = Math.floor(
                                        sessionData.duration / 60,
                                    );
                                    const minutes = sessionData.duration % 60;
                                    const timeString =
                                        hours > 0
                                            ? `${hours}h ${minutes}m`
                                            : `${minutes}m`;

                                    const userEmbed = new EmbedBuilder()
                                        .setTitle("🔴 Auto-Logout Notification")
                                        .setDescription(
                                            `Your admin session was automatically ended.\n\n**Reason:** ${offlineReason}\n**Session Duration:** ${timeString}\n**Ended:** <t:${Math.floor(Date.now() / 1000)}:F>\n\n💡 **Tip:** Use the Login button when you return to start a new session.`,
                                        )
                                        .setColor(0xff6600)
                                        .setTimestamp();

                                    await user.send({ embeds: [userEmbed] });
                                }
                            } catch (dmError) {
                                console.log(
                                    "Could not send auto-logout DM:",
                                    dmError.message,
                                );
                            }
                        }
                    } else {
                        // Update last activity for online users
                        data.lastActivity = new Date().toISOString();
                    }
                } catch (error) {
                    console.log(
                        `Error monitoring admin ${userId}:`,
                        error.message,
                    );
                }
            }
        }
    } catch (error) {
        console.error("Error in admin monitoring:", error);
    }
}, 60 * 1000); // Every minute

// Auto-cleanup old messages every 6 hours + Monthly admin reports + AUTOMATIC ADMIN CHANNEL DEEP CLEAN
setInterval(
    async () => {
        console.log("🧹 6-hour auto-cleanup starting...");
        try {
            // AUTOMATIC DEEP CLEANING of admin reports channel every 6 hours
            console.log(
                "🧹 Performing automatic deep cleaning of admin reports channel...",
            );
            await performCompleteAdminChannelCleanup();

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

            // Check if it's the 1st day of the month and generate admin report
            const now = new Date();
            if (now.getDate() === 1 && now.getHours() === 0) {
                console.log("📊 Generating monthly admin report...");
                await generateMonthlyAdminReport();
            }
        } catch (error) {
            console.error("Error during auto-cleanup:", error);
        }
    },
    6 * 60 * 60 * 1000, // Every 6 hours
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

    // Load ticket data and restore connections
    loadTicketData();
    await restoreTicketConnections();

    // Send bot online notification with auto-delete
    try {
        const adminChannel = client.channels.cache.get(CHANNELS.admin_reports);
        if (adminChannel) {
            const embed = new EmbedBuilder()
                .setTitle("🟢 Bot Status Update")
                .setDescription(
                    `**${client.user.tag} is now ONLINE!**\n\n🔄 **System Status:**\n✅ Connected to Discord\n✅ All systems operational\n✅ Admin tracking active\n✅ Auto-cleanup enabled\n✅ Enhanced message cleanup active\n✅ Ticket system restored\n\n⏰ **Startup Time:** <t:${Math.floor(Date.now() / 1000)}:F>\n\n🧹 **Auto-Cleanup:** This message will auto-delete in 2 minutes`,
                )
                .setColor(0x00ff00)
                .setTimestamp();

            const message = await adminChannel.send({ embeds: [embed] });
            console.log("📧 Bot online notification sent to admin channel");

            // Auto-delete the bot online notification after 2 minutes
            setTimeout(
                async () => {
                    try {
                        await message.delete();
                        console.log(
                            "🧹 Auto-deleted bot online notification message",
                        );
                    } catch (error) {
                        console.log(
                            "Could not auto-delete online notification:",
                            error.message,
                        );
                    }
                },
                2 * 60 * 1000,
            ); // 2 minutes
        }
    } catch (error) {
        console.error("Failed to send online notification:", error);
    }

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
            .setName("send_admin_tracking_panel")
            .setDescription("Admin: Send the admin login tracking panel")
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

        new SlashCommandBuilder()
            .setName("admin_report")
            .setDescription("Admin: Generate manual admin activity report")
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

        new SlashCommandBuilder()
            .setName("clean_full_channel")
            .setDescription(
                "Admin: Complete cleanup of specific channel (all messages)",
            )
            .addStringOption((option) =>
                option
                    .setName("channel_id")
                    .setDescription("Channel ID to completely clean")
                    .setRequired(true),
            )
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

        new SlashCommandBuilder()
            .setName("send_ticket_panel")
            .setDescription("Admin: Send the ticket support panel")
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

        new SlashCommandBuilder()
            .setName("close_ticket")
            .setDescription(
                "Close the current ticket (only works in ticket channels)",
            ),

        new SlashCommandBuilder()
            .setName("ticket_info")
            .setDescription("Get information about the current ticket"),
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
// Real-time presence update monitoring for logged-in admins
client.on("presenceUpdate", async (oldPresence, newPresence) => {
    try {
        if (!newPresence || !newPresence.user) return;

        const userId = newPresence.user.id;
        const adminData = pointsSystem.data.admin_tracking[userId];

        // Check if this user has an active admin session
        if (
            adminData &&
            adminData.currentSession &&
            adminData.currentSession.isActive
        ) {
            const oldStatus = oldPresence?.status || "unknown";
            const newStatus = newPresence.status;

            // If user goes offline, start auto-logout timer
            if (newStatus === "offline" || !newStatus) {
                console.log(
                    `🔄 Admin ${newPresence.user.username} went offline - starting auto-logout timer`,
                );

                // Set a shorter auto-logout timer for immediate offline detection
                setTimeout(async () => {
                    // Double-check if user is still offline and session is still active
                    const currentData =
                        pointsSystem.data.admin_tracking[userId];
                    if (
                        currentData &&
                        currentData.currentSession &&
                        currentData.currentSession.isActive
                    ) {
                        const member =
                            newPresence.guild?.members.cache.get(userId);
                        if (
                            !member ||
                            !member.presence ||
                            member.presence.status === "offline"
                        ) {
                            console.log(
                                `🔄 Auto-logout admin ${newPresence.user.username} due to offline status (real-time detection)`,
                            );

                            const sessionData =
                                pointsSystem.endAdminSession(userId);
                            await pointsSystem.saveData();

                            // Send notification
                            try {
                                const adminChannel = client.channels.cache.get(
                                    CHANNELS.admin_reports,
                                );
                                if (adminChannel && sessionData) {
                                    const hours = Math.floor(
                                        sessionData.duration / 60,
                                    );
                                    const minutes = sessionData.duration % 60;
                                    const timeString =
                                        hours > 0
                                            ? `${hours}h ${minutes}m`
                                            : `${minutes}m`;

                                    const embed = new EmbedBuilder()
                                        .setTitle("🔴 Real-Time Auto-Logout")
                                        .setDescription(
                                            `**${newPresence.user.displayName}** was automatically logged out\n\n🔐 **Reason:** Discord status changed to offline\n⏱️ **Session Duration:** ${timeString}\n🔓 **Auto-Logout:** <t:${Math.floor(Date.now() / 1000)}:F>\n\n⚡ **System:** Real-time presence detection`,
                                        )
                                        .setColor(0xff0000)
                                        .setTimestamp();

                                    await adminChannel.send({
                                        embeds: [embed],
                                    });
                                }
                            } catch (error) {
                                console.log(
                                    "Could not send real-time logout notification:",
                                    error.message,
                                );
                            }
                        }
                    }
                }, 30 * 1000); // 30 second delay to avoid false positives
            } else if (
                (oldStatus === "offline" || !oldStatus) &&
                (newStatus === "online" ||
                    newStatus === "idle" ||
                    newStatus === "dnd")
            ) {
                // User came back online - update activity
                adminData.lastActivity = new Date().toISOString();
                console.log(
                    `🟢 Admin ${newPresence.user.username} came back online`,
                );
            }
        }
    } catch (error) {
        console.error("Error in presence update monitoring:", error);
    }
});

client.on("interactionCreate", async (interaction) => {
    try {
        if (interaction.isCommand()) {
            await handleSlashCommand(interaction);
        } else if (interaction.isButton()) {
            await handleButtonInteraction(interaction);
        } else if (interaction.isStringSelectMenu()) {
            await handleSelectMenuInteraction(interaction);
        } else if (interaction.isModalSubmit()) {
            await handleModalSubmit(interaction);
        }
    } catch (error) {
        console.error("🚨 Interaction error occurred:", error);

        // Auto-cleanup gift card support ticket interactions on error
        try {
            await cleanupGiftCardSupportTicketInteractions();
            console.log(
                "🧹 Gift card support ticket cleanup completed after error",
            );
        } catch (cleanupError) {
            console.error("❌ Error during emergency cleanup:", cleanupError);
        }

        // Try to respond to the user if possible
        try {
            const errorEmbed = new EmbedBuilder()
                .setTitle("❌ System Error")
                .setDescription(
                    "An error occurred. The system has been automatically cleaned up.",
                )
                .setColor(0xff0000);

            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({
                    embeds: [errorEmbed],
                    ephemeral: true,
                });
            }
        } catch (responseError) {
            console.error("Could not send error response:", responseError);
        }
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
            case "send_admin_tracking_panel":
                await handleSendAdminTrackingPanel(interaction);
                break;
            case "admin_report":
                await handleAdminReport(interaction);
                break;
            case "clean_full_channel":
                await handleCleanFullChannel(interaction);
                break;
            case "send_ticket_panel":
                await handleSendTicketPanel(interaction);
                break;
            case "close_ticket":
                await handleCloseTicketCommand(interaction);
                break;
            case "ticket_info":
                await handleTicketInfo(interaction);
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
            case "admin_login":
                await handleAdminLogin(interaction);
                break;
            case "admin_logout":
                await handleAdminLogout(interaction);
                break;
            case "admin_status":
                await handleAdminStatus(interaction);
                break;
            case "open_ticket":
                await showTicketSelectMenu(interaction);
                break;
        }

        // Handle ticket types
        if (customId.endsWith("_ticket")) {
            const ticketType = customId.replace("_ticket", "");
            if (TICKET_TYPES[ticketType]) {
                await handleTicketCreation(interaction, ticketType);
            }
        }

        // Handle ticket management
        if (customId.startsWith("close_ticket_")) {
            const ticketId = customId.replace("close_ticket_", "");
            await handleCloseTicket(interaction, ticketId);
        } else if (customId.startsWith("admin_close_ticket_")) {
            const ticketId = customId.replace("admin_close_ticket_", "");
            if (hasAdminRole(interaction)) {
                await handleCloseTicket(interaction, ticketId);
            } else {
                await interaction.reply({
                    content: "❌ Only staff can use this button!",
                    ephemeral: true,
                });
            }
        } else if (customId.startsWith("ticket_info_")) {
            const ticketId = customId.replace("ticket_info_", "");
            await handleTicketInfoButton(interaction, ticketId);
        } else if (customId.startsWith("admin_respond_ticket_")) {
            const ticketId = customId.replace("admin_respond_ticket_", "");
            if (hasAdminRole(interaction)) {
                await handleAdminRespondButton(interaction, ticketId);
            } else {
                await interaction.reply({
                    content: "❌ Only staff can use this button!",
                    ephemeral: true,
                });
            }
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
    } catch (error) {
        console.error("Error handling button interaction:", error);
    }
}

async function handleSelectMenuInteraction(interaction) {
    if (interaction.customId === "gift_card_select") {
        await handleGiftCardSelection(interaction);
    } else if (interaction.customId === "ticket_type_select") {
        await handleTicketTypeSelection(interaction);
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
        } else if (customId.startsWith("admin_response_")) {
            const ticketId = customId.replace("admin_response_", "");
            await handleAdminResponseSubmit(interaction, ticketId);
        }
    } catch (error) {
        console.error("Error handling modal submit:", error);
    }
}

async function handleAdminResponseSubmit(interaction, ticketId) {
    try {
        const ticket = activeTickets.get(ticketId);
        if (!ticket) {
            return await interaction.reply({
                content: "❌ Ticket not found!",
                ephemeral: true,
            });
        }

        const responseMessage =
            interaction.fields.getTextInputValue("response_message");
        const user = await client.users.fetch(ticket.userId);

        // Send response to user
        const responseEmbed = new EmbedBuilder()
            .setTitle("💬 Staff Response")
            .setDescription(
                `**Ticket ID:** \`${ticketId}\`\n**Staff Member:** ${interaction.user.tag}\n\n**Response:**\n${responseMessage}`,
            )
            .setColor(0x0099ff)
            .setThumbnail(interaction.user.displayAvatarURL())
            .setTimestamp();

        const continueButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`close_ticket_${ticketId}`)
                .setLabel("🔒 Close Ticket")
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`ticket_info_${ticketId}`)
                .setLabel("ℹ️ Ticket Info")
                .setStyle(ButtonStyle.Secondary),
        );

        await user.send({
            embeds: [responseEmbed],
            components: [continueButton],
        });

        // Store admin response in ticket
        if (!ticket.adminResponses) ticket.adminResponses = [];
        ticket.adminResponses.push({
            staffId: interaction.user.id,
            staffTag: interaction.user.tag,
            message: responseMessage,
            timestamp: new Date().toISOString(),
        });

        await saveTicketData();

        // Confirm to admin
        const confirmEmbed = new EmbedBuilder()
            .setTitle("✅ Response Sent")
            .setDescription(
                `**Ticket ID:** \`${ticketId}\`\n**User:** ${user.tag}\n\n**Your response has been sent to the user.**`,
            )
            .setColor(0x00ff00);

        await interaction.reply({ embeds: [confirmEmbed], ephemeral: true });

        // Log the response
        await logTicketAction(
            ticketId,
            "staff_response",
            interaction.user,
            `Staff response sent`,
        );
    } catch (error) {
        console.error("Error handling admin response:", error);
        await interaction.reply({
            content: "❌ An error occurred while sending your response.",
            ephemeral: true,
        });
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

    // Generate unique gift card code
    let giftCardCode;
    do {
        giftCardCode = pointsSystem.generateGiftCardCode();
    } while (pointsSystem.data.generated_gift_cards[giftCardCode]);

    // Deduct diamonds
    userData.points -= card.cost;
    userData.total_spent += card.cost;
    userData.gift_cards_redeemed = userData.gift_cards_redeemed || [];
    userData.gift_cards_redeemed.push(cardType);

    // Create gift card
    const giftCard = {
        value: card.cost,
        status: "valid",
        created_at: new Date().toISOString(),
        created_by: interaction.user.id,
        claimed_by: null,
        claimed_at: null,
        void_reason: null,
        admin_generated: false,
        card_type: cardType,
    };

    pointsSystem.data.generated_gift_cards[giftCardCode] = giftCard;

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + GIFT_CARD_SETTINGS.validity_days);

    // Send DM with gift card code immediately
    try {
        const dmEmbed = new EmbedBuilder()
            .setTitle(`🎁 ${card.name} Generated!`)
            .setDescription(
                `**🎉 Congratulations!** Your ${card.name} has been created successfully!\n\n**Gift Card Code:** \`${giftCardCode}\`\n**Type:** ${card.name}\n**Value:** ${card.cost} 💎\n**Created:** <t:${Math.floor(Date.now() / 1000)}:F>\n**Expires:** <t:${Math.floor(expiryDate.getTime() / 1000)}:F>\n\n🔒 **Keep this code secure!** You can:\n• Use it for PCRP rewards\n• Check its status with \`/check_gift_card\`\n\n✅ **Valid for 7 days from creation**`,
            )
            .setColor(0x00ff00)
            .setTimestamp();

        await interaction.user.send({ embeds: [dmEmbed] });

        // Success response
        const successEmbed = new EmbedBuilder()
            .setTitle("🎁 Gift Card Purchase Successful!")
            .setDescription(
                `**${card.name}** purchased for ${card.cost} 💎\n\n📧 **Delivery:** Code sent to your DMs\n⏰ **Expires:** <t:${Math.floor(expiryDate.getTime() / 1000)}:F>\n\n✅ **Transaction Complete!**`,
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
                {
                    name: "📧 DM Status",
                    value: "✅ Code sent successfully!",
                    inline: true,
                },
            )
            .setColor(0x00ff00);

        const reply = await interaction.update({
            embeds: [successEmbed],
            components: [],
        });

        // Auto-delete after 5 minutes
        setTimeout(
            async () => {
                try {
                    await reply.delete();
                } catch (error) {
                    console.log(
                        "Could not delete gift card success message:",
                        error.message,
                    );
                }
            },
            5 * 60 * 1000,
        );
    } catch (error) {
        // DM failed - show code in the interaction response
        const fallbackEmbed = new EmbedBuilder()
            .setTitle("🎁 Gift Card Purchase Successful!")
            .setDescription(
                `**Gift Card Code:** \`${giftCardCode}\`\n\n**${card.name}** purchased for ${card.cost} 💎\n**Expires:** <t:${Math.floor(expiryDate.getTime() / 1000)}:F>\n\n⚠️ **Could not send DM!** Please save this code securely.`,
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
                {
                    name: "⚠️ DM Failed",
                    value: "Enable DMs to receive codes privately",
                    inline: true,
                },
            )
            .setColor(0xffaa00);

        const reply = await interaction.update({
            embeds: [fallbackEmbed],
            components: [],
        });

        // Auto-delete after 10 minutes for security
        setTimeout(
            async () => {
                try {
                    await reply.delete();
                } catch (error) {
                    console.log(
                        "Could not delete gift card fallback message:",
                        error.message,
                    );
                }
            },
            10 * 60 * 1000,
        );
    }

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
            "**How to get your gift card:**\n\n1. Use `/convert_points` to purchase a gift card\n2. Wait for admin approval\n3. Receive your gift card code via DM\n\n**Need help?** Contact an admin!\n\n🧹 **Note:** This message will auto-delete in 30 seconds.",
        )
        .setColor(0x0099ff);

    const reply = await interaction.reply({ embeds: [embed], ephemeral: true });

    // Auto-delete after 30 seconds
    setTimeout(async () => {
        try {
            await reply.delete();
            console.log("🧹 Auto-deleted gift card support ticket response");
        } catch (error) {
            console.log(
                "Could not delete gift card support ticket response:",
                error.message,
            );
        }
    }, 30 * 1000); // 30 seconds
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
        admin_generated: false,
    };

    pointsSystem.data.generated_gift_cards[giftCardCode] = giftCard;

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + GIFT_CARD_SETTINGS.validity_days);

    // Send DM with gift card code immediately
    try {
        const dmEmbed = new EmbedBuilder()
            .setTitle("🎁 Your Gift Card Generated!")
            .setDescription(
                `**🎉 Congratulations!** Your gift card has been created successfully!\n\n**Gift Card Code:** \`${giftCardCode}\`\n**Value:** ${diamondAmount.toLocaleString()} 💎\n**Created:** <t:${Math.floor(Date.now() / 1000)}:F>\n**Expires:** <t:${Math.floor(expiryDate.getTime() / 1000)}:F>\n\n🔒 **Keep this code secure!** You can:\n• Share it with others\n• Use it yourself\n• Check its status with \`/check_gift_card\`\n\n✅ **Valid for 7 days from creation**`,
            )
            .setColor(0x00ff00)
            .setTimestamp();

        await interaction.user.send({ embeds: [dmEmbed] });

        // Success response
        const successEmbed = new EmbedBuilder()
            .setTitle("🎁 Gift Card Created Successfully!")
            .setDescription(
                `**Your gift card has been generated!**\n\n💎 **Amount:** ${diamondAmount.toLocaleString()} diamonds\n📧 **Delivery:** Code sent to your DMs\n⏰ **Expires:** <t:${Math.floor(expiryDate.getTime() / 1000)}:F>\n\n✅ **Transaction Complete!**`,
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
                {
                    name: "📧 DM Status",
                    value: "✅ Code sent successfully!",
                    inline: true,
                },
            )
            .setColor(0x00ff00);

        const reply = await interaction.reply({
            embeds: [successEmbed],
            ephemeral: true,
        });

        // Auto-delete after 5 minutes
        setTimeout(
            async () => {
                try {
                    await reply.delete();
                } catch (error) {
                    console.log(
                        "Could not delete gift card success message:",
                        error.message,
                    );
                }
            },
            5 * 60 * 1000,
        );
    } catch (error) {
        // DM failed - show code in the interaction response
        const fallbackEmbed = new EmbedBuilder()
            .setTitle("🎁 Gift Card Generated!")
            .setDescription(
                `**Gift Card Code:** \`${giftCardCode}\`\n\n**Value:** ${diamondAmount.toLocaleString()} 💎\n**Status:** ✅ Valid\n**Expires:** <t:${Math.floor(expiryDate.getTime() / 1000)}:F>\n\n⚠️ **Could not send DM!** Please save this code securely.`,
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
                {
                    name: "⚠️ DM Failed",
                    value: "Enable DMs to receive codes privately",
                    inline: true,
                },
            )
            .setColor(0xffaa00);

        const reply = await interaction.reply({
            embeds: [fallbackEmbed],
            ephemeral: true,
        });

        // Auto-delete after 10 minutes for security
        setTimeout(
            async () => {
                try {
                    await reply.delete();
                } catch (error) {
                    console.log(
                        "Could not delete gift card fallback message:",
                        error.message,
                    );
                }
            },
            10 * 60 * 1000,
        );
    }

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

        // Calculate PCRP coin value
        const pcrpCoins = Math.floor(giftCard.value / 100);

        embed = new EmbedBuilder()
            .setTitle("🔍 Gift Card Status Check")
            .setDescription(
                `**Gift Card Code:** \`${giftCardCode}\`\n\n**Status:** ${statusEmoji} **${statusText}**\n**Value:** ${giftCard.value.toLocaleString()} 💎 = ${pcrpCoins} PCRP Coins\n**Conversion Rate:** 100 💎 = 1 PCRP Coin\n**Created:** <t:${Math.floor(createdDate.getTime() / 1000)}:F>\n**Expires:** <t:${Math.floor(expiryDate.getTime() / 1000)}:F>${claimedInfo}`,
            )
            .setColor(statusColor);
    }

    await interaction.reply({ embeds: [embed] });
}

async function handleGenerateGiftCard(interaction) {
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
        admin_generated: false,
    };

    pointsSystem.data.generated_gift_cards[giftCardCode] = giftCard;

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + GIFT_CARD_SETTINGS.validity_days);

    // Send DM with gift card code immediately
    try {
        const dmEmbed = new EmbedBuilder()
            .setTitle("🎁 Your Gift Card Generated!")
            .setDescription(
                `**🎉 Congratulations!** Your gift card has been created successfully!\n\n**Gift Card Code:** \`${giftCardCode}\`\n**Value:** ${diamondAmount.toLocaleString()} 💎\n**Created:** <t:${Math.floor(Date.now() / 1000)}:F>\n**Expires:** <t:${Math.floor(expiryDate.getTime() / 1000)}:F>\n\n🔒 **Keep this code secure!** You can:\n• Share it with others\n• Use it yourself\n• Check its status with \`/check_gift_card\`\n\n✅ **Valid for 7 days from creation**`,
            )
            .setColor(0x00ff00)
            .setTimestamp();

        await interaction.user.send({ embeds: [dmEmbed] });

        // Success response
        const successEmbed = new EmbedBuilder()
            .setTitle("🎁 Gift Card Created Successfully!")
            .setDescription(
                `**Your gift card has been generated!**\n\n💎 **Amount:** ${diamondAmount.toLocaleString()} diamonds\n📧 **Delivery:** Code sent to your DMs\n⏰ **Expires:** <t:${Math.floor(expiryDate.getTime() / 1000)}:F>\n\n✅ **Transaction Complete!**`,
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
                {
                    name: "📧 DM Status",
                    value: "✅ Code sent successfully!",
                    inline: true,
                },
            )
            .setColor(0x00ff00);

        await interaction.reply({ embeds: [successEmbed], ephemeral: true });
    } catch (error) {
        // DM failed - show code in the interaction response
        const fallbackEmbed = new EmbedBuilder()
            .setTitle("🎁 Gift Card Generated!")
            .setDescription(
                `**Gift Card Code:** \`${giftCardCode}\`\n\n**Value:** ${diamondAmount.toLocaleString()} 💎\n**Status:** ✅ Valid\n**Expires:** <t:${Math.floor(expiryDate.getTime() / 1000)}:F>\n\n⚠️ **Could not send DM!** Please save this code securely.`,
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
                {
                    name: "⚠️ DM Failed",
                    value: "Enable DMs to receive codes privately",
                    inline: true,
                },
            )
            .setColor(0xffaa00);

        await interaction.reply({ embeds: [fallbackEmbed], ephemeral: true });
    }

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

    // Calculate PCRP coin value
    const pcrpCoins = Math.floor(diamondAmount / 100);

    const embed = new EmbedBuilder()
        .setTitle("🛡️ Admin Gift Card Generated!")
        .setDescription(
            `**Gift Card Code:** \`${giftCardCode}\`\n\n**Value:** ${diamondAmount.toLocaleString()} 💎 = ${pcrpCoins} PCRP Coins\n**Conversion Rate:** 100 💎 = 1 PCRP Coin\n**Status:** ✅ Valid\n**Expires:** <t:${Math.floor(expiryDate.getTime() / 1000)}:F>\n**Generated by:** Admin\n\n⚠️ **Admin Generated:** This gift card was created without deducting diamonds.\n\n🔒 **Security:** This code has been sent to your DMs for secure handling.`,
        )
        .setColor(0xff0000);

    // Send DM with gift card code
    try {
        const dmEmbed = new EmbedBuilder()
            .setTitle("🛡️ Admin Generated Gift Card")
            .setDescription(
                `**Gift Card Code:** \`${giftCardCode}\`\n\n**Value:** ${diamondAmount.toLocaleString()} 💎 = ${pcrpCoins} PCRP Coins\n**Conversion Rate:** 100 💎 = 1 PCRP Coin\n**Expires:** <t:${Math.floor(expiryDate.getTime() / 1000)}:F>\n**Generated by:** Admin Panel\n\n🔒 **Admin Access:** Keep this code secure! You can share it with users or use it for giveaways.\n\n✅ **Features:**\n• Check status with \`/check_gift_card\`\n• Valid for 7 days\n• Can be claimed by any user`,
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
                value: `• Daily Reward: 50 💎 (base)\n• Max Streak: 3x multiplier\n• Conversion Rate: 100 💎 = 1 PCRP Coin\n• Data stored in: \`bot_data.json\``,
                inline: false,
            },
        )
        .setColor(0xff0000);

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

// Ticket System Functions
function createTicketPanelButtons() {
    // No buttons - only using dropdown menu
    return [];
}

function createTicketSelectMenu() {
    const options = Object.entries(TICKET_TYPES).map(([type, config]) => ({
        label: config.name,
        description: `${config.category} - Create a ${config.name.toLowerCase()} ticket`,
        emoji: config.emoji,
        value: type,
    }));

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId("ticket_type_select")
            .setPlaceholder("Select the option that best fits your problem...")
            .addOptions(options),
    );
}

function generateTicketId() {
    const id = `PCRP${ticketCounter}`;
    ticketCounter++;
    return id;
}

async function createTicketChannel(user, ticketType, ticketId) {
    try {
        const config = TICKET_TYPES[ticketType];
        const targetGuildId = ""; // Specific server ID
        const targetCategoryId = ""; // Specific category ID
        
        // Get the specific guild by ID
        const guild = client.guilds.cache.get(targetGuildId);

        if (!guild) {
            console.error(`Target guild ${targetGuildId} not found`);
            return null;
        }

        // Verify the user is in the target guild
        try {
            await guild.members.fetch(user.id);
        } catch (error) {
            console.error(`User ${user.id} not found in target guild ${targetGuildId}`);
            return null;
        }

        // Verify the category exists
        const ticketCategory = guild.channels.cache.get(targetCategoryId);
        if (!ticketCategory || ticketCategory.type !== 4) { // 4 = Category channel
            console.log(`Ticket category ${targetCategoryId} not found in guild ${targetGuildId}`);
            return null;
        }

        // Create permission overwrites array with validated IDs only
        const permissionOverwrites = [
            {
                id: guild.id, // @everyone role
                deny: ["ViewChannel"],
            },
            {
                id: user.id,
                allow: [
                    "ViewChannel",
                    "SendMessages",
                    "ReadMessageHistory",
                ],
            },
        ];

        // Add admin roles that actually exist in the target guild
        for (const roleId of ADMIN_ROLE_IDS) {
            if (roleId && roleId !== "ROLE ID") {
                const role = guild.roles.cache.get(roleId);
                if (role) {
                    permissionOverwrites.push({
                        id: roleId,
                        allow: [
                            "ViewChannel",
                            "SendMessages",
                            "ReadMessageHistory",
                            "ManageMessages",
                        ],
                    });
                    console.log(`Added admin role ${role.name} to ticket permissions`);
                } else {
                    console.log(`Admin role ${roleId} not found in target guild, skipping`);
                }
            }
        }

        // Add admin users that exist in the target guild (only if ADMIN_USER_IDS is not empty)
        if (ADMIN_USER_IDS.length > 0) {
            for (const userId of ADMIN_USER_IDS) {
                if (userId && userId !== "ROLE ID") {
                    try {
                        const member = await guild.members.fetch(userId);
                        if (member) {
                            permissionOverwrites.push({
                                id: userId,
                                allow: [
                                    "ViewChannel",
                                    "SendMessages",
                                    "ReadMessageHistory",
                                    "ManageMessages",
                                ],
                            });
                            console.log(`Added admin user ${member.user.tag} to ticket permissions`);
                        }
                    } catch (error) {
                        console.log(`Admin user ${userId} not found in target guild, skipping`);
                    }
                }
            }
        }

        // Create ticket channel in the specific guild and category
        const ticketChannel = await guild.channels.create({
            name: `ticket-${ticketId.toLowerCase()}`,
            type: 0, // Text channel
            parent: targetCategoryId, // Use the specific category ID
            permissionOverwrites: permissionOverwrites,
        });

        console.log(`✅ Created ticket channel ${ticketChannel.name} in guild ${guild.name} under category ${ticketCategory.name}`);

        // Create ticket buttons for channel
        const ticketButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`close_ticket_${ticketId}`)
                .setLabel("🔒 Close Ticket")
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`ticket_info_${ticketId}`)
                .setLabel("ℹ️ Ticket Info")
                .setStyle(ButtonStyle.Secondary),
        );

        const ticketEmbed = new EmbedBuilder()
            .setTitle(`🎫 ${config.name} Ticket`)
            .setDescription(
                `**Ticket ID:** \`${ticketId}\`\n**Type:** ${config.name}\n**Status:** 🟢 Open\n**User:** ${user}\n**Server:** ${guild.name}\n\n**Welcome to your support ticket!**\n\nYour ticket has been created successfully. Please describe your ${config.name.toLowerCase()} in detail below.\n\n**What happens next:**\n• Staff can respond directly in this channel\n• You can close this ticket anytime using the button below\n• This channel will be deleted when the ticket is closed\n\n⚠️ **Do not share passwords or other sensitive information.**`,
            )
            .addFields({
                name: "📝 Instructions",
                value: "• Provide as much detail as possible\n• Be patient while waiting for staff response\n• Use the buttons below to manage your ticket",
                inline: false,
            })
            .setColor(config.color)
            .setTimestamp()
            .setThumbnail(user.displayAvatarURL());

        const channelMessage = await ticketChannel.send({
            embeds: [ticketEmbed],
            components: [ticketButtons],
        });

        return { channel: ticketChannel, message: channelMessage };
    } catch (error) {
        console.error("Error creating ticket channel:", error);
        return null;
    }
}

async function handleTicketCreation(interaction, ticketType) {
    try {
        const config = TICKET_TYPES[ticketType];
        const ticketId = generateTicketId();
        const targetGuildId = ""; // Specific server ID

        // Check if the interaction is from the target server
        if (interaction.guildId !== targetGuildId) {
            const embed = new EmbedBuilder()
                .setTitle("❌ Wrong Server")
                .setDescription(
                    `Ticket creation is only available in the designated server.\n\n**Current Server:** ${interaction.guild?.name || "Unknown"}\n**Required Server ID:** \`${targetGuildId}\`\n\nPlease use the ticket system in the correct server.`,
                )
                .setColor(0xff0000);

            return await interaction.reply({
                embeds: [embed],
                ephemeral: true,
            });
        }

        // Check if user already has an active ticket
        const existingTicket = Array.from(activeTickets.values()).find(
            (ticket) =>
                ticket.userId === interaction.user.id &&
                ticket.status === "open",
        );

        if (existingTicket) {
            const embed = new EmbedBuilder()
                .setTitle("❌ Active Ticket Exists")
                .setDescription(
                    `You already have an active ticket with ID: \`${existingTicket.id}\`\n\nPlease close your existing ticket before creating a new one.`,
                )
                .setColor(0xff0000);

            return await interaction.reply({
                embeds: [embed],
                ephemeral: true,
            });
        }

        await interaction.deferReply({ ephemeral: true });

        // Create ticket channel
        const ticketResult = await createTicketChannel(
            interaction.user,
            ticketType,
            ticketId,
        );

        if (!ticketResult) {
            const errorEmbed = new EmbedBuilder()
                .setTitle("❌ Error Creating Ticket")
                .setDescription(
                    `Failed to create ticket channel. This could be due to:\n\n• Missing permissions in the target server\n• Category channel not found\n• You're not a member of the target server\n\n**Target Server ID:** \`${targetGuildId}\`\n**Category ID:** \`1392500468336562327\`\n\nPlease contact an administrator if this issue persists.`,
                )
                .setColor(0xff0000);

            return await interaction.editReply({ embeds: [errorEmbed] });
        }

        // Store ticket data
        const ticketData = {
            id: ticketId,
            userId: interaction.user.id,
            type: ticketType,
            status: "open",
            createdAt: new Date().toISOString(),
            claimedBy: null,
            channelId: ticketResult.channel.id,
            messages: [],
            guildId: targetGuildId,
        };

        activeTickets.set(ticketId, ticketData);
        await saveTicketData();

        // Notify staff in ticket logs channel
        await logTicketAction(
            ticketId,
            "created",
            interaction.user,
            `Ticket created: ${config.name} in <#${ticketResult.channel.id}> (Server: ${interaction.guild.name})`,
        );

        // Confirm to user
        const successEmbed = new EmbedBuilder()
            .setTitle("✅ Ticket Created Successfully!")
            .setDescription(
                `Your ticket channel has been created in the designated server!\n\n**Ticket ID:** \`${ticketId}\`\n**Type:** ${config.name}\n**Channel:** <#${ticketResult.channel.id}>\n**Server:** ${interaction.guild.name}\n**Category:** Support Tickets\n\n🔔 Our staff team can now assist you in your ticket channel.`,
            )
            .setColor(0x00ff00);

        await interaction.editReply({ embeds: [successEmbed] });
    } catch (error) {
        console.error("Error in ticket creation:", error);

        const errorEmbed = new EmbedBuilder()
            .setTitle("❌ Error")
            .setDescription(
                `An error occurred while creating your ticket.\n\n**Error Details:** ${error.message}\n\nPlease try again or contact an administrator if this issue persists.`,
            )
            .setColor(0xff0000);

        if (interaction.deferred) {
            await interaction.editReply({ embeds: [errorEmbed] });
        } else {
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    }
}

async function logTicketAction(ticketId, action, user, details = "") {
    try {
        const logChannel = client.channels.cache.get(CHANNELS.ticket_logs);
        if (!logChannel) return;

        const embed = new EmbedBuilder()
            .setTitle(
                `🎫 Ticket ${action.charAt(0).toUpperCase() + action.slice(1)}`,
            )
            .setDescription(
                `**Ticket ID:** \`${ticketId}\`\n**Action:** ${action}\n**User:** ${user.tag} (${user.id})\n**Time:** <t:${Math.floor(Date.now() / 1000)}:F>\n\n${details}`,
            )
            .setColor(
                action === "created"
                    ? 0x00ff00
                    : action === "closed"
                      ? 0xff0000
                      : 0xffaa00,
            )
            .setThumbnail(user.displayAvatarURL())
            .setTimestamp();

        // Add close button for staff if ticket is open
        const components = [];
        if (action === "created" || action === "message") {
            const ticket = activeTickets.get(ticketId);
            if (ticket && ticket.status === "open") {
                const adminButtons = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`admin_close_ticket_${ticketId}`)
                        .setLabel("🔒 Close Ticket (Admin)")
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId(`admin_respond_ticket_${ticketId}`)
                        .setLabel("💬 Respond to User")
                        .setStyle(ButtonStyle.Primary),
                );
                components.push(adminButtons);
            }
        }

        await logChannel.send({ embeds: [embed], components });
    } catch (error) {
        console.error("Error logging ticket action:", error);
    }
}

async function restoreTicketConnections() {
    console.log("🔄 Restoring ticket connections after restart...");
    let restoredCount = 0;
    let closedCount = 0;

    for (const [ticketId, ticket] of activeTickets) {
        try {
            if (ticket.status !== "open") continue;

            // Check if ticket channel still exists
            if (ticket.channelId) {
                const channel = client.channels.cache.get(ticket.channelId);
                if (channel) {
                    restoredCount++;
                    console.log(
                        `✅ Restored ticket ${ticketId} in channel #${channel.name}`,
                    );
                } else {
                    console.log(
                        `❌ Ticket channel for ${ticketId} no longer exists`,
                    );
                    ticket.status = "closed";
                    closedCount++;
                }
            } else {
                console.log(`❌ Ticket ${ticketId} has no channel ID`);
                ticket.status = "closed";
                closedCount++;
            }
        } catch (error) {
            console.log(
                `❌ Could not restore ticket ${ticketId}:`,
                error.message,
            );
            const ticket = activeTickets.get(ticketId);
            if (ticket) {
                ticket.status = "closed";
                closedCount++;
            }
        }
    }

    if (restoredCount > 0 || closedCount > 0) {
        await saveTicketData();
        console.log(
            `✅ Ticket restoration complete: ${restoredCount} restored, ${closedCount} auto-closed`,
        );
    } else {
        console.log("ℹ️ No active tickets to restore");
    }
}

// Point Drop Ticket System
let pointDropTickets = {}; // Store tickets in memory

function generateTicketId() {
    return "PCRP-" + Math.random().toString(36).substring(2, 10).toUpperCase();
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
        "",
        "",
        "",
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
            `**💎 MINING RESULTS 💎**\n\`\`\`\n    ⛏️💎💎💎⛏️\n   ╱ ╲ ╱ ╲ ╱ ╲\n  ╱   ╲   r��   ╲\n ╱_____╲___╲___╲\n    MINE CLOSED\n\`\`\`\n\n⏰ **Event Status:** ${endReason}\n🎫 **Event:** ${ticket.title}\n👥 **Total Miners:** ${miningData.participants.size}\n🏆 **Total Claims:** ${miningData.totalClaims}\n💎 **Total Pool:** ${miningData.totalDiamonds.toLocaleString()} 💎\n💎 **Diamonds Distributed:** ${diamondsDistributed.toLocaleString()} 💎\n💎 **Remaining:** ${miningData.remainingDiamonds.toLocaleString()} 💎\n🎯 **Ticket ID:** \`${ticket.id}\`${topMinersText}\n\n**Thanks for participating in this custom diamond mining event!**`,
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

// Startup functions
async function sendStartupPanels() {
    console.log("🚀 Bot startup sequence initiated...");
    console.log("🧹 Phase 1: Complete channel cleanup (bot restart only)");
    await cleanupOldPanels();

    console.log("📋 Phase 2: Deploying fresh panels");
    await sendDailyClaimPanel();
    await sendGamblingPanel();
    await sendGiftCardPanel();
    await sendLeaderboardPanel();
    await sendInfoPanel();
    await sendAdminGiftCardPanel();
    await sendPointDropTicketPanel();

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
            .setTitle("ℹ️ Diamond Points Bot Information Center")
            .setDescription(
                `**Welcome to the Complete Bot Guide!**\n\`\`\`\n    ℹ️ HELP CENTER ℹ️\n  ╔═══════════════════╗\n  ║ 📖 USER COMMANDS  ║\n  ║ 🛡️ ADMIN COMMANDS ║\n  ║ 💎 BOT FEATURES   ║\n  ╚═══════════════════╝\n\`\`\`\n\n**Quick Start Guide:**\n💎 **New Users:** Start with \`/claim_daily\` in <#${CHANNELS.daily_claims}>\n🎲 **Gaming:** Visit <#${CHANNELS.gambling}> for casino games\n🎁 **Rewards:** Use <#${CHANNELS.gift_cards}> to redeem prizes\n🏆 **Rankings:** Check <#${CHANNELS.leaderboard}> for top players\n\n**Bot Economy:**\n• Base Daily Reward: 50 💎\n• Streak Multiplier: Up to 3x\n• Gift Card Range: 500-100,000 💎\n• Conversion Rate: 100 💎 = 1 PCRP Coin\n\n**Commands Available:**\n• \`/info\` - Show this panel\n• Use buttons below for detailed command lists\n\nClick a button below to view command details!`,
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
                `**Admin-Only Gift Card System**\n\`\`\`\n  🛡️ ADMIN PANEL 🛡️\n╔══════════════════════╗\n║ 💎 Generate Cards    ║\n║ 🔒 Admin Access Only ║\n║ 📧 DM Delivery       ║\n╚══════════════════════╝\n\`\`\`\n\n**Features:**\n💎 **Generate Gift Cards** - Create cards with custom amounts\n📧 **Auto DM Delivery** - Codes sent directly to your DMs\n🔒 **Admin Only Access** - Restricted to authorized users\n⏰ **7-Day Validity** - All cards expire after 7 days\n\n**Usage:**\n1. Click the "Generate Gift Card" button below\n2. Enter diamond amount (500-100,000)\n3. Card will be generated and sent to your DMs\n4. Share the code or use it yourself\n\n**Access Requirements:**\n• Admin roles: Multiple admin roles configured\n\nOnly authorized admins can use this panel!`,
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

    // FIRST: Complete cleanup of admin reports channel (1387168027027574875)
    console.log("🧹 Phase 1a: Complete admin reports channel cleanup...");
    await performCompleteAdminChannelCleanup();

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
        CHANNELS.tickets,
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

                // AGGRESSIVE cleanup - fetch ALL messages for complete cleaning
                while (true) {
                    const fetchOptions = { limit: 100 };
                    if (lastMessageId) {
                        fetchOptions.before = lastMessageId;
                    }

                    const fetched = await channel.messages.fetch(fetchOptions);

                    if (fetched.size === 0) break;

                    // ENHANCED Filter: More aggressive cleanup of bot messages and user interactions
                    const messagesToDelete = fetched.filter((msg) => {
                        const messageAge = Date.now() - msg.createdTimestamp;
                        const isOld = messageAge > 7 * 24 * 60 * 60 * 1000; // Reduced to 7 days

                        // ALWAYS delete ALL bot messages (more aggressive)
                        if (msg.author.bot) {
                            return true;
                        }

                        // AGGRESSIVE user message cleanup
                        if (msg.author.bot === false) {
                            const content = msg.content.toLowerCase();
                            const hasEmbeds = msg.embeds.length > 0;
                            const hasComponents = msg.components.length > 0;
                            const hasReactions = msg.reactions.cache.size > 0;

                            // EXPANDED bot interaction patterns including gift card support tickets
                            const botPatterns = [
                                "💎",
                                "diamonds",
                                "claimed",
                                "gift card",
                                "support ticket",
                                "gift card support",
                                "ticket",
                                "support",
                                "🎫",
                                "🎁",
                                "how to get",
                                "admin approval",
                                "contact admin",
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
                                "🏆",
                                "⛏️",
                                "🔥",
                                "admin",
                                "login",
                                "logout",
                                "session",
                                "tracking",
                                "report",
                                "/claim",
                                "/gambling",
                                "/transfer",
                                "/generate",
                                "/convert",
                                "/redeem",
                                "approved",
                                "rejected",
                                "mining",
                                "drop",
                                "status",
                                "bot",
                                "command",
                                "error",
                                "successful",
                                "dm delivery",
                                "code sent",
                                "gift card code",
                            ];

                            const hasBotPattern = botPatterns.some((pattern) =>
                                content.includes(pattern),
                            );

                            // AGGRESSIVE deletion criteria
                            if (
                                hasBotPattern ||
                                hasEmbeds ||
                                hasComponents ||
                                hasReactions ||
                                isOld
                            ) {
                                return true;
                            }

                            // Delete messages that look like command responses or ticket interactions
                            if (
                                content.startsWith("/") ||
                                content.includes("✅") ||
                                content.includes("❌") ||
                                content.includes("⚠️") ||
                                content.includes("🎫") ||
                                content.includes("🎁") ||
                                content.length < 5
                            ) {
                                // Very short messages likely spam
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

// Admin Tracking System Functions
function createAdminTrackingButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("admin_login")
            .setLabel("🟢 Login")
            .setStyle(ButtonStyle.Success)
            .setEmoji("🔐"),
        new ButtonBuilder()
            .setCustomId("admin_logout")
            .setLabel("🔴 Logout")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("🔓"),
        new ButtonBuilder()
            .setCustomId("admin_status")
            .setLabel("📊 My Status")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("📈"),
    );
}

async function handleAdminLogin(interaction) {
    if (!hasAdminRole(interaction)) {
        const embed = new EmbedBuilder()
            .setTitle("❌ Access Denied")
            .setDescription("You need admin privileges to use this system.")
            .setColor(0xff0000);
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    pointsSystem.startAdminSession(interaction.user.id);
    await pointsSystem.saveData();

    const embed = new EmbedBuilder()
        .setTitle("🟢 Admin Login Successful")
        .setDescription(
            `**Welcome back, ${interaction.user.displayName}!**\n\n🔐 **Session Started:** <t:${Math.floor(Date.now() / 1000)}:F>\n📊 **Status:** Active\n⏱️ **Tracking:** Enabled\n\n✅ Your admin session is now being tracked. Use the Logout button when you're done.`,
        )
        .setColor(0x00ff00)
        .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleAdminLogout(interaction) {
    if (!hasAdminRole(interaction)) {
        const embed = new EmbedBuilder()
            .setTitle("❌ Access Denied")
            .setDescription("You need admin privileges to use this system.")
            .setColor(0xff0000);
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const sessionData = pointsSystem.endAdminSession(interaction.user.id);
    await pointsSystem.saveData();

    if (!sessionData) {
        const embed = new EmbedBuilder()
            .setTitle("⚠️ No Active Session")
            .setDescription("You don't have an active login session to end.")
            .setColor(0xffaa00);
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const hours = Math.floor(sessionData.duration / 60);
    const minutes = sessionData.duration % 60;
    const timeString = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

    const embed = new EmbedBuilder()
        .setTitle("🔴 Admin Logout Successful")
        .setDescription(
            `**Goodbye, ${interaction.user.displayName}!**\n\n🔓 **Session Ended:** <t:${Math.floor(Date.now() / 1000)}:F>\n⏱️ **Session Duration:** ${timeString}\n📊 **Status:** Offline\n\n✅ Your session has been recorded. Thank you for your service!`,
        )
        .setColor(0xff0000)
        .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleAdminStatus(interaction) {
    if (!hasAdminRole(interaction)) {
        const embed = new EmbedBuilder()
            .setTitle("❌ Access Denied")
            .setDescription("You need admin privileges to use this system.")
            .setColor(0xff0000);
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const adminData = pointsSystem.getAdminData(interaction.user.id);
    const totalHours = Math.floor(adminData.totalHours);
    const totalMinutes = Math.floor((adminData.totalHours - totalHours) * 60);
    const totalSessions = adminData.sessions.length;

    let statusText = "📴 Offline";
    let currentSessionText = "No active session";

    if (adminData.currentSession && adminData.currentSession.isActive) {
        statusText = "🟢 Online";
        const loginTime = new Date(adminData.currentSession.loginTime);
        const currentDuration = Math.floor(
            (Date.now() - loginTime) / 1000 / 60,
        );
        const currentHours = Math.floor(currentDuration / 60);
        const currentMins = currentDuration % 60;
        currentSessionText =
            currentHours > 0
                ? `${currentHours}h ${currentMins}m`
                : `${currentMins}m`;
    }

    const embed = new EmbedBuilder()
        .setTitle("📊 Your Admin Statistics")
        .setDescription(`**${interaction.user.displayName}'s Activity Report**`)
        .addFields(
            { name: "📊 Current Status", value: statusText, inline: true },
            {
                name: "⏱️ Current Session",
                value: currentSessionText,
                inline: true,
            },
            {
                name: "📈 Total Hours",
                value: `${totalHours}h ${totalMinutes}m`,
                inline: true,
            },
            {
                name: "🔢 Total Sessions",
                value: `${totalSessions} sessions`,
                inline: true,
            },
            { name: "📅 Data Range", value: "Last 30 days", inline: true },
            {
                name: "⏰ Last Activity",
                value: adminData.lastActivity
                    ? `<t:${Math.floor(new Date(adminData.lastActivity).getTime() / 1000)}:R>`
                    : "Never",
                inline: true,
            },
        )
        .setColor(0x0099ff)
        .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleSendAdminTrackingPanel(interaction) {
    if (!hasAdminRole(interaction)) {
        const embed = new EmbedBuilder()
            .setTitle("❌ Access Denied")
            .setDescription("You need admin privileges to use this command.")
            .setColor(0xff0000);
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    await sendAdminTrackingPanel();
    await interaction.reply({
        content: "✅ Admin tracking panel sent!",
        ephemeral: true,
    });
}

async function handleAdminReport(interaction) {
    if (!hasAdminRole(interaction)) {
        const embed = new EmbedBuilder()
            .setTitle("❌ Access Denied")
            .setDescription("You need admin privileges to use this command.")
            .setColor(0xff0000);
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    await interaction.reply({
        content: "📊 Generating admin activity report...",
        ephemeral: true,
    });
    await generateMonthlyAdminReport();
    await interaction.followUp({
        content: "✅ Admin report generated and sent to reports channel!",
        ephemeral: true,
    });
}

async function handleCleanFullChannel(interaction) {
    if (!hasAdminRole(interaction)) {
        const embed = new EmbedBuilder()
            .setTitle("❌ Access Denied")
            .setDescription("You need admin privileges to use this command.")
            .setColor(0xff0000);
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const channelId = interaction.options.getString("channel_id");

    await interaction.reply({
        content: `🧹 Starting COMPLETE cleanup of channel ${channelId}...`,
        ephemeral: true,
    });

    try {
        await performCompleteChannelCleanup(channelId);

        const embed = new EmbedBuilder()
            .setTitle("🧹 Complete Channel Cleanup Finished!")
            .setDescription(
                `**Channel ID:** \`${channelId}\`\n\n✅ **Complete cleanup performed:**\n• All bot messages removed\n• All user messages removed\n• All interactions cleared\n• Channel is now completely fresh\n\n🔄 **Operation completed successfully!**`,
            )
            .setColor(0x00ff00)
            .setTimestamp();

        await interaction.followUp({ embeds: [embed], ephemeral: true });

        console.log(
            `🧹 Manual complete cleanup of channel ${channelId} completed by admin:`,
            interaction.user.tag,
        );
    } catch (error) {
        console.error(
            `Error during complete cleanup of channel ${channelId}:`,
            error,
        );

        const errorEmbed = new EmbedBuilder()
            .setTitle("❌ Cleanup Error")
            .setDescription(
                `Failed to complete cleanup of channel \`${channelId}\`.\n\nError: ${error.message}`,
            )
            .setColor(0xff0000);

        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
    }
}

async function sendAdminTrackingPanel() {
    const adminChannel = client.channels.cache.get(CHANNELS.admin_reports);
    if (adminChannel) {
        const embed = new EmbedBuilder()
            .setTitle("🧑‍💼 Admin Login Tracking System")
            .setDescription(
                `**Professional Time Tracking for Admins**\n\`\`\`\n  🎫 ADMIN TRACKING 🎫\n╔══════════════════════════╗\n║ 🟢 Login  🔴 Logout     ║\n║ 📊 Status Monitoring    ║\n║ 📈 30-Day Reports       ║\n╚══════════════════════════╝\n\`\`\`\n\n**🔘 System Features:**\n🟢 **Login** - Start your admin session tracking\n🔴 **Logout** - End session and calculate duration\n📊 **My Status** - View your statistics and current session\n\n**🧑‍💼 Admin Features:**\n• **Session Monitoring** - Automatic login/logout tracking\n• **Online Status Detection** - Monitors Discord activity\n• **30-Day Data Storage** - Comprehensive session history\n• **Monthly Reports** - Top 5 admins by total hours\n\n**📊 Automated Reporting:**\n• Reports generated monthly on the 1st\n• Sent automatically to this channel\n• Includes detailed statistics and rankings\n• Data refreshes every 30 days\n\n**⚙️ Auto-Management:**\n• Sessions auto-end if offline >5 minutes\n• Data auto-saves every 5 minutes\n• Old data cleaned automatically\n\n**Admin Access Only** - Must have admin role to use`,
            )
            .setColor(0x0099ff)
            .setTimestamp();

        const components = createAdminTrackingButtons();
        await adminChannel.send({ embeds: [embed], components: [components] });
        console.log("✅ Admin tracking panel sent");
    }
}

async function generateMonthlyAdminReport() {
    try {
        const adminChannel = client.channels.cache.get(CHANNELS.admin_reports);
        if (!adminChannel) return;

        // Get all admin data and sort by total hours
        const adminStats = [];
        for (const [userId, data] of Object.entries(
            pointsSystem.data.admin_tracking,
        )) {
            if (data.totalHours > 0 || data.sessions.length > 0) {
                try {
                    const user = await client.users.fetch(userId);
                    adminStats.push({
                        user,
                        totalHours: data.totalHours,
                        sessions: data.sessions.length,
                        lastActivity: data.lastActivity,
                    });
                } catch (error) {
                    console.log(`Could not fetch user ${userId} for report`);
                }
            }
        }

        // Sort by total hours (descending)
        adminStats.sort((a, b) => b.totalHours - a.totalHours);
        const top5 = adminStats.slice(0, 5);

        const embed = new EmbedBuilder()
            .setTitle("📊 Monthly Admin Activity Report")
            .setDescription(
                `**🏆 Top 5 Admins by Total Hours**\n\n📅 **Report Period:** Last 30 Days\n📊 **Total Tracked Admins:** ${adminStats.length}\n⏰ **Generated:** <t:${Math.floor(Date.now() / 1000)}:F>`,
            )
            .setColor(0xffd700)
            .setTimestamp();

        if (top5.length === 0) {
            embed.addFields({
                name: "📝 No Data Available",
                value: "No admin activity recorded in the last 30 days.",
                inline: false,
            });
        } else {
            const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];

            for (let i = 0; i < top5.length; i++) {
                const admin = top5[i];
                const hours = Math.floor(admin.totalHours);
                const minutes = Math.floor((admin.totalHours - hours) * 60);
                const timeText =
                    hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

                embed.addFields({
                    name: `${medals[i]} ${admin.user.displayName}`,
                    value: `⏱️ **Time:** ${timeText}\n📊 **Sessions:** ${admin.sessions}\n⏰ **Last Active:** ${admin.lastActivity ? `<t:${Math.floor(new Date(admin.lastActivity).getTime() / 1000)}:R>` : "Never"}`,
                    inline: true,
                });
            }
        }

        // Calculate total statistics
        const totalHours = adminStats.reduce(
            (sum, admin) => sum + admin.totalHours,
            0,
        );
        const totalSessions = adminStats.reduce(
            (sum, admin) => sum + admin.sessions,
            0,
        );

        embed.addFields(
            {
                name: "📈 Total Hours",
                value: `${Math.floor(totalHours)}h ${Math.floor((totalHours - Math.floor(totalHours)) * 60)}m`,
                inline: true,
            },
            {
                name: "🔢 Total Sessions",
                value: `${totalSessions}`,
                inline: true,
            },
            {
                name: "📊 Average per Admin",
                value:
                    adminStats.length > 0
                        ? `${Math.floor(totalHours / adminStats.length)}h`
                        : "0h",
                inline: true,
            },
        );

        await adminChannel.send({ embeds: [embed] });
        console.log("📊 Monthly admin report generated and sent");
    } catch (error) {
        console.error("Error generating monthly admin report:", error);
    }
}

async function performCompleteAdminChannelCleanup() {
    // Complete cleanup of admin reports channel - removes ALL messages (bot and user)
    try {
        const adminChannelId = CHANNELS.admin_reports; // Use the configured admin reports channel
        const adminChannel = client.channels.cache.get(adminChannelId);

        if (!adminChannel) {
            console.log("❌ Admin reports channel not found for cleanup");
            return;
        }

        console.log(
            `🧹 Starting COMPLETE cleanup of admin channel: ${adminChannel.name}`,
        );

        let totalDeletedMessages = 0;
        let lastMessageId = null;

        // Fetch ALL messages and delete EVERYTHING
        while (true) {
            const fetchOptions = { limit: 100 };
            if (lastMessageId) {
                fetchOptions.before = lastMessageId;
            }

            const fetched = await adminChannel.messages.fetch(fetchOptions);

            if (fetched.size === 0) break;

            // Delete ALL messages (bot AND user messages)
            const messagesToDelete = fetched.filter(() => true); // Select ALL messages

            if (messagesToDelete.size > 0) {
                // Group messages by age for bulk delete (Discord only allows bulk delete for messages < 14 days)
                const recentMessages = [];
                const oldMessages = [];

                messagesToDelete.forEach((msg) => {
                    const messageAge = Date.now() - msg.createdTimestamp;
                    if (messageAge < 14 * 24 * 60 * 60 * 1000) {
                        recentMessages.push(msg);
                    } else {
                        oldMessages.push(msg);
                    }
                });

                // Bulk delete recent messages
                if (recentMessages.length > 1) {
                    // Split into chunks of 100 for bulk delete
                    for (let i = 0; i < recentMessages.length; i += 100) {
                        const chunk = recentMessages.slice(i, i + 100);
                        if (chunk.length > 1) {
                            await adminChannel.bulkDelete(chunk);
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

                totalDeletedMessages += messagesToDelete.size;
            }

            // Set lastMessageId for next iteration
            lastMessageId = fetched.last()?.id;

            // Break if we didn't fetch a full batch
            if (fetched.size < 100) break;

            // Small delay to avoid rate limits
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        if (totalDeletedMessages > 0) {
            console.log(
                `✅ COMPLETE CLEANUP: Removed ${totalDeletedMessages} messages (ALL bot and user messages) from admin channel`,
            );
        } else {
            console.log(
                `✅ Admin channel was already clean - no messages to remove`,
            );
        }
    } catch (error) {
        console.error("Error during complete admin channel cleanup:", error);
    }
}

// Update startup to include admin tracking panel
async function performCompleteChannelCleanup(channelId) {
    try {
        const channel = client.channels.cache.get(channelId);
        if (!channel) {
            console.log(`❌ Channel ${channelId} not found for cleanup`);
            return;
        }

        console.log(
            `🧹 Starting COMPLETE cleanup of channel: ${channel.name} (${channelId})`,
        );

        let totalDeletedMessages = 0;
        let lastMessageId = null;

        // Fetch ALL messages and delete EVERYTHING
        while (true) {
            const fetchOptions = { limit: 100 };
            if (lastMessageId) {
                fetchOptions.before = lastMessageId;
            }

            const fetched = await channel.messages.fetch(fetchOptions);

            if (fetched.size === 0) break;

            // Delete ALL messages (bot AND user messages)
            const messagesToDelete = fetched.filter(() => true); // Select ALL messages

            if (messagesToDelete.size > 0) {
                // Group messages by age for bulk delete (Discord only allows bulk delete for messages < 14 days)
                const recentMessages = [];
                const oldMessages = [];

                messagesToDelete.forEach((msg) => {
                    const messageAge = Date.now() - msg.createdTimestamp;
                    if (messageAge < 14 * 24 * 60 * 60 * 1000) {
                        recentMessages.push(msg);
                    } else {
                        oldMessages.push(msg);
                    }
                });

                // Bulk delete recent messages
                if (recentMessages.length > 1) {
                    // Split into chunks of 100 for bulk delete
                    for (let i = 0; i < recentMessages.length; i += 100) {
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

                totalDeletedMessages += messagesToDelete.size;
            }

            // Set lastMessageId for next iteration
            lastMessageId = fetched.last()?.id;

            // Break if we didn't fetch a full batch
            if (fetched.size < 100) break;

            // Small delay to avoid rate limits
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        if (totalDeletedMessages > 0) {
            console.log(
                `✅ COMPLETE CLEANUP: Removed ${totalDeletedMessages} messages (ALL bot and user messages) from ${channel.name}`,
            );
        } else {
            console.log(
                `✅ Channel ${channel.name} was already clean - no messages to remove`,
            );
        }
    } catch (error) {
        console.error(
            `Error during complete cleanup of channel ${channelId}:`,
            error,
        );
    }
}

// Ticket System Handler Functions
async function handleSendTicketPanel(interaction) {
    if (!hasAdminRole(interaction)) {
        const embed = new EmbedBuilder()
            .setTitle("❌ Access Denied")
            .setDescription("You need admin privileges to use this command.")
            .setColor(0xff0000);
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    await sendTicketPanel();
    await interaction.reply({
        content: "✅ Ticket support panel sent!",
        ephemeral: true,
    });
}

async function showTicketSelectMenu(interaction) {
    const embed = new EmbedBuilder()
        .setTitle("🎫 Support Tickets")
        .setDescription(
            "**Select the option that best fits your problem. A support ticket will be created for you automatically.**\n\nChoose from the dropdown menu below to create your ticket.",
        )
        .setColor(0x0099ff)
        .setThumbnail(client.user.displayAvatarURL());

    const selectMenu = createTicketSelectMenu();
    await interaction.reply({
        embeds: [embed],
        components: [selectMenu],
        ephemeral: true,
    });
}

async function handleTicketTypeSelection(interaction) {
    const ticketType = interaction.values[0];
    await handleTicketCreation(interaction, ticketType);
}

async function handleCloseTicket(interaction, ticketId) {
    try {
        const ticket = activeTickets.get(ticketId);
        if (!ticket) {
            return await interaction.reply({
                content: "❌ Ticket not found!",
                ephemeral: true,
            });
        }

        const isAdmin = ADMIN_USER_IDS.includes(interaction.user.id) || hasAdminRole(interaction);
        const isOwner = ticket.userId === interaction.user.id;

        if (!isAdmin && !isOwner) {
            return await interaction.reply({
                content: "❌ You can only close your own tickets!",
                ephemeral: true,
            });
        }

        // Update ticket status
        ticket.status = "closed";
        ticket.closedBy = interaction.user.id;
        ticket.closedAt = new Date().toISOString();

        // Create ticket transcript from channel messages
        const transcript = await createChannelTranscript(ticket);

        // Save to ticket history
        if (!pointsSystem.data.tickets.history) {
            pointsSystem.data.tickets.history = [];
        }
        pointsSystem.data.tickets.history.push({
            ...ticket,
            transcript: transcript,
        });

        const embed = new EmbedBuilder()
            .setTitle("🔒 Ticket Closed")
            .setDescription(
                `**Ticket ID:** \`${ticketId}\`\n**Closed by:** ${interaction.user}\n**Closed at:** <t:${Math.floor(Date.now() / 1000)}:F>\n\n**This ticket has been closed.** The channel will be deleted in 10 seconds.\n\nThank you for using our support system!`,
            )
            .setColor(0xff0000)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });

        // Send transcript to user via DM
        try {
            const user = await client.users.fetch(ticket.userId);
            const transcriptEmbed = new EmbedBuilder()
                .setTitle(`📋 Ticket Transcript - ${ticketId}`)
                .setDescription(
                    `**Ticket ID:** \`${ticketId}\`\n**Type:** ${TICKET_TYPES[ticket.type]?.name || "Unknown"}\n**Closed:** <t:${Math.floor(Date.now() / 1000)}:F>\n\nHere is the transcript of your support ticket:`,
                )
                .setColor(0x808080)
                .setTimestamp();

            if (transcript && transcript.length > 0) {
                const { AttachmentBuilder } = require("discord.js");
                const attachment = new AttachmentBuilder(
                    Buffer.from(transcript, "utf8"),
                    { name: `ticket-${ticketId}-transcript.txt` },
                );

                await user.send({
                    embeds: [transcriptEmbed],
                    files: [attachment],
                });
            } else {
                await user.send({ embeds: [transcriptEmbed] });
            }
        } catch (error) {
            console.log(
                "Could not send transcript to user via DM:",
                error.message,
            );
        }

        // Log the closure
        await logTicketAction(
            ticketId,
            "closed",
            interaction.user,
            `Closed by ${isAdmin ? "admin" : "user"} - Channel will be deleted`,
        );

        // Delete the ticket channel after 10 seconds
        setTimeout(async () => {
            try {
                const channel = client.channels.cache.get(ticket.channelId);
                if (channel) {
                    await channel.delete();
                    console.log(`✅ Ticket channel ${channel.name} deleted successfully`);
                }
            } catch (error) {
                console.log("Could not delete ticket channel:", error.message);
            }
        }, 10000);

        // Remove from active tickets and save
        activeTickets.delete(ticketId);
        await saveTicketData();
    } catch (error) {
        console.error("Error closing ticket:", error);
        await interaction.reply({
            content: "❌ An error occurred while closing the ticket.",
            ephemeral: true,
        });
    }
}

async function createChannelTranscript(ticket) {
    try {
        const config = TICKET_TYPES[ticket.type];
        const user = await client.users.fetch(ticket.userId);
        const channel = client.channels.cache.get(ticket.channelId);

        let transcript = `TICKET TRANSCRIPT\n`;
        transcript += `==================\n`;
        transcript += `Ticket ID: ${ticket.id}\n`;
        transcript += `User: ${user.tag} (${user.id})\n`;
        transcript += `Type: ${config?.name || "Unknown"}\n`;
        transcript += `Category: ${config?.category || "Unknown"}\n`;
        transcript += `Channel: #${channel?.name || "deleted-channel"}\n`;
        transcript += `Created: ${new Date(ticket.createdAt).toLocaleString()}\n`;
        transcript += `Closed: ${new Date().toLocaleString()}\n`;
        transcript += `Status: ${ticket.status}\n`;

        if (ticket.claimedBy) {
            try {
                const claimedUser = await client.users.fetch(ticket.claimedBy);
                transcript += `Claimed by: ${claimedUser.tag} (${claimedUser.id})\n`;
            } catch {
                transcript += `Claimed by: ${ticket.claimedBy}\n`;
            }
        }

        transcript += `\n==================\n`;
        transcript += `CONVERSATION LOG\n`;
        transcript += `==================\n\n`;

        if (channel) {
            try {
                const messages = await channel.messages.fetch({ limit: 100 });
                const sortedMessages = messages.sort(
                    (a, b) => a.createdTimestamp - b.createdTimestamp,
                );

                for (const msg of sortedMessages.values()) {
                    const author = msg.author;
                    const timestamp = new Date(
                        msg.createdTimestamp,
                    ).toLocaleString();

                    if (msg.embeds.length > 0 && msg.author.bot) {
                        // Skip system embeds but keep user messages
                        continue;
                    }

                    transcript += `[${timestamp}] ${author.tag}: ${msg.content}\n`;

                    if (msg.attachments.size > 0) {
                        transcript += `  Attachments: ${Array.from(
                            msg.attachments.values(),
                        )
                            .map((att) => att.name)
                            .join(", ")}\n`;
                    }
                    transcript += `\n`;
                }
            } catch (error) {
                transcript += `Error fetching channel messages: ${error.message}\n`;
            }
        } else {
            transcript += `Channel not found or already deleted.\n`;
        }

        transcript += `==================\n`;
        transcript += `END OF TRANSCRIPT\n`;

        return transcript;
    } catch (error) {
        console.error("Error creating channel transcript:", error);
        return `Error creating transcript for ticket ${ticket.id}`;
    }
}

async function handleClaimTicket(interaction, ticketId) {
    try {
        if (!hasAdminRole(interaction)) {
            return await interaction.reply({
                content: "❌ Only staff members can claim tickets!",
                ephemeral: true,
            });
        }

        const ticket = activeTickets.get(ticketId);
        if (!ticket) {
            return await interaction.reply({
                content: "❌ Ticket not found!",
                ephemeral: true,
            });
        }

        if (ticket.claimedBy) {
            const claimedUser = await client.users.fetch(ticket.claimedBy);
            return await interaction.reply({
                content: `❌ This ticket is already claimed by ${claimedUser.tag}!`,
                ephemeral: true,
            });
        }

        // Claim the ticket
        ticket.claimedBy = interaction.user.id;
        ticket.claimedAt = new Date().toISOString();

        const embed = new EmbedBuilder()
            .setTitle("👮 Ticket Claimed")
            .setDescription(
                `**Ticket ID:** \`${ticketId}\`\n**Claimed by:** ${interaction.user}\n**Status:** 🟡 In Progress\n\n${interaction.user} is now handling this ticket.`,
            )
            .setColor(0xffaa00)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
        await logTicketAction(
            ticketId,
            "claimed",
            interaction.user,
            `Ticket claimed by staff member`,
        );
    } catch (error) {
        console.error("Error claiming ticket:", error);
        await interaction.reply({
            content: "❌ An error occurred while claiming the ticket.",
            ephemeral: true,
        });
    }
}

async function handleCloseTicketCommand(interaction) {
    // For slash command, check if user has an active ticket
    const userTicket = Array.from(activeTickets.values()).find(
        (ticket) =>
            ticket.userId === interaction.user.id && ticket.status === "open",
    );

    if (!userTicket) {
        return await interaction.reply({
            content: "❌ You don't have any active tickets to close!",
            ephemeral: true,
        });
    }

    await handleCloseTicket(interaction, userTicket.id);
}

async function handleTicketInfo(interaction) {
    // For slash command, show user's active ticket info
    const userTicket = Array.from(activeTickets.values()).find(
        (ticket) =>
            ticket.userId === interaction.user.id && ticket.status === "open",
    );

    if (!userTicket) {
        return await interaction.reply({
            content: "❌ You don't have any active tickets!",
            ephemeral: true,
        });
    }

    await handleTicketInfoButton(interaction, userTicket.id);
}

async function handleTicketInfoButton(interaction, ticketId) {
    try {
        const ticket = activeTickets.get(ticketId);
        if (!ticket) {
            return await interaction.reply({
                content: "❌ Ticket not found!",
                ephemeral: true,
            });
        }

        const config = TICKET_TYPES[ticket.type];
        const creator = await client.users.fetch(ticket.userId);
        let claimedInfo = "None";

        if (ticket.claimedBy) {
            const claimedUser = await client.users.fetch(ticket.claimedBy);
            claimedInfo = `${claimedUser.tag} (<t:${Math.floor(new Date(ticket.claimedAt).getTime() / 1000)}:R>)`;
        }

        const embed = new EmbedBuilder()
            .setTitle("ℹ️ Ticket Information")
            .setDescription(`**Ticket ID:** \`${ticket.id}\``)
            .addFields(
                { name: "👤 Creator", value: `${creator.tag}`, inline: true },
                { name: "📝 Type", value: config.name, inline: true },
                {
                    name: "📊 Status",
                    value: ticket.status === "open" ? "🟢 Open" : "🔴 Closed",
                    inline: true,
                },
                { name: "👮 Claimed By", value: claimedInfo, inline: true },
                {
                    name: "📅 Created",
                    value: `<t:${Math.floor(new Date(ticket.createdAt).getTime() / 1000)}:R>`,
                    inline: true,
                },
                { name: "📂 Category", value: config.category, inline: true },
                {
                    name: "💬 Messages",
                    value: `${ticket.messages?.length || 0}`,
                    inline: true,
                },
                { name: "📍 Location", value: "DM-based ticket", inline: true },
            )
            .setColor(config.color)
            .setThumbnail(creator.displayAvatarURL())
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
        console.error("Error getting ticket info:", error);
        await interaction.reply({
            content: "❌ An error occurred while fetching ticket information.",
            ephemeral: true,
        });
    }
}

async function handleAdminRespondButton(interaction, ticketId) {
    try {
        const ticket = activeTickets.get(ticketId);
        if (!ticket) {
            return await interaction.reply({
                content: "❌ Ticket not found!",
                ephemeral: true,
            });
        }

        const modal = new ModalBuilder()
            .setCustomId(`admin_response_${ticketId}`)
            .setTitle(`Respond to Ticket ${ticketId}`);

        const responseInput = new TextInputBuilder()
            .setCustomId("response_message")
            .setLabel("Your Response to User")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("Type your response to the user here...")
            .setRequired(true)
            .setMaxLength(2000);

        modal.addComponents(
            new ActionRowBuilder().addComponents(responseInput),
        );
        await interaction.showModal(modal);
    } catch (error) {
        console.error("Error showing admin response modal:", error);
        await interaction.reply({
            content: "❌ An error occurred.",
            ephemeral: true,
        });
    }
}

async function sendTicketPanel() {
    const ticketChannel = client.channels.cache.get(CHANNELS.tickets);
    if (ticketChannel) {
        const embed = new EmbedBuilder()
            .setTitle("🎫 Get Support")
            .setDescription(
                "**Click on the button corresponding to the type of ticket you wish to open.**\n\nOur support team is here to help you with any issues or questions you may have. Please select the appropriate category below to create your support ticket.",
            )
            .addFields(
                {
                    name: "💬 Report a user",
                    value: "Report inappropriate behavior, rule violations, or other user-related issues.",
                    inline: false,
                },
                {
                    name: "👁️ Ban Appeal",
                    value: "Appeal a ban or punishment you believe was unfair or incorrect.",
                    inline: false,
                },
                {
                    name: "❓ Questions!",
                    value: "General questions about the server, rules, or how things work.",
                    inline: false,
                },
            )
            .setColor(0x0099ff)
            .setThumbnail(
                "https://cdn.discordapp.com/attachments/1000000000000000000/1000000000000000000/ticket-icon.png",
            )
            .setFooter({
                text: "Support tickets are monitored by our staff team",
            })
            .setTimestamp();

        const selectMenu = createTicketSelectMenu();

        await ticketChannel.send({
            embeds: [embed],
            components: [selectMenu],
        });
        console.log("✅ Ticket support panel sent");
    }
}

async function cleanupGiftCardSupportTicketInteractions() {
    // Specific cleanup for gift card support ticket interactions
    console.log("🧹 Starting Gift Card Support Ticket interaction cleanup...");

    const giftCardChannel = client.channels.cache.get(CHANNELS.gift_cards);
    const verificationChannel = client.channels.cache.get(
        CHANNELS.gift_card_verification,
    );

    const channelsToClean = [giftCardChannel, verificationChannel].filter(
        Boolean,
    );

    for (const channel of channelsToClean) {
        try {
            console.log(
                `🧹 Cleaning gift card support ticket interactions in: ${channel.name}`,
            );

            let totalCleaned = 0;
            let lastMessageId = null;

            while (true) {
                const fetchOptions = { limit: 100 };
                if (lastMessageId) {
                    fetchOptions.before = lastMessageId;
                }

                const fetched = await channel.messages.fetch(fetchOptions);
                if (fetched.size === 0) break;

                const ticketMessages = fetched.filter((msg) => {
                    const content = msg.content.toLowerCase();
                    const hasEmbeds = msg.embeds.length > 0;

                    // Specifically target gift card support ticket related messages
                    const supportTicketPatterns = [
                        "gift card support ticket",
                        "support ticket",
                        "how to get your gift card",
                        "admin approval",
                        "contact an admin",
                        "wait for admin approval",
                        "receive your gift card code",
                        "🎫",
                        "ticket",
                        "support",
                        "approval",
                        "generate gift card",
                        "redeem gift card",
                        "convert points",
                    ];

                    const hasTicketPattern = supportTicketPatterns.some(
                        (pattern) => content.includes(pattern),
                    );

                    // Check for ticket-related embeds
                    const hasTicketEmbed = msg.embeds.some(
                        (embed) =>
                            embed.title?.includes("Support Ticket") ||
                            embed.title?.includes("Gift Card") ||
                            embed.description?.includes("support ticket") ||
                            embed.description?.includes("admin approval"),
                    );

                    return (
                        hasTicketPattern ||
                        hasTicketEmbed ||
                        (msg.author.bot &&
                            hasEmbeds &&
                            msg.embeds.some((e) =>
                                e.title?.includes("Gift Card"),
                            ))
                    );
                });

                if (ticketMessages.size > 0) {
                    // Delete ticket-related messages
                    for (const msg of ticketMessages.values()) {
                        try {
                            await msg.delete();
                            totalCleaned++;
                            await new Promise((resolve) =>
                                setTimeout(resolve, 500),
                            );
                        } catch (error) {
                            // Ignore delete errors
                        }
                    }
                }

                lastMessageId = fetched.last()?.id;
                if (fetched.size < 100) break;

                await new Promise((resolve) => setTimeout(resolve, 1000));
            }

            if (totalCleaned > 0) {
                console.log(
                    `✅ Cleaned ${totalCleaned} gift card support ticket interactions from ${channel.name}`,
                );
            }
        } catch (error) {
            console.log(
                `❌ Error cleaning gift card support tickets in ${channel.name}:`,
                error.message,
            );
        }
    }
}

async function sendStartupPanels() {
    console.log("🚀 Bot startup sequence initiated...");
    console.log("🧹 Phase 1: Complete channel cleanup");
    await cleanupOldPanels();

    // AUTOMATIC DEEP CLEANING of admin reports channel (1392501395369885698)
    console.log(
        "🧹 Phase 1a: AUTOMATIC DEEP CLEANING of admin reports channel...",
    );
    await performCompleteAdminChannelCleanup();

    // Special complete cleanup for gift cards channel
    console.log("🧹 Phase 1b: Complete gift cards channel cleanup...");
    await performCompleteChannelCleanup(CHANNELS.gift_cards);

    // Phase 1c: Specific cleanup for gift card support ticket interactions
    console.log("🧹 Phase 1c: Gift card support ticket interaction cleanup...");
    await cleanupGiftCardSupportTicketInteractions();

    console.log("📋 Phase 2: Deploying fresh panels");
    await sendDailyClaimPanel();
    await sendGamblingPanel();
    await sendGiftCardPanel();
    await sendLeaderboardPanel();
    await sendInfoPanel();
    await sendAdminGiftCardPanel();
    await sendPointDropTicketPanel();
    await sendAdminTrackingPanel(); // Add admin tracking panel
    await sendTicketPanel(); // Add ticket support panel

    console.log(
        "✅ Bot startup sequence completed - All systems fresh and operational!",
    );
}

// Secure approach using environment variable from Secrets:
const token = process.env.DISCORD_TOKEN || "bot_token";
client.login(token);

///
