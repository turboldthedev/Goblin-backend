const mongoose = require("mongoose");
const { Schema, model, models } = mongoose;

const BoxTemplateSchema = new Schema(
  {
    name: { type: String, required: true },
    normalPrize: { type: Number, required: true, default: 0 },
    goldenPrize: { type: Number, required: true, default: 0 },
    goldenChance: { type: Number, required: true, default: 0.01 },
    active: { type: Boolean, required: true, default: true },
    imageUrl: { type: String, required: true },
    missionUrl: { type: String, required: true },
    missionDesc: { type: String, required: true },
    boxType: {
      type: String,
      enum: ["normal", "partner"],
      required: true,
      default: "normal",
    },

    promoCode: { type: String },
  },
  { timestamps: true }
);

const BoxTemplate =
  models.Box || // ✅ guard against existing "Box"
  model("Box", BoxTemplateSchema);

module.exports = { BoxTemplate };
