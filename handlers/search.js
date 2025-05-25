const { Markup } = require("telegraf");
const { getAllUsers, saveUser, loadUser } = require("../mongo");
const geolib = require("geolib");

function prettyProfile(user) {
  const name = user.data.name || "";
  const age = user.data.age || "";
  const city = user.data.city || "";
  const about = user.data.about || "";
  let profileText = `<b>• Ім'я:</b> ${name}\n<b>• Вік:</b> ${age}\n`;
  if (city) {
    profileText += `<b>• Місто:</b> ${city}\n`;
  }
  profileText += `\n\n<b>• Про себе:</b> ${about}`;
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
      await ctx.reply("💞 Вам хтось поставив лайк!", pendingMenu);
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

async function handleSearch(ctx, user, id, isInline = false) {
  try {
    if (!user || !user.finished) {
      if (isInline) return ctx.answerCbQuery("Спочатку створи свою анкету!");
      return ctx.reply("Спочатку створи свою анкету!");
    }

    const hasPending = await checkPendingLikes(ctx, user);
    if (hasPending) return;

    const seen = user.seen || [];
    const disliked = user.disliked || [];
    const [_, allUsers] = await Promise.all([
      Promise.resolve(user), // keep for symmetry, user is already loaded
      getAllUsers(),
    ]);
    // Initial filter: exclude self, unfinished, seen, disliked, currentView, and users without valid photo(s)
    let filtered = allUsers.filter(
      (u) =>
        u.id !== id &&
        u.finished &&
        !seen.includes(u.id) &&
        u.id !== user.currentView &&
        !disliked.includes(u.id) &&
        !(user.blacklist || []).includes(u.id) &&
        Array.isArray(u.data.photos) &&
        u.data.photos.some(Boolean)
    );
    // Apply gender filter if selected
    if (
      user.data.searchGender &&
      user.data.searchGender !== "" &&
      user.data.searchGender !== "Будь-хто"
    ) {
      const target =
        user.data.searchGender === "Хлопці" ? "Хлопець" : "Дівчина";
      filtered = filtered.filter((u) => u.data.gender === target);
    }
    // Sort by proximity if coordinates are available
    let candidates = filtered;
    if (user.data.latitude != null && user.data.longitude != null) {
      const withCoords = filtered.filter(
        (u) => u.data.latitude != null && u.data.longitude != null
      );
      const sortedCoords = withCoords
        .map((u) => ({
          user: u,
          distance: geolib.getDistance(
            { latitude: user.data.latitude, longitude: user.data.longitude },
            { latitude: u.data.latitude, longitude: u.data.longitude }
          ),
        }))
        .sort((a, b) => a.distance - b.distance)
        .map((item) => item.user);
      const withoutCoords = filtered.filter(
        (u) => u.data.latitude == null || u.data.longitude == null
      );
      candidates = [...sortedCoords, ...withoutCoords];
    }
    const other = candidates.length ? candidates[0] : null;

    if (!other) {
      user.currentView = null;
      user.disliked = [];
      user.lastAction = "search";
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

    user.currentView = other.id;
    user.lastAction = "search";
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
    await ctx.reply("💝/❌ Зробіть свій вибір:", searchMenu);
  } catch (e) {
    console.error("handleSearch ERROR:", e);
    await ctx.reply("Виникла технічна помилка. Спробуйте ще раз.");
  }
}

module.exports = { handleSearch, checkPendingLikes, prettyProfile };
