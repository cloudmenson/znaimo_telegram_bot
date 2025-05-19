const express = require("express");
const { Telegraf, Markup } = require("telegraf");
require("dotenv").config();

const { loadUser, saveUser, removeUser, getAllUsers } = require("./mongo");

const bot = new Telegraf(process.env.BOT_TOKEN);

const mainMenu = Markup.keyboard([
  ["🔍 Шукати", "⭐ Преміум", "⚙️ Профіль"],
]).resize();

const startProfile = {
  step: "name",
  editStep: null,
  data: {
    name: "",
    age: "",
    about: "",
    photos: [],
  },
  seen: [],
  finished: false,
  currentView: null,
};

bot.start(async (ctx) => {
  const id = ctx.from.id;
  let user = await loadUser(id);

  if (!user || !user.finished) {
    user = { ...startProfile, id };
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

  // --- Кнопка Шукати ---
  if (ctx.message.text === "🔍 Шукати") {
    return await handleSearch(ctx, user, id);
  }

  // --- Кнопка Преміум ---
  if (ctx.message.text === "⭐ Преміум") {
    return ctx.reply("Преміум скоро буде доступний 😉", mainMenu);
  }

  // --- Кнопка Профіль ---
  if (ctx.message.text === "⚙️ Профіль") {
    if (!user || !user.finished) {
      return ctx.reply(
        "Ти ще не створив анкету! /start — щоб почати.",
        mainMenu
      );
    }
    if (!user.data.photos || user.data.photos.length === 0) {
      return ctx.reply("У твоїй анкеті ще немає фото.", mainMenu);
    }
    await ctx.replyWithMediaGroup(
      user.data.photos.map((file_id) => ({ type: "photo", media: file_id }))
    );
    return ctx.reply(
      `Твоя анкета:\n\nІм'я: ${user.data.name}\nВік: ${user.data.age}\nПро себе: ${user.data.about}`,
      Markup.keyboard([["❌ Видалити профіль", "✏️ Редагувати"]])
        .oneTime()
        .resize()
    );
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

  // --- Кнопка ✏️ Редагувати (Відкрити меню редагування) ---
  if (ctx.message.text === "✏️ Редагувати") {
    if (!user || !user.finished) {
      return ctx.reply("Спочатку створи анкету! /start");
    }
    return ctx.reply(
      "Що ти хочеш змінити?",
      Markup.inlineKeyboard([
        [Markup.button.callback("✏️ Ім'я", "edit_name")],
        [Markup.button.callback("🎂 Вік", "edit_age")],
        [Markup.button.callback("📝 Опис", "edit_about")],
        [Markup.button.callback("🖼 Фото", "edit_photos")],
      ])
    );
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
        const age = parseInt(ctx.message.text, 10);
        if (isNaN(age) || age < 16 || age > 99) {
          return ctx.reply("Введи коректний вік (16-99):");
        }
        user.data.age = age;
        user.editStep = null;
        await saveUser(user);
        ctx.reply("Вік змінено ✅", mainMenu);
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
        if (ctx.message.photo) {
          if (user.data.photos.length >= 3) {
            return ctx.reply(
              "Максимум 3 фото! Натисни 'Готово', якщо всі фото додані."
            );
          }
          const fileId =
            ctx.message.photo[ctx.message.photo.length - 1].file_id;
          user.data.photos.push(fileId);
          await saveUser(user);
          ctx.reply(
            `Фото додано (${user.data.photos.length}/3). Ще додати? Надішли фото або натисни 'Готово'.`,
            Markup.keyboard([["Готово"]])
              .oneTime()
              .resize()
          );
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
    return; // Не йдемо далі по створенню анкети
  }

  // Якщо немає анкети — почати
  if (!user) {
    user = { ...startProfile, id };
    await saveUser(user);
    await ctx.reply("Вітаю у Znaimo! Давай створимо твою анкету.");
    return ctx.reply("Почнемо з імені. Як тебе звати?");
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
      const age = parseInt(ctx.message.text, 10);
      if (isNaN(age) || age < 16 || age > 99) {
        return ctx.reply("Введи коректний вік (16-99):");
      }
      user.data.age = age;
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
        const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        if (user.data.photos.length >= 3) {
          return ctx.reply(
            "Максимум 3 фото! Натисни 'Готово', якщо всі фото додані."
          );
        }
        user.data.photos.push(fileId);
        await saveUser(user);
        ctx.reply(
          `Фото додано (${user.data.photos.length}/3). Ще додати? Надішли фото або натисни 'Готово'.`,
          Markup.keyboard([["Готово"]])
            .oneTime()
            .resize()
        );
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
          ctx.reply(
            "Твоя анкета готова! /search — шукати людей, /edit — редагувати анкету.",
            mainMenu
          );
        }
      } else {
        ctx.reply("Надішли фото або натисни 'Готово'.");
      }
      break;

    default:
      ctx.reply("Щось пішло не так. /start щоб почати спочатку.");
  }
});

// ----------- Inline-редагування профілю ------------

bot.action("edit_name", async (ctx) => {
  const id = ctx.from.id;
  let user = await loadUser(id);
  user.editStep = "edit_name";
  await saveUser(user);
  ctx.reply("Введи нове імʼя:");
});
bot.action("edit_age", async (ctx) => {
  const id = ctx.from.id;
  let user = await loadUser(id);
  user.editStep = "edit_age";
  await saveUser(user);
  ctx.reply("Введи новий вік:");
});
bot.action("edit_about", async (ctx) => {
  const id = ctx.from.id;
  let user = await loadUser(id);
  user.editStep = "edit_about";
  await saveUser(user);
  ctx.reply("Введи новий опис (5-200 символів):");
});
bot.action("edit_photos", async (ctx) => {
  const id = ctx.from.id;
  let user = await loadUser(id);
  user.editStep = "edit_photos";
  user.data.photos = [];
  await saveUser(user);
  ctx.reply(
    "Відправ фото одне за одним (максимум 3). Коли закінчиш — напиши 'Готово'.",
    Markup.keyboard([["Готово"]])
      .oneTime()
      .resize()
  );
});

// ----------- Пошук інших анкет ----------------------

async function handleSearch(ctx, user, id) {
  if (!user || !user.finished) {
    return ctx.reply("Спочатку створи свою анкету!");
  }
  const seen = user.seen || [];
  const allUsers = await getAllUsers();
  const others = allUsers.filter(
    (u) => u.id !== id && u.finished && !seen.includes(u.id)
  );

  if (others.length === 0) {
    return ctx.reply("Анкет більше немає. Спробуй пізніше.");
  }

  const other = others[Math.floor(Math.random() * others.length)];

  user.currentView = other.id;
  await saveUser(user);

  await ctx.replyWithMediaGroup(
    other.data.photos.map((file_id) => ({ type: "photo", media: file_id }))
  );
  await ctx.reply(
    `Ім'я: ${other.data.name}\nВік: ${other.data.age}\nПро себе: ${other.data.about}`,
    Markup.inlineKeyboard([
      Markup.button.callback("👍 Лайк", "like"),
      Markup.button.callback("👎 Дизлайк", "dislike"),
    ])
  );
}

// ----------- Лайк / Дизлайк ----------------------

bot.action("like", async (ctx) => {
  const id = ctx.from.id;
  const user = await loadUser(id);
  const otherId = user?.currentView;

  if (!otherId) return ctx.reply("Помилка. Спробуй знову 'Шукати'");

  user.seen = [...(user.seen || []), otherId];
  await saveUser(user);
  ctx.reply("Тобі сподобалася анкета!");
  ctx.deleteMessage();
});
bot.action("dislike", async (ctx) => {
  const id = ctx.from.id;
  const user = await loadUser(id);
  const otherId = user?.currentView;

  if (!otherId) return ctx.reply("Помилка. Спробуй знову 'Шукати'");

  user.seen = [...(user.seen || []), otherId];
  await saveUser(user);
  ctx.reply("Анкета відхилена.");
  ctx.deleteMessage();
});

// --------------------- /edit (скидання анкети) ------------------

bot.command("edit", async (ctx) => {
  const id = ctx.from.id;
  let user = await loadUser(id);
  if (!user) {
    ctx.reply("У тебе ще немає анкети! /start");
  } else {
    ctx.reply(
      "Що ти хочеш змінити?",
      Markup.inlineKeyboard([
        [Markup.button.callback("✏️ Ім'я", "edit_name")],
        [Markup.button.callback("🎂 Вік", "edit_age")],
        [Markup.button.callback("📝 Опис", "edit_about")],
        [Markup.button.callback("🖼 Фото", "edit_photos")],
      ])
    );
  }
});

// --------------------- /profile ------------------------

bot.command("profile", async (ctx) => {
  const id = ctx.from.id;
  const user = await loadUser(id);

  if (!user || !user.finished) {
    return ctx.reply("Ти ще не створив анкету! /start — щоб почати.");
  }
  if (!user.data.photos || user.data.photos.length === 0) {
    return ctx.reply("У твоїй анкеті ще немає фото.");
  }
  await ctx.replyWithMediaGroup(
    user.data.photos.map((file_id) => ({ type: "photo", media: file_id }))
  );
  ctx.reply(
    `Твоя анкета:\n\nІм'я: ${user.data.name}\nВік: ${user.data.age}\nПро себе: ${user.data.about}`,
    Markup.keyboard([["❌ Видалити профіль", "✏️ Редагувати"]])
      .oneTime()
      .resize()
  );
});

// --------------------- Запуск ------------------------
bot.launch();
console.log("@@@@@@@@@@@ BOT IS RUNNING! @@@@@@@@@@@");

const app = express();
app.get("/", (req, res) => res.send("Znaimo bot is alive!"));
app.listen(process.env.PORT);

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
