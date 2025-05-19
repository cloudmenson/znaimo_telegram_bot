const express = require("express");
const { Telegraf, Markup } = require("telegraf");
require("dotenv").config();

const { loadUser, saveUser, removeUser, getAllUsers } = require("./mongo");

const bot = new Telegraf(process.env.BOT_TOKEN);

const mainMenu = Markup.keyboard([
  ["🔍 Дивитися анкети", "✏️ Редагувати профіль", "❌ Видалити профіль"],
]).resize();

const searchMenu = Markup.keyboard([["💝", "❌", "⚙️ Профіль"]]).resize();

const pendingMenu = Markup.keyboard([["💝 Взаємно", "❌ Відхилити"]]).resize();

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

// --------------------------- Мідлвар для pendingLikes ---------------------------
async function checkPendingLikes(ctx, user) {
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
    await ctx.reply("Вам хтось поставив лайк! Оберіть дію:", pendingMenu);
  } else {
    // Якщо користувач видалив анкету — просто видаляємо з черги
    user.pendingLikes.shift();
    await saveUser(user);
    return await checkPendingLikes(ctx, user); // рекурсивно
  }
  return true;
}

// --------------------------- Базова логіка ---------------------------
bot.start(async (ctx) => {
  const id = ctx.from.id;
  let user = await loadUser(id);
  if (!user || !user.finished) {
    user = { ...startProfile, id, username: ctx.from.username || null };
    await saveUser(user);
    await ctx.reply("Вітаю у Znaimo! Давай створимо твою анкету.");
    await ctx.reply("Почнемо з імені. Як тебе звати?");
  } else {
    ctx.reply("Ти вже маєш анкету! Обирай дію нижче:", mainMenu);
  }
});

bot.on("message", async (ctx) => {
  const id = ctx.from.id;
  let user = await loadUser(id);
  if (!user) {
    user = { ...startProfile, id, username: ctx.from.username || null };
    await saveUser(user);
  }
  if (!user.pendingLikes) user.pendingLikes = [];

  // ---- 1. Обробка pending лайків (завжди ПЕРША!) ----
  if (
    ctx.message.text === "💝 Взаємно" ||
    ctx.message.text === "❌ Відхилити"
  ) {
    if (user.pendingLikes.length > 0) {
      const pendingId = user.pendingLikes.shift();
      await saveUser(user);
      const pendingUser = await loadUser(pendingId);

      if (ctx.message.text === "💝 Взаємно" && pendingUser) {
        // Надсилаємо посилання обом!
        if (user.username) {
          await ctx.telegram.sendMessage(
            pendingId,
            `💞 Ви щойно отримали взаємний лайк!\n\n` +
              `Бажаємо приємно провести час!\n` +
              `Ось посилання на користувача: https://t.me/${user.username}`
          );
        }
        if (pendingUser.username) {
          await ctx.telegram.sendMessage(
            user.id,
            `💞 Ви щойно отримали взаємний лайк!\n\n` +
              `Бажаємо приємно провести час!\n` +
              `Користувач: https://t.me/${pendingUser.username}`
          );
        }
      }
      // Після відповіді — якщо ще є pending, одразу наступний!
      if (user.pendingLikes.length > 0) {
        await saveUser(user);
        return await checkPendingLikes(ctx, user);
      }
      // Якщо pendingLikes закінчився — стандартне меню
      await saveUser(user);
      return ctx.reply("Дякуємо за відповідь!", mainMenu);
    }
  }
  // Якщо є pendingLikes — показати користувачу анкету наступного і чекати дію
  if (user.pendingLikes.length > 0) {
    return await checkPendingLikes(ctx, user);
  }

  // --- Кнопка Шукати ---
  if (ctx.message.text === "🔍 Дивитися анкети") {
    return await handleSearch(ctx, user, id);
  }

  // --- Кнопка Профіль ---
  if (ctx.message.text === "⚙️ Профіль") {
    if (!user || !user.finished) {
      return ctx.reply(
        "Ти ще не створив анкету! Натисни /start щоб почати.",
        Markup.removeKeyboard()
      );
    }
    if (!user.data.photos || user.data.photos.length === 0) {
      return ctx.reply(
        "У твоїй анкеті ще немає фото.",
        Markup.keyboard([
          [
            "🔍 Дивитися анкети",
            "✏️ Редагувати профіль",
            "❌ Видалити профіль",
          ],
        ]).resize()
      );
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
    return ctx.reply("Оберіть дію:", mainMenu);
  }

  // --- Кнопка Преміум ---
  if (ctx.message.text === "⭐ Преміум") {
    return ctx.reply("Преміум скоро буде доступний 🫡", mainMenu);
  }

  // --- Кнопки пошуку/лайків/профілю (Пошук) ---
  if (ctx.message.text === "💝" || ctx.message.text === "❌") {
    await handleLikeDislike(
      ctx,
      user,
      ctx.message.text === "💝" ? "like" : "dislike"
    );
    return;
  }

  // --- Кнопка Видалити профіль ---
  if (ctx.message.text === "❌ Видалити профіль") {
    if (user) {
      await removeUser(id);
    }
    return ctx.reply(
      "Профіль видалено. /start щоб створити заново.",
      Markup.removeKeyboard()
    );
  }

  // --- Кнопка ✏️ Редагувати профіль (Відкрити меню редагування) ---
  if (
    ctx.message.text === "✏️ Редагувати профіль" ||
    ctx.message.text === "✏️ Редагувати"
  ) {
    if (!user || !user.finished) {
      return ctx.reply("Спочатку створи анкету! /start");
    }
    return ctx.reply(
      "Що ти хочеш змінити?",
      Markup.keyboard([
        ["✏️ Ім'я", "🎂 Вік", "🏠 Місто", "📝 Опис", "🤳 Фото", "⬅️ Назад"],
      ]).resize()
    );
  }

  // --- Меню редагування профілю ---
  if (ctx.message.text === "✏️ Ім'я") {
    user.editStep = "edit_name";
    await saveUser(user);
    return ctx.reply("Введи нове імʼя:");
  }
  if (ctx.message.text === "🎂 Вік") {
    user.editStep = "edit_age";
    await saveUser(user);
    return ctx.reply("Введи новий вік:");
  }
  if (ctx.message.text === "🏠 Місто") {
    user.editStep = "edit_city";
    await saveUser(user);
    return ctx.reply("Введи нову назву міста:");
  }
  if (ctx.message.text === "📝 Опис") {
    user.editStep = "edit_about";
    await saveUser(user);
    return ctx.reply("Введи новий опис (5-200 символів):");
  }
  if (ctx.message.text === "🤳 Фото") {
    user.editStep = "edit_photos";
    user.data.photos = [];
    await saveUser(user);
    return ctx.reply(
      "Відправ фото одне за одним (максимум 3). Коли закінчиш — напиши 'Готово'.",
      Markup.keyboard([["Готово"]])
        .oneTime()
        .resize()
    );
  }
  if (ctx.message.text === "⬅️ Назад") {
    if (!user || !user.finished) {
      return ctx.reply("Ти ще не створив анкету! /start — щоб почати.");
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
    return ctx.reply("Оберіть дію:", mainMenu);
  }

  // --- Блок редагування профілю ---
  if (user && user.editStep) {
    switch (user.editStep) {
      case "edit_name":
        if (!ctx.message.text || ctx.message.text.length < 2) {
          return ctx.reply("Введи коректне імʼя:");
        }
        user.data.name = ctx.message.text.trim();
        user.editStep = null;
        await saveUser(user);
        ctx.reply("Імʼя змінено ✅", mainMenu);
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
          ctx.reply("Вік змінено ✅", mainMenu);
        }
        break;

      case "edit_city":
        if (!ctx.message.text || ctx.message.text.length < 2) {
          return ctx.reply("Введи коректну назву міста:");
        }
        user.data.city = ctx.message.text.trim();
        user.editStep = null;
        await saveUser(user);
        ctx.reply("Місто змінено ✅", mainMenu);
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
        ctx.reply("Опис змінено ✅", mainMenu);
        break;

      case "edit_photos":
        // --- Додавання фото: максимум 3, після третього фото не пропонуємо додавати ще ---
        if (ctx.message.photo) {
          if (user.data.photos.length >= 3) {
            return ctx.reply("3 фото додано. Натисни 'Готово' для завершення.");
          }
          const fileId =
            ctx.message.photo[ctx.message.photo.length - 1].file_id;
          user.data.photos.push(fileId);
          await saveUser(user);
          if (user.data.photos.length === 3) {
            ctx.reply("3 фото додано. Натисни 'Готово' для завершення.");
          } else {
            ctx.reply(
              `Фото додано (${user.data.photos.length}/3). Ще додати? Надішли фото або натисни 'Готово'.`,
              Markup.keyboard([["Готово"]])
                .oneTime()
                .resize()
            );
          }
        } else if (
          ctx.message.text === "Готово" ||
          ctx.message.text.toLowerCase() === "готово"
        ) {
          if (user.data.photos.length === 0) {
            ctx.reply("Додай мінімум одне фото!");
          } else {
            user.editStep = null;
            await saveUser(user);
            ctx.reply("Фото оновлено ✅", mainMenu);
          }
        } else {
          ctx.reply("Надішли фото або натисни 'Готово'.");
        }
        break;
    }
    return;
  }

  // Якщо анкета вже заповнена — реагувати на команди/пошук
  if (user.finished) return;

  // --- Заповнення анкети step-by-step ---
  switch (user.step) {
    case "name":
      if (!ctx.message.text || ctx.message.text.length < 2) {
        return ctx.reply("Введи коректне імʼя:");
      }
      user.data.name = ctx.message.text.trim();
      user.step = "age";
      await saveUser(user);
      ctx.reply("Скільки тобі років?");
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
        ctx.reply("В якому місті ти живеш?");
      }
      break;

    case "city":
      if (!ctx.message.text || ctx.message.text.length < 2) {
        return ctx.reply("Введи коректну назву міста:");
      }
      user.data.city = ctx.message.text.trim();
      user.step = "about";
      await saveUser(user);
      ctx.reply("Розкажи про себе коротко (до 200 символів):");
      break;

    case "about":
      if (
        !ctx.message.text ||
        ctx.message.text.length < 5 ||
        ctx.message.text.length > 200
      ) {
        return ctx.reply("Введи коротку інформацію про себе (5-200 символів):");
      }
      user.data.about = ctx.message.text.trim();
      user.step = "photos";
      await saveUser(user);
      ctx.reply(
        "Додай хоча б одне фото (максимум 3).\nВідправ фото одне за одним, коли готово — натисни 'Готово'.",
        Markup.keyboard([["Готово"]])
          .oneTime()
          .resize()
      );
      break;

    case "photos":
      if (ctx.message.photo) {
        if (user.data.photos.length >= 3) {
          return ctx.reply("3 фото додано. Натисни 'Готово' для завершення.");
        }
        const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        user.data.photos.push(fileId);
        await saveUser(user);
        if (user.data.photos.length === 3) {
          ctx.reply("3 фото додано. Натисни 'Готово' для завершення.");
        } else {
          ctx.reply(
            `Фото додано (${user.data.photos.length}/3). Ще додати? Надішли фото або натисни 'Готово'.`,
            Markup.keyboard([["Готово"]])
              .oneTime()
              .resize()
          );
        }
      } else if (
        ctx.message.text === "Готово" ||
        ctx.message.text.toLowerCase() === "готово"
      ) {
        if (user.data.photos.length === 0) {
          ctx.reply("Додай мінімум одне фото!");
        } else {
          user.finished = true;
          user.step = null;
          await saveUser(user);
          ctx.reply("Твоя анкета готова!", mainMenu);
        }
      } else {
        ctx.reply("Надішли фото або натисни 'Готово'.");
      }
      break;

    default:
      ctx.reply("Щось пішло не так. /start щоб почати спочатку.");
  }
});

// ----------- Пошук інших анкет ----------------------

async function handleSearch(ctx, user, id) {
  if (!user || !user.finished) {
    return ctx.reply("Спочатку створи свою анкету!");
  }
  const seen = user.seen || [];
  const allUsers = await getAllUsers();
  const others = allUsers;
}
