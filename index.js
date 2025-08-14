// index.js
import dotenv from 'dotenv';
import path from 'path';
import { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder } from 'discord.js';
import schedule from 'node-schedule';

dotenv.config({ path: path.resolve('./.env') });

// ---------- Test environment ----------
console.log('DISCORD_TOKEN:', process.env.DISCORD_TOKEN);
console.log('APP_ID:', process.env.APP_ID);
console.log('GUILD_ID:', process.env.GUILD_ID);
console.log('PARENT_CHANNEL_ID:', process.env.PARENT_CHANNEL_ID);

// ---------- Create REST client ----------
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// ---------- Define Slash Commands ----------
const commands = [
  new SlashCommandBuilder()
    .setName('total')
    .setDescription('显示指定日期开的子区里的所有用户总数')
    .addStringOption(option =>
      option.setName('date')
        .setDescription('必填，YYYY.MM.DD')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('user_total')
    .setDescription('显示指定日期开的子区里指定用户的总数')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('用户')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('date')
        .setDescription('必填，YYYY.MM.DD')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('range_total')
    .setDescription('显示指定日期开的子区里所有用户的总数')
    .addStringOption(option =>
      option.setName('date')
        .setDescription('必填，YYYY.MM.DD')
        .setRequired(true)
    ),
].map(cmd => cmd.toJSON());

// ---------- Register commands ----------
(async () => {
  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.APP_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('✅ Commands registered successfully!');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
})();

// ---------- Create Client ----------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel, Partials.Message]
});

// ---------- Data storage ----------
const dailyTotals = {}; // dailyTotals[YYYY.MM.DD][threadId][messageId] = { userId, num, _replied }
const parentChannelId = process.env.PARENT_CHANNEL_ID;

function formatDate(date) {
  const d = new Date(date);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${yyyy}.${mm}.${dd}`;
}

function getTodayDate() {
  return formatDate(new Date());
}

// ---------- Scan previous messages ----------
async function scanPreviousMessages(thread) {
  const dateStr = formatDate(thread.createdAt);
  if (!dailyTotals[dateStr]) dailyTotals[dateStr] = {};
  if (!dailyTotals[dateStr][thread.id]) dailyTotals[dateStr][thread.id] = {};

  try {
    let lastId;
    while (true) {
      const options = { limit: 100 };
      if (lastId) options.before = lastId;
      const fetched = await thread.messages.fetch(options);
      if (fetched.size === 0) break;
      fetched.forEach(msg => {
        const num = parseFloat(msg.content);
        if (!isNaN(num)) {
          dailyTotals[dateStr][thread.id][msg.id] = { userId: msg.author.id, num };
        }
      });
      lastId = fetched.last()?.id;
      if (fetched.size < 100) break;
    }
  } catch (err) {
    console.error('Scanning previous messages failed:', err);
  }
}

// ---------- Update total for a thread ----------
function updateTotalForThread(dateStr, threadId) {
  const threadData = dailyTotals[dateStr]?.[threadId] || {};
  return Object.values(threadData).reduce((a, b) => a + b.num, 0);
}

// ---------- Thread events ----------
client.on('threadCreate', thread => {
  const dateStr = formatDate(thread.createdAt);
  if (!dailyTotals[dateStr]) dailyTotals[dateStr] = {};
  if (!dailyTotals[dateStr][thread.id]) dailyTotals[dateStr][thread.id] = {};
});

// ---------- Message events ----------
client.on('messageCreate', async msg => {
  if (!msg.channel.isThread()) return;
  const threadId = msg.channel.id;
  const num = parseFloat(msg.content);
  if (isNaN(num)) return;

  const dateStr = formatDate(msg.channel.createdAt); // thread 创建日期
  if (!dailyTotals[dateStr]) dailyTotals[dateStr] = {};
  if (!dailyTotals[dateStr][threadId]) dailyTotals[dateStr][threadId] = {};
  if (!dailyTotals[dateStr][threadId][msg.id]) {
    dailyTotals[dateStr][threadId][msg.id] = { userId: msg.author.id, num };
  }

  const sum = updateTotalForThread(dateStr, threadId);

  // 回复只一次
  if (!dailyTotals[dateStr][threadId][msg.id]._replied) {
    dailyTotals[dateStr][threadId][msg.id]._replied = true;
    msg.reply(`✅ Recorded ${num}. Total for this thread on ${dateStr}: ${sum.toFixed(1)}`);
  }
});

client.on('messageUpdate', async (oldMsg, newMsg) => {
  if (!newMsg.channel.isThread()) return;
  const threadId = newMsg.channel.id;
  const num = parseFloat(newMsg.content);
  if (isNaN(num)) return;

  const dateStr = formatDate(newMsg.channel.createdAt);
  if (!dailyTotals[dateStr]) dailyTotals[dateStr] = {};
  if (!dailyTotals[dateStr][threadId]) dailyTotals[dateStr][threadId] = {};
  dailyTotals[dateStr][threadId][newMsg.id] = { userId: newMsg.author.id, num };

  const sum = updateTotalForThread(dateStr, threadId);

  if (!dailyTotals[dateStr][threadId][newMsg.id]._replied) {
    dailyTotals[dateStr][threadId][newMsg.id]._replied = true;
    newMsg.reply(`✅ Updated ${num}. Total for this thread on ${dateStr}: ${sum.toFixed(1)}`);
  }
});

client.on('messageDelete', async msg => {
  if (!msg.channel.isThread()) return;
  const threadId = msg.channel.id;
  const dateStr = formatDate(msg.channel.createdAt);
  dailyTotals[dateStr]?.[threadId] && delete dailyTotals[dateStr][threadId][msg.id];
});

// ---------- Slash Commands ----------
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options } = interaction;

  if (commandName === 'total') {
    const date = options.getString('date');
    let sum = 0;
    if (dailyTotals[date]) {
      Object.values(dailyTotals[date]).forEach(threadData => {
        sum += Object.values(threadData).reduce((a, b) => a + b.num, 0);
      });
    }
    return interaction.reply(`📊 ${date} total: ${sum.toFixed(1)}`);
  }

  if (commandName === 'user_total') {
    const user = options.getUser('user');
    const date = options.getString('date');
    let total = 0;
    if (dailyTotals[date]) {
      Object.values(dailyTotals[date]).forEach(threadData => {
        Object.values(threadData).forEach(entry => {
          if (entry.userId === user.id) total += entry.num;
        });
      });
    }
    return interaction.reply(`📊 ${user.tag} total on ${date}: ${total.toFixed(1)}`);
  }

  if (commandName === 'range_total') {
    const date = options.getString('date');
    let total = 0;
    if (dailyTotals[date]) {
      Object.values(dailyTotals[date]).forEach(threadData => {
        total += Object.values(threadData).reduce((a, b) => a + b.num, 0);
      });
    }
    return interaction.reply(`📊 Total for all users on ${date}: ${total.toFixed(1)}`);
  }
});

// ---------- Daily 4PM summary ----------
schedule.scheduleJob('0 16 * * *', async () => {
  const today = getTodayDate();
  try {
    const parent = await client.channels.fetch(parentChannelId);
    const fetchedThreads = await parent.threads.fetchActive();
    for (const [id, thread] of fetchedThreads.threads) {
      const sum = updateTotalForThread(formatDate(thread.createdAt), id);
      await thread.send(`📊 Today's total: ${sum.toFixed(1)}`);
    }
  } catch (err) {
    console.error('Daily summary failed:', err);
  }
});

// ---------- Ready event ----------
client.once('ready', async () => {
  console.log(`✅ Bot logged in: ${client.user.tag}`);
  try {
    const parent = await client.channels.fetch(parentChannelId);
    const fetchedThreads = await parent.threads.fetchActive();
    for (const [id, thread] of fetchedThreads.threads) {
      await scanPreviousMessages(thread);
    }

    const botMember = await parent.guild.members.fetch(client.user.id);
    console.log('Bot permissions in parent channel:', botMember.permissionsIn(parent).toArray());
  } catch (err) {
    console.error('Failed to scan threads or check permissions:', err);
  }
});

client.login(process.env.DISCORD_TOKEN);
