const crypto = require("crypto");

// simple device id generator
const generateDeviceId = (req) => {
  const ip = req.ip || "";
  const userAgent = req.headers["user-agent"] || "";

  const raw = ip + userAgent;

  return crypto.createHash("sha256").update(raw).digest("hex");
};

module.exports = { generateDeviceId };
