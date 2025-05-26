const express = require("express");
const { Telegraf, Markup } = require("telegraf");
const cron = require("node-cron");
require("dotenv").config();

const {
  getDb,
  loadUser,
  saveUser,
  removeUser,
  getAllUsers,
} = require("./mongo");

const NodeGeocoder = require("node-geocoder");
const geolib = require("geolib");
// Configure geocoder to use OpenStreetMap
const geocoder = NodeGeocoder({ provider: "openstreetmap" });

const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN);

// Глобальний обробник помилок Telegraf
bot.catch((err, ctx) => {
  console.error("BOT ERROR", err);
  ctx.reply("Виникла технічна помилка. Спробуйте ще раз.");
});

// Привітальне повідомлення для нових користувачіва
bot.on("message", async (ctx, next) => {
  // Пропустити команди щоб не блокувати /start та інші
  if (ctx.message.text && ctx.message.text.startsWith("/")) {
    return next();
  }
  const id = ctx.from.id;
  const user = await loadUser(id);
  if (!user) {
    // Індикатор “бот друкує”
    // await ctx.sendChatAction("typing");

    // Особисте звертання по імені
    await ctx.reply(
      `👋 Привіт, ${ctx.from.first_name}! Ласкаво просимо до Znaimo!

Щоб почати, натисни /start.

Я допоможу тобі:
• Створити власну анкету
• Знайти та переглянути анкети інших
• Розпочати спілкування одразу після зустрічі лайків!`
    );
    return;
  }
  return next();
});

// Основні меню як звичайна клавіатура (емодзі без тексту)
const mainMenu = Markup.keyboard([["🔍", "✏️", "⭐", "⚙️", "❓"]])
  .resize()
  .oneTime(false);
// Відображення власного профілю через клавіатуру
bot.hears("⚙️", async (ctx) => {
  const id = ctx.from.id;
  const user = await loadUser(id);
  // Якщо анкета незавершена
  if (!user || !user.finished) {
    return ctx.reply("Ти ще не створив анкету. Натисни /start.");
  }
  // Якщо фото відсутні
  if (!user.data.photos || user.data.photos.length === 0) {
    return ctx.reply(
      "У твоїй анкеті ще немає фото.\n" +
        "Щоб додати фото, натисни «✏️ Змінити."
    );
  }
  // Показуємо медіа-групу з анкетою
  await ctx.replyWithMediaGroup([
    {
      type: "photo",
      media: user.data.photos[0],
      caption: prettyProfile(user),
      parse_mode: "HTML",
    },
    ...user.data.photos
      .slice(1)
      .map((file_id) => ({ type: "photo", media: file_id })),
  ]);
  // Повертаємо меню дій
  await ctx.reply("Обери дію:", mainMenu);
});

// Меню очікування лайків (reply-keyboard)
const pendingMenu = Markup.keyboard([["💝 Взаємно", "❌ Відхилити"]])
  .resize()
  .oneTime(false);

// Меню для пошуку (reply-keyboard)
const searchMenu = Markup.keyboard([["💝", "💥", "❌", "↩", "⚙️"]])
  .resize()
  .oneTime(false);

// Меню редагування профілю — тільки воно інлайн!
const editProfileMenu = Markup.inlineKeyboard([
  [
    Markup.button.callback("✏️ Ім'я", "edit_name"),
    Markup.button.callback("🎂 Вік", "edit_age"),
  ],
  [
    Markup.button.callback("⚧ Стать", "edit_gender"),
    Markup.button.callback("🏠 Місто", "edit_city"),
  ],
  [Markup.button.callback("📝 Опис", "edit_about")],
  [Markup.button.callback("🔎 Пошук статі", "edit_searchGender")],
  [Markup.button.callback("🤳 Фото", "edit_photos")],
  [Markup.button.callback("🚫 Чорний список", "edit_blacklist")],
]);

const startProfile = {
  step: "name",
  editStep: null,
  data: {
    name: "",
    gender: "",
    age: "",
    city: "",
    about: "",
    photos: [],
    searchGender: "", // preferred gender to search
    latitude: null,
    longitude: null,
  },
  seen: [],
  finished: false,
  currentView: null,
  pendingLikes: [],
  superLikesUsed: [],
  hasUsedBackInSearch: false,
};

function prettyProfile(user) {
  const name = user.data.name || "";
  const age = user.data.age || "";
  const city = user.data.city || "";
  const about = user.data.about;
  let profileText = `<b>• Ім'я:</b> ${name}\n<b>• Вік:</b> ${age}\n`;
  if (city) {
    profileText += `<b>• Місто:</b> ${city}\n`;
  }
  if (about) {
    profileText += `\n<b>• Про себе:</b> ${about}`;
  }
  return profileText;
}

async function checkPendingLikes(ctx, user) {
  try {
    if (!user || !user.pendingLikes || user.pendingLikes.length === 0)
      return false;
    const pendingId = user.pendingLikes[0];
    const pendingUser = await loadUser(pendingId);
    if (
      pendingUser &&
      pendingUser.data &&
      pendingUser.data.photos &&
      pendingUser.data.photos.length > 0
    ) {
      // 1. Спочатку надсилаємо анкету користувача
      await ctx.replyWithMediaGroup([
        {
          type: "photo",
          media: pendingUser.data.photos[0],
          caption: prettyProfile(pendingUser),
          parse_mode: "HTML",
        },
        ...pendingUser.data.photos.slice(1).map((file_id) => ({
          type: "photo",
          media: file_id,
        })),
      ]);
      // 2. Потім надсилаємо текст з кнопками та додатковою інструкцією
      await ctx.reply("💞 Вам хтось поставив лайк!", pendingMenu);
    } else {
      // Якщо користувач видалив анкету — просто видаляємо з черги
      user.pendingLikes.shift();
      await saveUser(user);
      return await checkPendingLikes(ctx, user); // рекурсивно
    }
    return true;
  } catch (e) {
    console.error("checkPendingLikes ERROR:", e);
    await ctx.reply("Виникла технічна помилка. Спробуйте ще раз.");
    return false;
  }
}

bot.start(async (ctx) => {
  // 0) Check if user already exists in DB
  const existing = await loadUser(ctx.from.id);
  if (existing) {
    return ctx.reply("У вас вже є анкета.", mainMenu);
  }
  // Зберігаємо id реферера, якщо є startPayload
  const referrerId = ctx.startPayload ? parseInt(ctx.startPayload) : null;

  // 1) Індикатор “typing…”
  // await ctx.sendChatAction("typing");
  // 2) Персональне вітання
  await ctx.reply(
    `👋 Привіт, ${ctx.from.first_name}! Ласкаво просимо до Znaimo!`
  );

  // Доповненне повідомлення після вітання
  // await ctx.sendChatAction("typing");
  await ctx.reply(
    `Я допоможу тобі:
• Створити власну анкету
• Знайти та переглянути анкети інших
• Розпочати спілкування одразу після зустрічі лайків!`
  );

  // 3) Ще один “typing…” перед наступним кроком
  // await ctx.sendChatAction("typing");
  // 4) Власне запит на створення анкети
  // Створюємо нового користувача одразу з referrer/referrals
  const id = ctx.from.id;
  const user = {
    ...startProfile,
    id,
    username: ctx.from.username || null,
    referrer: referrerId || null,
    referrals: [],
  };
  await saveUser(user);

  // Якщо є реферер і це не сам користувач — додаємо id до його referrals
  if (referrerId && referrerId !== ctx.from.id) {
    const refUser = await loadUser(referrerId);
    if (refUser) {
      refUser.referrals = refUser.referrals || [];
      if (!refUser.referrals.includes(ctx.from.id)) {
        refUser.referrals.push(ctx.from.id);
        await saveUser(refUser);
      }
    }
  }

  await ctx.reply(
    "✍️ Давай створимо твою анкету.",
    Markup.inlineKeyboard([
      [Markup.button.callback("Створити анкету", "create_profile")],
    ])
  );
});

// ------------------ INLINE-КНОПКИ ТА CALLBACK-и ------------------

// Створити анкету (коли ще не існує)
bot.action("create_profile", async (ctx) => {
  try {
    const id = ctx.from.id;
    const existing = await loadUser(id);
    if (existing && existing.finished) {
      return ctx.reply("Ваша анкета вже створена.", mainMenu);
    }
    // Повністю оновлюємо стан анкети
    const user = { ...startProfile, id, username: ctx.from.username || null };
    await saveUser(user);
    // Запитуємо ім'я – тепер user.finished буде false
    await ctx.reply("✏️ Почнемо з імені. Як тебе звати?");
  } catch (e) {
    console.error("CREATE_PROFILE ERROR:", e);
    await ctx.reply("Виникла технічна помилка. Спробуйте ще раз.");
  }
});

bot.command("find", async (ctx) => {
  // Дія як bot.action("search")
  const id = ctx.from.id;
  let user = await loadUser(id);
  if (!user || !user.finished) {
    return ctx.reply("Спочатку створи анкету через /start");
  }
  await handleSearch(ctx, user, id, false);
});

bot.command("profile", async (ctx) => {
  const id = ctx.from.id;
  const user = await loadUser(id);
  // Якщо анкету не створено або не завершено
  if (!user || !user.finished) {
    return ctx.reply("Ти ще не створив анкету. Натисни /start, щоб розпочати.");
  }
  // Якщо фото відсутні
  if (!user.data.photos || user.data.photos.length === 0) {
    return ctx.reply(
      "У твоїй анкеті ще немає фото.\n\n" +
        "Щоб додати фото, натисни «✏️ Змінити або виконай /edit."
    );
  }
  // Інакше показуємо медіа-групу та меню дій
  const photos = user.data.photos;
  await ctx.replyWithMediaGroup([
    {
      type: "photo",
      media: photos[0],
      caption: prettyProfile(user),
      parse_mode: "HTML",
    },
    ...photos.slice(1).map((file_id) => ({
      type: "photo",
      media: file_id,
    })),
  ]);
  await ctx.reply("Обери дію:", mainMenu);
});

bot.command("edit", async (ctx) => {
  const id = ctx.from.id;
  let user = await loadUser(id);
  if (!user || !user.finished) {
    return ctx.reply("Спочатку створи анкету через /start");
  }
  await ctx.reply("Що ти хочеш змінити?", editProfileMenu);
});

// Головне меню: пошук
bot.action("search", async (ctx) => {
  try {
    const id = ctx.from.id;
    let user = await loadUser(id);

    // Перевірка вхідних лайків перед пошуком
    const hasPending = await checkPendingLikes(ctx, user);
    if (hasPending) return;

    if (!user) {
      return ctx.answerCbQuery("Сталася помилка: не знайдено користувача.");
    }
    if (!user.finished) {
      return ctx.answerCbQuery("Спочатку створи анкету!");
    }
    await handleSearch(ctx, user, id, true);
  } catch (e) {
    console.error("SEARCH ERROR:", e);
    await ctx.reply("Виникла технічна помилка. Спробуйте ще раз.");
  }
});

bot.hears("🔍", async (ctx) => {
  const id = ctx.from.id;
  let user = await loadUser(id);

  const hasPending = await checkPendingLikes(ctx, user);
  if (hasPending) return;

  if (!user || !user.finished) {
    return ctx.reply("Спочатку створи анкету через /start");
  }
  await handleSearch(ctx, user, id, false);
});

bot.hears("✏️", async (ctx) => {
  const id = ctx.from.id;
  let user = await loadUser(id);
  if (!user || !user.finished) {
    return ctx.reply("Спочатку створи анкету через /start");
  }
  await ctx.reply("Що ти хочеш змінити?", editProfileMenu);
});

// Головне меню: редагування профілю
bot.action("edit_profile", async (ctx) => {
  try {
    const id = ctx.from.id;
    let user = await loadUser(id);
    if (!user) {
      return ctx.answerCbQuery("Сталася помилка: не знайдено користувача.");
    }
    if (!user.finished) {
      return ctx.answerCbQuery("Спочатку створи анкету!");
    }
    await ctx.editMessageText("Що ти хочеш змінити?", editProfileMenu);
  } catch (e) {
    console.error("EDIT_PROFILE ERROR:", e);
    await ctx.reply("Виникла технічна помилка. Спробуйте ще раз.");
  }
});

// Меню пошуку: лайк/дизлайк/профіль
bot.action("like", async (ctx) => {
  try {
    const id = ctx.from.id;
    let user = await loadUser(id);
    if (!user) {
      return ctx.answerCbQuery("Сталася помилка: не знайдено користувача.");
    }
    if (!user.currentView) {
      return ctx.answerCbQuery("Не вдалося знайти анкету. Спробуйте ще раз.");
    }
    await handleLikeDislike(ctx, user, "like", true);
  } catch (e) {
    console.error("LIKE ERROR:", e);
    await ctx.reply("Виникла технічна помилка. Спробуйте ще раз.");
  }
});
bot.action("dislike", async (ctx) => {
  try {
    const id = ctx.from.id;
    let user = await loadUser(id);
    if (!user) {
      return ctx.answerCbQuery("Сталася помилка: не знайдено користувача.");
    }
    if (!user.currentView) {
      return ctx.answerCbQuery("Не вдалося знайти анкету. Спробуйте ще раз.");
    }
    await handleLikeDislike(ctx, user, "dislike", true);
  } catch (e) {
    console.error("DISLIKE ERROR:", e);
    await ctx.reply("Виникла технічна помилка. Спробуйте ще раз.");
  }
});
bot.action("profile", async (ctx) => {
  try {
    const id = ctx.from.id;
    let user = await loadUser(id);
    if (!user) {
      return ctx.answerCbQuery("Сталася помилка: не знайдено користувача.");
    }
    if (!user.finished) {
      return ctx.answerCbQuery(
        "Ти ще не створив анкету! Натисни /start щоб почати."
      );
    }
    if (!user.data.photos || user.data.photos.length === 0) {
      return ctx.answerCbQuery("У твоїй анкеті ще немає фото.");
    }
    const photos = user.data.photos;
    await ctx.replyWithMediaGroup([
      {
        type: "photo",
        media: photos[0],
        caption: prettyProfile(user),
        parse_mode: "HTML",
      },
      ...photos.slice(1).map((file_id) => ({
        type: "photo",
        media: file_id,
      })),
    ]);
    await ctx.reply("Обери дію:", mainMenu);

    await ctx.answerCbQuery();
  } catch (e) {
    console.error("PROFILE ERROR:", e);
    await ctx.reply("Виникла технічна помилка. Спробуйте ще раз.");
  }
});

// Обробка відповіді на pending likes через клавіатуру
bot.hears("💝 Взаємно", async (ctx) => {
  const id = ctx.from.id;
  let user = await loadUser(id);
  if (!user.pendingLikes || user.pendingLikes.length === 0) {
    return ctx.reply("У вас немає запитів на лайк.", mainMenu);
  }
  const pendingId = user.pendingLikes.shift();
  await saveUser(user);
  const pendingUser = await loadUser(pendingId);

  // Відправляємо контакт pendingUser поточному користувачу
  if (pendingUser && pendingUser.username) {
    await ctx.reply(
      `💞 У вас взаємний лайк!

Бажаємо приємного спілкування та чудового настрою!

https://t.me/${pendingUser.username}`,
      mainMenu
    );
  }

  // Відправляємо контакт користувача (ctx.from) pendingUser
  if (pendingUser) {
    const usernameOrId = user.username ? user.username : user.id;
    await ctx.telegram.sendMessage(
      pendingId,
      `💞 У вас взаємний лайк!

Бажаємо приємного спілкування та чудового настрою!

https://t.me/${usernameOrId}`
    );
  }
});
bot.hears("❌ Відхилити", async (ctx) => {
  const id = ctx.from.id;
  let user = await loadUser(id);
  if (!user.pendingLikes || user.pendingLikes.length === 0) {
    return ctx.reply("У вас немає запитів на лайк.", mainMenu);
  }
  user.pendingLikes.shift();
  await saveUser(user);
  if (user.pendingLikes.length > 0) {
    await checkPendingLikes(ctx, user);
  } else {
    await ctx.reply("Відхилено.", mainMenu);
  }
});

bot.hears("💥", async (ctx) => {
  const id = ctx.from.id;
  let user = await loadUser(id);
  if (!user || !user.finished || !user.currentView) {
    return ctx.reply("Немає доступної анкети для оцінки.");
  }

  const today = new Date().toISOString().slice(0, 10);
  user.superLikesUsed = user.superLikesUsed || [];

  if (user.superLikesUsed.includes(today)) {
    return ctx.reply("💥 Ви вже використали супер-лайк сьогодні.");
  }

  if (!user.superLikeExplained) {
    await ctx.reply(
      "💥 Супер-лайк — це один потужний лайк на день, який гарантовано побачить інший користувач."
    );
    user.superLikeExplained = true;
    await saveUser(user);
  }

  user.superLikesUsed.push(today);
  await saveUser(user);

  const otherId = user.currentView;
  const likedUser = await loadUser(otherId);
  if (!likedUser) return ctx.reply("Помилка при завантаженні анкети.");

  likedUser.pendingLikes = likedUser.pendingLikes || [];
  if (!likedUser.pendingLikes.includes(user.id)) {
    likedUser.pendingLikes.unshift(user.id); // на початок
  }
  await saveUser(likedUser);

  try {
    await ctx.telegram.sendMessage(
      otherId,
      `💥 У вас СУПЕР-ЛАЙК від @${user.username || user.id}!`
    );
  } catch (e) {
    console.error("SUPERLIKE NOTIFY ERROR", e);
  }

  await ctx.reply("💥 Супер-лайк надіслано!", searchMenu);
  user.seen = user.seen || [];
  if (!user.seen.includes(otherId)) user.seen.push(otherId);
  await saveUser(user);
  await handleSearch(ctx, user, id, false);
});

// Меню редагування профілю: поля
bot.action("edit_name", async (ctx) => {
  try {
    const id = ctx.from.id;
    let user = await loadUser(id);
    if (!user) {
      return ctx.answerCbQuery("Сталася помилка: не знайдено користувача.");
    }
    user.editStep = "edit_name";
    await saveUser(user);
    await ctx.reply(
      "✏️ Введи нове імʼя:",
      Markup.keyboard([["Відмінити"]])
        .resize()
        .oneTime(true)
    );
  } catch (e) {
    console.error("EDIT_NAME ERROR:", e);
    await ctx.reply("Виникла технічна помилка. Спробуйте ще раз.");
  }
});
bot.action("edit_gender", async (ctx) => {
  try {
    const id = ctx.from.id;
    let user = await loadUser(id);
    if (!user) {
      return ctx.answerCbQuery("Сталася помилка: не знайдено користувача.");
    }
    user.editStep = "edit_gender";
    await saveUser(user);
    return ctx.reply(
      "⚧ Обери стать:",
      Markup.keyboard([["Хлопець", "Дівчина"], ["Відмінити"]])
        .resize()
        .oneTime(true)
    );
  } catch (e) {
    console.error("EDIT_GENDER ERROR:", e);
    await ctx.reply("Виникла технічна помилка. Спробуйте ще раз.");
  }
});
bot.action("edit_age", async (ctx) => {
  try {
    const id = ctx.from.id;
    let user = await loadUser(id);
    if (!user) {
      return ctx.answerCbQuery("Сталася помилка: не знайдено користувача.");
    }
    user.editStep = "edit_age";
    await saveUser(user);
    await ctx.reply(
      "🎂 Введи новий вік:",
      Markup.keyboard([["Відмінити"]])
        .resize()
        .oneTime(true)
    );
  } catch (e) {
    console.error("EDIT_AGE ERROR:", e);
    await ctx.reply("Виникла технічна помилка. Спробуйте ще раз.");
  }
});
bot.action("edit_city", async (ctx) => {
  try {
    const id = ctx.from.id;
    let user = await loadUser(id);
    if (!user) {
      return ctx.answerCbQuery("Сталася помилка: не знайдено користувача.");
    }
    user.editStep = "edit_city";
    await saveUser(user);
    await ctx.reply(
      "🏠 Введи нову назву міста:",
      Markup.keyboard([["Відмінити"]])
        .resize()
        .oneTime(true)
    );
  } catch (e) {
    console.error("EDIT_CITY ERROR:", e);
    await ctx.reply("Виникла технічна помилка. Спробуйте ще раз.");
  }
});
bot.action("edit_about", async (ctx) => {
  try {
    const id = ctx.from.id;
    let user = await loadUser(id);
    if (!user) {
      return ctx.answerCbQuery("Сталася помилка: не знайдено користувача.");
    }
    user.editStep = "edit_about";
    await saveUser(user);
    await ctx.reply(
      "📝 Введи новий опис:",
      Markup.keyboard([["Відмінити"]])
        .resize()
        .oneTime(true)
    );
  } catch (e) {
    console.error("EDIT_ABOUT ERROR:", e);
    await ctx.reply("Виникла технічна помилка. Спробуйте ще раз.");
  }
});
// Edit searchGender
bot.action("edit_searchGender", async (ctx) => {
  const id = ctx.from.id;
  const user = await loadUser(id);
  user.editStep = "edit_searchGender";
  await saveUser(user);
  return ctx.reply(
    "🔎 Які анкети хочеш шукати? Обери стать:",
    Markup.keyboard([["Хлопці", "Дівчата", "Будь-хто"], ["Відмінити"]])
      .resize()
      .oneTime(true)
  );
});
bot.action("edit_photos", async (ctx) => {
  try {
    const id = ctx.from.id;
    let user = await loadUser(id);
    if (!user) {
      return ctx.answerCbQuery("Користувача не знайдено.");
    }
    user.editStep = "edit_photos";
    // Backup existing photos in case of cancellation
    user._backupPhotos = user.data.photos ? [...user.data.photos] : [];
    user.data.photos = [];
    await saveUser(user);
    // Запитуємо фото через reply-клавіатуру
    await ctx.reply(
      "📸 Надішліть до 3 фото. Коли готові — натисніть «Готово».",
      Markup.keyboard([["Готово", "Відмінити"]])
        .resize()
        .oneTime(true)
    );
  } catch (e) {
    console.error("EDIT_PHOTOS ERROR:", e);
    await ctx.reply("Виникла помилка. Спробуйте ще раз.");
  }
});

bot.action(/^blacklist_confirm_(\d+)$/, async (ctx) => {
  const blockedId = parseInt(ctx.match[1]);
  const id = ctx.from.id;
  const user = await loadUser(id);
  if (!user || !user.finished)
    return ctx.reply("Помилка: не знайдено ваш профіль.");

  // Дозволяємо додавання до чорного списку лише під час перегляду анкети в пошуку
  if (user.lastAction !== "search" || user.currentView !== blockedId) {
    return ctx.reply(
      "❗ Заблокувати можна лише під час перегляду анкети в пошуку."
    );
  }

  user.blacklist = user.blacklist || [];

  if (user.blacklist.length >= 50) {
    return ctx.reply("🚫 Ти досяг ліміту в 50 заблокованих користувачів.");
  }

  if (!user.blacklist.includes(blockedId)) {
    user.blacklist.push(blockedId);
    await saveUser(user);
    await ctx.reply("Користувача додано до чорного списку.");
  } else {
    await ctx.reply("Цей користувач вже у чорному списку.");
  }

  await handleSearch(ctx, user, id, false);
});

bot.action("blacklist_cancel", async (ctx) => {
  const id = ctx.from.id;
  const user = await loadUser(id);
  await ctx.reply("Дію скасовано.");
  if (user && user.currentView) {
    await handleSearch(ctx, user, id, false);
  }
});

// Обробка повідомлень (тільки для введення тексту/фото/етапи)
bot.on("message", async (ctx, next) => {
  try {
    const id = ctx.from.id;
    let user = await loadUser(id);
    if (!user) {
      user = { ...startProfile, id, username: ctx.from.username || null };
      await saveUser(user);
    }
    if (!user.pendingLikes) user.pendingLikes = [];

    // --- Блок редагування профілю ---
    if (user && user.editStep) {
      // Allow cancel during edit flow
      if (ctx.message.text === "Відмінити" || ctx.message.text === "/cancel") {
        user.editStep = null;
        // Restore photos if we had a backup
        if (user._backupPhotos) {
          user.data.photos = [...user._backupPhotos];
          delete user._backupPhotos;
        }
        await saveUser(user);
        return ctx.reply("Редагування профілю скасовано ❌", mainMenu);
      }
      try {
        switch (user.editStep) {
          case "edit_searchGender":
            if (!["Хлопці", "Дівчата", "Будь-хто"].includes(ctx.message.text)) {
              return ctx.reply("Будь ласка, обери стать з клавіатури:");
            }
            user.data.searchGender = ctx.message.text;
            user.editStep = null;
            await saveUser(user);
            await ctx.reply("Налаштування пошуку статі змінено ✅", mainMenu);
            break;
          case "edit_name":
            if (!ctx.message.text || ctx.message.text.length < 2) {
              return ctx.reply("Введи коректне імʼя:");
            }
            user.data.name = ctx.message.text.trim();
            user.editStep = null;
            await saveUser(user);
            await ctx.reply("Імʼя змінено ✅", mainMenu);
            break;
          case "edit_gender":
            if (!["Хлопець", "Дівчина"].includes(ctx.message.text)) {
              return ctx.reply("Будь ласка, обери стать з клавіатури:");
            }
            user.data.gender = ctx.message.text;
            user.editStep = null;
            await saveUser(user);
            await ctx.reply("Стать змінено ✅", mainMenu);
            break;
          case "edit_age":
            {
              const age = parseInt(ctx.message.text, 10);
              if (isNaN(age) || age < 18 || age > 99) {
                return ctx.reply("Введи коректний вік (18-99):");
              }
              user.data.age = age;
              user.editStep = null;
              await saveUser(user);
              await ctx.reply("Вік змінено ✅", mainMenu);
            }
            break;
          case "edit_city":
            if (!ctx.message.text || ctx.message.text.length < 2) {
              return ctx.reply("Введи коректну назву міста:");
            }
            user.data.city = ctx.message.text.trim();
            // Geocode city to coordinates
            try {
              const geoRes = await geocoder.geocode(user.data.city);
              if (geoRes && geoRes.length) {
                user.data.latitude = geoRes[0].latitude;
                user.data.longitude = geoRes[0].longitude;
              }
            } catch (e) {
              console.error("GEOCODE ERROR:", e);
            }
            await saveUser(user);
            user.editStep = null;
            await ctx.reply("Місто змінено ✅", mainMenu);
            break;
          case "edit_about":
            if (ctx.message.text && ctx.message.text.length > 200) {
              return ctx.reply("Опис має бути до 200 символів.");
            }
            user.data.about = ctx.message.text?.trim() || "";
            user.editStep = null;
            await saveUser(user);
            await ctx.reply("Опис змінено ✅", mainMenu);
            break;
          case "edit_photos":
            if (ctx.message.photo) {
              const fileId =
                ctx.message.photo[ctx.message.photo.length - 1].file_id;
              user.data.photos.push(fileId);
              await saveUser(user);
              const count = user.data.photos.length;
              const text =
                count < 3
                  ? `Фото додано (${count}/3). Надішліть ще або натисніть «Готово».`
                  : `Фото додано (${count}/3). Максимум досягнуто. Натисніть «Готово».`;
              return ctx.reply(
                text,
                Markup.keyboard([["Готово", "Відмінити"]])
                  .resize()
                  .oneTime(true)
              );
            }
            if (
              ctx.message.text === "Готово" ||
              ctx.message.text?.toLowerCase() === "готово"
            ) {
              if (!user.data.photos || user.data.photos.length === 0) {
                return ctx.reply(
                  "Будь ласка, надішліть хоча б одне фото.",
                  Markup.keyboard([["Готово", "Відмінити"]])
                    .resize()
                    .oneTime(true)
                );
              }
              user.editStep = null;
              // Clear backup after successful update
              if (user._backupPhotos) {
                delete user._backupPhotos;
              }
              await saveUser(user);
              return ctx.reply("✅ Фото профілю оновлено!", mainMenu);
            }
            return ctx.reply(
              "Надішліть фото або натисніть «Готово».",
              Markup.keyboard([["Готово", "Відмінити"]])
                .resize()
                .oneTime(true)
            );
        }
        return;
      } catch (e) {
        console.error("EDIT_STEP MESSAGE ERROR:", e);
        await ctx.reply("Виникла технічна помилка. Спробуйте ще раз.");
        return;
      }
    }

    // Якщо анкета вже заповнена — не реагувати (всі дії через інлайн)
    if (user.finished) return next();

    // --- Заповнення анкети step-by-step ---
    try {
      switch (user.step) {
        case "name":
          if (!ctx.message.text || ctx.message.text.length < 2) {
            return ctx.reply("Введи коректне імʼя:");
          }
          user.data.name = ctx.message.text.trim();
          user.step = "age";
          await saveUser(user);
          await ctx.reply("🎂 Скільки тобі років?");
          break;
        case "age": {
          const age = parseInt(ctx.message.text, 10);
          if (isNaN(age) || age < 18 || age > 99) {
            return ctx.reply("Введи коректний вік (18-99):");
          }
          user.data.age = age;
          user.step = "gender";
          await saveUser(user);
          // Prompt for gender immediately
          return ctx.reply(
            "⚧ Обери стать:",
            Markup.keyboard([["Хлопець", "Дівчина"]])
              .resize()
              .oneTime(true)
          );
        }
        case "gender":
          if (!["Хлопець", "Дівчина"].includes(ctx.message.text)) {
            return ctx.reply("Будь ласка, обери стать з клавіатури:");
          }
          user.data.gender = ctx.message.text;
          user.step = "city";
          await saveUser(user);
          await ctx.reply("🏠 В якому місті ти живеш?");
          break;
        case "city":
          if (!ctx.message.text || ctx.message.text.length < 2) {
            return ctx.reply("Введи коректну назву міста:");
          }
          user.data.city = ctx.message.text.trim();
          // Geocode city to coordinates
          try {
            const geoRes = await geocoder.geocode(user.data.city);
            if (geoRes && geoRes.length) {
              user.data.latitude = geoRes[0].latitude;
              user.data.longitude = geoRes[0].longitude;
            }
          } catch (e) {
            console.error("GEOCODE ERROR:", e);
          }
          user.step = "about";
          await saveUser(user);
          await ctx.reply(
            "📝 За бажанням, можеш додати інформацію про себе:",
            Markup.keyboard([["Пропустити"]]).resize().oneTime(true)
          );
          break;
        case "about":
          if (ctx.message.text === "Пропустити") {
            user.data.about = "";
            user.step = "photos";
            await saveUser(user);
            return ctx.reply(
              "📸 Надішліть до 3 фото. Коли готові — натисніть «Готово».",
              Markup.keyboard([["Готово"]]).resize().oneTime(true)
            );
          }
          if (ctx.message.text && ctx.message.text.length > 200) {
            return ctx.reply("📝 Текст має бути до 200 символів:");
          }
          user.data.about = ctx.message.text?.trim() || "";
          user.step = "photos";
          await saveUser(user);
          return ctx.reply(
            "📸 Надішліть до 3 фото. Коли готові — натисніть «Готово».",
            Markup.keyboard([["Готово"]]).resize().oneTime(true)
          );
        case "photos":
          if (ctx.message.photo) {
            if (user.data.photos.length >= 3) {
              return ctx.reply(
                "3 фото додано. Максимум досягнуто. Натисніть «Готово».",
                Markup.keyboard([["Готово"]])
                  .resize()
                  .oneTime(true)
              );
            }
            // Only add the last (highest-res) photo from the message
            const fileId =
              ctx.message.photo[ctx.message.photo.length - 1].file_id;
            user.data.photos.push(fileId);
            await saveUser(user);
            const count = user.data.photos.length;
            const text =
              count < 3
                ? `Фото додано (${count}/3). Надішліть ще або натисніть «Готово».`
                : `Фото додано (${count}/3). Максимум досягнуто. Натисніть «Готово».`;
            return ctx.reply(
              text,
              Markup.keyboard([["Готово"]])
                .resize()
                .oneTime(true)
            );
          }
          if (
            ctx.message.text === "Готово" ||
            ctx.message.text?.toLowerCase() === "готово"
          ) {
            if (user.data.photos.length === 0) {
              return ctx.reply(
                "Будь ласка, надішліть хоча б одне фото.",
                Markup.keyboard([["Готово"]])
                  .resize()
                  .oneTime(true)
              );
            }
            // Move to search-gender selection
            user.step = "searchGender";
            await saveUser(user);
            return ctx.reply(
              "🔎 Які анкети ти хочеш шукати? Обери стать:",
              Markup.keyboard([["Хлопці", "Дівчата", "Будь-хто"]])
                .resize()
                .oneTime(true)
            );
          }
          return ctx.reply(
            "Надішліть фото або натисніть «Готово».",
            Markup.keyboard([["Готово"]])
              .resize()
              .oneTime(true)
          );
        case "searchGender":
          if (!["Хлопці", "Дівчата", "Будь-хто"].includes(ctx.message.text)) {
            return ctx.reply(
              "🔎 Будь ласка, обери стать з клавіатури:",
              Markup.keyboard([["Хлопці", "Дівчата", "Будь-хто"]])
                .resize()
                .oneTime(true)
            );
          }
          if (ctx.message.text === "Відмінити") {
            user.data.searchGender = "";
          } else {
            user.data.searchGender = ctx.message.text;
          }
          user.finished = true;
          user.step = null;
          await saveUser(user);
          return ctx.reply("✅ Ваша анкета готова!", mainMenu);
        default:
          await ctx.reply("Щось пішло не так. /start щоб почати спочатку.");
      }
    } catch (e) {
      console.error("STEP MESSAGE ERROR:", e);
      await ctx.reply("Виникла технічна помилка. Спробуйте ще раз.");
    }
  } catch (e) {
    console.error("MESSAGE ERROR:", e);
    await ctx.reply("Виникла технічна помилка. Спробуйте ще раз.");
  }
});

async function handleSearch(ctx, user, id, isInline = false) {
  try {
    if (!user || !user.finished) {
      if (isInline) return ctx.answerCbQuery("Спочатку створи свою анкету!");
      return ctx.reply("Спочатку створи свою анкету!");
    }

    const hasPending = await checkPendingLikes(ctx, user);
    if (hasPending) return;

    const seen = user.seen || [];
    const disliked = user.disliked || [];
    const [_, allUsers] = await Promise.all([
      Promise.resolve(user), // keep for symmetry, user is already loaded
      getAllUsers(),
    ]);
    // Initial filter: exclude self, unfinished, seen, disliked, currentView, and users without valid photo(s)
    let filtered = allUsers.filter(
      (u) =>
        u.id !== id &&
        u.finished &&
        !seen.includes(u.id) &&
        u.id !== user.currentView &&
        !disliked.includes(u.id) &&
        !(user.blacklist || []).includes(u.id) &&
        Array.isArray(u.data.photos) &&
        u.data.photos.some(Boolean)
    );
    // Apply gender filter if selected
    if (
      user.data.searchGender &&
      user.data.searchGender !== "" &&
      user.data.searchGender !== "Будь-хто"
    ) {
      const target =
        user.data.searchGender === "Хлопці" ? "Хлопець" : "Дівчина";
      filtered = filtered.filter((u) => u.data.gender === target);
    }
    // Sort by proximity if coordinates are available
    let candidates = filtered;
    if (user.data.latitude != null && user.data.longitude != null) {
      const withCoords = filtered.filter(
        (u) => u.data.latitude != null && u.data.longitude != null
      );
      const sortedCoords = withCoords
        .map((u) => ({
          user: u,
          distance: geolib.getDistance(
            { latitude: user.data.latitude, longitude: user.data.longitude },
            { latitude: u.data.latitude, longitude: u.data.longitude }
          ),
        }))
        .sort((a, b) => a.distance - b.distance)
        .map((item) => item.user);
      const withoutCoords = filtered.filter(
        (u) => u.data.latitude == null || u.data.longitude == null
      );
      candidates = [...sortedCoords, ...withoutCoords];
    }
    const other = candidates.length ? candidates[0] : null;

    if (!other) {
      user.currentView = null;
      user.disliked = [];
      user.lastAction = "search";
      user.hasUsedBackInSearch = false;
      await saveUser(user);
      if (isInline) {
        await ctx.editMessageText(
          "Анкет більше немає. Спробуй пізніше.",
          mainMenu
        );
      } else {
        await ctx.reply("Анкет більше немає. Спробуй пізніше.", mainMenu);
      }
      return;
    }

    // Save previous view before updating
    user.lastView = user.currentView || null;
    user.currentView = other.id;
    user.lastAction = "search";
    user.hasUsedBackInSearch = false;
    await saveUser(user);

    const photos = other.data.photos;
    await ctx.replyWithMediaGroup([
      {
        type: "photo",
        media: photos[0],
        caption: prettyProfile(other),
        parse_mode: "HTML",
      },
      ...photos.slice(1).map((file_id) => ({
        type: "photo",
        media: file_id,
      })),
    ]);
    // Use reply-keyboard for search mode
    await ctx.reply("💝/❌ Зробіть свій вибір:", searchMenu);
  } catch (e) {
    console.error("handleSearch ERROR:", e);
    await ctx.reply("Виникла технічна помилка. Спробуйте ще раз.");
  }
}

async function handleLikeDislike(ctx, user, action, isInline = false) {
  try {
    // Очистити editStep, якщо анкета завершена, але editStep лишився
    if (user && user.finished && user.editStep) {
      user.editStep = null;
      await saveUser(user);
    }
    if (!user || !user.currentView) {
      if (isInline) return ctx.answerCbQuery("Помилка. Спробуй знову");
      return ctx.reply("Помилка. Спробуй знову");
    }
    const id = ctx.from.id;
    const otherId = user?.currentView;

    // Ліміт лайків на день: перевірка тільки для дії like
    if (action === "like") {
      const today = new Date().toISOString().slice(0, 10);
      if (!user.lastLikeDate || user.lastLikeDate !== today) {
        user.lastLikeDate = today;
        user.dailyLikes = 0;
      }
      const referralBonus = (user.referrals?.length || 0) * 5;
      const maxLikes = 50 + referralBonus;
      if (user.dailyLikes >= maxLikes) {
        return ctx.reply(
          `🚫 Ви досягли денного ліміту лайків. Спробуйте пізніше.`
        );
      }
      user.dailyLikes = (user.dailyLikes || 0) + 1;
      await saveUser(user);
    }

    // Load both user and liked/disliked user in parallel
    const [_, likedUser] = await Promise.all([
      Promise.resolve(user), // user already loaded
      loadUser(otherId),
    ]);
    if (!likedUser.seen) likedUser.seen = [];
    // If the liked user is a mock, skip real messaging
    if (likedUser && likedUser.mock) {
      // Treat as a simple like: mark seen and show next profile
      if (!user.seen.includes(otherId)) {
        user.seen.push(otherId);
      }
      await saveUser(user);
      return await handleSearch(ctx, user, id, isInline);
    }

    if (action === "dislike") {
      // Не додаємо otherId до seen при дизлайку
    } else {
      if (!user.seen.includes(otherId)) {
        user.seen.push(otherId);
      }
      await saveUser(user);
    }

    if (likedUser) {
      if (action === "like") {
        if ((likedUser.seen || []).includes(id)) {
          // Mutual like: send media group (profile) and notification to both
          // Для likedUser (otherId)
          if (user.data.photos && user.data.photos.length > 0) {
            try {
              await ctx.telegram.sendMediaGroup(otherId, [
                {
                  type: "photo",
                  media: user.data.photos[0],
                  caption: prettyProfile(user),
                  parse_mode: "HTML",
                },
                ...user.data.photos.slice(1).map((file_id) => ({
                  type: "photo",
                  media: file_id,
                })),
              ]);
            } catch (err) {
              if (
                (err.description &&
                  err.description.includes("bot was blocked by the user")) ||
                (err.description && err.description.includes("USER_IS_BLOCKED"))
              ) {
                return await handleSearch(ctx, user, id, isInline);
              } else {
                throw err;
              }
            }
          }
          try {
            await ctx.telegram.sendMessage(
              otherId,
              `💞 У вас взаємний лайк з @${ctx.from.username || user.id}!`
            );
          } catch (err) {
            if (
              (err.description &&
                err.description.includes("bot was blocked by the user")) ||
              (err.description && err.description.includes("USER_IS_BLOCKED"))
            ) {
              return await handleSearch(ctx, user, id, isInline);
            } else {
              throw err;
            }
          }

          // Для користувача, який лайкнув (current user)
          if (likedUser.data.photos && likedUser.data.photos.length > 0) {
            try {
              await ctx.telegram.sendMediaGroup(id, [
                {
                  type: "photo",
                  media: likedUser.data.photos[0],
                  caption: prettyProfile(likedUser),
                  parse_mode: "HTML",
                },
                ...likedUser.data.photos.slice(1).map((file_id) => ({
                  type: "photo",
                  media: file_id,
                })),
              ]);
            } catch (err) {
              if (
                (err.description &&
                  err.description.includes("bot was blocked by the user")) ||
                (err.description && err.description.includes("USER_IS_BLOCKED"))
              ) {
                return await handleSearch(ctx, user, id, isInline);
              } else {
                throw err;
              }
            }
          }
          try {
            await ctx.telegram.sendMessage(
              id,
              `💞 У вас взаємний лайк з @${likedUser.username || likedUser.id}!`
            );
          } catch (err) {
            if (
              (err.description &&
                err.description.includes("bot was blocked by the user")) ||
              (err.description && err.description.includes("USER_IS_BLOCKED"))
            ) {
              return await handleSearch(ctx, user, id, isInline);
            } else {
              throw err;
            }
          }
          // Reset currentView after mutual like so profile doesn't reappear
          user.currentView = null;
          await saveUser(user);
          // Додаємо анкету до seen, якщо ще не додано
          if (!user.seen.includes(otherId)) {
            user.seen.push(otherId);
            await saveUser(user);
          }
          // Додаємо id до seen likedUser, якщо ще не додано
          if (!likedUser.seen.includes(id)) {
            likedUser.seen.push(id);
            await saveUser(likedUser);
          }
          // After mutual like, proceed to next profile
          return await handleSearch(ctx, user, id, isInline);
        } else {
          if (!likedUser.pendingLikes) likedUser.pendingLikes = [];
          if (!likedUser.pendingLikes.includes(user.id)) {
            likedUser.pendingLikes.push(user.id);
            await saveUser(likedUser);

            // Негайне повідомлення користувачу, якому поставили лайк
            // Спочатку його профіль
            if (user.data.photos && user.data.photos.length > 0) {
              try {
                await ctx.telegram.sendMediaGroup(likedUser.id, [
                  {
                    type: "photo",
                    media: user.data.photos[0],
                    caption: prettyProfile(user),
                    parse_mode: "HTML",
                  },
                  ...user.data.photos.slice(1).map((file_id) => ({
                    type: "photo",
                    media: file_id,
                  })),
                ]);
              } catch (err) {
                if (
                  (err.description &&
                    err.description.includes("bot was blocked by the user")) ||
                  (err.description &&
                    err.description.includes("USER_IS_BLOCKED"))
                ) {
                  return await handleSearch(ctx, user, id, isInline);
                } else {
                  throw err;
                }
              }
            }
            // Потім текст з кнопками pendingMenu
            try {
              await ctx.telegram.sendMessage(
                likedUser.id,
                "💞 Вам хтось поставив лайк!",
                pendingMenu
              );
            } catch (err) {
              if (
                (err.description &&
                  err.description.includes("bot was blocked by the user")) ||
                (err.description && err.description.includes("USER_IS_BLOCKED"))
              ) {
                return await handleSearch(ctx, user, id, isInline);
              } else {
                throw err;
              }
            }
          }
        }
      }
    }
    if (action === "dislike") {
      if (!user.disliked) user.disliked = [];
      if (!user.disliked.includes(otherId)) {
        user.disliked.push(otherId);
      }
      await saveUser(user);
    }
    await handleSearch(ctx, user, id, isInline);
  } catch (e) {
    console.error("handleLikeDislike ERROR:", e);
    await ctx.reply("Виникла технічна помилка. Спробуйте ще раз.");
  }
}

// --------------------- Запуск ------------------------
(async () => {
  try {
    const WEBHOOK_PATH = "/bot" + process.env.BOT_TOKEN;
    const WEBHOOK_URL = `https://${
      process.env.RENDER_EXTERNAL_HOSTNAME || "your-app-name.onrender.com"
    }${WEBHOOK_PATH}`;

    // Set bot commands and webhook
    await bot.telegram.setMyCommands([
      { command: "profile", description: "⚙️ Профіль" },
      { command: "premium", description: "⭐️ Преміум" },
      { command: "referral", description: "🎁 Реферальна система" },
      { command: "privacy", description: "🔒 Політика приватності" },
      { command: "blacklist", description: "🚫 Додати в чорний список" },
      { command: "language", description: "🌐 Мова" },
    ]);
    await bot.telegram.setWebhook(WEBHOOK_URL);

    // Start webhook listener
    app.use(bot.webhookCallback(WEBHOOK_PATH));
    app.get("/", (req, res) => res.send("Znaimo bot is alive!"));

    // Listen on port
    app.listen(process.env.PORT, () => {
      console.log(`Server listening on port ${process.env.PORT}`);
    });
  } catch (e) {
    console.error("Startup error:", e);
  }
})();

// push messages
cron.schedule("0 */12 * * *", async () => {
  const allUsers = await getAllUsers();
  const now = Date.now();

  for (const user of allUsers) {
    if (!user.finished || !user.username) continue;

    const lastUpdated = new Date(
      user.updatedAt || user.createdAt || now
    ).getTime();
    if (now - lastUpdated < 12 * 60 * 60 * 1000) continue; // якщо був активний менш ніж 12 годин тому

    try {
      await bot.telegram.sendMessage(
        user.id,
        `👋 Привіт! У нас нові анкети — перевір, хто тебе міг вже лайкнути!`,
        Markup.keyboard([["🔍", "⚙️"]])
          .resize()
          .oneTime(true)
      );
    } catch (e) {
      if (
        e.description?.includes("bot was blocked by the user") ||
        e.description?.includes("USER_IS_BLOCKED")
      ) {
        continue;
      }
      console.error("PUSH ERROR:", e);
    }
  }
});

process.once("SIGINT", () => process.exit(0));
process.once("SIGTERM", () => process.exit(0));

// Кнопки пошуку (reply-keyboard)
bot.hears("💝", async (ctx) => {
  const id = ctx.from.id;
  let user = await loadUser(id);
  if (!user || !user.finished || !user.currentView) {
    return ctx.reply("Немає доступної анкети для оцінки.");
  }
  await handleLikeDislike(ctx, user, "like");
});

bot.hears("❌", async (ctx) => {
  const id = ctx.from.id;
  let user = await loadUser(id);
  if (!user || !user.finished || !user.currentView) {
    return ctx.reply("Немає доступної анкети для оцінки.");
  }
  await handleLikeDislike(ctx, user, "dislike");
});

bot.hears("⚙️", async (ctx) => {
  const id = ctx.from.id;
  let user = await loadUser(id);
  if (!user || !user.finished) {
    return ctx.reply("Ти ще не створив анкету! Натисни /start щоб почати.");
  }
  if (!user.data.photos || user.data.photos.length === 0) {
    return ctx.reply("У твоїй анкеті ще немає фото.");
  }
  const photos = user.data.photos;
  await ctx.replyWithMediaGroup([
    {
      type: "photo",
      media: photos[0],
      caption: prettyProfile(user),
      parse_mode: "HTML",
    },
    ...photos.slice(1).map((file_id) => ({
      type: "photo",
      media: file_id,
    })),
  ]);
  await ctx.reply("Обери дію:", mainMenu);
});

// Реферальна система
bot.command("referral", async (ctx) => {
  const id = ctx.from.id;
  const user = await loadUser(id);
  if (!user || !user.finished) {
    return ctx.reply("Спочатку створи анкету через /start.");
  }
  const count = user.referrals ? user.referrals.length : 0;
  const today = new Date().toISOString().slice(0, 10);
  const referralBonus = count * 5;
  const likesToday = user.lastLikeDate === today ? user.dailyLikes || 0 : 0;
  const maxLikes = 50 + referralBonus;

  await ctx.replyWithHTML(`🎁 <b>Реферальна система</b>

📨 <b>Запрошено друзів:</b> <b>${count}</b>

🔗 <b>Твоє посилання для запрошень:</b>
<code>https://t.me/${ctx.botInfo.username}?start=${id}</code>

❤️ <b>Денний ліміт лайків:</b> <b>${likesToday}/${maxLikes}</b>
(🧩 <i>50 базових</i> + 💎 <i>${referralBonus} за запрошених</i>)

📌 <i>Додаткові лайки нараховуються, якщо запрошена людина створить анкету і лайкне хоча б 1 анкету.</i>`);
});

// Преміум система
bot.command("premium", async (ctx) => {
  const id = ctx.from.id;
  const user = await loadUser(id);
  if (!user || !user.finished) {
    return ctx.reply("Спочатку створи анкету через /start.");
  }
  // TODO: імплементувати логіку рефералів
  await ctx.reply("⭐ Преміум система поки в розробці.");
});

// Політика приватності
bot.command("privacy", async (ctx) => {
  const id = ctx.from.id;
  const user = await loadUser(id);
  if (!user || !user.finished) {
    return ctx.reply("Спочатку створи анкету через /start.");
  }
  await ctx.replyWithHTML(`
🔒 <b>Політика приватності для Telegram-бота Znaimo</b>
<i>Оновлено: 24 травня 2025</i>

<b>1. Загальні положення</b>
Ми цінуємо вашу приватність і прагнемо максимально прозоро пояснювати, які дані ми збираємо та як їх використовуємо. Ця політика описує обробку інформації користувачів бота Znaimo.

<b>2. Дані, які ми ЗБИРАЄМО і ЗБЕРІГАЄМО</b>
- <b>Особисті дані Telegram</b>: ID, ім’я, юзернейм
- <b>Дані анкети</b>: ім’я, вік, стать, місто, “Про себе”, фото (<code>file_id</code>), параметри пошуку
- <b>Метадані</b>: час створення/оновлення анкети, статус (активна/деактивована)
- <b>Лайки/дизлайки</b>: кому ви ставили і хто вам ставив 💝 або ❌

<b>3. Дані, які ми НЕ ЗБИРАЄМО</b>
- Контакти, email, телефон
- Дані натискань кнопок (крім лайків)
- Повідомлення вільного чату поза анкетою

<b>4. Використання даних</b>
- Створення, показ та пошук анкет
- Сповіщення про взаємні лайки
- Сповіщення про відсутність після 12-ти годин повної відсутності користувача

<b>5. Зберігання та захист</b>
- Захищені сервери з резервним копіюванням
- Доступ тільки адміністратору
- Не передаємо дані третім особам, крім випадків, передбачених законом

<b>6. Видалення даних</b>
- Видалення відсутне. Змініть дані анкети на фейкові і видаліть бота зі свого чату, якщо необхідно.

<b>7. Зміни в політиці</b>
Ми можемо оновлювати цю політику; зміни будуть оголошені через бота.

<b>8. Контакти</b>
Співпраця/Питання/Зауваження: @znaimoHelper або пишіть на znaimo.bot@gmail.com
  `);
});

// Додати в чорний список
bot.command("blacklist", async (ctx) => {
  const id = ctx.from.id;
  const user = await loadUser(id);

  if (!user || !user.finished) {
    return ctx.reply("Спочатку створи анкету через /start.");
  }

  // Дозволяємо чорний список лише якщо користувач у режимі пошуку анкет
  if (user.lastAction !== "search") {
    return ctx.reply(
      "❗ Команду /blacklist можна використовувати лише під час перегляду анкет."
    );
  }

  if (!user.currentView) {
    return ctx.reply("Цю дію можна виконати лише під час перегляду анкети.");
  }

  const otherId = user.currentView;
  await ctx.reply(
    `🚫 Ви хочете додати цього користувача до чорного списку?`,
    Markup.inlineKeyboard([
      [Markup.button.callback("✅ Так", `blacklist_confirm_${otherId}`)],
      [Markup.button.callback("❌ Ні", `blacklist_cancel`)],
    ])
  );
});

// language
bot.command("language", async (ctx) => {
  const id = ctx.from.id;
  const user = await loadUser(id);
  if (!user || !user.finished) {
    return ctx.reply("Спочатку створи анкету через /start.");
  }
  // TODO: імплементувати переклади
  await ctx.reply("🌐 Майбутні мови: 🇵🇱, 🇬🇧 — у розробці.");
});

bot.action("edit_blacklist", async (ctx) => {
  const id = ctx.from.id;
  const user = await loadUser(id);

  if (!user || !user.finished) {
    return ctx.answerCbQuery("Спочатку створи анкету через /start.");
  }

  const blacklist = user.blacklist || [];
  if (!blacklist.length) {
    return ctx.reply("У тебе немає заблокованих користувачів.");
  }

  const buttons = [];
  for (let uid of blacklist) {
    const u = await loadUser(uid);
    const name = u?.data?.name || u?.username || `ID: ${uid}`;
    buttons.push([Markup.button.callback(`🚫 ${name}`, `unblock_${uid}`)]);
  }

  return ctx.reply(
    "🧾 Обери кого розблокувати:",
    Markup.inlineKeyboard(buttons)
  );
});

bot.action(/^unblock_(\d+)$/, async (ctx) => {
  const unblockId = parseInt(ctx.match[1]);
  const id = ctx.from.id;
  const user = await loadUser(id);

  if (!user || !user.blacklist) return ctx.reply("Немає доступу до списку.");
  user.blacklist = user.blacklist.filter((uid) => uid !== unblockId);
  await saveUser(user);

  await ctx.answerCbQuery("Користувача розблоковано.");
  await ctx.editMessageText("Користувача розблоковано ✅");
});

// Кнопка "⬅️ Назад" для повернення до попередньої анкети (нова логіка)
bot.hears("↩", async (ctx) => {
  const id = ctx.from.id;
  let user = await loadUser(id);

  if (!user || !user.finished || !user.lastView || user.hasUsedBackInSearch) {
    return ctx.reply("Немає попередньої анкети для перегляду.");
  }

  // Якщо останню анкету було лайкнуто — заборонити повертатись
  if (user.seen?.includes(user.lastView)) {
    user.lastView = null;
    await saveUser(user);
    return ctx.reply(
      "❌ Ви вже поставили лайк на цю анкету. Назад повернутись не можна."
    );
  }

  const prevUser = await loadUser(user.lastView);
  if (!prevUser || !prevUser.data.photos || prevUser.data.photos.length === 0) {
    user.lastView = null;
    await saveUser(user);
    return ctx.reply("Попередню анкету не знайдено або вона видалена.");
  }

  user.currentView = user.lastView;
  user.lastView = null;
  user.hasUsedBackInSearch = true;
  await saveUser(user);

  const photos = prevUser.data.photos;
  await ctx.replyWithMediaGroup([
    {
      type: "photo",
      media: photos[0],
      caption: prettyProfile(prevUser),
      parse_mode: "HTML",
    },
    ...photos.slice(1).map((file_id) => ({
      type: "photo",
      media: file_id,
    })),
  ]);
});

// FAQ handler (оновлений текст і emoji-кнопка)
bot.hears("❓", async (ctx) => {
  await ctx.replyWithHTML(`
📘 <b>Пояснення кнопок</b>

🔍 — Перегляд анкет інших користувачів.
✏️ — Редагування своєї анкети.
💝 — Звичайний лайк. Якщо взаємно — отримаєте контакт.
💥 — <b>Супер-лайк</b>. Один на день. Сповіщає іншу людину одразу.
❌ — Пропустити анкету.
↩ — Повернення до попередньої (один раз за пошук).
⭐ - Преміум. Можливість виділитися та збільшити шанси на знаходження того, кого шукаєш.
⚙️ — Перегляд або редагування свого профілю.
❓ — Довідка про функціонал бота.
    `);
});

// Преміум переваги та покупка
bot.hears("⭐", async (ctx) => {
  await ctx.replyWithHTML(
    `
<b>⭐ Переваги Преміуму</b>

• 🇺🇦 <b>Пошук по місту</b>: можливість шукати людей зі свого міста або області

• 📓 <b>Збільшено ліміт чорного списку</b>: з 50 до 100 користувачів

• 📵 <b>Реклама відсутня</b>

• 💘 <b>Підтримка проєкту</b>: Ви допомагаєте нам підтримувати бота без реклами і розвивати його функціонал далі
    `,
    Markup.inlineKeyboard([
      [Markup.button.callback("💳 Купити Преміум", "buy_premium")],
    ])
  );
});

bot.action("buy_premium", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    "⏳ Оплата наразі у розробці. Незабаром зʼявиться можливість підтримати нас ❤️"
  );
});
