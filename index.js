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
  await ctx.replyWithPhoto(
    { source: "./img/welcome-logo.jpg" },
    {
      caption: `👋 Вітаємо в *Znaimo*!

Це бот, який допоможе знайти людину для спілкування або серйозних стосунків. Щоб почати — створіть свою анкету.

✨ Заповніть кілька простих питань, додайте фото, і почнімо подорож до нових знайомств!

❤️ Ваша історія може початися просто зараз.`,
      parse_mode: "Markdown",
    }
  );

  await ctx.reply("🔷 Щоб почати — натисни кнопку нижче:", {
    reply_markup: {
      keyboard: [["🚀 Почати створення анкети"]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });

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

bot.hears("🚀 Почати створення анкети", async (ctx) => {
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
  users[id].lastSeenId = target.id; // Зберігаємо останню переглянуту анкету
  saveUsers(users);

  ctx.replyWithPhoto(target.photo, {
    caption: `👤 ${target.name}\n📝 ${target.description || "Опис відсутній"}`,
    reply_markup: {
      keyboard: [
        ["💘", "💌", "❌"],
        ["⚙️ Налаштування"],
      ],
      resize_keyboard: true,
    },
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
  users[id].photo = fileId;
  saveUsers(users);
  ctx.reply("📸 Фото збережено. Якщо більше нічого не хочеш додати — натисни кнопку нижче 👇", {
    reply_markup: {
      keyboard: [["✅ Це все, зберегти фото 🤖"]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
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
    if (liker?.photo) {
      ctx.replyWithPhoto(liker.photo, {
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
  if (!user || !user.gender || !user.searchGender || !user.photo) {
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

bot.on("text", (ctx) => {
  const text = ctx.message.text;
  const users = loadUsers();
  const id = String(ctx.from.id);
  const user = users[id];
  if (!user) return;

  if (ctx.message.reply_to_message?.text?.includes("Введіть мінімальний вік анкет")) {
    const age = parseInt(text);
    if (isNaN(age) || age < 14 || age > 99) {
      return ctx.reply("🔴 Вік повинен бути в межах 14–99 років.\nВведіть правильне значення.");
    }
    user.minAge = age;
    saveUsers(users);
    return ctx.reply("🔢 Введіть максимальний вік анкет, які будуть вам траплятись в пошуку та яким буде відображатись ваша анкета:", {
      reply_markup: { force_reply: true },
    });
  }

  if (ctx.message.reply_to_message?.text?.includes("Введіть максимальний вік анкет")) {
    const age = parseInt(text);
    if (isNaN(age) || age < 14 || age > 99 || age <= user.minAge) {
      return ctx.reply("🔴 Вік повинен бути в межах 14–99 років і більшим за мінімальний.\nВведіть правильне значення.");
    }
    user.maxAge = age;
    saveUsers(users);
    return ctx.reply("🎂 Скільки вам років?", {
      reply_markup: { force_reply: true },
    });
  }

  if (ctx.message.reply_to_message?.text?.includes("Скільки вам років")) {
    const age = parseInt(text);
    if (isNaN(age) || age < 14 || age > 99) {
      return ctx.reply("🔴 Вік повинен бути в межах 14–99 років.\nВведіть правильне значення.");
    }
    user.age = age;
    saveUsers(users);
    return ctx.reply("🏙️ З якого ви міста?", {
      reply_markup: { force_reply: true },
    });
  }

  // Додаємо обробку відповіді на місто
  if (ctx.message.reply_to_message?.text?.includes("міста")) {
    user.city = text;
    saveUsers(users);
    const profileText = `• Ім'я: ${user.name}\n• Вік: ${user.age}\n• Місто: ${user.city}\n\n• Про себе: ${user.description || "Не вказано"}`;
    ctx.replyWithPhoto(user.photo, {
      caption: profileText,
    });
    return ctx.reply("Ось так виглядає ваш профіль. Все правильно?", {
      reply_markup: {
        keyboard: [["Так, почати пошук", "Ні, редагувати"]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
  }
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
