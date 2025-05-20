const express = require("express");
const { Telegraf, Markup } = require("telegraf");
require("dotenv").config();

const { loadUser, saveUser, removeUser, getAllUsers } = require("./mongo");

const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN);

// Глобальний обробник помилок Telegraf
bot.catch((err, ctx) => {
  console.error("BOT ERROR", err);
  ctx.reply("Виникла технічна помилка. Спробуйте ще раз.");
});

// Основні меню як звичайна клавіатура
const mainMenu = Markup.keyboard([
  ["🔍 Дивитися анкети", "✏️ Редагувати профіль"],
])
  .resize()
  .oneTime(false);

// Меню очікування лайків (reply-keyboard)
const pendingMenu = Markup.keyboard([["💝 Взаємно", "❌ Відхилити"]])
  .resize()
  .oneTime(false);

// Меню для пошуку (reply-keyboard)
const searchMenu = Markup.keyboard([["💝", "❌", "⚙️ Профіль"]])
  .resize()
  .oneTime(false);

// Меню редагування профілю — тільки воно інлайн!
const editProfileMenu = Markup.inlineKeyboard([
  [
    Markup.button.callback("✏️ Ім'я", "edit_name"),
    Markup.button.callback("🎂 Вік", "edit_age"),
  ],
  [
    Markup.button.callback("🏠 Місто", "edit_city"),
    Markup.button.callback("📝 Опис", "edit_about"),
  ],
  [
    Markup.button.callback("🤳 Фото", "edit_photos"),
    Markup.button.callback("⬅️ Назад", "edit_back"),
  ],
]);

const startProfile = {
  step: "name",
  editStep: null,
  data: {
    name: "",
    age: "",
    city: "",
    about: "",
    photos: [],
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
      await ctx.reply("Вам хтось поставив лайк! Оберіть дію:", pendingMenu);
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
  const id = ctx.from.id;
  let user = await loadUser(id);
  if (!user || !user.finished) {
    user = { ...startProfile, id, username: ctx.from.username || null };
    await saveUser(user);
    // Показати лише кнопку "Створити анкету" (inline)
    await ctx.reply(
      "Вітаю у Znaimo! Давай створимо твою анкету.",
      Markup.inlineKeyboard([
        [Markup.button.callback("Створити анкету", "create_profile")],
      ])
    );
  } else {
    ctx.reply("Ти вже маєш анкету! Обирай дію нижче:", mainMenu);
  }
});

// ------------------ INLINE-КНОПКИ ТА CALLBACK-и ------------------

// Створити анкету (коли ще не існує)
bot.action("create_profile", async (ctx) => {
  try {
    const id = ctx.from.id;
    let user = await loadUser(id);
    if (!user) {
      user = { ...startProfile, id, username: ctx.from.username || null };
      await saveUser(user);
    }
    user.step = "name";
    await saveUser(user);
    await ctx.editMessageText("Почнемо з імені. Як тебе звати?");
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
    await ctx.reply(`
      💞 У вас взаємний лайк з @${pendingUser.username}!\n\n +
      Бажаємо приємного спілкування та чудового настрою!\n\n +
      https://t.me/${pendingUser.username}
      `);
  }

  // Відправляємо контакт користувача (ctx.from) pendingUser
  if (pendingUser) {
    const usernameOrId = user.username ? user.username : user.id;
    await ctx.telegram.sendMessage(
      pendingId,
      `💞 У вас взаємний лайк з @${pendingUser.username}!\n\n` +
        `Бажаємо приємного спілкування та чудового настрою!\n\n` +
        `https://t.me/${usernameOrId}`
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
    await ctx.editMessageText("Введи нове імʼя:");
  } catch (e) {
    console.error("EDIT_NAME ERROR:", e);
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
    await ctx.editMessageText("Введи новий вік:");
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
    await ctx.editMessageText("Введи нову назву міста:");
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
    await ctx.editMessageText("Введи новий опис (5-200 символів):");
  } catch (e) {
    console.error("EDIT_ABOUT ERROR:", e);
    await ctx.reply("Виникла технічна помилка. Спробуйте ще раз.");
  }
});
bot.action("edit_photos", async (ctx) => {
  try {
    const id = ctx.from.id;
    let user = await loadUser(id);
    if (!user) {
      return ctx.answerCbQuery("Сталася помилка: не знайдено користувача.");
    }
    user.editStep = "edit_photos";
    user.data.photos = [];
    await saveUser(user);
    await ctx.editMessageText(
      "Відправ фото одне за одним (максимум 3). Коли закінчиш — напиши 'Готово'."
    );
  } catch (e) {
    console.error("EDIT_PHOTOS ERROR:", e);
    await ctx.reply("Виникла технічна помилка. Спробуйте ще раз.");
  }
});
bot.action("edit_back", async (ctx) => {
  try {
    const id = ctx.from.id;
    let user = await loadUser(id);
    if (!user) {
      return ctx.editMessageText(
        "Ти ще не створив анкету! /start — щоб почати."
      );
    }
    if (!user.finished) {
      return ctx.editMessageText(
        "Ти ще не створив анкету! /start — щоб почати."
      );
    }
    if (!user.data.photos || user.data.photos.length === 0) {
      return ctx.editMessageText("У твоїй анкеті ще немає фото.");
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
  } catch (e) {
    console.error("EDIT_BACK ERROR:", e);
    await ctx.reply("Виникла технічна помилка. Спробуйте ще раз.");
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
      try {
        switch (user.editStep) {
          case "edit_name":
            if (!ctx.message.text || ctx.message.text.length < 2) {
              return ctx.reply("Введи коректне імʼя:");
            }
            user.data.name = ctx.message.text.trim();
            user.editStep = null;
            await saveUser(user);
            await ctx.reply("Імʼя змінено ✅", mainMenu);
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
            user.editStep = null;
            await saveUser(user);
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
              if (user.data.photos.length >= 3) {
                return ctx.reply(
                  "3 фото додано. Напиши 'Готово' для завершення."
                );
              }
              const fileId =
                ctx.message.photo[ctx.message.photo.length - 1].file_id;
              user.data.photos.push(fileId);
              await saveUser(user);
              if (user.data.photos.length === 3) {
                await ctx.reply(
                  "3 фото додано. Напиши 'Готово' для завершення."
                );
              } else {
                await ctx.reply(
                  `Фото додано (${user.data.photos.length}/3). Ще додати? Надішли фото або напиши 'Готово'.`
                );
              }
            } else if (
              ctx.message.text === "Готово" ||
              ctx.message.text.toLowerCase() === "готово"
            ) {
              if (user.data.photos.length === 0) {
                await ctx.reply("Додай мінімум одне фото!");
              } else {
                user.editStep = null;
                await saveUser(user);
                await ctx.reply("Фото оновлено ✅", mainMenu);
              }
            } else {
              await ctx.reply("Надішли фото або напиши 'Готово'.");
            }
            break;
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
          await ctx.reply("Скільки тобі років?");
          break;
        case "age":
          {
            const age = parseInt(ctx.message.text, 10);
            if (isNaN(age) || age < 16 || age > 99) {
              return ctx.reply("Введи коректний вік (16-99):");
            }
            user.data.age = age;
            user.step = "city";
            await saveUser(user);
            await ctx.reply("В якому місті ти живеш?");
          }
          break;
        case "city":
          if (!ctx.message.text || ctx.message.text.length < 2) {
            return ctx.reply("Введи коректну назву міста:");
          }
          user.data.city = ctx.message.text.trim();
          user.step = "about";
          await saveUser(user);
          await ctx.reply("Розкажи про себе коротко (до 200 символів):");
          break;
        case "about":
          if (
            !ctx.message.text ||
            ctx.message.text.length < 5 ||
            ctx.message.text.length > 200
          ) {
            return ctx.reply(
              "Введи коротку інформацію про себе (5-200 символів):"
            );
          }
          user.data.about = ctx.message.text.trim();
          user.step = "photos";
          await saveUser(user);
          await ctx.reply(
            "Додай хоча б одне фото (максимум 3).\nВідправ фото одне за одним, коли готово — напиши 'Готово'."
          );
          break;
        case "photos":
          if (ctx.message.photo) {
            if (user.data.photos.length >= 3) {
              return ctx.reply(
                "3 фото додано. Напиши 'Готово' для завершення."
              );
            }
            const fileId =
              ctx.message.photo[ctx.message.photo.length - 1].file_id;
            user.data.photos.push(fileId);
            await saveUser(user);
            if (user.data.photos.length === 3) {
              await ctx.reply("3 фото додано. Напиши 'Готово' для завершення.");
            } else {
              await ctx.reply(
                `Фото додано (${user.data.photos.length}/3). Ще додати? Надішли фото або напиши 'Готово'.`
              );
            }
          } else if (
            ctx.message.text === "Готово" ||
            ctx.message.text.toLowerCase() === "готово"
          ) {
            if (user.data.photos.length === 0) {
              await ctx.reply("Додай мінімум одне фото!");
            } else {
              user.finished = true;
              user.step = null;
              await saveUser(user);
              await ctx.reply("Твоя анкета готова!", mainMenu);
            }
          } else {
            await ctx.reply("Надішли фото або напиши 'Готово'.");
          }
          break;
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
    const others = allUsers.filter(
      (u) => u.id !== id && u.finished && !seen.includes(u.id)
    );

    if (others.length === 0) {
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

    const other = others[Math.floor(Math.random() * others.length)];

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
    await ctx.reply("Зробіть свій вибір:", searchMenu);
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
            `💞 У вас взаємний лайк з @${
              likedUser.username || likedUser.id
            }!\n\nБажаємо приємного спілкування та чудового настрою!`
          );
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
              "Вам хтось поставив лайк! Оберіть дію:",
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
console.log("--------- BOT IS RUNNING! ---------");

const WEBHOOK_PATH = "/bot" + process.env.BOT_TOKEN;
const WEBHOOK_URL = `https://${
  process.env.RENDER_EXTERNAL_HOSTNAME || "your-app-name.onrender.com"
}${WEBHOOK_PATH}`;

(async () => {
  await bot.telegram.setWebhook(WEBHOOK_URL);
})();

app.use(bot.webhookCallback(WEBHOOK_PATH));
app.get("/", (req, res) => res.send("Znaimo bot is alive!"));

// Слухаємо порт Render
app.listen(process.env.PORT, () => {
  console.log(`Server listening on port ${process.env.PORT}`);
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

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

bot.hears("⚙️ Профіль", async (ctx) => {
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
