const express = require("express");
const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");
require("dotenv").config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const USERS_FILE = "./users.json";

// --------------------- Helpers ------------------------

const loadUsers = () => {
  if (!fs.existsSync(USERS_FILE)) return {};
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
};

const saveUsers = (users) => {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
};

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

bot.start((ctx) => {
  const users = loadUsers();
  const id = ctx.from.id;
  if (!users[id] || !users[id].finished) {
    users[id] = { ...startProfile, finished: false };
    saveUsers(users);
    ctx.reply("Вітаю у Znaimo! Давай створимо твою анкету. Як тебе звати?");
  } else {
    ctx.reply(
      "Ти вже маєш анкету! /search — шукати людей, /edit — змінити анкету"
    );
  }
});

// Головний обробник
bot.on("message", (ctx) => {
  const users = loadUsers();
  const id = ctx.from.id;

  // Якщо немає анкети — почати
  if (!users[id]) {
    users[id] = { ...startProfile };
    saveUsers(users);
    return ctx.reply("Почнемо з імені. Як тебе звати?");
  }
  const user = users[id];

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
      saveUsers(users);
      ctx.reply("Скільки тобі років?");
      break;

    case "age":
      const age = parseInt(ctx.message.text, 10);
      if (isNaN(age) || age < 16 || age > 99) {
        return ctx.reply("Введи коректний вік (16-99):");
      }
      user.data.age = age;
      user.step = "about";
      saveUsers(users);
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
      saveUsers(users);
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
        saveUsers(users);

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
          saveUsers(users);
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

bot.command("search", (ctx) => {
  const users = loadUsers();
  const id = ctx.from.id;

  if (!users[id] || !users[id].finished) {
    return ctx.reply("Спочатку створи свою анкету!");
  }

  // Знаходимо випадкову анкету (не свою і не тих, кого вже лайкнув/відхилив)
  const seen = users[id].seen || [];
  const others = Object.entries(users).filter(
    ([uid, u]) => uid !== String(id) && u.finished && !seen.includes(uid)
  );

  if (others.length === 0) {
    return ctx.reply("Анкет більше немає. Спробуй пізніше.");
  }

  const [otherId, other] = others[Math.floor(Math.random() * others.length)];

  // Запамʼятовуємо, що показали цю анкету
  users[id].currentView = otherId;
  saveUsers(users);

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

bot.action("like", (ctx) => {
  const users = loadUsers();
  const id = ctx.from.id;
  const otherId = users[id].currentView;

  if (!otherId) return ctx.reply("Помилка. Спробуй /search");

  users[id].seen = [...(users[id].seen || []), otherId];
  saveUsers(users);
  ctx.reply("Тобі сподобалася анкета!");
  ctx.deleteMessage();
});

bot.action("dislike", (ctx) => {
  const users = loadUsers();
  const id = ctx.from.id;
  const otherId = users[id].currentView;

  if (!otherId) return ctx.reply("Помилка. Спробуй /search");

  users[id].seen = [...(users[id].seen || []), otherId];
  saveUsers(users);
  ctx.reply("Анкета відхилена.");
  ctx.deleteMessage();
});

// --------------------- Редагування анкети ------------------------

bot.command("edit", (ctx) => {
  const users = loadUsers();
  const id = ctx.from.id;
  if (!users[id]) {
    ctx.reply("У тебе ще немає анкети! /start");
  } else {
    users[id] = { ...startProfile, finished: false };
    saveUsers(users);
    ctx.reply("Редагуємо анкету. Як тебе звати?");
  }
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
