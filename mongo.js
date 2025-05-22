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

async function saveUser(user) {
  const db = await getDb();
  if (!user) return;
  await db
    .collection("users")
    .updateOne({ id: user.id }, { $set: user }, { upsert: true });
}

async function removeUser(id) {
  const db = await getDb();
  await db.collection("users").deleteOne({ id });
}

async function getAllUsers() {
  const db = await getDb();
  return db.collection("users").find().toArray();
}

module.exports = { loadUser, saveUser, removeUser, getAllUsers };
