const mongoose = require("mongoose");
const { Schema, model, models } = mongoose;

const UserBoxSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
    templateId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Box",
    },
    opened: { type: Boolean, required: true, default: false },
    missionCompleted: { type: Boolean, required: true, default: false },
    startTime: { type: Date, required: true },
    readyAt: { type: Date, required: true },
    prizeType: { type: String, enum: ["NORMAL", "GOLDEN"], required: true },
    openedAt: { type: Date },
    prizeAmount: { type: Number, required: true, default: 0 },

    promoValid: { type: Boolean, required: true, default: false },
    promoCodeUsed: { type: String },
  },
  { timestamps: true }
);

const UserBox = models.UserBox || model("UserBox", UserBoxSchema);

module.exports = { UserBox };
