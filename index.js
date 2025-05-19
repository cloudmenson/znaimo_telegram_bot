const express = require("express");
const { Telegraf, Markup } = require("telegraf");
require("dotenv").config();

const { loadUser, saveUser, removeUser, getAllUsers } = require("./mongo");

const bot = new Telegraf(process.env.BOT_TOKEN);

const mainMenu = Markup.keyboard([
  ["🔍 Дивитися анкети", "⭐ Преміум", "⚙️ Профіль"],
]).resize();

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

  // --- Кнопка Шукати ---
  if (ctx.message.text === "🔍 Дивитися анкети") {
    return await handleSearch(ctx, user, id);
  }

  // --- Кнопка Преміум ---
  if (ctx.message.text === "⭐ Преміум") {
    return ctx.reply("Преміум скоро буде доступний 🫡", mainMenu);
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
      return ctx.reply("У твоїй анкеті ще немає фото.", mainMenu);
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
    return ctx.replyWithHTML(
      "",
      Markup.keyboard([["✏️ Редагувати", "❌ Видалити профіль"]])
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
        [Markup.button.callback("🏠 Місто", "edit_city")],
        [Markup.button.callback("📝 Опис", "edit_about")],
        [Markup.button.callback("🤳 Фото", "edit_photos")],
        [Markup.button.callback("⬅️ Назад", "profile_back")],
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
            // Якщо вже 3 фото, не даємо додати ще, повідомлення тільки про максимум
            return ctx.reply("3 фото додано. Натисни 'Готово' для завершення.");
          }
          const fileId =
            ctx.message.photo[ctx.message.photo.length - 1].file_id;
          user.data.photos.push(fileId);
          await saveUser(user);
          if (user.data.photos.length === 3) {
            // Якщо це третє фото — одразу повідомляємо про максимум і не пропонуємо додавати ще
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
    return; // Не йдемо далі по створенню анкети
  }

  // Якщо немає анкети — почати
  if (!user) {
    user = { ...startProfile, id, username: ctx.from.username || null };
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
      // --- Додавання фото при створенні: максимум 3, після третього фото не пропонуємо додавати ще ---
      if (ctx.message.photo) {
        if (user.data.photos.length >= 3) {
          // Забороняємо додавати більше 3 фото
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
          ctx.replyWithHTML(
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
bot.action("edit_city", async (ctx) => {
  const id = ctx.from.id;
  let user = await loadUser(id);
  user.editStep = "edit_city";
  await saveUser(user);
  ctx.reply("Введи нову назву міста:");
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
    // Показуємо головне меню якщо анкет більше немає
    return ctx.reply("Анкет більше немає. Спробуй пізніше.", mainMenu);
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
  // Кнопки під анкетою як звичайна клавіатура!
  await ctx.reply("", Markup.keyboard([["💝", "❌", "⚙️ Профіль"]]).resize());
}

// ----------- Лайк / Дизлайк ----------------------

// ----------- Лайк / Дизлайк з обробкою взаємних лайків та пошуком наступної анкети -----------
bot.action("like", async (ctx) => {
  const id = ctx.from.id;
  const user = await loadUser(id);
  const otherId = user?.currentView;

  if (!otherId) return ctx.reply("Помилка. Спробуй знову");

  // Додаємо переглянуту анкету до seen
  user.seen = [...(user.seen || []), otherId];
  await saveUser(user);
  ctx.deleteMessage();

  // Повідомляємо власнику анкети, що його лайкнули
  const likedUser = await loadUser(otherId);
  if (likedUser) {
    // Якщо у likedUser вже є лайкнувшого у seen — це взаємний лайк
    if ((likedUser.seen || []).includes(id)) {
      // Взаємний лайк — повідомити обох
      try {
        // ========== ВСТАВ ЦЕЙ БЛОК ТУТ ==========
        if (user.username) {
          // Надсилаємо посилання на користувача для likedUser
          await ctx.telegram.sendMessage(
            otherId,
            `💞 Ви щойно отримали взаємний лайк!\n\n` +
              `Бажаємо приємно провести час!\n` +
              `Ось посилання на користувача: https://t.me/${user.username}`
          );
        }
        if (likedUser.username) {
          // Надсилаємо посилання на likedUser для user
          await ctx.telegram.sendMessage(
            id,
            `💞 Ви щойно отримали взаємний лайк!\n\n` +
              `Бажаємо приємно провести час!\n` +
              `Користувач: https://t.me/${likedUser.username}`
          );
        }
        // ========== КІНЕЦЬ БЛОКУ ==========
      } catch (e) {}
    } else {
      // Просто повідомлення власнику анкети
      try {
        await ctx.telegram.sendMessage(
          otherId,
          "Ваша анкета комусь сподобалась!"
        );
      } catch (e) {}
    }
  }

  // Після лайку одразу шукаємо наступну анкету
  await handleSearch(ctx, user, id);
});

bot.action("dislike", async (ctx) => {
  const id = ctx.from.id;
  const user = await loadUser(id);
  const otherId = user?.currentView;

  if (!otherId) return ctx.reply("Помилка. Спробуй знову");

  // Додаємо переглянуту анкету до seen
  user.seen = [...(user.seen || []), otherId];
  await saveUser(user);
  ctx.deleteMessage();

  // Після дизлайку одразу шукаємо наступну анкету
  await handleSearch(ctx, user, id);
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
        [Markup.button.callback("🏠 Місто", "edit_city")],
        [Markup.button.callback("📝 Опис", "edit_about")],
        [Markup.button.callback("🤳 Фото", "edit_photos")],
        [Markup.button.callback("⬅️ Назад", "profile_back")],
      ])
    );
  }
});

// ----------- Обробник "⬅️ Назад" у меню редагування профілю -----------
bot.action("profile_back", async (ctx) => {
  const id = ctx.from.id;
  const user = await loadUser(id);
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
  await ctx.replyWithHTML(
    "",
    Markup.keyboard([["✏️ Редагувати", "❌ Видалити профіль"]])
      .oneTime()
      .resize()
  );
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
  ctx.replyWithHTML(
    "",
    Markup.keyboard([["✏️ Редагувати", "❌ Видалити профіль"]])
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
