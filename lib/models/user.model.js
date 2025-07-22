const mongoose = require("mongoose");
const { Schema, model, models } = mongoose;

const UserSchema = new Schema({
  xUsername: { type: String, required: true, unique: true, sparse: true },
  followersCount: { type: Number, default: 0 },
  goblinPoints: { type: Number, default: 0 },
  profileImage: { type: String },
  referralCode: { type: String, unique: true, sparse: true },
  referralPoints: { type: Number, default: 0 },
});

// sort descending by points
UserSchema.index({ goblinPoints: -1 });
// enable text search on username
UserSchema.index({ xUsername: "text" });

module.exports = models.User || model("User", UserSchema);
