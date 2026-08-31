const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { normalizeModuleConfig } = require("../utils/moduleConfig");

const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "No token provided",
      });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select(
      "_id role accountRole businessOwnerId staffStatus permissions isDeleted enabledModules defaultModule",
    );

    // Deleted یا موجود نہ ہونے والا User
    if (!user || user.isDeleted === true) {
      return res.status(401).json({
        message: "User not found",
      });
    }

    // پرانے Users جن میں accountRole موجود نہیں، Owner سمجھے جائیں گے
    const accountRole = user.accountRole || "owner";

    // Blocked Staff Access
    if (accountRole === "staff" && user.staffStatus === "blocked") {
      return res.status(403).json({
        message: "Your account has been blocked",
      });
    }

    // Business Owner ID
    const businessOwnerId =
      accountRole === "owner" ? user._id : user.businessOwnerId;

    if (!businessOwnerId) {
      return res.status(403).json({
        message: "Business owner not found",
      });
    }

    // Staff کے Business Owner کو بھی Verify کریں
    let businessOwner = null;

    if (accountRole === "staff") {
      businessOwner = await User.findOne({
        _id: businessOwnerId,
        isDeleted: { $ne: true },
      }).select("_id accountRole enabledModules defaultModule");

      if (!businessOwner) {
        return res.status(403).json({
          message: "Business owner account is unavailable",
        });
      }
    }

    const moduleConfig = normalizeModuleConfig(
      accountRole === "staff" ? businessOwner : user,
    );

    // اصل Logged-in User
    req.actorId = user._id;

    req.user = {
      id: businessOwnerId,
      role: user.role,
      accountRole,
      permissions: user.permissions || [],
      businessOwnerId,
      actorId: user._id,
      enabledModules: moduleConfig.enabledModules,
      defaultModule: moduleConfig.defaultModule,
    };

    // پرانے Controllers کے لیے Business Owner ID
    req.userId = businessOwnerId;

    return next();
  } catch (error) {
    console.error("Auth error:", error.message);

    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
};

module.exports = protect;
module.exports.protect = protect;
