function registerProfileHandlers(bot) {
  bot.command("profile", async (ctx) => {
    const id = ctx.from.id;
    const user = await loadUser(id);
    // Якщо анкету не створено або не завершено
    if (!user || !user.finished) {
      return ctx.reply(
        "Ти ще не створив анкету. Натисни /start, щоб розпочати."
      );
    }
    // Якщо фото відсутні
    if (!user.data.photos || user.data.photos.length === 0) {
      return ctx.reply(
        "У твоїй анкеті ще немає фото.\n\n" +
          "Щоб додати фото, натисни «✏️ Змінити або виконай /edit."
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
}

module.exports = { registerProfileHandlers };
