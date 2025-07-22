require("dotenv").config();

const express = require("express");
const serverless = require("serverless-http");
const { connectToDatabase } = require("./lib/config/mongodb");
const { BoxTemplate } = require("./lib/models/box.model");
const { UserBox } = require("./lib/models/userBox.model");
const User = require("./lib/models/user.model");
const requireAuth = require("./lib/auth/requireAuth");
const cors = require("cors");

const app = express();
app.use(express.json());

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://dev.d3bfsc16ju6asx.amplifyapp.com",
    ],
    credentials: true,
  })
);

// reuse one mongoose connection across cold starts
let dbPromise = null;
async function ensureDb() {
  if (!dbPromise) dbPromise = connectToDatabase();
  return dbPromise;
}

// 1) List all active box templates
app.get("/boxes", async (req, res) => {
  await ensureDb();
  const boxes = await BoxTemplate.find({ active: true }).lean();

  res.json({ boxes });
});

// 2) Get user’s current box status
app.get("/box/status", requireAuth, async (req, res) => {
  await ensureDb();
  const { xUsername } = req.auth;
  const user = await User.findOne({ xUsername });
  const userBox = await UserBox.findOne({
    userId: user._id,
    opened: false,
  }).lean();
  if (!userBox) return res.json({ hasBox: false });
  const now = new Date();
  const isReady = now >= userBox.readyAt;
  res.json({
    hasBox: true,
    box: {
      id: userBox._id,
      startTime: userBox.startTime,
      readyAt: userBox.readyAt,
      prizeType: userBox.prizeType,
      prizeAmount: userBox.prizeAmount,
      missionCompleted: userBox.missionCompleted,
      isReady,
      opened: userBox.opened,
    },
  });
});

app.get("/box/:id", requireAuth, async (req, res) => {
  await ensureDb();
  const { xUsername } = req.auth;
  const template = await BoxTemplate.findById(req.params.id).lean();
  if (!template) {
    return res.status(404).json({ error: "Box template not found" });
  }

  let hasBox = false;
  let isReady = false;
  let opened = false;
  let missionDone = false;
  let startTime = null;
  let readyAt = null;

  if (xUsername) {
    // look up their User record
    const me = await User.findOne({ xUsername }).lean();
    if (me) {
      // see if they have an active box for this template
      const ub = await UserBox.findOne({
        userId: me._id,
        templateId: template._id,
        opened: false,
      }).lean();
      if (ub) {
        hasBox = true;
        startTime = ub.startTime;
        readyAt = ub.readyAt;
        isReady = Date.now() >= ub.readyAt.getTime();
        opened = ub.opened;
        missionDone = ub.missionCompleted;
      }
    }
  }

  return res.json({
    _id: template._id,
    name: template.name,
    imageUrl: template.imageUrl,
    normalPrize: template.normalPrize,
    boxType: template.boxType,
    missionUrl: template.missionUrl,
    missionDesc: template.missionDesc,
    hasBox,
    isReady,
    opened,
    missionCompleted: missionDone,
    startTime,
    readyAt,
  });
});

app.post("/box/:id/start", requireAuth, async (req, res) => {
  await ensureDb();
  const { xUsername } = req.auth;

  const user = await User.findOne({ xUsername });
  console.log(user);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  if (await UserBox.exists({ userId: user._id, opened: false }))
    return res
      .status(400)
      .json({ error: "You already have an active box mining." });

  const template = await BoxTemplate.findOne({
    _id: req.params.id,
    active: true,
  });
  if (!template) return res.status(400).json({ error: "No box available." });

  // pick prizeç
  const rnd = Math.random(),
    isGold = rnd < template.goldenChance;
  const prizeType = isGold ? "GOLDEN" : "NORMAL";
  const prizeAmount = isGold ? template.goldenPrize : template.normalPrize;

  const now = new Date();
  const readyAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const userBox = new UserBox({
    userId: user._id,
    templateId: template._id,
    startTime: now,
    readyAt,
    prizeType,
    prizeAmount,
    missionCompleted: false,
    opened: false,
  });
  await userBox.save();

  res.json({
    message: "Box mining started",
    box: { id: userBox._id, startTime: now, readyAt, prizeType, prizeAmount },
  });
});

// 4) Complete mission
app.post("/box/:id/mission", requireAuth, async (req, res) => {
  await ensureDb();
  const { xUsername } = req.auth;
  const user = await User.findOne({ xUsername });
  const userBox = await UserBox.findOne({
    userId: user._id,
    templateId: req.params.id,
    opened: false,
  });
  if (!userBox)
    return res
      .status(400)
      .json({ error: "No active box to complete mission for." });
  if (new Date() < userBox.readyAt)
    return res.status(400).json({ error: "Box is not ready yet." });

  userBox.missionCompleted = true;
  await userBox.save();
  res.json({ message: "Mission marked as completed." });
});

// 5) Claim / open box
app.post("/box/:id/claim", requireAuth, async (req, res) => {
  await ensureDb();
  const { xUsername } = req.auth;
  const user = await User.findOne({ xUsername });
  const userBox = await UserBox.findOne({
    userId: user._id,
    templateId: req.params.id,
    opened: false,
  });
  if (!userBox)
    return res.status(400).json({ error: "No active box to open." });
  const now = new Date();
  if (now < userBox.readyAt)
    return res.status(400).json({ error: "Box is not ready yet." });
  if (!userBox.missionCompleted)
    return res.status(400).json({ error: "Mission not completed yet." });

  userBox.opened = true;
  userBox.openedAt = now;
  let finalPrize = userBox.prizeAmount;
  if (userBox.promoValid) finalPrize *= 2;

  // credit user
  const updatedUser = await User.findByIdAndUpdate(
    user._id,
    { $inc: { goblinPoints: finalPrize } },
    { new: true }
  );
  if (!updatedUser) throw new Error("Failed to update user points");

  userBox.prizeAmount = finalPrize;
  await userBox.save();

  res.json({
    message: "Box opened! Prize credited.",
    prizeAmount: finalPrize,
    prizeType: userBox.prizeType,
    newBalance: updatedUser.goblinPoints,
    promoApplied: userBox.promoValid,
  });
});

app.get(
  "/users",
  wrap(async (req, res) => {
    await ensureDb();

    // pull query-params (with defaults)
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 20, 1),
      100
    );
    const search = (req.query.search || "").trim();

    // build filter
    const filter = search
      ? { xUsername: { $regex: search, $options: "i" } }
      : {};

    // total count for pagination UI
    const total = await User.countDocuments(filter);

    // fetch the page
    const users = await User.find(filter)
      .sort({ goblinPoints: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select("xUsername goblinPoints profileImage referralCode") // only what we need
      .lean();

    // attach rank relative to this page
    const rankedUsers = users.map((u, i) => ({
      ...u,
      rank: (page - 1) * limit + i + 1,
    }));

    res.json({
      rankedUsers,
      page,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  })
);

app.get(
  "/users/:username",
  requireAuth,
  wrap(async (req, res) => {
    await ensureDb();
    const username = req.params.username;
    if (!username) {
      return res.status(400).json({ error: "Username is required" });
    }

    // fetch only the fields we expose
    const user = await User.findOne({ xUsername: username })
      .select("xUsername goblinPoints profileImage referralCode")
      .lean();
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // compute rank = number of people with strictly more points + 1
    const higherCount = await User.countDocuments({
      goblinPoints: { $gt: user.goblinPoints },
    });

    return res.json({
      user: {
        xUsername: user.xUsername,
        goblinPoints: user.goblinPoints,
        profileImage: user.profileImage,
        referralCode: user.referralCode,
      },
      rank: higherCount + 1,
    });
  })
);

function wrap(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

app.use((err, req, res, next) => {
  console.error("Unhandled error in route:", err);
  res.status(500).json({ error: "Internal server error." });
});

if (require.main === module) {
  // only run this when called directly, not when serverless-http wraps it
  const port = process.env.PORT || 3001;
  app.listen(port, () => console.log(`Listening on http://localhost:${port}`));
}
module.exports.handler = serverless(app);
