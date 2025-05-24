const express = require("express");
const { Telegraf, Markup } = require("telegraf");
require("dotenv").config();

const { getDb, loadUser, saveUser, removeUser, getAllUsers } = require("./mongo");
const { faker } = require("@faker-js/faker");

const NodeGeocoder = require("node-geocoder");
const geolib = require("geolib");
// Configure geocoder to use OpenStreetMap
const geocoder = NodeGeocoder({ provider: "openstreetmap" });

// Seed mock users if collection is empty
async function seedMockUsers() {
  const db = await getDb();
  const coll = db.collection("users");
  const count = await coll.countDocuments();
  if (count === 0) {
    const mocks = [];
    for (let i = 0; i < 100; i++) {
      const genderType = faker.helpers.arrayElement(["male", "female"]);
      const label = genderType === "male" ? "Хлопець" : "Дівчина";
      mocks.push({
        id: 200000000 + i,
        username: faker.internet.userName(),
        step: null,
        editStep: null,
        finished: true,
        currentView: null,
        pendingLikes: [],
        seen: [],
        data: {
          name: faker.name.firstName(genderType),
          gender: label,
          age: faker.datatype.number({ min: 18, max: 60 }),
          city: faker.address.city(),
          about: faker.lorem.sentences(2),
          photos: [`https://i.pravatar.cc/300?img=${i + 1}`],
          searchGender: "",
          latitude: null,
          longitude: null,
        },
      });
    }
    await coll.insertMany(mocks);
    console.log("✅ Seeded 100 mock users");
  }
}

const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN);

// Глобальний middleware для показу “typing” перед кожним повідомленням
bot.use(async (ctx, next) => {
  try {
    await ctx.sendChatAction("typing");
  } catch (e) {
    console.error("ChatAction ERROR", e);
  }
  return next();
});

// Глобальний обробник помилок Telegraf
bot.catch((err, ctx) => {
  console.error("BOT ERROR", err);
  ctx.reply("Виникла технічна помилка. Спробуйте ще раз.");
});

// Привітальне повідомлення для нових користувачіва
bot.on("message", async (ctx, next) => {
  // Пропустити команди, щоб не блокувати /start та інші
  if (ctx.message.text && ctx.message.text.startsWith("/")) {
    return next();
  }
  const id = ctx.from.id;
  const user = await loadUser(id);
  if (!user) {
    // Індикатор “бот друкує”
    await ctx.sendChatAction("typing");

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
const mainMenu = Markup.keyboard([
  ["🔍 Дивитися анкети", "✏️ Редагувати профіль", "📝 Профіль"],
])
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
        "Щоб додати фото, натисни «✏️ Редагувати профіль»."
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

function prettyProfile(user) {
  const name = user.data.name || "";
  const age = user.data.age || "";
  const city = user.data.city || "";
  const about = user.data.about || "";
  let profileText = `<b>• Ім'я:</b> ${name}\n<b>• Вік:</b> ${age}\n`;
  if (city) {
    profileText += `<b>• Місто:</b> ${city}\n`;
  }
  profileText += `<b>• Про себе:</b> ${about}`;
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
  // 1) Індикатор “typing…”
  await ctx.sendChatAction("typing");
  // 2) Персональне вітання
  await ctx.reply(
    `👋 Привіт, ${ctx.from.first_name}! Ласкаво просимо до Znaimo!`
  );

  // Доповненне повідомлення після вітання
  await ctx.sendChatAction("typing");
  await ctx.reply(
    `Я допоможу тобі:
• Створити власну анкету
• Знайти та переглянути анкети інших
• Розпочати спілкування одразу після зустрічі лайків!`
  );

  // 3) Ще один “typing…” перед наступним кроком
  await ctx.sendChatAction("typing");
  // 4) Власне запит на створення анкети
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
        "Щоб додати фото, натисни «✏️ Редагувати профіль» або виконай /edit."
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

bot.hears("🔍 Дивитися анкети", async (ctx) => {
  const id = ctx.from.id;
  let user = await loadUser(id);

  const hasPending = await checkPendingLikes(ctx, user);
  if (hasPending) return;

  if (!user || !user.finished) {
    return ctx.reply("Спочатку створи анкету через /start");
  }
  await handleSearch(ctx, user, id, false);
});

bot.hears("✏️ Редагувати профіль", async (ctx) => {
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
              if (isNaN(age) || age < 16 || age > 99) {
                return ctx.reply("Введи коректний вік (16-99):");
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
          if (isNaN(age) || age < 16 || age > 99) {
            return ctx.reply("Введи коректний вік (16-99):");
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

async function handleSearch(ctx, user, id, isInline = false) {
  try {
    if (!user || !user.finished) {
      if (isInline) return ctx.answerCbQuery("Спочатку створи свою анкету!");
      return ctx.reply("Спочатку створи свою анкету!");
    }

    const hasPending = await checkPendingLikes(ctx, user);
    if (hasPending) return;

    const seen = user.seen || [];
    const allUsers = await getAllUsers();
    // Initial filter: exclude self, unfinished, seen, and currentView
    let filtered = allUsers.filter(
      (u) =>
        u.id !== id &&
        u.finished &&
        !seen.includes(u.id) &&
        u.id !== user.currentView
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
      candidates = filtered
        .filter((u) => u.data.latitude != null && u.data.longitude != null)
        .map((u) => ({
          user: u,
          distance: geolib.getDistance(
            { latitude: user.data.latitude, longitude: user.data.longitude },
            { latitude: u.data.latitude, longitude: u.data.longitude }
          ),
        }))
        .sort((a, b) => a.distance - b.distance)
        .map((item) => item.user);
    }
    const other = candidates.length ? candidates[0] : null;

    if (!other) {
      user.currentView = null; // <--- reset
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

    user.currentView = other.id;
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
    await ctx.reply("📋 Зробіть свій вибір:", searchMenu);
  } catch (e) {
    console.error("handleSearch ERROR:", e);
    await ctx.reply("Виникла технічна помилка. Спробуйте ще раз.");
  }
}

async function handleLikeDislike(ctx, user, action, isInline = false) {
  try {
    if (!user || !user.currentView) {
      if (isInline) return ctx.answerCbQuery("Помилка. Спробуй знову");
      return ctx.reply("Помилка. Спробуй знову");
    }
    const id = ctx.from.id;
    const otherId = user?.currentView;

    user.seen = [...(user.seen || []), otherId];
    await saveUser(user);

    const likedUser = await loadUser(otherId);
    if (likedUser) {
      if (action === "like") {
        if ((likedUser.seen || []).includes(id)) {
          // Mutual like: send media group (profile) and notification to both
          // Для likedUser (otherId)
          if (user.data.photos && user.data.photos.length > 0) {
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
          }
          await ctx.telegram.sendMessage(
            otherId,
            `💞 У вас взаємний лайк з @${ctx.from.username || user.id}!`
          );

          // Для користувача, який лайкнув (current user)
          if (likedUser.data.photos && likedUser.data.photos.length > 0) {
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
          }
          await ctx.telegram.sendMessage(
            id,
            `💞 У вас взаємний лайк з @${likedUser.username || likedUser.id}!`
          );
          // Reset currentView after mutual like so profile doesn't reappear
          user.currentView = null;
          await saveUser(user);
          // After mutual like, return and do not proceed to search
          return;
        } else {
          if (!likedUser.pendingLikes) likedUser.pendingLikes = [];
          if (!likedUser.pendingLikes.includes(user.id)) {
            likedUser.pendingLikes.push(user.id);
            await saveUser(likedUser);

            // Негайне повідомлення користувачу, якому поставили лайк
            // Спочатку його профіль
            if (user.data.photos && user.data.photos.length > 0) {
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
            }
            // Потім текст з кнопками pendingMenu
            await ctx.telegram.sendMessage(
              likedUser.id,
              "💞 Вам хтось поставив лайк!",
              pendingMenu
            );
          }
        }
      }
    }
    await handleSearch(ctx, user, id, isInline);
  } catch (e) {
    console.error("handleLikeDislike ERROR:", e);
    await ctx.reply("Виникла технічна помилка. Спробуйте ще раз.");
  }
}

// --------------------- Запуск ------------------------
;(async () => {
  try {
    // Seed mock users once
    await seedMockUsers();

    console.log("--------- BOT IS RUNNING! ---------");
    const WEBHOOK_PATH = "/bot" + process.env.BOT_TOKEN;
    const WEBHOOK_URL = `https://${process.env.RENDER_EXTERNAL_HOSTNAME || "your-app-name.onrender.com"}${WEBHOOK_PATH}`;

    // Set bot commands and webhook
    await bot.telegram.setMyCommands([
      { command: "profile", description: "📝 Профіль" },
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

bot.hears("📝 Профіль", async (ctx) => {
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
  // TODO: імплементувати логіку рефералів
  await ctx.reply("🎁 Реферальна система поки в розробці.");
});

// Політика приватності
bot.command("privacy", async (ctx) => {
  const id = ctx.from.id;
  const user = await loadUser(id);
  if (!user || !user.finished) {
    return ctx.reply("Спочатку створи анкету через /start.");
  }
  await ctx.reply("🔒 Політика приватності: текст політики тут...");
});

// Додати в чорний список
bot.command("blacklist", async (ctx) => {
  const id = ctx.from.id;
  const user = await loadUser(id);
  if (!user || !user.finished) {
    return ctx.reply("Спочатку створи анкету через /start.");
  }
  // TODO: імплементувати додавання в чорний список
  await ctx.reply("🚫 Додати в чорний список — у розробці.");
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
