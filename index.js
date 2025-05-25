const express = require("express");
const { Telegraf, Markup } = require("telegraf");
require("dotenv").config();

const { loadUser, saveUser } = require("./mongo");

const NodeGeocoder = require("node-geocoder");
const geocoder = NodeGeocoder({ provider: "openstreetmap" });

const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN);

const { handleLikeDislike } = require("./handlers/like");
const { registerStartHandlers } = require("./handlers/start");
const { registerPushNotifications } = require("./handlers/push");
const { registerProfileHandlers } = require("./handlers/profile");
const {
  handleSearch,
  checkPendingLikes,
  prettyProfile,
} = require("./handlers/search");

registerStartHandlers(bot);
registerProfileHandlers(bot);
registerPushNotifications(bot);

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

// Основні меню як звичайна клавіатура
const mainMenu = Markup.keyboard([["🔍 Анкети", "✏️ Змінити", "📝 Профіль"]])
  .resize()
  .oneTime(false);
// Відображення власного профілю через клавіатуру
bot.hears("📝 Профіль", async (ctx) => {
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
const searchMenu = Markup.keyboard([["💝", "❌", "📝 Профіль"]])
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
};

bot.command("find", async (ctx) => {
  // Дія як bot.action("search")
  const id = ctx.from.id;
  let user = await loadUser(id);
  if (!user || !user.finished) {
    return ctx.reply("Спочатку створи анкету через /start");
  }
  await handleSearch(ctx, user, id, false);
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

bot.hears("🔍 Анкети", async (ctx) => {
  const id = ctx.from.id;
  let user = await loadUser(id);

  const hasPending = await checkPendingLikes(ctx, user);
  if (hasPending) return;

  if (!user || !user.finished) {
    return ctx.reply("Спочатку створи анкету через /start");
  }
  await handleSearch(ctx, user, id, false);
});

bot.hears("✏️ Змінити", async (ctx) => {
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
      Markup.keyboard([["Хлопець", "Дівчина", "Інше"], ["Відмінити"]])
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
      "📝 Введи новий опис (5-200 символів):",
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
            if (!["Хлопець", "Дівчина", "Інше"].includes(ctx.message.text)) {
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
            if (
              !ctx.message.text ||
              ctx.message.text.length < 5 ||
              ctx.message.text.length > 200
            ) {
              return ctx.reply("Введи опис від 5 до 200 символів:");
            }
            user.data.about = ctx.message.text.trim();
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
            Markup.keyboard([["Хлопець", "Дівчина", "Інше"]])
              .resize()
              .oneTime(true)
          );
        }
        case "gender":
          if (!["Хлопець", "Дівчина", "Інше"].includes(ctx.message.text)) {
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
            "📝 Розкажи про себе коротко (до 200 символів):",
            Markup.removeKeyboard()
          );
          break;
        case "about":
          if (
            !ctx.message.text ||
            ctx.message.text.length < 5 ||
            ctx.message.text.length > 200
          ) {
            return ctx.reply(
              "📝 Введи коротку інформацію про себе (5–200 символів):"
            );
          }
          user.data.about = ctx.message.text.trim();
          user.step = "photos";
          await saveUser(user);
          return ctx.reply(
            "📸 Надішліть до 3 фото. Коли готові — натисніть «Готово».",
            Markup.keyboard([["Готово"]])
              .resize()
              .oneTime(true)
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

// --------------------- Запуск ------------------------
(async () => {
  try {
    const WEBHOOK_PATH = "/bot" + process.env.BOT_TOKEN;
    const WEBHOOK_URL = `https://${
      process.env.RENDER_EXTERNAL_HOSTNAME || "your-app-name.onrender.com"
    }${WEBHOOK_PATH}`;

    // Set bot commands and webhook
    await bot.telegram.setMyCommands([
      { command: "profile", description: "📝 Профіль" },
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

// Реферальна система
bot.command("referral", async (ctx) => {
  const id = ctx.from.id;
  const user = await loadUser(id);
  if (!user || !user.finished) {
    return ctx.reply("Спочатку створи анкету через /start.");
  }
  const link = `https://t.me/${ctx.botInfo.username}?start=${id}`;
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
- <b>Метадані</b>: час створення/оновлення анкети, статус (активна/деактивована), інкогніто-режим
- <b>Лайки/дизлайки</b>: кому ви ставили і хто вам ставив 💝/❌, вміст повідомлень

<b>3. Дані, які ми НЕ ЗБИРАЄМО</b>
- Контакти, email, телефон
- Дані натискань кнопок (крім лайків)
- Повідомлення вільного чату поза анкетою

<b>4. Використання даних</b>
- Створення, показ та пошук анкет
- Сповіщення про взаємні лайки

<b>5. Зберігання та захист</b>
- Захищені сервери з резервним копіюванням
- Доступ тільки адміністраторам
- Не передаємо дані третім особам, крім випадків, передбачених законом

<b>6. Видалення даних</b>
- <code>/delete</code> (поки не реалізовано)
- Або змініть дані анкети на фейкові і видаліть бота зі свого чату

<b>7. Зміни в політиці</b>
Ми можемо оновлювати цю політику; зміни будуть оголошені через бота.

<b>8. Контакти</b>
Питання/зауваження: znaimo.bot@gmail.com
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
