const { parse } = require("cookie");

if (typeof globalThis.crypto === "undefined") {
  const { webcrypto } = require("crypto");
  globalThis.crypto = webcrypto;
}

async function requireAuth(req, res, next) {
  console.log("=== DEBUG INFO ===");
  console.log("Authorization header:", req.headers.authorization);
  console.log("==================");
  const token =
    req.headers.authorization && req.headers.authorization.startsWith("Bearer ")
      ? req.headers.authorization.substring(7)
      : null;

  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const { jwtVerify } = await import("jose");

  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(process.env.NEXTAUTH_SECRET)
    );

    req.auth = { xUsername: payload.xUsername || payload.sub, ...payload };
    return next();
  } catch (err) {
    console.error("JWT verification failed:", err);
    return res.status(401).json({ error: "Unauthorized" });
  }
}

module.exports = requireAuth;
