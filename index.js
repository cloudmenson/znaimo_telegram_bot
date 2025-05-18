const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");
const bot = new Telegraf(process.env.BOT_TOKEN);

const USERS_FILE = "./users.json";

if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify({}, null, 2));
}

function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE));
  } catch (error) {
    console.error("Failed to parse users.json:", error);
    return {};
  }
}

function saveUsers(data) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Failed to save users.json:", error);
  }
}

bot.catch((err, ctx) => {
  console.error("Error: ", err);
});

bot.start((ctx) => {
  const users = loadUsers();
  const id = String(ctx.from.id);
  if (!users[id]) {
    users[id] = {
      id,
      name: ctx.from.first_name || "Без імені",
      photo: null,
      description: "",
      liked: [],
      likedBy: [],
      views: 0,
      isPremium: false,
      gender: null,
      searchGender: null,
    };
    saveUsers(users);
    // Запитати стать
    return ctx.reply("👤 Обери свою стать:", {
      reply_markup: {
        keyboard: [["🚹 Я хлопець", "🚺 Я дівчина"]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
  }
  // Якщо користувач є, але ще не обрав стать або кого шукає
  if (!users[id].gender) {
    return ctx.reply("👤 Обери свою стать:", {
      reply_markup: {
        keyboard: [["🚹 Я хлопець", "🚺 Я дівчина"]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
  }
  if (!users[id].searchGender) {
    return ctx.reply("👀 Кого хочеш знайти?", {
      reply_markup: {
        keyboard: [["👩 Дівчину", "👨 Хлопця"]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
  }
  ctx.reply("👋 Привіт! Готово до знайомств?", {
    reply_markup: {
      keyboard: [
        ["📱 Знайти анкету", "📝 Редагувати анкету"],
        ["👀 Хто мене лайкнув", "👤 Мій профіль"],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
    },
  });
});

// Вибір статі
bot.hears(["🚹 Я хлопець", "🚺 Я дівчина"], (ctx) => {
  const users = loadUsers();
  const id = String(ctx.from.id);
  if (!users[id]) return;
  const isMale = ctx.message.text.includes("хлопець");
  users[id].gender = isMale ? "male" : "female";
  saveUsers(users);
  ctx.reply("👀 Кого хочеш знайти?", {
    reply_markup: {
      keyboard: [["👩 Дівчину", "👨 Хлопця"]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
});

// Вибір кого шукати
bot.hears(["👩 Дівчину", "👨 Хлопця"], (ctx) => {
  const users = loadUsers();
  const id = String(ctx.from.id);
  if (!users[id]) return;
  const lookingForFemale = ctx.message.text.includes("Дівчину");
  users[id].searchGender = lookingForFemale ? "female" : "male";
  saveUsers(users);
  ctx.reply("✅ Готово! Тепер можеш переглядати анкети 👇", {
    reply_markup: {
      keyboard: [
        ["📱 Знайти анкету", "📝 Редагувати анкету"],
        ["👀 Хто мене лайкнув", "👤 Мій профіль"],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
    },
  });
});

bot.hears("📱 Знайти анкету", (ctx) => {
  const users = loadUsers();
  const id = String(ctx.from.id);
  const user = users[id];

  if (!user) return ctx.reply("⚠️ Спочатку напиши /start");
  if (!user.photo) return ctx.reply("📷 Завантаж фото спочатку.");
  if (!user.gender || !user.searchGender) {
    return ctx.reply("👤 Обери свою стать та кого шукаєш через /start");
  }
  if (!user.isPremium && user.views >= 50)
    return ctx.reply(
      "🔒 Ви переглянули 50 анкет. 💎 Купи преміум у іншого бота."
    );

  const target = getRandomUser(id, users);
  if (!target) return ctx.reply("Немає анкет для перегляду 😢");

  users[id].views += 1;
  saveUsers(users);

  ctx.replyWithPhoto(target.photo, {
    caption: `👤 ${target.name}\n📝 ${target.description || "Опис відсутній"}`,
    ...Markup.inlineKeyboard([
      [Markup.button.callback("❤️ Лайк", `like_${target.id}`)],
      [Markup.button.callback("❌ Пропустити", `skip_${target.id}`)],
    ]),
  });
});

bot.hears("📝 Редагувати анкету", async (ctx) => {
  await ctx.reply("✏️ Введи опис для свого профілю:", {
    reply_markup: {
      force_reply: true,
      selective: true,
    },
  });
});

// Обробка відповіді на force-reply для редагування анкети
bot.on("message", async (ctx) => {
  if (
    ctx.message &&
    ctx.message.text &&
    ctx.message.reply_to_message &&
    ctx.message.reply_to_message.text === "✏️ Введи опис для свого профілю:"
  ) {
    const users = loadUsers();
    const id = String(ctx.from.id);
    if (!users[id]) {
      return ctx.reply("⚠️ Спочатку напиши /start");
    }
    users[id].description = ctx.message.text;
    saveUsers(users);
    return ctx.reply("📝 Опис збережено!");
  }
});

bot.hears("👤 Мій профіль", (ctx) => {
  const users = loadUsers();
  const id = String(ctx.from.id);
  const u = users[id];
  if (!u || !u.photo)
    return ctx.reply("⚠️ Профіль не знайдено. Почни з /start");

  ctx.replyWithPhoto(u.photo, {
    caption: `👤 ${u.name}\n📝 ${
      u.description || "Опис відсутній"
    }\n👁 Переглядів: ${u.views}`,
  });
});

bot.command("likes", (ctx) => {
  const users = loadUsers();
  const id = String(ctx.from.id);
  const user = users[id];
  if (!user) return ctx.reply("⚠️ Спочатку напиши /start");
  if (!user.likedBy || user.likedBy.length === 0) {
    return ctx.reply("Ніхто ще не лайкнув ваш профіль.");
  }
  const likedByNames = user.likedBy
    .map((uid) => users[uid]?.name || "Користувач")
    .join(", ");
  ctx.reply(`Вас лайкнули: ${likedByNames}`);
});

bot.hears("👀 Хто мене лайкнув", (ctx) => {
  ctx.reply("🔜 У розробці. Скоро буде видно, хто тебе лайкнув 😉");
});

bot.action(/like_(.+)/, (ctx) => {
  const users = loadUsers();
  const fromId = String(ctx.from.id);
  const toId = ctx.match[1];

  if (!users[toId] || !users[fromId])
    return ctx.reply("Користувач не знайдений.");

  users[fromId].liked.push(toId);
  users[toId].likedBy.push(fromId);
  saveUsers(users);

  ctx.reply("💘 Ти вподобав(ла) цього користувача!");
  // Повідомлення іншому користувачу
  bot.telegram.sendMessage(toId, `💌 Вас вподобав(ла) ${users[fromId].name}!`);

  ctx.deleteMessage().catch(() => {});
});

bot.action(/skip_(.+)/, (ctx) => {
  ctx.reply("⏭️ Пропущено.");
  ctx.deleteMessage().catch(() => {});
});

(async () => {
  await bot.telegram.setMyCommands([
    { command: "start", description: "🚀 Почати" },
    { command: "find", description: "📱 Знайти анкету" },
    { command: "profile", description: "👤 Мій профіль" },
    { command: "edit", description: "📝 Редагувати анкету" },
  ]);
  bot.launch();
})();
