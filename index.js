const express = require("express");
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

bot.start(async (ctx) => {
  const users = loadUsers();
  const id = String(ctx.from.id);

  const user = users[id];

  const profileIsIncomplete =
    !user ||
    !user.gender ||
    !user.searchGender ||
    !user.age ||
    !user.city ||
    !user.photos ||
    user.photos.length === 0;

  if (profileIsIncomplete) {
    users[id] = {
      id,
      name: ctx.from.first_name || "Без імені",
      photos: user?.photos || [],
      description: user?.description || "",
      liked: user?.liked || [],
      likedBy: user?.likedBy || [],
      views: user?.views || 0,
      isPremium: user?.isPremium || false,
      gender: user?.gender || null,
      searchGender: user?.searchGender || null,
      age: user?.age || null,
      city: user?.city || null,
      stage: user?.stage || null,
    };
    saveUsers(users);

    return ctx.reply("🔷 Щоб почати — натисни кнопку нижче:", {
      reply_markup: {
        keyboard: [["🚀 Почати створення анкети"]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
  }

  ctx.reply("✅ Тепер можете переглядати анкети та спілкуватись:", {
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

bot.hears("🚀 Почати створення анкети", async (ctx) => {
  const users = loadUsers();
  const id = String(ctx.from.id);
  if (!users[id]) {
    users[id] = {
      id,
      name: ctx.from.first_name || "Без імені",
      photos: [],
      description: "",
      liked: [],
      likedBy: [],
      views: 0,
      isPremium: false,
      gender: null,
      searchGender: null,
      stage: null,
    };
    saveUsers(users);
  }

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
        keyboard: [["Хлопців", "Дівчат", "Будь кого"]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
  }

  ctx.reply("✅ Тепер можете переглядати анкети та спілкуватись:", {
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
      keyboard: [["Хлопців", "Дівчат", "Будь кого"]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
});

// Вибір кого шукати
bot.hears(["Хлопців", "Дівчат", "Будь кого"], (ctx) => {
  const users = loadUsers();
  const id = String(ctx.from.id);
  if (!users[id]) return;
  if (ctx.message.text === "Дівчат") {
    users[id].searchGender = "female";
  } else if (ctx.message.text === "Хлопців") {
    users[id].searchGender = "male";
  } else {
    users[id].searchGender = "any";
  }
  users[id].stage = "minAge";
  saveUsers(users);
  ctx.reply("🔢 Введіть мінімальний вік анкет, які будуть вам траплятись в пошуку та яким буде відображатись ваша анкета:", {
    reply_markup: { force_reply: true },
  });
});

bot.hears("📱 Знайти анкету", (ctx) => {
  const users = loadUsers();
  const id = String(ctx.from.id);
  const user = users[id];

  if (!user) return ctx.reply("⚠️ Спочатку напиши /start");
  if (!user.photos || user.photos.length === 0) {
    return ctx.reply("📷 Завантажте хоча б 1 фото через редагування профілю, щоб шукати анкети.");
  }
  if (!user.gender || !user.searchGender) {
    return ctx.reply("👤 Обери свою стать та кого шукаєш через /start");
  }
  if (!user.isPremium && user.views >= 50)
    return ctx.reply(
      "🔒 Ви переглянули 50 анкет. 💎 Купи преміум у іншого бота."
    );

  // Збираємо кандидатів
  const allCandidates = Object.values(users).filter(u => {
    if (u.id === id) return false;
    if (!u.photos || u.photos.length === 0) return false;
    if (!u.gender) return false;
    if (user.searchGender !== "any" && u.gender !== user.searchGender) return false;
    if (u.age < (user.minAge || 14) || u.age > (user.maxAge || 99)) return false;
    return true;
  });

  if (allCandidates.length === 0) {
    return ctx.reply("😔 На жаль, поки немає доступних анкет для перегляду.");
  }

  // Сортуємо: спочатку ті, що з вашого міста
  const sameCity = allCandidates.filter(u => u.city === user.city);
  const otherCity = allCandidates.filter(u => u.city !== user.city);
  const sorted = [...sameCity, ...otherCity];

  // Обираємо кандидата по черзі
  const index = user.views % sorted.length;
  const target = sorted[index];

  users[id].views += 1;
  users[id].lastSeenId = target.id;
  saveUsers(users);

  // Відправка анкети
  const caption = `👤 ${target.name}\n📝 ${target.description || "Опис відсутній"}`;
  if (target.photos && target.photos[0]) {
    ctx.replyWithPhoto(target.photos[0], {
      caption,
      reply_markup: {
        keyboard: [
          ["💘", "💌", "❌"],
          ["⚙️ Налаштування"],
        ],
        resize_keyboard: true,
      },
    });
  } else {
    ctx.reply(caption, {
      reply_markup: {
        keyboard: [
          ["💘", "💌", "❌"],
          ["⚙️ Налаштування"],
        ],
        resize_keyboard: true,
      },
    });
  }
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
  const users = loadUsers();
  const id = String(ctx.from.id);
  const user = users[id];
  if (!user) return;

  // Handle editing description
  if (
    ctx.message &&
    ctx.message.text &&
    ctx.message.reply_to_message &&
    ctx.message.reply_to_message.text === "✏️ Введи опис для свого профілю:"
  ) {
    user.description = ctx.message.text;
    saveUsers(users);
    return ctx.reply("📝 Опис збережено!");
  }

  if (!user.stage) return;

  const text = ctx.message.text.trim();
  switch (user.stage) {
    case "minAge": {
      const age = parseInt(text, 10);
      if (isNaN(age) || age < 14 || age > 99) {
        return ctx.reply("🔴 Вік повинен бути в межах 14–99 років.\nВведіть правильне значення.");
      }
      user.minAge = age;
      user.stage = "maxAge";
      saveUsers(users);
      return ctx.reply("🔢 Введіть максимальний вік анкет, які будуть вам траплятись в пошуку та яким буде відображатись ваша анкета:", {
        reply_markup: { force_reply: true },
      });
    }
    case "maxAge": {
      const age = parseInt(text, 10);
      if (isNaN(age) || age < 14 || age > 99 || age <= user.minAge) {
        return ctx.reply("🔴 Вік повинен бути в межах 14–99 років і більшим за мінімальний.\nВведіть правильне значення.");
      }
      user.maxAge = age;
      user.stage = "age";
      saveUsers(users);
      return ctx.reply("🎂 Скільки вам років?", { reply_markup: { force_reply: true } });
    }
    case "age": {
      const age = parseInt(text, 10);
      if (isNaN(age) || age < 14 || age > 99) {
        return ctx.reply("🔴 Вік повинен бути в межах 14–99 років.\nВведіть правильне значення.");
      }
      user.age = age;
      user.stage = "city";
      saveUsers(users);
      return ctx.reply("🏙️ З якого ви міста?", { reply_markup: { force_reply: true } });
    }
    case "city": {
      user.city = text;
      user.stage = null;
      saveUsers(users);
      // show profile preview and confirmation as before...
      const profileText = `• Ім'я: ${user.name}\n• Вік: ${user.age}\n• Місто: ${user.city}\n\n• Про себе: ${user.description || "Не вказано"}`;
      if (user.photos && user.photos[0]) {
        await ctx.replyWithPhoto(user.photos[0], { caption: profileText });
      } else {
        await ctx.reply(profileText);
      }
      return ctx.reply("Ось так виглядає ваш профіль. Все правильно?", {
        reply_markup: {
          keyboard: [["Так, почати пошук", "Ні, редагувати"]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
    }
  }
});

// Новий обробник для фото
bot.on("photo", async (ctx) => {
  const users = loadUsers();
  const id = String(ctx.from.id);
  if (!users[id]) {
    return ctx.reply("⚠️ Спочатку напиши /start");
  }
  const photoArray = ctx.message.photo;
  const photo = photoArray[photoArray.length - 1]; // найкраща якість
  const fileId = photo.file_id;
  const photos = users[id].photos || [];
  if (photos.length >= 3) {
    return ctx.reply("📸 Ви вже додали 3 фото. Натисніть ✅ Завершити додавання фото.", {
      reply_markup: {
        keyboard: [["✅ Завершити додавання фото"]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
  }
  photos.push(fileId);
  users[id].photos = photos;
  saveUsers(users);
  const count = photos.length;
  const buttons = count < 3
    ? [["📸 Надіслати ще фото"], ["✅ Завершити додавання фото"]]
    : [["✅ Завершити додавання фото"]];
  ctx.reply(`📷 Фото збережено (${count}/3)`, {
    reply_markup: { keyboard: buttons, resize_keyboard: true, one_time_keyboard: true },
  });
});

bot.hears("📸 Надіслати ще фото", ctx => {
  ctx.reply("🔄 Надішліть наступне фото (до 3).");
});
bot.hears("✅ Завершити додавання фото", ctx => {
  const users = loadUsers();
  const user = users[String(ctx.from.id)];
  if (!user || !user.photos || user.photos.length === 0) {
    return ctx.reply("⚠️ Завантажте хоча б 1 фото, щоб продовжити.");
  }
  ctx.reply("✅ Фото збережено! Продовжимо.", {
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

bot.hears("👤 Мій профіль", (ctx) => {
  const users = loadUsers();
  const id = String(ctx.from.id);
  const u = users[id];
  if (!u || !u.photos || u.photos.length === 0)
    return ctx.reply("⚠️ Профіль не знайдено. Почни з /start");

  const profileCaption = `👤 ${u.name}\n📝 ${
    u.description || "Опис відсутній"
  }\n👁 Переглядів: ${u.views}`;

  if (u.photos && u.photos[0]) {
    ctx.replyWithPhoto(u.photos[0], { caption: profileCaption });
  } else {
    ctx.reply(profileCaption);
  }
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
  const users = loadUsers();
  const id = String(ctx.from.id);
  const user = users[id];
  if (!user) return ctx.reply("⚠️ Спочатку напиши /start");

  const unseenLikers = (user.likedBy || []).filter((uid) => !user.liked.includes(uid));
  if (unseenLikers.length === 0) {
    return ctx.reply("😢 Немає нових лайків.");
  }

  unseenLikers.forEach((uid) => {
    const liker = users[uid];
    if (liker?.photos && liker.photos[0]) {
      ctx.replyWithPhoto(liker.photos[0], {
        caption: `• Ім'я: ${liker.name}\n• Вік: ${liker.age}\n• Місто: ${liker.city || "Не вказано"}\n• Про себе: ${liker.description || "—"}`,
      });
    }
  });
});

// bot.action(/like_(.+)/, (ctx) => {
//   const users = loadUsers();
//   const fromId = String(ctx.from.id);
//   const toId = ctx.match[1];

//   if (!users[toId] || !users[fromId])
//     return ctx.reply("Користувач не знайдений.");

//   users[fromId].liked.push(toId);
//   users[toId].likedBy.push(fromId);
//   saveUsers(users);

//   ctx.reply("💘 Ти вподобав(ла) цього користувача!");
//   // Повідомлення іншому користувачу
//   bot.telegram.sendMessage(toId, `💌 Вас вподобав(ла) ${users[fromId].name}!`);

//   ctx.deleteMessage().catch(() => {});
// });

// bot.action(/skip_(.+)/, (ctx) => {
//   ctx.reply("⏭️ Пропущено.");
//   ctx.deleteMessage().catch(() => {});
// });

bot.hears("💘", (ctx) => {
  const users = loadUsers();
  const fromId = String(ctx.from.id);
  const user = users[fromId];
  const toId = user.lastSeenId;

  if (!toId || !users[toId]) {
    return ctx.reply("⛔ Немає активної анкети.");
  }

  if (!user.liked.includes(toId)) {
    user.liked.push(toId);
  }
  if (!users[toId].likedBy.includes(fromId)) {
    users[toId].likedBy.push(fromId);
  }

  saveUsers(users);

  // Повідомлення іншому користувачу
  if (users[toId].liked.includes(fromId)) {
    bot.telegram.sendMessage(toId, `💞 Ви збіглися з ${user.name}!`);
    bot.telegram.sendMessage(fromId, `💞 Взаємний лайк з ${users[toId].name}!`);
  } else {
    bot.telegram.sendMessage(toId, `💌 Вас лайкнув(ла) ${user.name}`);
  }

  ctx.reply("💘 Ви вподобали анкету!");
  ctx.telegram.sendMessage(fromId, "📱 Наступна анкета:", {
    reply_markup: {
      keyboard: [["📱 Знайти анкету"]],
      resize_keyboard: true,
    },
  });
});

bot.hears("❌", (ctx) => {
  ctx.reply("⏭️ Пропущено. Щоб побачити наступну анкету натисніть:", {
    reply_markup: {
      keyboard: [["📱 Знайти анкету"]],
      resize_keyboard: true,
    },
  });
});

bot.hears("⚙️ Налаштування", (ctx) => {
  ctx.reply("🔧 Що бажаєш змінити?", {
    reply_markup: {
      keyboard: [["📝 Редагувати анкету"]],
      resize_keyboard: true,
    },
  });
});

bot.hears("✅ Це все, зберегти фото 🤖", (ctx) => {
  const users = loadUsers();
  const id = String(ctx.from.id);
  const user = users[id];
  if (!user || !user.gender || !user.searchGender || !user.photos || user.photos.length === 0) {
    return ctx.reply("⚠️ Спочатку потрібно завершити заповнення анкети через /start");
  }
  ctx.reply("✅ Анкета збережена! Ви можете переглядати інших:", {
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

(bot.hears("Так, почати пошук", (ctx) => {
  ctx.reply("✅ Анкета збережена! Ви можете переглядати інших:", {
    reply_markup: {
      keyboard: [
        ["📱 Знайти анкету", "📝 Редагувати анкету"],
        ["👀 Хто мене лайкнув", "👤 Мій профіль"],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
    },
  });
}));

bot.hears("Ні, редагувати", (ctx) => {
  ctx.reply("🔁 Обери, що хочеш змінити:", {
    reply_markup: {
      keyboard: [["📝 Редагувати анкету"]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
});

(async () => {
  await bot.telegram.setMyCommands([
    { command: "start", description: "🚀 Почати" },
    { command: "find", description: "📱 Знайти анкету" },
    { command: "profile", description: "👤 Мій профіль" },
    { command: "edit", description: "📝 Редагувати анкету" },
  ]);
  bot.telegram.setChatMenuButton({
    menu_button: {
      type: "commands",
    },
  });

  const app = express();
  app.use(bot.webhookCallback("/"));
  app.get("/", (_, res) => res.send("🤖 Znaimo Bot is running."));
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, async () => {
    console.log(`🚀 Server listening on port ${PORT}`);
    const webhookUrl = `https://znaimo-telegram-bot.onrender.com`;
    await bot.telegram.setWebhook(webhookUrl);
    console.log(`✅ Webhook set to ${webhookUrl}`);
  });
})();

function getRandomUser(currentUserId, users) {
  const currentUser = users[currentUserId];
  const candidates = Object.values(users).filter(user => {
    if (user.id === currentUserId) return false;
    if (!user.photos || user.photos.length === 0) return false;
    if (!user.gender) return false;
    if (currentUser.searchGender !== "any" && user.gender !== currentUser.searchGender) return false;
    if (user.age < (currentUser.minAge || 14)) return false;
    if (user.age > (currentUser.maxAge || 99)) return false;
    return true;
  });
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
