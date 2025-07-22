const mongoose = require("mongoose");

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  throw new Error("Please define the MONGODB_URI environment variable");
}

// Use `global._mongo` to cache across Lambda cold starts
if (!global._mongo) {
  global._mongo = { conn: null, promise: null };
}
async function connectToDatabase() {
  if (global._mongo.conn) {
    return global._mongo.conn;
  }
  if (!global._mongo.promise) {
    global._mongo.promise = mongoose
      .connect(MONGODB_URI, {
        dbName: "goblin",
        bufferCommands: false,
      })
      .then((m) => (global._mongo.conn = m));
  }
  await global._mongo.promise;
  return global._mongo.conn;
}

module.exports = { connectToDatabase };
