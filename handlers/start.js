function registerStartHandlers(bot) {
  bot.start(async (ctx) => {
    // 0) Check if user already exists in DB
    const existing = await loadUser(ctx.from.id);
    if (existing) {
      return ctx.reply("У вас вже є анкета.", mainMenu);
    }
    // Зберігаємо id реферера, якщо є startPayload
    const referrerId = ctx.startPayload ? parseInt(ctx.startPayload) : null;

    // 1) Індикатор “typing…”
    // await ctx.sendChatAction("typing");
    // 2) Персональне вітання
    await ctx.reply(
      `👋 Привіт, ${ctx.from.first_name}! Ласкаво просимо до Znaimo!`
    );

    // Доповненне повідомлення після вітання
    // await ctx.sendChatAction("typing");
    await ctx.reply(
      `Я допоможу тобі:
• Створити власну анкету
• Знайти та переглянути анкети інших
• Розпочати спілкування одразу після зустрічі лайків!`
    );

    // 3) Ще один “typing…” перед наступним кроком
    // await ctx.sendChatAction("typing");
    // 4) Власне запит на створення анкети
    // Створюємо нового користувача одразу з referrer/referrals
    const id = ctx.from.id;
    const user = {
      ...startProfile,
      id,
      username: ctx.from.username || null,
      referrer: referrerId || null,
      referrals: [],
    };
    await saveUser(user);

    // Якщо є реферер і це не сам користувач — додаємо id до його referrals
    if (referrerId && referrerId !== ctx.from.id) {
      const refUser = await loadUser(referrerId);
      if (refUser) {
        refUser.referrals = refUser.referrals || [];
        if (!refUser.referrals.includes(ctx.from.id)) {
          refUser.referrals.push(ctx.from.id);
          await saveUser(refUser);
        }
      }
    }

    await ctx.reply(
      "✍️ Давай створимо твою анкету.",
      Markup.inlineKeyboard([
        [Markup.button.callback("Створити анкету", "create_profile")],
      ])
    );
  });

  bot.action("create_profile", async (ctx) => {
    try {
      const id = ctx.from.id;
      const existing = await loadUser(id);
      if (existing && existing.finished) {
        return ctx.reply("Ваша анкета вже створена.", mainMenu);
      }
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
}

module.exports = { registerStartHandlers };
