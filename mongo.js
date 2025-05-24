const { MongoClient } = require("mongodb");

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

async function getDb() {
  if (!client.topology || !client.topology.isConnected())
    await client.connect();
  return client.db("znaimo");
}

async function loadUser(id) {
  const db = await getDb();
  return db.collection("users").findOne({ id });
}

async function saveUser(user, tryCount = 0) {
  const db = await getDb();
  if (!user || !user.id) throw new Error("User id is required");

  // Initialize version for new users
  if (typeof user.version !== "number") {
    user.version = 1;
  }

  // Prevent _id conflicts on upsert by excluding it from the update
  const updateDoc = { ...user };
  delete updateDoc._id;
  // Attempt to update the document only if version matches
  const result = await db.collection("users").findOneAndUpdate(
    { id: user.id, version: user.version },
    { $set: { ...updateDoc, version: user.version + 1 } },
    { upsert: true, returnDocument: "after" }
  );

  if (!result.value) {
    // If version mismatch, retry up to 3 times
    if (tryCount < 3) {
      const latest = await db.collection("users").findOne({ id: user.id });
      user = { ...latest, ...user, version: latest.version || 1 };
      return saveUser(user, tryCount + 1);
    }
    throw new Error("User update conflict: too many attempts");
  }

  return result.value;
}

async function removeUser(id) {
  const db = await getDb();
  await db.collection("users").deleteOne({ id });
}

async function getAllUsers() {
  const db = await getDb();
  return db.collection("users").find().toArray();
}

module.exports = { getDb, loadUser, saveUser, removeUser, getAllUsers };
