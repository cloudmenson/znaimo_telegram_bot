const { saveUser, loadUser } = require("../mongo");
const { handleSearch, prettyProfile } = require("./search");
const { Markup } = require("telegraf");

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

module.exports = { handleLikeDislike };
