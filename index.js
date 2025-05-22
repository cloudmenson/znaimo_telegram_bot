const express = require("express");
const { Telegraf, Markup } = require("telegraf");
require("dotenv").config();

const { loadUser, saveUser, removeUser, getAllUsers } = require("./mongo");

const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN);

const translations = require("./translations");

function t(user, key, params = {}) {
  const lang = user?.lang || "uk";
  let text = translations[lang][key] || translations.en[key] || key;
  Object.keys(params).forEach((k) => {
    text = text.replace(`{${k}}`, params[k]);
  });
  return text;
}

function getMainMenu(user) {
  return Markup.keyboard(translations[user.lang || "uk"].mainMenu)
    .resize()
    .oneTime(false);
}
function getEditProfileMenu(user) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(t(user, "editMenuName"), "edit_name"),
      Markup.button.callback(t(user, "editMenuAge"), "edit_age"),
    ],
    [
      Markup.button.callback(t(user, "editMenuCity"), "edit_city"),
      Markup.button.callback(t(user, "editMenuAbout"), "edit_about"),
    ],
    [Markup.button.callback(t(user, "editMenuPhotos"), "edit_photos")],
  ]);
}
function getSearchMenu(user) {
  return Markup.keyboard([
    [t(user, "actionLike"), t(user, "actionDislike"), t(user, "yourProfile")]
  ]).resize().oneTime(false);
}
function getPendingMenu(user) {
  return Markup.keyboard([
    [t(user, "actionLike") + " Взаємно", t(user, "actionDislike") + " Відхилити"]
  ]).resize().oneTime(false);
}

const startProfile = {
  step: "name",
  editStep: null,
  lang: "uk",
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
  let profileText = `<b>• ${t(user, "editMenuName")}</b> ${name}\n<b>• ${t(user, "editMenuAge")}</b> ${age}\n`;
  if (city) {
    profileText += `<b>• ${t(user, "editMenuCity")}</b> ${city}\n`;
  }
  profileText += `<b>• ${t(user, "editMenuAbout")}</b> ${about}`;
  return profileText;
}

// --------------------- Меню вибору мови --------------------
bot.hears([
  "🌐 Мова", "🌐 Language", "🌐 Język"
], async (ctx) => {
  const user = await loadUser(ctx.from.id);
  await ctx.reply(
    t(user, "chooseLang"),
    Markup.inlineKeyboard([
      [Markup.button.callback("🇺🇦 Українська", "lang_uk")],
      [Markup.button.callback("🇬🇧 English", "lang_en")],
      [Markup.button.callback("🇵🇱 Polski", "lang_pl")],
    ])
  );
});
bot.command("language", async (ctx) => {
  const user = await loadUser(ctx.from.id);
  await ctx.reply(
    t(user, "chooseLang"),
    Markup.inlineKeyboard([
      [Markup.button.callback("🇺🇦 Українська", "lang_uk")],
      [Markup.button.callback("🇬🇧 English", "lang_en")],
      [Markup.button.callback("🇵🇱 Polski", "lang_pl")],
    ])
  );
});
bot.action(/lang_(uk|en|pl)/, async (ctx) => {
  const lang = ctx.match[1];
  let user = await loadUser(ctx.from.id);
  user.lang = lang;
  await saveUser(user);
  await ctx.editMessageText(translations[lang].langChanged);
  await ctx.reply(
    t(user, "greeting", { name: ctx.from.first_name }),
    getMainMenu(user)
  );
});

// Глобальний middleware для показу “typing” перед кожним повідомленням
bot.use(async (ctx, next) => {
  try {
    await ctx.sendChatAction("typing");
  } catch (e) {}
  return next();
});
bot.catch((err, ctx) => {
  console.error("BOT ERROR", err);
  ctx.reply("Виникла технічна помилка. Спробуйте ще раз.");
});

// Привітальне повідомлення для нових користувачів
bot.on("message", async (ctx, next) => {
  if (ctx.message.text && ctx.message.text.startsWith("/")) return next();
  const id = ctx.from.id;
  const user = await loadUser(id);
  if (!user) {
    await ctx.reply(
      t({lang: "uk"}, "greeting", { name: ctx.from.first_name }) + "\n\n" + t({lang: "uk"}, "help")
    );
    return;
  }
  return next();
});

// ------------------ Головні меню -----------------------

bot.hears((text, ctx) => {
  const userLang = ctx.session?.user?.lang || "uk";
  return translations[userLang].mainMenu.includes(text);
}, async (ctx) => {
  // Фільтруємо по тексту меню
  const text = ctx.message.text;
  const id = ctx.from.id;
  let user = await loadUser(id);

  if (text === t(user, "menuView")) {
    const hasPending = await checkPendingLikes(ctx, user);
    if (hasPending) return;
    if (!user || !user.finished) {
      return ctx.reply(t(user, "profileNotCreated"), getMainMenu(user));
    }
    await handleSearch(ctx, user, id, false);
  }
  if (text === t(user, "menuEdit")) {
    if (!user || !user.finished) {
      return ctx.reply(t(user, "profileNotCreated"), getMainMenu(user));
    }
    await ctx.reply(t(user, "editProfile"), getEditProfileMenu(user));
  }
  if (text === t(user, "menuProfile")) {
    if (!user || !user.finished) {
      return ctx.reply(t(user, "profileNotCreated"), getMainMenu(user));
    }
    if (!user.data.photos || user.data.photos.length === 0) {
      return ctx.reply(t(user, "sendProfilePhoto"), getMainMenu(user));
    }
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
    await ctx.reply(t(user, "chooseAction"), getMainMenu(user));
  }
});

// ------------------ Команди ---------------------------
bot.start(async (ctx) => {
  const id = ctx.from.id;
  let user = await loadUser(id);
  if (!user) {
    user = { ...startProfile, id, username: ctx.from.username || null };
    await saveUser(user);
  }
  await ctx.reply(
    t(user, "greeting", { name: ctx.from.first_name })
  );
  await ctx.reply(t(user, "help"));
  await ctx.reply(
    t(user, "startProfile"),
    Markup.inlineKeyboard([
      [Markup.button.callback(t(user, "createProfileBtn"), "create_profile")],
    ])
  );
});
bot.command("profile", async (ctx) => {
  const id = ctx.from.id;
  const user = await loadUser(id);
  if (!user || !user.finished) {
    return ctx.reply(t(user, "profileNotCreated"), getMainMenu(user));
  }
  if (!user.data.photos || user.data.photos.length === 0) {
    return ctx.reply(t(user, "sendProfilePhoto"), getMainMenu(user));
  }
  await ctx.replyWithMediaGroup([
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
  await ctx.reply(t(user, "chooseAction"), getMainMenu(user));
});
bot.command("edit", async (ctx) => {
  const id = ctx.from.id;
  let user = await loadUser(id);
  if (!user || !user.finished) {
    return ctx.reply(t(user, "profileNotCreated"), getMainMenu(user));
  }
  await ctx.reply(t(user, "editProfile"), getEditProfileMenu(user));
});
bot.command("find", async (ctx) => {
  const id = ctx.from.id;
  let user = await loadUser(id);
  if (!user || !user.finished) {
    return ctx.reply(t(user, "profileNotCreated"), getMainMenu(user));
  }
  await handleSearch(ctx, user, id, false);
});

// Створення анкети
bot.action("create_profile", async (ctx) => {
  try {
    const id = ctx.from.id;
    const user = { ...startProfile, id, username: ctx.from.username || null };
    await saveUser(user);
    await ctx.reply(t(user, "enterName"));
  } catch (e) {
    await ctx.reply(t({}, "error"));
  }
});

// ----- Пошук і лайки -----
async function checkPendingLikes(ctx, user) {
  if (!user || !user.pendingLikes || user.pendingLikes.length === 0) return false;
  const pendingId = user.pendingLikes[0];
  const pendingUser = await loadUser(pendingId);
  if (pendingUser && pendingUser.data && pendingUser.data.photos && pendingUser.data.photos.length > 0) {
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
    await ctx.reply(t(user, "pendingLike"), getPendingMenu(user));
  } else {
    user.pendingLikes.shift();
    await saveUser(user);
    return await checkPendingLikes(ctx, user);
  }
  return true;
}
bot.hears(t({}, "actionLike") + " Взаємно", async (ctx) => {
  const id = ctx.from.id;
  let user = await loadUser(id);
  if (!user.pendingLikes || user.pendingLikes.length === 0) {
    return ctx.reply(t(user, "noLikeRequests"), getMainMenu(user));
  }
  const pendingId = user.pendingLikes.shift();
  await saveUser(user);
  const pendingUser = await loadUser(pendingId);

  if (pendingUser && pendingUser.username) {
    await ctx.reply(
      t(user, "mutualLike", { username: pendingUser.username }),
      getMainMenu(user)
    );
  }
  if (pendingUser) {
    const usernameOrId = user.username ? user.username : user.id;
    await ctx.telegram.sendMessage(
      pendingId,
      t(pendingUser, "mutualLike", { username: usernameOrId })
    );
  }
});
bot.hears(t({}, "actionDislike") + " Відхилити", async (ctx) => {
  const id = ctx.from.id;
  let user = await loadUser(id);
  if (!user.pendingLikes || user.pendingLikes.length === 0) {
    return ctx.reply(t(user, "noLikeRequests"), getMainMenu(user));
  }
  user.pendingLikes.shift();
  await saveUser(user);
  if (user.pendingLikes.length > 0) {
    await checkPendingLikes(ctx, user);
  } else {
    await ctx.reply(t(user, "rejected"), getMainMenu(user));
  }
});

// ----- Меню пошуку -----
async function handleSearch(ctx, user, id, isInline = false) {
  if (!user || !user.finished) {
    if (isInline) return ctx.answerCbQuery(t(user, "profileNotCreated"));
    return ctx.reply(t(user, "profileNotCreated"), getMainMenu(user));
  }

  const hasPending = await checkPendingLikes(ctx, user);
  if (hasPending) return;

  const seen = user.seen || [];
  const allUsers = await getAllUsers();
  const others = allUsers.filter(
    (u) =>
      u.id !== id &&
      u.finished &&
      !seen.includes(u.id) &&
      u.id !== user.currentView
  );

  if (others.length === 0) {
    user.currentView = null;
    await saveUser(user);
    if (isInline) {
      await ctx.editMessageText(t(user, "noProfiles"), getMainMenu(user));
    } else {
      await ctx.reply(t(user, "noProfiles"), getMainMenu(user));
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
  await ctx.reply(t(user, "chooseAction"), getSearchMenu(user));
}
bot.hears(t({}, "actionLike"), async (ctx) => {
  const id = ctx.from.id;
  let user = await loadUser(id);
  if (!user || !user.finished || !user.currentView) {
    return ctx.reply(t(user, "noProfiles"), getMainMenu(user));
  }
  await handleLikeDislike(ctx, user, "like");
});
bot.hears(t({}, "actionDislike"), async (ctx) => {
  const id = ctx.from.id;
  let user = await loadUser(id);
  if (!user || !user.finished || !user.currentView) {
    return ctx.reply(t(user, "noProfiles"), getMainMenu(user));
  }
  await handleLikeDislike(ctx, user, "dislike");
});
async function handleLikeDislike(ctx, user, action, isInline = false) {
  if (!user || !user.currentView) {
    if (isInline) return ctx.answerCbQuery(t(user, "noProfiles"));
    return ctx.reply(t(user, "noProfiles"), getMainMenu(user));
  }
  const id = ctx.from.id;
  const otherId = user?.currentView;

  user.seen = [...(user.seen || []), otherId];
  await saveUser(user);

  const likedUser = await loadUser(otherId);
  if (likedUser) {
    if (action === "like") {
      if ((likedUser.seen || []).includes(id)) {
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
        await ctx.telegram.sendMessage(
          likedUser.id,
          t(likedUser, "mutualLike", { username: ctx.from.username || user.id })
        );

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
          t(user, "mutualLike", { username: likedUser.username || likedUser.id })
        );
        user.currentView = null;
        await saveUser(user);
        return;
      } else {
        if (!likedUser.pendingLikes) likedUser.pendingLikes = [];
        if (!likedUser.pendingLikes.includes(user.id)) {
          likedUser.pendingLikes.push(user.id);
          await saveUser(likedUser);
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
          await ctx.telegram.sendMessage(
            likedUser.id,
            t(likedUser, "pendingLike"),
            getPendingMenu(likedUser)
          );
        }
      }
    }
  }
  await handleSearch(ctx, user, id, isInline);
}

// ------------------ Заповнення анкети та редагування ---------------------

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
      switch (user.editStep) {
        case "edit_name":
          if (!ctx.message.text || ctx.message.text.length < 2) {
            return ctx.reply(t(user, "enterValidName"));
          }
          user.data.name = ctx.message.text.trim();
          user.editStep = null;
          await saveUser(user);
          await ctx.reply(t(user, "nameUpdated"), getMainMenu(user));
          break;
        case "edit_age":
          {
            const age = parseInt(ctx.message.text, 10);
            if (isNaN(age) || age < 16 || age > 99) {
              return ctx.reply(t(user, "enterValidAge"));
            }
            user.data.age = age;
            user.editStep = null;
            await saveUser(user);
            await ctx.reply(t(user, "ageUpdated"), getMainMenu(user));
          }
          break;
        case "edit_city":
          if (!ctx.message.text || ctx.message.text.length < 2) {
            return ctx.reply(t(user, "enterValidCity"));
          }
          user.data.city = ctx.message.text.trim();
          user.editStep = null;
          await saveUser(user);
          await ctx.reply(t(user, "cityUpdated"), getMainMenu(user));
          break;
        case "edit_about":
          if (
            !ctx.message.text ||
            ctx.message.text.length < 5 ||
            ctx.message.text.length > 200
          ) {
            return ctx.reply(t(user, "enterValidAbout"));
          }
          user.data.about = ctx.message.text.trim();
          user.editStep = null;
          await saveUser(user);
          await ctx.reply(t(user, "aboutUpdated"), getMainMenu(user));
          break;
        case "edit_photos":
          if (ctx.message.photo) {
            const fileId =
              ctx.message.photo[ctx.message.photo.length - 1].file_id;
            user.data.photos.push(fileId);
            await saveUser(user);
            const count = user.data.photos.length;
            let text =
              count < 3
                ? t(user, "photosDone", { count })
                : t(user, "photosDone", { count }) + " " + t(user, "done");
            return ctx.reply(
              text,
              Markup.keyboard([[t(user, "done")]])
                .resize()
                .oneTime(true)
            );
          }
          if (
            ctx.message.text === t(user, "done") ||
            ctx.message.text?.toLowerCase() === t(user, "done").toLowerCase()
          ) {
            if (!user.data.photos || user.data.photos.length === 0) {
              return ctx.reply(
                t(user, "atLeastOnePhoto"),
                Markup.keyboard([[t(user, "done")]])
                  .resize()
                  .oneTime(true)
              );
            }
            user.editStep = null;
            await saveUser(user);
            return ctx.reply(t(user, "profileUpdated"), getMainMenu(user));
          }
          return ctx.reply(
            t(user, "sendPhoto"),
            Markup.keyboard([[t(user, "done")]])
              .resize()
              .oneTime(true)
          );
      }
      return;
    }

    // Якщо анкета вже заповнена — не реагувати (всі дії через інлайн)
    if (user.finished) return next();

    // --- Заповнення анкети step-by-step ---
    switch (user.step) {
      case "name":
        if (!ctx.message.text || ctx.message.text.length < 2) {
          return ctx.reply(t(user, "enterValidName"));
        }
        user.data.name = ctx.message.text.trim();
        user.step = "age";
        await saveUser(user);
        await ctx.reply(t(user, "enterAge"));
        break;
      case "age":
        {
          const age = parseInt(ctx.message.text, 10);
          if (isNaN(age) || age < 16 || age > 99) {
            return ctx.reply(t(user, "enterValidAge"));
          }
          user.data.age = age;
          user.step = "city";
          await saveUser(user);
          await ctx.reply(t(user, "enterCity"));
        }
        break;
      case "city":
        if (!ctx.message.text || ctx.message.text.length < 2) {
          return ctx.reply(t(user, "enterValidCity"));
        }
        user.data.city = ctx.message.text.trim();
        user.step = "about";
        await saveUser(user);
        await ctx.reply(t(user, "enterAbout"));
        break;
      case "about":
        if (
          !ctx.message.text ||
          ctx.message.text.length < 5 ||
          ctx.message.text.length > 200
        ) {
          return ctx.reply(t(user, "enterValidAbout"));
        }
        user.data.about = ctx.message.text.trim();
        user.step = "photos";
        await saveUser(user);
        return ctx.reply(
          t(user, "enterPhotos"),
          Markup.keyboard([[t(user, "done")]])
            .resize()
            .oneTime(true)
        );
      case "photos":
        if (ctx.message.photo) {
          if (user.data.photos.length >= 3) {
            return ctx.reply(
              t(user, "photosDone", { count: 3 }),
              Markup.keyboard([[t(user, "done")]])
                .resize()
                .oneTime(true)
            );
          }
          const fileId =
            ctx.message.photo[ctx.message.photo.length - 1].file_id;
          user.data.photos.push(fileId);
          await saveUser(user);
          const count = user.data.photos.length;
          let text =
            count < 3
              ? t(user, "photosDone", { count })
              : t(user, "photosDone", { count }) + " " + t(user, "done");
          return ctx.reply(
            text,
            Markup.keyboard([[t(user, "done")]])
              .resize()
              .oneTime(true)
          );
        }
        if (
          ctx.message.text === t(user, "done") ||
          ctx.message.text?.toLowerCase() === t(user, "done").toLowerCase()
        ) {
          if (user.data.photos.length === 0) {
            return ctx.reply(
              t(user, "atLeastOnePhoto"),
              Markup.keyboard([[t(user, "done")]])
                .resize()
                .oneTime(true)
            );
          }
          user.finished = true;
          user.step = null;
          await saveUser(user);
          return ctx.reply(t(user, "profileReady"), getMainMenu(user));
        }
        return ctx.reply(
          t(user, "sendPhoto"),
          Markup.keyboard([[t(user, "done")]])
            .resize()
            .oneTime(true)
        );
        break;
      default:
        await ctx.reply(t(user, "error"));
    }
  } catch (e) {
    await ctx.reply(t({}, "error"));
  }
});

// --------------------- Запуск ------------------------
console.log("--------- BOT IS RUNNING! ---------");

const WEBHOOK_PATH = "/bot" + process.env.BOT_TOKEN;
const WEBHOOK_URL = `https://${
  process.env.RENDER_EXTERNAL_HOSTNAME || "your-app-name.onrender.com"
}${WEBHOOK_PATH}`;

(async () => {
  await bot.telegram.setMyCommands([
    { command: "profile", description: "📝 Профіль" },
    { command: "referral", description: "🎁 Реферальна система" },
    { command: "privacy", description: "🔒 Політика приватності" },
    { command: "blacklist", description: "🚫 Додати в чорний список" },
    { command: "language", description: "🌐 Мова / Language" }
  ]);
  await bot.telegram.setWebhook(WEBHOOK_URL);
})();
app.use(bot.webhookCallback(WEBHOOK_PATH));
app.get("/", (req, res) => res.send("Znaimo bot is alive!"));
app.listen(process.env.PORT, () => {
  console.log(`Server listening on port ${process.env.PORT}`);
});
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
