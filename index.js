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

    return ctx.reply("Щоб почати, натисніть кнопку нижче:", {
      reply_markup: {
        keyboard: [["Почати створення анкети"]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
  }

  ctx.reply("Тепер ви можете переглядати анкети та спілкуватися:", {
    reply_markup: {
      keyboard: [
        ["Знайти анкету", "Редагувати анкету"],
        ["Хто мене лайкнув", "Мій профіль"],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
    },
  });
});

bot.hears("Почати створення анкети", async (ctx) => {
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
    return ctx.reply("Оберіть свою стать:", {
      reply_markup: {
        keyboard: [["🚹 Я хлопець", "🚺 Я дівчина"]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
  }

  if (!users[id].searchGender) {
    return ctx.reply("Кого ви шукаєте?", {
      reply_markup: {
        keyboard: [["Хлопців", "Дівчат", "Будь кого"]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
  }

  ctx.reply("Тепер ви можете переглядати анкети та спілкуватися:", {
    reply_markup: {
      keyboard: [
        ["Знайти анкету", "Редагувати анкету"],
        ["Хто мене лайкнув", "Мій профіль"],
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
  ctx.reply("Кого ви шукаєте?", {
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
  ctx.reply("Вкажіть мінімальний вік анкет для пошуку:", {
    reply_markup: { force_reply: true },
  });
});

bot.hears("Знайти анкету", (ctx) => {
  const users = loadUsers();
  const id = String(ctx.from.id);
  const user = users[id];

  if (!user) return ctx.reply("Спочатку напишіть /start");
  if (!user.photos || user.photos.length === 0) {
    return ctx.reply("Завантажте хоча б одне фото через редагування профілю, щоб шукати анкети.");
  }
  if (!user.gender || !user.searchGender) {
    return ctx.reply("Оберіть свою стать та кого шукаєте через /start");
  }
  if (!user.isPremium && user.views >= 50)
    return ctx.reply(
      "Ви переглянули 50 анкет. Придбайте преміум у іншого бота."
    );

  const target = getRandomUser(id, users);
  if (!target) return ctx.reply("Немає анкет для перегляду");

  users[id].views += 1;
  users[id].lastSeenId = target.id; // Зберігаємо останню переглянуту анкету
  saveUsers(users);

  ctx.replyWithPhoto(target.photos[0], {
    caption: `${target.name}\n${target.description || "Опис відсутній"}`,
    reply_markup: {
      keyboard: [
        ["💘", "💌", "❌"],
        ["⚙️ Налаштування"],
      ],
      resize_keyboard: true,
    },
  });
});

bot.hears("Редагувати анкету", async (ctx) => {
  await ctx.reply("Введіть опис для вашого профілю:", {
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
    (
      ctx.message.reply_to_message.text === "✏️ Введи опис для свого профілю:" ||
      ctx.message.reply_to_message.text === "Введіть опис для вашого профілю:"
    )
  ) {
    user.description = ctx.message.text;
    saveUsers(users);
    return ctx.reply("Опис збережено!");
  }

  if (!user.stage) return;

  const text = ctx.message.text.trim();
  switch (user.stage) {
    case "minAge": {
      const age = parseInt(text, 10);
      if (isNaN(age) || age < 14 || age > 99) {
        return ctx.reply("Вік повинен бути від 14 до 99 років. Введіть правильне значення.");
      }
      user.minAge = age;
      user.stage = "maxAge";
      saveUsers(users);
      return ctx.reply("Вкажіть максимальний вік анкет для пошуку:", {
        reply_markup: { force_reply: true },
      });
    }
    case "maxAge": {
      const age = parseInt(text, 10);
      if (isNaN(age) || age < 14 || age > 99 || age <= user.minAge) {
        return ctx.reply("Вік повинен бути від 14 до 99 років і більшим за мінімальний. Введіть правильне значення.");
      }
      user.maxAge = age;
      user.stage = "age";
      saveUsers(users);
      return ctx.reply("Скільки вам років?", { reply_markup: { force_reply: true } });
    }
    case "age": {
      const age = parseInt(text, 10);
      if (isNaN(age) || age < 14 || age > 99) {
        return ctx.reply("Вік повинен бути від 14 до 99 років. Введіть правильне значення.");
      }
      user.age = age;
      user.stage = "city";
      saveUsers(users);
      return ctx.reply("З якого ви міста?", { reply_markup: { force_reply: true } });
    }
    case "city": {
      user.city = text;
      saveUsers(users);
      user.stage = "photo";
      ctx.reply("Завантажте від 1 до 3 фотографій для вашого профілю.", {
        reply_markup: { force_reply: true, selective: true }
      });
      return;
    }
    case "description": {
      user.description = text;
      user.stage = null;
      saveUsers(users);
      const profileText = `Ім'я: ${user.name}\nВік: ${user.age}\nМісто: ${user.city}\n\nПро себе: ${user.description || "не вказано"}`;
      if (user.photos && user.photos[0]) {
        await ctx.replyWithPhoto(user.photos[0], { caption: profileText });
      } else {
        await ctx.reply(profileText);
      }
      return ctx.reply("Ваш профіль готовий. Почати пошук чи редагувати?", {
        reply_markup: {
          keyboard: [["Почати пошук", "Редагувати профіль"]],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      });
    }
  }
});

// Новий обробник для фото
bot.on("photo", async (ctx) => {
  const users = loadUsers();
  const id = String(ctx.from.id);
  const user = users[id];
  if (!user) {
    return ctx.reply("Спочатку напишіть /start");
  }
  if (user.stage !== "photo") {
    return;
  }
  const photoArray = ctx.message.photo;
  const photo = photoArray[photoArray.length - 1];
  const fileId = photo.file_id;
  const photos = user.photos || [];
  if (photos.length >= 3) {
    return ctx.reply("Ви вже додали 3 фото. Введіть 'Готово' для завершення.", {
      reply_markup: {
        force_reply: true,
        selective: true
      }
    });
  }
  photos.push(fileId);
  user.photos = photos;
  saveUsers(users);
  if (photos.length < 3) {
    user.stage = "photo";
    ctx.reply(`Фото збережено (${photos.length}/3). Відправте ще фото або введіть 'Готово' для завершення.`, {
      reply_markup: { force_reply: true, selective: true }
    });
  } else {
    user.stage = "description";
    ctx.reply("Введіть опис вашого профілю (необов’язково).", {
      reply_markup: { force_reply: true, selective: true }
    });
  }
});

// Обробник тексту "Готово" під час фото-етапу
bot.hears("Готово", (ctx) => {
  const users = loadUsers();
  const id = String(ctx.from.id);
  const user = users[id];
  if (!user || user.stage !== "photo" || !user.photos || user.photos.length === 0) {
    return ctx.reply("Завантажте хоча б одне фото, щоб продовжити.");
  }
  user.stage = "description";
  saveUsers(users);
  ctx.reply("Введіть опис вашого профілю (необов’язково).", {
    reply_markup: { force_reply: true, selective: true }
  });
});

// Старі кнопки додавання фото більше не використовуються

bot.hears("Мій профіль", (ctx) => {
  const users = loadUsers();
  const id = String(ctx.from.id);
  const u = users[id];
  if (!u || !u.photos || u.photos.length === 0)
    return ctx.reply("Профіль не знайдено. Почніть з /start");

  const profileCaption = `${u.name}\n${u.description || "Опис відсутній"}\nПереглядів: ${u.views}`;

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

bot.hears("Хто мене лайкнув", (ctx) => {
  const users = loadUsers();
  const id = String(ctx.from.id);
  const user = users[id];
  if (!user) return ctx.reply("Спочатку напишіть /start");

  const unseenLikers = (user.likedBy || []).filter((uid) => !user.liked.includes(uid));
  if (unseenLikers.length === 0) {
    return ctx.reply("Немає нових лайків.");
  }

  unseenLikers.forEach((uid) => {
    const liker = users[uid];
    if (liker?.photos && liker.photos[0]) {
      ctx.replyWithPhoto(liker.photos[0], {
        caption: `Ім'я: ${liker.name}\nВік: ${liker.age}\nМісто: ${liker.city || "Не вказано"}\nПро себе: ${liker.description || "—"}`,
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

bot.hears("Почати пошук", (ctx) => {
  ctx.reply("Анкета збережена! Ви можете переглядати інших:", {
    reply_markup: {
      keyboard: [
        ["Знайти анкету", "Редагувати анкету"],
        ["Хто мене лайкнув", "Мій профіль"],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
    },
  });
});

bot.hears("Редагувати профіль", (ctx) => {
  ctx.reply("Оберіть, що хочете змінити:", {
    reply_markup: {
      keyboard: [["Редагувати анкету"]],
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
