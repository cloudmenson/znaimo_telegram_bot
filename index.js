const express = require("express");
const { Telegraf, Markup } = require("telegraf");
require("dotenv").config();

const { loadUser, saveUser, getAllUsers } = require("./mongo");

const bot = new Telegraf(process.env.BOT_TOKEN);

// --------------------- Анкета логіка ------------------------

const startProfile = {
  step: "name",
  data: {
    name: "",
    age: "",
    about: "",
    photos: [],
  },
};

// --------------------- Bot logic ------------------------

bot.start(async (ctx) => {
  const id = ctx.from.id;
  let user = await loadUser(id);
  if (!user || !user.finished) {
    user = { ...startProfile, finished: false, _id: id.toString() };
    await saveUser(user);
    ctx.reply("Вітаю у Znaimo! Давай створимо твою анкету. Як тебе звати?");
  } else {
    ctx.reply(
      "Ти вже маєш анкету! /search — шукати людей, /edit — змінити анкету"
    );
  }
});

// Головний обробник
bot.on("message", async (ctx) => {
  const id = ctx.from.id;
  let user = await loadUser(id);

  // Якщо немає анкети — почати
  if (!user) {
    user = { ...startProfile, _id: id.toString() };
    await saveUser(user);
    return ctx.reply("Почнемо з імені. Як тебе звати?");
  }

  // Якщо анкета вже заповнена — реагувати на команди/пошук
  if (user.finished) return;

  // Заповнення анкети step-by-step
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

        // Якщо є хоча б 1 фото — показати кнопку "Готово"
        if (user.data.photos.length >= 1) {
          ctx.reply(
            `Фото додано (${user.data.photos.length}/3). Ще додати? Надішли фото або натисни 'Готово'.`,
            Markup.keyboard([["Готово"]])
              .oneTime()
              .resize()
          );
        } else {
          // Якщо ще немає жодного фото — звичайна клавіатура
          ctx.reply(
            `Фото додано (${user.data.photos.length}/3). Ще додати? Надішли фото.`
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
          ctx.reply(
            "Твоя анкета готова! /search — шукати людей, /edit — редагувати анкету.",
            Markup.removeKeyboard()
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

// --------------------- Пошук інших анкет ------------------------

bot.command("search", async (ctx) => {
  const id = ctx.from.id;
  const user = await loadUser(id);

  if (!user || !user.finished) {
    return ctx.reply("Спочатку створи свою анкету!");
  }

  // Знаходимо випадкову анкету (не свою і не тих, кого вже лайкнув/відхилив)
  const seen = user.seen || [];
  const allUsers = await getAllUsers();
  const others = allUsers.filter(
    (u) => u._id !== id.toString() && u.finished && !seen.includes(u._id)
  );

  if (others.length === 0) {
    return ctx.reply("Анкет більше немає. Спробуй пізніше.");
  }

  const other = others[Math.floor(Math.random() * others.length)];

  // Запамʼятовуємо, що показали цю анкету
  user.currentView = other._id;
  await saveUser(user);

  ctx
    .replyWithMediaGroup(
      other.data.photos.map((file_id) => ({ type: "photo", media: file_id }))
    )
    .then(() => {
      ctx.reply(
        `Ім'я: ${other.data.name}\nВік: ${other.data.age}\nПро себе: ${other.data.about}`,
        Markup.inlineKeyboard([
          Markup.button.callback("👍 Лайк", "like"),
          Markup.button.callback("👎 Дизлайк", "dislike"),
        ])
      );
    });
});

// --------------------- Лайк / Дизлайк ------------------------

bot.action("like", async (ctx) => {
  const id = ctx.from.id;
  const user = await loadUser(id);
  const otherId = user?.currentView;

  if (!otherId) return ctx.reply("Помилка. Спробуй /search");

  user.seen = [...(user.seen || []), otherId];
  await saveUser(user);
  ctx.reply("Тобі сподобалася анкета!");
  ctx.deleteMessage();
});

bot.action("dislike", async (ctx) => {
  const id = ctx.from.id;
  const user = await loadUser(id);
  const otherId = user?.currentView;

  if (!otherId) return ctx.reply("Помилка. Спробуй /search");

  user.seen = [...(user.seen || []), otherId];
  await saveUser(user);
  ctx.reply("Анкета відхилена.");
  ctx.deleteMessage();
});

// --------------------- edit profile ------------------------

bot.command("edit", async (ctx) => {
  const id = ctx.from.id;
  let user = await loadUser(id);
  if (!user) {
    ctx.reply("У тебе ще немає анкети! /start");
  } else {
    user = { ...startProfile, finished: false, _id: id.toString() };
    await saveUser(user);
    ctx.reply("Редагуємо анкету. Як тебе звати?");
  }
});

// --------------------- user profile ------------------------

bot.command("profile", async (ctx) => {
  const id = ctx.from.id;
  const user = await loadUser(id);

  if (!user || !user.finished) {
    return ctx.reply("Ти ще не створив анкету! /start — щоб почати.");
  }

  if (!user.data.photos || user.data.photos.length === 0) {
    return ctx.reply("У твоїй анкеті ще немає фото.");
  }

  ctx
    .replyWithMediaGroup(
      user.data.photos.map((file_id) => ({ type: "photo", media: file_id }))
    )
    .then(() => {
      ctx.reply(
        `Твоя анкета:\n\nІм'я: ${user.data.name}\nВік: ${user.data.age}\nПро себе: ${user.data.about}`
      );
    });
});

// --------------------- Запуск ------------------------
bot.launch();
console.log("Bot is running!");

// Express (щоб не падало на free хостах)
const app = express();
app.get("/", (req, res) => res.send("Znaimo bot is alive!"));
app.listen(process.env.PORT);

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
