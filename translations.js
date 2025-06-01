const translations = {
  uk: {
    language_select_prompt: "🌍 Обери мову:",
    language_changed: "✅ Мову змінено!",
    welcome_start:
      "👋 Привіт, {name}! Ласкаво просимо до Znaimo!\n\n" +
      "Щоб почати, натисни /start.\n\n" +
      "Я допоможу тобі:\n" +
      "• Створити власну анкету\n" +
      "• Знайти та переглянути анкети інших\n" +
      "• Розпочати спілкування одразу після зустрічі лайків!",
    welcome: "👋 Привіт, {name}! Ласкаво просимо до Znaimo!",
    help_intro:
      "Я допоможу тобі:\n" +
      "• Створити власну анкету\n" +
      "• Знайти та переглянути анкети інших\n" +
      "• Розпочати спілкування одразу після зустрічі лайків!",
    already_has_profile: "У вас вже є анкета.",
    profile_not_created: "Ти ще не створив анкету. Натисни /start.",
    profile_no_photos:
      "У твоїй анкеті ще немає фото.\n" +
      "Щоб додати фото, натисни «✏️ Змінити».",
    no_pending_likes: "У вас немає запитів на лайк.",
    rejected: "Відхилено.",
    no_profile_to_rate: "Немає доступної анкети для оцінки.",
    superlike_used: "💥 Ви вже використали супер-лайк сьогодні.",
    superlike_explain:
      "💥 Супер-лайк — це один потужний лайк на день, який гарантовано побачить інший користувач.",
    superlike_sent: "💥 Супер-лайк надіслано!",
    superlike_cancelled: "❌ Супер-лайк скасовано.",
    edit_cancelled: "Редагування профілю скасовано ❌",
    send_username_warning:
      "❗️Щоб інші могли зв’язатися з тобою після взаємного лайку, переконайся, що:\n" +
      "• У тебе є username в Telegram\n" +
      "— ТАКОЖ —\n" +
      "• Перевір в налаштуваннях Telegram → Приватність → Пересилання повідомлень увімкнено «Усі».",
    no_previous_profile: "Немає попередньої анкети для перегляду.",
    cant_go_back:
      "❌ Ви вже поставили лайк на цю анкету. Назад повернутись не можна.",
    previous_not_found: "Попередню анкету не знайдено або вона видалена.",
    blacklist_empty: "У тебе немає заблокованих користувачів.",
    blacklist_limit: "🚫 Ти досяг ліміту в 50 заблокованих користувачів.",
    blacklist_already: "Цей користувач вже у чорному списку.",
    blacklist_added: "Користувача додано до чорного списку.",
    unblock_success: "Користувача розблоковано ✅",
    no_access_to_blacklist: "Немає доступу до списку.",
    start_again: "Щось пішло не так. /start щоб почати спочатку.",
    no_more_profiles: "Анкет більше немає. Спробуй пізніше.",
    edit_profile_prompt: "Що ти хочеш змінити?",
    start_profile_prompt: "✍️ Давай створимо твою анкету.",
    // --- Added keys below in logical order among similar prompts ---
    create_profile: "Створити анкету",
    cancel: "Відмінити",
    done: "Готово",
    enter_name: "✏️ Почнемо з імені. Як тебе звати?",
    enter_age: "🎂 Скільки тобі років?",
    enter_gender: "⚧ Обери стать:",
    enter_city: "🏠 В якому місті ти живеш?",
    enter_about: "📝 За бажанням, можеш додати інформацію про себе:",
    select_gender_keyboard: "Будь ласка, обери стать з клавіатури:",
    enter_valid_name: "Введи коректне імʼя:",
    enter_valid_age: "Введи коректний вік (18-99):",
    enter_valid_city: "Введи коректну назву міста:",
    about_too_long: "Опис має бути до 200 символів.",
    send_photo: "Надішліть фото або натисніть «Готово».",
    send_at_least_one_photo: "Будь ласка, надішліть хоча б одне фото.",
    photo_updated: "✅ Фото профілю оновлено!",
    enter_min_age: "Введіть новий мінімальний вік (від 18 до 99):",
    enter_max_age: "Введіть новий максимальний вік (від 18 до 99):",
    invalid_min_age: "Невірне значення. Введіть число від 18 до 99, не більше за максимальний вік.",
    invalid_max_age: "Невірне значення. Введіть число від 18 до 99, не менше за мінімальний вік.",
    profile_ready: "✅ Ваша анкета готова!",
    generic_error: "Виникла технічна помилка. Спробуйте ще раз.",
    new_profiles_notification: "👋 Привіт! У нас нові анкети — перевір, хто тебе міг вже лайкнути!",
    choose_profile_action: "💝/❌ Зробіть свій вибір:",
    // --- End added keys ---
    skip: "Пропустити",
    enter_min_age:
      "Введіть мінімальний вік анкет, які будуть вам траплятись в пошуку " +
      "та яким буде відображатись ваша анкета. (18–99):",
    enter_max_age:
      "Введіть максимальний вік анкет, які вам підходять. " +
      "(Має бути ≥ мінімального і не більше 99)",
    send_photos:
      "📸 Надішліть до 3 фото. Коли готові — натисніть «Готово».",
    yes: "✅ Так",
    no: "❌ Ні",
    faq_text:
      "📘 <b>Пояснення кнопок</b>\n\n" +
      "🔍 — Перегляд анкет інших користувачів.\n" +
      "🏠 — Перегляд свого профілю.\n" +
      "✏️ — Редагування своєї анкети або параметрів пошуку.\n" +
      "💝 — Звичайний лайк. Якщо взаємно — отримаєте контакт.\n" +
      "💥 — <b>Супер-лайк</b>. Один на день. Сповіщає іншу людину одразу.\n" +
      "❌ — Пропустити анкету.\n" +
      "↩ — Повернення до попередньої (один раз за пошук).\n" +
      "⭐ — Преміум. Можливість виділитися та збільшити шанси на знаходження того, кого шукаєш.\n" +
      "⚙️ — Перегляд свого профілю або його редагування.\n" +
      "❓ — Довідка про функціонал бота.",
    privacy_policy:
      "🔒 <b>Політика приватності для Telegram-бота Znaimo</b>\n" +
      "<i>Оновлено: 24 травня 2025</i>\n\n" +
      "<b>1. Загальні положення</b>\n" +
      "Ми цінуємо вашу приватність і прагнемо максимально прозоро пояснювати, " +
      "які дані ми збираємо та як їх використовуємо. Ця політика описує обробку " +
      "інформації користувачів бота Znaimo.\n\n" +
      "<b>2. Дані, які ми ЗБИРАЄМО і ЗБЕРІГАЄМО</b>\n" +
      "- <b>Особисті дані Telegram</b>: ID, ім’я, юзернейм\n" +
      "- <b>Дані анкети</b>: ім’я, вік, стать, місто, “Про себе”, фото (<code>file_id</code>), параметри пошуку\n" +
      "- <b>Метадані</b>: час створення/оновлення анкети, статус (активна/деактивована)\n" +
      "- <b>Лайки/дизлайки</b>: кому ви ставили і хто вам ставив 💝 або ❌\n\n" +
      "<b>3. Дані, які ми НЕ ЗБИРАЄМО</b>\n" +
      "- Контакти, email, телефон\n" +
      "- Дані натискань кнопок (крім лайків)\n" +
      "- Повідомлення вільного чату поза анкетою\n\n" +
      "<b>4. Використання даних</b>\n" +
      "- Створення, показ та пошук анкет\n" +
      "- Сповіщення про взаємні лайки\n" +
      "- Сповіщення про відсутність після 12-ти годин повної відсутності користувача\n\n" +
      "<b>5. Зберігання та захист</b>\n" +
      "- Захищені сервери з резервним копіюванням\n" +
      "- Доступ тільки адміністратору\n" +
      "- Не передаємо дані третім особам, крім випадків, передбачених законом\n\n" +
      "<b>6. Видалення даних</b>\n" +
      "- Видалення відсутнє. Змініть дані анкети на фейкові і видаліть бота зі свого чату, якщо необхідно.\n\n" +
      "<b>7. Зміни в політиці</b>\n" +
      "Ми можемо оновлювати цю політику; зміни будуть оголошені через бота.\n\n" +
      "<b>8. Контакти</b>\n" +
      "Співпраця/Питання/Зауваження: @znaimoHelper або пишіть на znaimo.bot@gmail.com",
    referral_text:
      "🎁 <b>Реферальна система</b>\n\n" +
      "📨 <b>Запрошено друзів:</b> <b>{count}</b>\n\n" +
      "🔗 <b>Твоє посилання для запрошень:</b>\n" +
      "<code>https://t.me/{username}?start={userId}</code>\n\n" +
      "❤️ <b>Денний ліміт лайків:</b> <b>{likesToday}/{maxLikes}</b>\n" +
      "(🧩 <i>50 базових</i> + 💎 <i>{referralBonus} за запрошених</i>)\n\n" +
      "📌 <i>Додаткові лайки нараховуються, якщо запрошена людина створить анкету " +
      "і лайкне хоча б 1 анкету.</i>",
    premium_info:
      "💳 <b>Щоб отримати преміум на 30 днів</b>:\n\n" +
      "1. Переведіть <b>100 грн</b> на карту:  \n" +
      "<code>4441 1110 5652 0756</code>\n\n" +
      "2. Надішліть скріншот платежу сюди 👉 <a href=\"https://t.me/znaimoHelper\">@znaimoHelper</a>\n\n" +
      "Після активації ви отримаєте:\n" +
      "• 💝 Безлімітні лайки щодня\n" +
      "• 📓 Збільшено ліміт чорного списку з 50 до 100 користувачів\n" +
      "• 📵 Відсутність реклами\n" +
      "• 🧭 Підтримка проєкту\n" +
      "• 🕐 Термін дії: 30 днів",
    buy_premium: "💳 Купити Преміум",
    error_user_not_found: "Сталася помилка: не знайдено користувача.",
  },
  en: {
    language_select_prompt: "🌍 Choose your language:",
    language_changed: "✅ Language changed!",
    already_has_profile: "You already have a profile.",
    profile_not_complete:
      "Your profile is not complete yet. Let's continue creating it.",
    welcome_start:
      "👋 Hi, {name}! Welcome to Znaimo!\n\nTo get started, press /start.\n\nI'll help you:\n" +
      "• Create your profile\n• Discover and view other profiles\n• Start chatting once you both like each other!",
    welcome: "👋 Hi, {name}! Welcome to Znaimo!",
    help_intro:
      "I’ll help you:\n" +
      "• Create your profile\n" +
      "• Discover and view other profiles\n" +
      "• Start chatting once you both like each other!",
    create_profile: "Create profile",
    done: "Done",
    cancel: "Cancel",
    edit_name: "✏️ Enter a new name:",
    edit_gender: "⚧ Choose gender:",
    edit_age: "🎂 Enter new age:",
    edit_city: "🏠 Enter a new city name:",
    edit_about: "📝 Enter a new description:",
    edit_photos:
      "📸 Send up to 3 photos. When ready — press “Done”.",
    blacklist_added: "User added to blacklist.",
    blacklist_already: "This user is already in your blacklist.",
    blacklist_limit:
      "🚫 You have reached the limit of 50 blocked users.",
    blacklist_empty: "You have no blocked users.",
    unblock_success: "User unblocked ✅",
    action_cancelled: "Action cancelled.",
    no_pending_likes: "You have no like requests.",
    rejected: "Rejected.",
    no_profile_to_rate: "No profile available to rate.",
    superlike_used:
      "💥 You have already used your super-like today.",
    superlike_explain:
      "💥 Super-like — one powerful like per day, guaranteed to be seen by the other user.",
    superlike_sent: "💥 Super-like sent!",
    superlike_cancelled: "❌ Super-like cancelled.",
    photo_added:
      "Photo added ({count}/3). Send more or press “Done”.",
    photo_limit:
      "Photo added ({count}/3). Limit reached. Press “Done”.",
    send_photo: "Send a photo or press “Done”.",
    send_at_least_one_photo:
      "Please send at least one photo.",
    photo_updated: "✅ Profile photo updated!",
    edit_cancelled: "Profile editing cancelled ❌",
    name_updated: "Name updated ✅",
    gender_updated: "Gender updated ✅",
    age_updated: "Age updated ✅",
    city_updated: "City updated ✅",
    about_updated: "Description updated ✅",
    search_gender_updated: "Search gender updated ✅",
    min_age_updated: "Minimum age updated.",
    max_age_updated: "Maximum age updated.",
    no_previous_profile: "No previous profile to view.",
    cant_go_back:
      "❌ You already liked this profile. Can't go back.",
    previous_not_found: "Previous profile not found or deleted.",
    blacklist_only_search:
      "❗ The /blacklist command can only be used while viewing profiles.",
    blacklist_only_in_profile:
      "This action can only be performed while viewing a profile.",
    confirm_blacklist: "🚫 Do you want to add this user to the blacklist?",
    no_access_to_blacklist: "No access to the list.",
    profile_ready: "✅ Your profile is ready!",
    send_username_warning:
      "❗️To let others contact you after a mutual like, make sure:\n" +
      "• You have a Telegram username\n" +
      "— ALSO —\n" +
      "• In Telegram settings → Privacy → Forwarded messages set to “Everybody”.",
    no_more_profiles: "No more profiles. Try again later.",
    choose_profile_action: "💝/❌ Make your choice:",
    start_again: "Something went wrong. /start to begin again.",
    edit_profile_prompt: "What would you like to change?",
    start_profile_prompt: "✍️ Let's create your profile.",
    enter_name:
      "✏️ Let's start with your name. What's your name?",
    enter_age: "🎂 How old are you?",
    enter_gender: "⚧ Choose your gender:",
    enter_city: "🏠 Which city do you live in?",
    enter_about: "📝 If you want, add some info about yourself:",
    skip: "Skip",
    enter_min_age:
      "Enter the minimum age of profiles you want to see/search for. (18–99):",
    enter_max_age:
      "Enter the maximum age of profiles that suit you. (Must be ≥ minimum and ≤ 99)",
    send_photos:
      "📸 Send up to 3 photos. When ready — press “Done”.",
    yes: "✅ Yes",
    no: "❌ No",
    faq_text:
      "📘 <b>Button explanations</b>\n\n" +
      "🔍 — Browse other users' profiles.\n" +
      "🏠 — View your profile.\n" +
      "✏️ — Edit your profile or search settings.\n" +
      "💝 — Like. If mutual — you'll get each other's contact.\n" +
      "💥 — <b>Super-like</b>. One per day. Notifies the other user immediately.\n" +
      "❌ — Skip profile.\n" +
      "↩ — Go back to the previous profile (once per search).\n" +
      "⭐ — Premium. Stand out and increase your chances of finding who you're looking for.\n" +
      "⚙️ — View or edit your profile.\n" +
      "❓ — Help about bot functionality.",
    privacy_policy:
      "🔒 <b>Privacy Policy for Znaimo Telegram Bot</b>\n" +
      "<i>Updated: May 24, 2025</i>\n\n" +
      "<b>1. General Provisions</b>\n" +
      "We value your privacy and strive to be transparent about the data we collect and how we use it. This policy explains the processing of user data by the Znaimo bot.\n\n" +
      "<b>2. Data We Collect and Store</b>\n" +
      "- <b>Telegram personal data</b>: ID, name, username\n" +
      "- <b>Profile data</b>: name, age, gender, city, “About me”, photos (<code>file_id</code>), search parameters\n" +
      "- <b>Metadata</b>: time of profile creation/update, status (active/deactivated)\n" +
      "- <b>Likes/dislikes</b>: who you liked and who liked you 💝 or ❌\n\n" +
      "<b>3. Data We Do Not Collect</b>\n" +
      "- Contacts, email, phone\n" +
      "- Button press data (except likes)\n" +
      "- Free chat messages outside of profiles\n\n" +
      "<b>4. Use of Data</b>\n" +
      "- Creating, displaying, and searching profiles\n" +
      "- Notifications about mutual likes\n" +
      "- Notifications if a user is inactive for 12 hours\n\n" +
      "<b>5. Storage and Security</b>\n" +
      "- Secure servers with backups\n" +
      "- Access only by the administrator\n" +
      "- We do not share data with third parties, except as required by law\n\n" +
      "<b>6. Data Deletion</b>\n" +
      "- No deletion feature. Change your profile data to fake info and remove the bot if needed.\n\n" +
      "<b>7. Policy Changes</b>\n" +
      "We may update this policy; changes will be announced through the bot.\n\n" +
      "<b>8. Contact</b>\n" +
      "Partnership/Questions/Feedback: @znaimoHelper or write to znaimo.bot@gmail.com",
    referral_text:
      "🎁 <b>Referral System</b>\n\n" +
      "📨 <b>Friends invited:</b> <b>{count}</b>\n\n" +
      "🔗 <b>Your referral link:</b>\n" +
      "<code>https://t.me/{username}?start={userId}</code>\n\n" +
      "❤️ <b>Daily like limit:</b> <b>{likesToday}/{maxLikes}</b>\n" +
      "(🧩 <i>50 base</i> + 💎 <i>{referralBonus} for invited</i>)\n\n" +
      "📌 <i>Extra likes are granted if an invited person creates a profile and likes at least one profile.</i>",
    premium_info:
      "💳 <b>To get Premium for 30 days</b>:\n\n" +
      "1. Send <b>100 UAH</b> to card number:  \n" +
      "<code>4441 1110 5652 0756</code>\n\n" +
      "2. Send a payment screenshot to 👉 <a href=\"https://t.me/znaimoHelper\">@znaimoHelper</a>\n\n" +
      "After activation, you get:\n" +
      "• 💝 Unlimited daily likes\n" +
      "• 📓 Blacklist limit increased from 50 to 100\n" +
      "• 📵 No ads\n" +
      "• 🧭 Support the project\n" +
      "• 🕐 Valid for 30 days",
    buy_premium: "💳 Buy Premium",
    error_user_not_found: "Сталася помилка: не знайдено користувача.",
  },
  pl: {
    language_select_prompt: "🌍 Wybierz język:",
    language_changed: "✅ Język został zmieniony!",
    already_has_profile: "Masz już profil.",
    profile_not_complete:
      "Twój profil nie jest jeszcze ukończony. Kontynuujmy jego tworzenie.",
    welcome_start:
      "👋 Cześć, {name}! Witamy w Znaimo!\n\nAby zacząć, naciśnij /start.\n\nPomogę Ci:\n" +
      "• Stworzyć swój profil\n• Przeglądać i zobaczyć inne profile\n" +
      "• Rozpocząć czat, gdy oboje polubicie swoje profile!",
    welcome: "👋 Cześć, {name}! Witamy w Znaimo!",
    help_intro:
      "Pomogę Ci:\n" +
      "• Stworzyć swój profil\n" +
      "• Przeglądać profile innych\n" +
      "• Zacząć rozmowę po wzajemnym polubieniu!",
    create_profile: "Utwórz profil",
    done: "Gotowe",
    cancel: "Anuluj",
    edit_name: "✏️ Wpisz nowe imię:",
    edit_gender: "⚧ Wybierz płeć:",
    edit_age: "🎂 Wpisz nowy wiek:",
    edit_city: "🏠 Wpisz nowe miasto:",
    edit_about: "📝 Wpisz nowy opis:",
    edit_photos:
      "📸 Wyślij do 3 zdjęć. Gdy gotowe — naciśnij „Gotowe”.",
    blacklist_added: "Użytkownik dodany do czarnej listy.",
    blacklist_already:
      "Ten użytkownik jest już na Twojej czarnej liście.",
    blacklist_limit:
      "🚫 Osiągnięto limit 50 zablokowanych użytkowników.",
    blacklist_empty: "Nie masz zablokowanych użytkowników.",
    unblock_success: "Użytkownik odblokowany ✅",
    action_cancelled: "Anulowano.",
    no_pending_likes: "Nie masz próśb o polubienie.",
    rejected: "Odrzucono.",
    no_profile_to_rate: "Brak profilu do oceny.",
    superlike_used:
      "💥 Już użyłeś super-lajka dzisiaj.",
    superlike_explain:
      "💥 Super-lajk — jeden silny lajk dziennie, który na pewno zobaczy druga osoba.",
    superlike_sent: "💥 Super-lajk wysłany!",
    superlike_cancelled: "❌ Super-lajk anulowany.",
    photo_added:
      "Zdjęcie dodane ({count}/3). Wyślij więcej lub kliknij „Gotowe”.",
    photo_limit:
      "Zdjęcie dodane ({count}/3). Osiągnięto limit. Kliknij „Gotowe”.",
    send_photo: "Wyślij zdjęcie lub kliknij „Gotowe”.",
    send_at_least_one_photo:
      "Wyślij przynajmniej jedno zdjęcie.",
    photo_updated: "✅ Zdjęcie profilowe zaktualizowane!",
    edit_cancelled: "Edycja profilu anulowana ❌",
    name_updated: "Imię zaktualizowane ✅",
    gender_updated: "Płeć zaktualizowana ✅",
    age_updated: "Wiek zaktualizowany ✅",
    city_updated: "Miasto zaktualizowane ✅",
    about_updated: "Opis zaktualizowany ✅",
    search_gender_updated: "Ustawienia wyszukiwania płci zaktualizowane ✅",
    min_age_updated: "Minimalny wiek zaktualizowany.",
    max_age_updated: "Maksymalny wiek zaktualizowany.",
    no_previous_profile: "Brak poprzedniego profilu do wyświetlenia.",
    cant_go_back:
      "❌ Już polubiłeś ten profil. Nie można wrócić.",
    previous_not_found:
      "Poprzedni profil nie znaleziony lub usunięty.",
    blacklist_only_search:
      "❗ Komendę /blacklist można używać tylko podczas przeglądania profili.",
    blacklist_only_in_profile:
      "Tę czynność można wykonać tylko podczas przeglądania profilu.",
    confirm_blacklist: "🚫 Czy chcesz dodać tego użytkownika do czarnej listy?",
    no_access_to_blacklist: "Brak dostępu do listy.",
    profile_ready: "✅ Twój profil jest gotowy!",
    send_username_warning:
      "❗️Aby inni mogli się z Tobą skontaktować po wzajemnym polubieniu, upewnij się, że:\n" +
      "• Masz username w Telegramie\n" +
      "— ORAZ —\n" +
      "• W ustawieniach Telegrama → Prywatność → Przekazywanie wiadomoń ustawione na „Wszyscy”.",
    no_more_profiles: "Brak więcej profili. Spróbuj później.",
    choose_profile_action: "💝/❌ Wybierz:",
    start_again: "Coś poszło nie tak. /start, aby zacząć ponownie.",
    edit_profile_prompt: "Co chcesz zmienić?",
    start_profile_prompt: "✍️ Stwórzmy Twój profil.",
    enter_name:
      "✏️ Zacznijmy od imienia. Jak masz na imię?",
    enter_age: "🎂 Ile masz lat?",
    enter_gender: "⚧ Wybierz płeć:",
    enter_city: "🏠 W jakim jesteś mieście?",
    enter_about: "📝 Jeśli chcesz, dodaj informacje o sobie:",
    skip: "Pomiń",
    enter_min_age:
      "Wprowadź minimalny wiek profili, które chcesz zobaczyć/wyszukać. (18–99):",
    enter_max_age:
      "Wprowadź maksymalny wiek profili, które Ci odpowiadają. (Musi być ≥ minimalnego i ≤ 99)",
    send_photos:
      "📸 Wyślij do 3 zdjęć. Gdy będziesz gotowy — naciśnij „Gotowe”.",
    yes: "✅ Tak",
    no: "❌ Nie",
    faq_text:
      "📘 <b>Wyjaśnienie przycisków</b>\n\n" +
      "🔍 — Przeglądaj profile innych użytkowników.\n" +
      "🏠 — Przeglądaj swój profil.\n" +
      "✏️ — Edytuj swój profil lub ustawienia wyszukiwania.\n" +
      "💝 — Polub. Jeśli wzajemne — otrzymasz kontakt.\n" +
      "💥 — <b>Super-polubienie</b>. Raz dziennie. Powiadamia drugiego użytkownika natychmiast.\n" +
      "❌ — Pomiń profil.\n" +
      "↩ — Wróć do poprzedniego profilu (raz na wyszukiwanie).\n" +
      "⭐ — Premium. Wyróżnij się i zwiększ swoje szanse na znalezienie kogo szukasz.\n" +
      "⚙️ — Przeglądaj lub edytuj swój profil.\n" +
      "❓ — Pomoc dotycząca funkcji bota.",
    privacy_policy:
      "🔒 <b>Polityka Prywatności dla Bota Telegram Znaimo</b>\n" +
      "<i>Aktualizacja: 24 maja 2025</i>\n\n" +
      "<b>1. Postanowienia ogólne</b>\n" +
      "Cenimy Twoją prywatność i dążymy do pełnej transparentności w zakresie danych, które zbieramy i jak ich używamy. Niniejsza polityka opisuje przetwarzanie danych użytkowników bota Znaimo.\n\n" +
      "<b>2. Dane, które zbieramy i przechowujemy</b>\n" +
      "- <b>Dane osobowe Telegram</b>: ID, imię, nazwa użytkownika\n" +
      "- <b>Dane profilu</b>: imię, wiek, płeć, miasto, „O mnie”, zdjęcia (<code>file_id</code>), parametry wyszukiwania\n" +
      "- <b>Metadane</b>: czas utworzenia/aktualizacji profilu, status (aktywny/dezaktywowany)\n" +
      "- <b>Polubienia/odrzucenia</b>: kogo polubiłeś i kto polubił Ciebie 💝 lub ❌\n\n" +
      "<b>3. Dane, których nie zbieramy</b>\n" +
      "- Kontakty, e-mail, telefon\n" +
      "- Dane o naciśnięciach przycisków (oprócz polubień)\n" +
      "- Wolne wiadomości czatu poza profilami\n\n" +
      "<b>4. Wykorzystanie danych</b>\n" +
      "- Tworzenie, wyświetlanie i wyszukiwanie profili\n" +
      "- Powiadomienia o wzajemnych polubieniach\n" +
      "- Powiadomienia, jeśli użytkownik jest nieaktywny przez 12 godzin\n\n" +
      "<b>5. Przechowywanie i zabezpieczenia</b>\n" +
      "- Bezpieczne serwery z kopią zapasową\n" +
      "- Dostęp tylko dla administratora\n" +
      "- Nie udostępniamy danych stronom trzecim, poza przypadkami wymaganymi prawem\n\n" +
      "<b>6. Usuwanie danych</b>\n" +
      "- Brak funkcji usuwania. Zmień dane profilu na fikcyjne i usuń bota, jeśli chcesz.\n\n" +
      "<b>7. Zmiany w polityce</b>\n" +
      "Możemy aktualizować tę politykę; zmiany będą ogłaszane przez bota.\n\n" +
      "<b>8. Kontakt</b>\n" +
      "Współpraca/Pytania/Opinie: @znaimoHelper lub pisz na znaimo.bot@gmail.com",
    referral_text:
      "🎁 <b>System Poleceń</b>\n\n" +
      "📨 <b>Osoby zaproszone:</b> <b>{count}</b>\n\n" +
      "🔗 <b>Twój link polecający:</b>\n" +
      "<code>https://t.me/{username}?start={userId}</code>\n\n" +
      "❤️ <b>Dzienny limit polubień:</b> <b>{likesToday}/{maxLikes}</b>\n" +
      "(🧩 <i>50 podstawowych</i> + 💎 <i>{referralBonus} za zaproszone</i>)\n\n" +
      "📌 <i>Dodatkowe polubienia przyznawane są, jeśli zaproszona osoba stworzy profil " +
      "i polubi przynajmniej jeden profil.</i>",
    premium_info:
      "💳 <b>Aby uzyskać Premium na 30 dni</b>:\n\n" +
      "1. Wyślij <b>100 PLN</b> na numer karty:  \n" +
      "<code>4441 1110 5652 0756</code>\n\n" +
      "2. Prześlij zrzut ekranu płatności do 👉 <a href=\"https://t.me/znaimoHelper\">@znaimoHelper</a>\n\n" +
      "Po aktywacji otrzymujesz:\n" +
      "• 💝 Nieograniczone polubienia dziennie\n" +
      "• 📓 Limit czarnej listy zwiększony z 50 do 100\n" +
      "• 📵 Brak reklam\n" +
      "• 🧭 Wsparcie projektu\n" +
      "• 🕐 Ważne przez 30 dni",
    buy_premium: "💳 Kup Premium",
  },
};

module.exports = {
  t: function (key, lang = "uk", vars = {}) {
    let str = translations[lang]?.[key] || translations["uk"]?.[key] || key;
    Object.entries(vars).forEach(([k, v]) => {
      str = str.replace(`{${k}}`, v);
    });
    return str;
  },
};
