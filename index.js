
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

// Bot configuration
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Data file path
const DATA_FILE = 'bot_data.json';

// Channel configuration - Update these with your channel IDs
const CHANNELS = {
    daily_claims: '1386661611506237480',
    point_drops: '1386661687356030976',
    leaderboard: '1386368897447493783',
    transfers: '1386365076268908564',
    gambling: '1386724089980387522',
    general: null // Can be set to allow leaderboard from general channel
};

// Gift card options
const GIFT_CARDS = {
    steam: { name: 'Steam Gift Card', cost: 1000, emoji: '🎮' },
    amazon: { name: 'Amazon Gift Card', cost: 1500, emoji: '📦' },
    spotify: { name: 'Spotify Premium', cost: 800, emoji: '🎵' },
    netflix: { name: 'Netflix Subscription', cost: 1200, emoji: '🎬' },
    google: { name: 'Google Play Card', cost: 900, emoji: '📱' }
};

class PointsBot {
    constructor() {
        this.data = {
            users: {},
            settings: {
                daily_reward: 50,
                max_streak_multiplier: 3.0,
                conversion_rate: 100,
                drop_channel_id: null
            },
            gift_card_requests: {}
        };
        this.loadData();
    }

    async saveData() {
        try {
            await fs.writeFile(DATA_FILE, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('Error saving data:', error);
        }
    }

    async loadData() {
        try {
            const data = await fs.readFile(DATA_FILE, 'utf8');
            const loadedData = JSON.parse(data);
            this.data = { ...this.data, ...loadedData };
            console.log(`Loaded data for ${Object.keys(this.data.users).length} users`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('No existing data file found, starting fresh');
            } else {
                console.error('Error loading data:', error);
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
                gift_cards_redeemed: []
            };
        }
        return this.data.users[userIdStr];
    }

    calculateStreakMultiplier(streak) {
        const maxMultiplier = this.data.settings.max_streak_multiplier;
        return Math.min(1 + (streak * 0.1), maxMultiplier);
    }
}

const pointsSystem = new PointsBot();

// Auto-save every 5 minutes
setInterval(async () => {
    await pointsSystem.saveData();
}, 5 * 60 * 1000);

// Utility functions
function createDailyClaimButtons() {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('claim_daily')
                .setLabel('Claim Daily Diamonds')
                .setStyle(ButtonStyle.Success)
                .setEmoji('💎')
        );
}

function createGamblingButtons() {
    const row1 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('dice_game')
                .setLabel('🎲 Dice Game')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🎲'),
            new ButtonBuilder()
                .setCustomId('coinflip_game')
                .setLabel('🪙 Coinflip Game')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🪙'),
            new ButtonBuilder()
                .setCustomId('slots_game')
                .setLabel('🎰 Lucky Slots')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🎰')
        );

    const row2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('game_details')
                .setLabel('📊 Game Details')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📊')
        );

    return [row1, row2];
}

function createGiftCardSelect() {
    const options = Object.entries(GIFT_CARDS).map(([type, card]) => ({
        label: `${card.name} - ${card.cost} 💎`,
        description: `Cost: ${card.cost} Diamonds`,
        emoji: card.emoji,
        value: type
    }));

    return new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('gift_card_select')
                .setPlaceholder('🎁 Choose a gift card to redeem...')
                .addOptions(options)
        );
}

// Event handlers
client.once('ready', async () => {
    console.log(`${client.user.tag} has connected to Discord!`);
    console.log(`Bot is in ${client.guilds.cache.size} guilds`);

    // Register slash commands
    const commands = [
        new SlashCommandBuilder()
            .setName('claim_daily')
            .setDescription('Claim your daily reward and streak bonus'),
        
        new SlashCommandBuilder()
            .setName('get_points')
            .setDescription('Check your points or another user\'s points')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('User to check points for')
                    .setRequired(false)
            ),
        
        new SlashCommandBuilder()
            .setName('transfer_points')
            .setDescription('Send points to another user')
            .addUserOption(option =>
                option.setName('recipient')
                    .setDescription('User to send points to')
                    .setRequired(true)
            )
            .addIntegerOption(option =>
                option.setName('amount')
                    .setDescription('Amount of points to send')
                    .setRequired(true)
                    .setMinValue(1)
            ),
        
        new SlashCommandBuilder()
            .setName('gambling_menu')
            .setDescription('Access the 3D gambling menu with all game options'),
        
        new SlashCommandBuilder()
            .setName('redeem_gift_card')
            .setDescription('Convert your diamonds to gift cards'),
        
        new SlashCommandBuilder()
            .setName('leaderboard')
            .setDescription('View the points leaderboard'),
        
        new SlashCommandBuilder()
            .setName('drop_points')
            .setDescription('Admin: Start a point drop session')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
        new SlashCommandBuilder()
            .setName('send_daily_claim')
            .setDescription('Admin: Manually send daily claim button to channel')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    ];

    try {
        await client.application.commands.set(commands);
        console.log(`Registered ${commands.length} slash commands`);
    } catch (error) {
        console.error('Failed to register commands:', error);
    }

    // Send startup panels
    setTimeout(sendStartupPanels, 10000);
});

// Interaction handlers
client.on('interactionCreate', async interaction => {
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
            case 'claim_daily':
                await handleDailyClaim(interaction);
                break;
            case 'get_points':
                await handleGetPoints(interaction);
                break;
            case 'transfer_points':
                await handleTransferPoints(interaction);
                break;
            case 'gambling_menu':
                await handleGamblingMenu(interaction);
                break;
            case 'redeem_gift_card':
                await handleRedeemGiftCard(interaction);
                break;
            case 'leaderboard':
                await handleLeaderboard(interaction);
                break;
            case 'drop_points':
                await handleDropPoints(interaction);
                break;
            case 'send_daily_claim':
                await handleSendDailyClaim(interaction);
                break;
        }
    } catch (error) {
        console.error('Error handling slash command:', error);
        const embed = new EmbedBuilder()
            .setTitle('❌ Error')
            .setDescription('An error occurred while processing your command.')
            .setColor(0xFF0000);
        
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
            case 'claim_daily':
                await handleDailyClaimButton(interaction);
                break;
            case 'dice_game':
                await showDiceModal(interaction);
                break;
            case 'coinflip_game':
                await showCoinflipModal(interaction);
                break;
            case 'slots_game':
                await handleSlotsGame(interaction);
                break;
            case 'game_details':
                await showGameDetails(interaction);
                break;
        }
    } catch (error) {
        console.error('Error handling button interaction:', error);
    }
}

async function handleSelectMenuInteraction(interaction) {
    if (interaction.customId === 'gift_card_select') {
        await handleGiftCardSelection(interaction);
    }
}

async function handleModalSubmit(interaction) {
    const { customId } = interaction;

    try {
        if (customId === 'dice_modal') {
            await handleDiceGame(interaction);
        } else if (customId === 'coinflip_modal') {
            await handleCoinflipGame(interaction);
        }
    } catch (error) {
        console.error('Error handling modal submit:', error);
    }
}

// Command implementations
async function handleDailyClaim(interaction) {
    if (interaction.channelId !== CHANNELS.daily_claims) {
        const embed = new EmbedBuilder()
            .setTitle('❌ Wrong Channel')
            .setDescription(`Please use this command in <#${CHANNELS.daily_claims}>`)
            .setColor(0xFF0000);
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
            const nextClaim = new Date(lastClaim.getTime() + 24 * 60 * 60 * 1000);
            const embed = new EmbedBuilder()
                .setTitle('⏰ Daily Claim Cooldown')
                .setDescription(`You can claim again <t:${Math.floor(nextClaim.getTime() / 1000)}:R>`)
                .setColor(0xFF0000);
            return await interaction.reply({ embeds: [embed], ephemeral: true });
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
        .setTitle('💎 Daily Diamond Claim!')
        .setDescription(`**Reward:** ${totalReward} 💎\n${interaction.user} claimed their daily diamonds!`)
        .addFields(
            { name: '💰 Reward', value: `${totalReward} 💎`, inline: true },
            { name: '🔥 Streak', value: `${userData.streak} days`, inline: true },
            { name: '📈 Multiplier', value: `${multiplier.toFixed(1)}x`, inline: true }
        )
        .setColor(0xFFD700);

    await interaction.reply({ embeds: [embed] });
    await pointsSystem.saveData();
}

async function handleGetPoints(interaction) {
    if (interaction.channelId !== CHANNELS.transfers) {
        const embed = new EmbedBuilder()
            .setTitle('❌ Wrong Channel')
            .setDescription(`Please use this command in <#${CHANNELS.transfers}>`)
            .setColor(0xFF0000);
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const targetUser = interaction.options.getUser('user') || interaction.user;
    const userData = pointsSystem.getUserData(targetUser.id);

    const embed = new EmbedBuilder()
        .setTitle(`💎 ${targetUser.displayName}'s Points`)
        .setDescription(`**3D Wallet:**\n\`\`\`\n╔══════════════╗\n║ 💎 ${userData.points.toLocaleString()} Diamonds ║\n║══════════════║\n║ 🔥 ${userData.streak} Day Streak ║\n╚══════════════╝\n\`\`\``)
        .addFields(
            { name: '📊 Total Earned', value: `${userData.total_earned.toLocaleString()} 💎`, inline: true },
            { name: '💸 Total Spent', value: `${userData.total_spent.toLocaleString()} 💎`, inline: true },
            { name: '🎁 Gift Cards', value: `${userData.gift_cards_redeemed?.length || 0}`, inline: true }
        )
        .setColor(0x0099FF);

    await interaction.reply({ embeds: [embed] });
}

async function handleTransferPoints(interaction) {
    if (interaction.channelId !== CHANNELS.transfers) {
        const embed = new EmbedBuilder()
            .setTitle('❌ Wrong Channel')
            .setDescription(`Please use this command in <#${CHANNELS.transfers}>`)
            .setColor(0xFF0000);
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const recipient = interaction.options.getUser('recipient');
    const amount = interaction.options.getInteger('amount');

    if (recipient.id === interaction.user.id) {
        return await interaction.reply({ content: "❌ You can't transfer points to yourself!", ephemeral: true });
    }

    const senderData = pointsSystem.getUserData(interaction.user.id);

    if (senderData.points < amount) {
        return await interaction.reply({ content: `❌ Insufficient points! You have ${senderData.points} Diamonds.`, ephemeral: true });
    }

    const recipientData = pointsSystem.getUserData(recipient.id);

    senderData.points -= amount;
    senderData.total_spent += amount;
    recipientData.points += amount;
    recipientData.total_earned += amount;

    const embed = new EmbedBuilder()
        .setTitle('💸 Points Transferred!')
        .setDescription(`**3D Transfer Animation:**\n\`\`\`\n${interaction.user.displayName.substring(0, 8)}\n    ↓ ${amount} 💎\n${recipient.displayName.substring(0, 8)}\n\`\`\`\nTransfer complete!`)
        .setColor(0x00FF00);

    await interaction.reply({ embeds: [embed] });
    await pointsSystem.saveData();
}

async function handleGamblingMenu(interaction) {
    if (interaction.channelId !== CHANNELS.gambling) {
        const embed = new EmbedBuilder()
            .setTitle('❌ Wrong Channel')
            .setDescription(`Please use this command in <#${CHANNELS.gambling}>`)
            .setColor(0xFF0000);
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const userData = pointsSystem.getUserData(interaction.user.id);

    const embed = new EmbedBuilder()
        .setTitle('🎰 3D Casino Menu')
        .setDescription(`**Welcome to the Diamond Casino!**\n\`\`\`\n    🎰 CASINO 🎰\n  ╔═══════════════╗\n  ║ 🎲  🪙  🎰 ║\n  ║ Dice Coin Slot ║\n  ╚═══════════════╝\n\`\`\`\n**Your Balance:** ${userData.points} 💎\n\nClick a button below to play!`)
        .setColor(0x800080);

    const components = createGamblingButtons();
    await interaction.reply({ embeds: [embed], components });
}

async function showDiceModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('dice_modal')
        .setTitle('🎲 Dice Game Setup');

    const guessInput = new TextInputBuilder()
        .setCustomId('guess')
        .setLabel('Your Guess (1-6)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter a number between 1 and 6...')
        .setRequired(true)
        .setMaxLength(1);

    const betInput = new TextInputBuilder()
        .setCustomId('bet')
        .setLabel('Bet Amount (Minimum 10 Diamonds)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter your bet amount (min 10)...')
        .setRequired(true)
        .setMaxLength(10);

    modal.addComponents(
        new ActionRowBuilder().addComponents(guessInput),
        new ActionRowBuilder().addComponents(betInput)
    );

    await interaction.showModal(modal);
}

async function showCoinflipModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('coinflip_modal')
        .setTitle('🪙 Coinflip Game Setup');

    const choiceInput = new TextInputBuilder()
        .setCustomId('choice')
        .setLabel('Your Choice (heads/tails or H/T)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter heads, tails, H, or T...')
        .setRequired(true)
        .setMaxLength(5);

    const betInput = new TextInputBuilder()
        .setCustomId('bet')
        .setLabel('Bet Amount (Minimum 10 Diamonds)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter your bet amount (min 10)...')
        .setRequired(true)
        .setMaxLength(10);

    modal.addComponents(
        new ActionRowBuilder().addComponents(choiceInput),
        new ActionRowBuilder().addComponents(betInput)
    );

    await interaction.showModal(modal);
}

async function handleDiceGame(interaction) {
    const guess = parseInt(interaction.fields.getTextInputValue('guess'));
    const bet = parseInt(interaction.fields.getTextInputValue('bet'));

    if (isNaN(guess) || guess < 1 || guess > 6) {
        return await interaction.reply({ content: '❌ Guess must be between 1 and 6!', ephemeral: true });
    }

    if (isNaN(bet) || bet < 10) {
        return await interaction.reply({ content: '❌ Minimum bet is 10 diamonds!', ephemeral: true });
    }

    const userData = pointsSystem.getUserData(interaction.user.id);

    if (userData.points < bet) {
        return await interaction.reply({ content: `❌ Insufficient points! You have ${userData.points} 💎 but need ${bet} 💎`, ephemeral: true });
    }

    const result = Math.floor(Math.random() * 6) + 1;
    const won = guess === result;

    const diceFaces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

    let embed;
    if (won) {
        const winnings = bet * 5;
        userData.points += winnings;
        userData.total_earned += winnings;
        embed = new EmbedBuilder()
            .setTitle('🎲 LUCKY DICE! You Won!')
            .setDescription(`**🎲 Dice Game Result 🎲**\n**Your Guess:** ${guess} ${diceFaces[guess-1]} ✅\n**Dice Result:** ${result} ${diceFaces[result-1]}\n**Won:** ${winnings} 💎 (5x multiplier!)`)
            .addFields(
                { name: '💰 New Balance', value: `${userData.points} 💎`, inline: true },
                { name: '🎯 Bet Amount', value: `${bet} 💎`, inline: true }
            )
            .setColor(0x00FF00);
    } else {
        userData.points -= bet;
        userData.total_spent += bet;
        embed = new EmbedBuilder()
            .setTitle('🎲 Dice Roll - Try Again!')
            .setDescription(`**🎲 Dice Game Result 🎲**\n**Your Guess:** ${guess} ${diceFaces[guess-1]} ❌\n**Dice Result:** ${result} ${diceFaces[result-1]}\n**Lost:** ${bet} 💎`)
            .addFields(
                { name: '💰 New Balance', value: `${userData.points} 💎`, inline: true },
                { name: '🎯 Bet Amount', value: `${bet} 💎`, inline: true }
            )
            .setColor(0xFF0000);
    }

    await interaction.reply({ embeds: [embed] });
    await pointsSystem.saveData();
}

async function handleCoinflipGame(interaction) {
    const choiceInput = interaction.fields.getTextInputValue('choice').toLowerCase().trim();
    const bet = parseInt(interaction.fields.getTextInputValue('bet'));

    let userChoice;
    if (['heads', 'h'].includes(choiceInput)) {
        userChoice = 'heads';
    } else if (['tails', 't'].includes(choiceInput)) {
        userChoice = 'tails';
    } else {
        return await interaction.reply({ content: "❌ Choice must be 'heads', 'tails', 'H', or 'T'!\n**Suggestions:** H (Heads) or T (Tails)", ephemeral: true });
    }

    if (isNaN(bet) || bet < 10) {
        return await interaction.reply({ content: '❌ Minimum bet is 10 diamonds!', ephemeral: true });
    }

    const userData = pointsSystem.getUserData(interaction.user.id);

    if (userData.points < bet) {
        return await interaction.reply({ content: `❌ Insufficient points! You have ${userData.points} 💎`, ephemeral: true });
    }

    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    const won = userChoice === result;

    const choiceIcons = { heads: '👑', tails: '💰' };
    const choiceLetters = { heads: 'H', tails: 'T' };

    let embed;
    if (won) {
        const winnings = bet * 2;
        userData.points += winnings;
        userData.total_earned += winnings;
        embed = new EmbedBuilder()
            .setTitle('🪙 PERFECT FLIP! You Won!')
            .setDescription(`**🪙 Coinflip Game Result 🪙**\n**Your Choice:** ${choiceLetters[userChoice]} (${userChoice.charAt(0).toUpperCase() + userChoice.slice(1)}) ${choiceIcons[userChoice]} ✅\n**Coin Result:** ${choiceLetters[result]} (${result.charAt(0).toUpperCase() + result.slice(1)}) ${choiceIcons[result]}\n**Won:** ${winnings} 💎 (2x multiplier!)`)
            .addFields(
                { name: '💰 New Balance', value: `${userData.points} 💎`, inline: true },
                { name: '🎯 Bet Amount', value: `${bet} 💎`, inline: true }
            )
            .setColor(0x00FF00);
    } else {
        userData.points -= bet;
        userData.total_spent += bet;
        embed = new EmbedBuilder()
            .setTitle('🪙 Coin Flip - Next Time!')
            .setDescription(`**🪙 Coinflip Game Result 🪙**\n**Your Choice:** ${choiceLetters[userChoice]} (${userChoice.charAt(0).toUpperCase() + userChoice.slice(1)}) ${choiceIcons[userChoice]} ❌\n**Coin Result:** ${choiceLetters[result]} (${result.charAt(0).toUpperCase() + result.slice(1)}) ${choiceIcons[result]}\n**Lost:** ${bet} 💎`)
            .addFields(
                { name: '💰 New Balance', value: `${userData.points} 💎`, inline: true },
                { name: '🎯 Bet Amount', value: `${bet} 💎`, inline: true }
            )
            .setColor(0xFF0000);
    }

    await interaction.reply({ embeds: [embed] });
    await pointsSystem.saveData();
}

async function handleSlotsGame(interaction) {
    const userData = pointsSystem.getUserData(interaction.user.id);
    const bet = 30;

    if (userData.points < bet) {
        return await interaction.reply({ content: `❌ You need ${bet} 💎 to play! You have ${userData.points} 💎`, ephemeral: true });
    }

    const symbols = ['🍒', '🍋', '🍊', '💎', '⭐', '🍀'];
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
        if (reels[0] === '💎') multiplier = 10;
        else if (reels[0] === '⭐') multiplier = 8;
        else if (reels[0] === '🍀') multiplier = 12;
        else multiplier = 3;
    } else if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) {
        multiplier = 1.5;
    }

    const winnings = Math.floor(bet * multiplier);

    let embed;
    if (winnings > 0) {
        userData.points += winnings - bet;
        userData.total_earned += winnings;
        embed = new EmbedBuilder()
            .setTitle(multiplier >= 8 ? '🎰 JACKPOT!' : '🎰 Slots Winner!')
            .setDescription(`**Slot Result:** ${reels[0]} ${reels[1]} ${reels[2]}\n**Won:** ${winnings} 💎 (${multiplier}x!)`)
            .addFields({ name: '💰 Balance', value: `${userData.points} 💎`, inline: true })
            .setColor(0x00FF00);
    } else {
        userData.points -= bet;
        userData.total_spent += bet;
        embed = new EmbedBuilder()
            .setTitle('🎰 Slots - Spin Again!')
            .setDescription(`**Slot Result:** ${reels[0]} ${reels[1]} ${reels[2]}\n**Lost:** ${bet} 💎`)
            .addFields({ name: '💰 Balance', value: `${userData.points} 💎`, inline: true })
            .setColor(0xFF0000);
    }

    await interaction.reply({ embeds: [embed] });
    await pointsSystem.saveData();
}

async function showGameDetails(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('🎮 Casino Games Details')
        .setDescription('**Choose Your Stakes!**')
        .addFields(
            { name: '🎲 Dice Game', value: '• Choose number 1-6\n• Minimum bet: 10 💎\n• Win: 5x your bet\n• Form opens on click', inline: true },
            { name: '🪙 Coinflip Game', value: '• Pick H/T or heads/tails\n• Minimum bet: 10 💎\n• Win: 2x your bet\n• Form opens on click', inline: true },
            { name: '🎰 Lucky Slots', value: '• Auto-spin reels\n• Fixed bet: 30 💎\n• Win: Up to 12x bet\n• Instant play', inline: true }
        )
        .setColor(0x0099FF);

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleRedeemGiftCard(interaction) {
    const userData = pointsSystem.getUserData(interaction.user.id);

    const embed = new EmbedBuilder()
        .setTitle('🎁 Gift Card Redemption Center')
        .setDescription(`**Your Balance:** ${userData.points} 💎\n\n**Available Gift Cards:**\n\n\`\`\`\n🎁 GIFT CARD STORE 🎁\n╔══════════════════╗\n║ Choose your reward! ║\n╚══════════════════╝\n\`\`\`\nSelect a gift card from the dropdown below:`)
        .setColor(0xFFD700);

    // Show available gift cards
    Object.entries(GIFT_CARDS).forEach(([type, card]) => {
        const affordable = userData.points >= card.cost ? '✅' : '❌';
        embed.addFields({ name: `${card.emoji} ${card.name}`, value: `${affordable} ${card.cost} 💎`, inline: true });
    });

    const component = createGiftCardSelect();
    await interaction.reply({ embeds: [embed], components: [component] });
}

async function handleGiftCardSelection(interaction) {
    const cardType = interaction.values[0];
    const card = GIFT_CARDS[cardType];
    const userData = pointsSystem.getUserData(interaction.user.id);

    if (userData.points < card.cost) {
        const embed = new EmbedBuilder()
            .setTitle('❌ Insufficient Diamonds')
            .setDescription(`You need ${card.cost} 💎 but only have ${userData.points} 💎`)
            .setColor(0xFF0000);
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Deduct points
    userData.points -= card.cost;
    userData.total_spent += card.cost;
    if (!userData.gift_cards_redeemed) userData.gift_cards_redeemed = [];
    userData.gift_cards_redeemed.push({
        type: cardType,
        name: card.name,
        cost: card.cost,
        date: new Date().toISOString()
    });

    // Send DM to user
    let dmSent = false;
    try {
        const dmEmbed = new EmbedBuilder()
            .setTitle('🎉 Gift Card Redeemed Successfully!')
            .setDescription(`**${card.name}** has been redeemed!\n\n**Details:**\n• Cost: ${card.cost} 💎\n• Date: ${new Date().toLocaleString()}\n• Remaining Diamonds: ${userData.points} 💎`)
            .addFields({ name: '📧 Next Steps', value: 'An administrator will contact you within 24 hours to process your gift card delivery. Please keep this message for reference.', inline: false })
            .setFooter({ text: 'Thank you for using our points system!' })
            .setColor(0x00FF00);

        await interaction.user.send({ embeds: [dmEmbed] });
        dmSent = true;
    } catch (error) {
        console.log('Could not send DM to user');
    }

    // Store request for admin processing
    pointsSystem.data.gift_card_requests[interaction.user.id] = {
        user_id: interaction.user.id,
        username: interaction.user.displayName,
        card_type: cardType,
        card_name: card.name,
        cost: card.cost,
        timestamp: new Date().toISOString(),
        status: 'pending'
    };

    // Response embed
    const embed = new EmbedBuilder()
        .setTitle('✅ Gift Card Redeemed!')
        .setDescription(`Successfully redeemed **${card.name}**!`)
        .addFields(
            { name: 'Cost', value: `${card.cost} 💎`, inline: true },
            { name: 'Remaining', value: `${userData.points} 💎`, inline: true }
        )
        .setColor(0x00FF00);

    if (dmSent) {
        embed.addFields({ name: '📧 Check DM', value: 'Details sent to your DM!', inline: false });
    } else {
        embed.addFields({ name: '⚠️ DM Failed', value: "Couldn't send DM. Please enable DMs from server members.", inline: false });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
    await pointsSystem.saveData();
}

async function handleLeaderboard(interaction) {
    const allowedChannels = [CHANNELS.leaderboard];
    if (CHANNELS.general) allowedChannels.push(CHANNELS.general);

    if (!allowedChannels.includes(interaction.channelId)) {
        const embed = new EmbedBuilder()
            .setTitle('❌ Wrong Channel')
            .setDescription(`Please use this command in <#${CHANNELS.leaderboard}>${CHANNELS.general ? ` or <#${CHANNELS.general}>` : ''}`)
            .setColor(0xFF0000);
        return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const usersData = pointsSystem.data.users;
    const sortedUsers = Object.entries(usersData)
        .sort(([,a], [,b]) => b.points - a.points)
        .slice(0, 10);

    const embed = new EmbedBuilder()
        .setTitle('🏆 3D Diamond Leaderboard')
        .setDescription('**Top 10 Richest Players**\n```\n    🏆 LEADERBOARD 🏆\n  ╔═══════════════════╗\n  ║ 👑 DIAMOND ELITE 👑 ║\n  ╚═══════════════════╝\n```')
        .setColor(0xFFD700);

    const medals = ['🥇', '🥈', '🥉'];
    const trophyDesign = ['👑', '💎', '⭐'];

    for (let i = 0; i < sortedUsers.length; i++) {
        const [userId, data] = sortedUsers[i];
        let userDisplay;
        
        try {
            const user = await client.users.fetch(userId);
            userDisplay = `@${user.username}`;
        } catch {
            userDisplay = `User ${userId}`;
        }

        const position = i + 1;
        const positionEmoji = position <= 3 ? medals[position - 1] : `${position}.`;
        const decoration = position <= 3 ? trophyDesign[position - 1] : '💎';

        embed.addFields({
            name: `${positionEmoji} ${userDisplay}`,
            value: `${decoration} ${data.points.toLocaleString()} Diamonds\n🔥 ${data.streak} day streak`,
            inline: false
        });
    }

    await interaction.reply({ embeds: [embed] });
}

async function handleDropPoints(interaction) {
    const dropChannel = client.channels.cache.get(CHANNELS.point_drops);
    if (!dropChannel) {
        return await interaction.reply({ content: '❌ Point drops channel not found!', ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle('⏳ Admin Point Drop Starting!')
        .setDescription('**3D Drop Preview:**\n```\n     💎💎💎\n    ╱ ╲ ╱ ╲\n   ╱   ╲   ╲\n  ╱_____╲___╲\n```\nGet ready! Claiming starts in 5 minutes!')
        .setFooter({ text: `Triggered by ${interaction.user.displayName}` })
        .setColor(0xFFA500);

    const button = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('claim_drop')
                .setLabel('Waiting to Start...')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⏳')
                .setDisabled(true)
        );

    await dropChannel.send({ embeds: [embed], components: [button] });
    await interaction.reply({ content: `✅ Point drop session started in <#${CHANNELS.point_drops}>!`, ephemeral: true });
}

async function handleSendDailyClaim(interaction) {
    const dailyChannel = client.channels.cache.get(CHANNELS.daily_claims);
    if (!dailyChannel) {
        return await interaction.reply({ content: '❌ Daily claims channel not found!', ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle('💎 Daily Diamond Claim Available!')
        .setDescription('**Daily Diamond Reward:**\n```\n╔═══════════╗\n║   💎 50   ║\n║  ╔═════╗  ║\n║  ║ ✨ ✨ ║  ║\n║  ╚═════╝  ║\n╚═══════════╝\n```\n**Your daily diamonds are ready!**\n\nClick the button below to claim your diamonds and maintain your streak!')
        .addFields(
            { name: '💰 Base Reward', value: '50 💎', inline: true },
            { name: '🔥 Streak Bonus', value: 'Up to 3x multiplier!', inline: true },
            { name: '⏰ Manual Trigger', value: 'Admin activated', inline: true }
        )
        .setFooter({ text: `Triggered by ${interaction.user.displayName}` })
        .setColor(0xFFD700);

    const component = createDailyClaimButtons();
    await dailyChannel.send({ embeds: [embed], components: [component] });
    await interaction.reply({ content: `✅ Daily claim button sent to <#${CHANNELS.daily_claims}>!`, ephemeral: true });
}

async function sendStartupPanels() {
    console.log('Sending startup panels...');

    // Daily claims panel
    const dailyChannel = client.channels.cache.get(CHANNELS.daily_claims);
    if (dailyChannel) {
        const embed = new EmbedBuilder()
            .setTitle('💎 24H Daily Diamond Claim Center')
            .setDescription('**Daily Diamond Reward:**\n```\n╔═══════════╗\n║   💎 50   ║\n║  ╔═════╗  ║\n║  ║ ✨ ✨ ║  ║\n║  ╚═════╝  ║\n╚═══════════╝\n```\n**Your daily diamonds are ready!**\n\nClick the button below to claim your diamonds and maintain your streak!')
            .addFields(
                { name: '💰 Base Reward', value: '50 💎', inline: true },
                { name: '🔥 Streak Bonus', value: 'Up to 3x multiplier!', inline: true },
                { name: '⏰ Auto Refresh', value: 'Every 24 hours', inline: true }
            )
            .setFooter({ text: '🤖 Auto-started by bot' })
            .setColor(0xFFD700);

        const component = createDailyClaimButtons();
        await dailyChannel.send({ embeds: [embed], components: [component] });
        console.log('✅ Daily claim panel sent');
    }

    // Gambling panel
    const gamblingChannel = client.channels.cache.get(CHANNELS.gambling);
    if (gamblingChannel) {
        const embed = new EmbedBuilder()
            .setTitle('🎰 Diamond Casino - Gambling Hub')
            .setDescription('**Welcome to the Casino!**\n```\n🎲 ╔═══════════╗ 🪙\n  ║  CASINO   ║\n  ║ ═════════ ║\n  ║ 💎 GAMES 💎 ║\n  ╚═══════════╝\n```\n**Available Games:**')
            .addFields(
                { name: '🎲 Quick Dice', value: 'Guess 1-6 for 5x payout!\nFill form with number & bet', inline: true },
                { name: '🪙 Quick Flip', value: 'Heads or Tails for 2x payout!\nFill form with choice & bet', inline: true },
                { name: '💎 Risk & Reward', value: 'Higher risk = Higher rewards!', inline: false }
            )
            .setFooter({ text: '🎰 Good luck and gamble responsibly!' })
            .setColor(0x800080);

        const components = createGamblingButtons();
        await gamblingChannel.send({ embeds: [embed], components });
        console.log('✅ Gambling panel sent');
    }
}

// Start the bot
const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
    console.error('❌ Error: DISCORD_BOT_TOKEN not found in environment variables!');
    console.error('Please add your bot token in the Secrets tab (🔒 icon in sidebar)');
    console.error('Key: DISCORD_BOT_TOKEN');
    console.error('Value: Your Discord bot token');
    process.exit(1);
}

console.log('🤖 Starting Discord Points Bot...');
client.login(token).catch(error => {
    console.error('❌ Failed to start bot:', error);
    console.error('Please check your bot token and internet connection.');
});
