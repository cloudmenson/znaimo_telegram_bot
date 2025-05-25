const cron = require("node-cron");
const { getAllUsers } = require("../mongo");
const { Markup } = require("telegraf");

function registerPushNotifications(bot) {
  cron.schedule("0 */12 * * *", async () => {
    const allUsers = await getAllUsers();
    const now = Date.now();

    for (const user of allUsers) {
      if (!user.finished || !user.username) continue;
      const lastUpdated = new Date(user.updatedAt || user.createdAt || now).getTime();
      if (now - lastUpdated < 12 * 60 * 60 * 1000) continue;

      try {
        await bot.telegram.sendMessage(
          user.id,
          `👋 Привіт! У нас нові анкети — перевір, хто тебе міг вже лайкнути!`,
          Markup.keyboard([["🔍 Анкети", "📝 Профіль"]]).resize().oneTime(true)
        );
      } catch (e) {
        if (
          e.description?.includes("bot was blocked by the user") ||
          e.description?.includes("USER_IS_BLOCKED")
        ) continue;
        console.error("PUSH ERROR:", e);
      }
    }
  });
}

module.exports = { registerPushNotifications };
