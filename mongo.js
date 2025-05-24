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
  if (!user || !user.id) throw new Error("User id is required");

  // Exclude internal _id field from update
  const updateDoc = { ...user };
  delete updateDoc._id;

  // Atomic upsert by user.id to avoid duplicates
  await db.collection("users").updateOne(
    { id: user.id },
    { $set: updateDoc },
    { upsert: true }
  );
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
