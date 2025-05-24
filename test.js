// seed.js
const { getDb } = require("./mongo");
const { faker } = require("@faker-js/faker");

(async () => {
  const db = await getDb();
  const coll = db.collection("users");
  const count = await coll.countDocuments();
  if (count === 0) {
    const mocks = [];
    for (let i = 0; i < 100; i++) {
      const genderType = faker.helpers.arrayElement(["male", "female"]);
      const label = genderType === "male" ? "Хлопець" : "Дівчина";
      mocks.push({
        id: 200000000 + i,
        username: faker.internet.userName(),
        step: null,
        editStep: null,
        finished: true,
        currentView: null,
        pendingLikes: [],
        seen: [],
        data: {
          name: faker.name.firstName(genderType),
          gender: label,
          age: faker.datatype.number({ min: 18, max: 60 }),
          city: faker.address.city(),
          about: faker.lorem.sentences(2),
          photos: [`https://i.pravatar.cc/300?img=${i + 1}`],
          searchGender: "",
          latitude: null,
          longitude: null,
        },
      });
    }
    await coll.insertMany(mocks);
    console.log("✅ 100 мок-анкет успішно додано в базу");
  } else {
    console.log("База вже не порожня, нічого не додано");
  }
  process.exit();
})();

// delete_mocks.js
// const { getDb } = require('./mongo');

// (async () => {
//   const db = getDb();
//   const coll = db.collection('users');
//   // Якщо використав діапазон id:
//   const result = await coll.deleteMany({ id: { $gte: 200000000 } });
//   console.log(`Видалено ${result.deletedCount} мок-анкет`);
//   process.exit();
// })();

// node delete_mocks.js
