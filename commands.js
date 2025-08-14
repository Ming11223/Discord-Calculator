import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const commands = [
  new SlashCommandBuilder()
    .setName('add_number')
    .setDescription('Add a number to your total for today')
    .addNumberOption(option =>
      option.setName('number')
        .setDescription('The number to add')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('total')
    .setDescription('Show today’s total or total for a specific date')
    .addStringOption(option =>
      option.setName('date')
        .setDescription('Optional date YYYY-MM-DD')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('user_total')
    .setDescription('Show a user’s total in a date range')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to check')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('start')
        .setDescription('Start date YYYY-MM-DD')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('end')
        .setDescription('End date YYYY-MM-DD')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('range_total')
    .setDescription('Show total for all users in a date range')
    .addStringOption(option =>
      option.setName('start')
        .setDescription('Start date YYYY-MM-DD')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('end')
        .setDescription('End date YYYY-MM-DD')
        .setRequired(true)
    ),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Registering commands...');
    // 使用全局命令（不需要服务器ID）
    await rest.put(
      Routes.applicationCommands(process.env.APP_ID),
      { body: commands }
    );
    console.log('✅ Commands registered globally!');
    console.log('注意：全局命令可能需要几分钟到几小时才能生效');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
})();
