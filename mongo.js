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

  // Determine filter and upsert behavior:
  let filter, options;
  if (user._id) {
    // Updating existing document by its _id and version
    filter = { _id: user._id, version: user.version };
    options = { returnDocument: "after" }; // no upsert
  } else {
    // Creating new document or first-time save
    filter = { id: user.id, version: user.version };
    options = { upsert: true, returnDocument: "after" };
  }

  // Exclude _id from update document to prevent conflicts
  const updateDoc = { ...user };
  delete updateDoc._id;

  // Perform findOneAndUpdate
  const result = await db.collection("users").findOneAndUpdate(
    filter,
    { $set: { ...updateDoc, version: user.version + 1 } },
    options
  );

  if (!result.value) {
    // Conflict: version mismatch or no match
    if (tryCount < 3) {
      // Load latest by id
      const latest = await db.collection("users").findOne({ id: user.id });
      if (!latest) {
        // No existing doc, reset version for retry
        user.version = 1;
        delete user._id;
      } else {
        // Merge changes onto latest
        user = { ...latest, ...user, version: latest.version || 1 };
      }
      return saveUser(user, tryCount + 1);
    }
    throw new Error("User update conflict: too many attempts");
  }

  // On success, ensure user._id is set
  user._id = result.value._id;
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
