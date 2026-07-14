const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const UserDevice = require("../models/UserDevice");
const Installation = require("../models/Installation");
const LocalSession = require("../models/LocalSession");
const InviteCode = require("../models/InviteCode");
const PasswordReset = require("../models/PasswordReset");

const { generateDeviceId } = require("../utils/deviceHelper");
const { recalculateAllUserAccounts } = require("../utils/accountHelper");
const { logActivity } = require("../utils/activityLogger");

const createBaseAccountsForUser = require("../utils/createBaseAccounts");
const createDefaultExpenseTitlesForUser = require("../utils/createDefaultExpenseTitles");
const fixLegacyExpenseTitles = require("../utils/fixLegacyExpenseTitles");
const sendEmail = require("../utils/sendEmail");

const normalizeEmail = (email = "") => String(email).trim().toLowerCase();

const escapeRegex = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* Register Owner */

const registerUser = async (req, res) => {
  try {
    const { name, password, code } = req.body;

    const cleanName = String(name || "").trim();
    const cleanEmail = normalizeEmail(req.body.email);
    const cleanCode = String(code || "").trim();

    if (!cleanName || !cleanEmail || !password || !cleanCode) {
      return res.status(400).json({
        msg: "Name, email, password and invite code are required",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({
        msg: "Invalid email format",
      });
    }

    if (String(password).length < 6) {
      return res.status(400).json({
        msg: "Password must be at least 6 characters",
      });
    }

    const existingUser = await User.findOne({
      email: cleanEmail,
      isDeleted: false,
    }).select("_id");

    if (existingUser) {
      return res.status(409).json({
        msg: "User already exists",
      });
    }

    const invite = await InviteCode.findOne({
      email: {
        $regex: `^${escapeRegex(cleanEmail)}$`,
        $options: "i",
      },
      code: cleanCode,
      isUsed: false,
    });

    if (!invite) {
      return res.status(400).json({
        msg: "Invalid or expired code",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const newUser = await User.create({
      name: cleanName,
      email: cleanEmail,
      password: hashedPassword,

      // Existing System Admin role untouched
      role: "staff",

      // New registered software user becomes Business Owner
      accountRole: "owner",
      businessOwnerId: null,
      createdByOwner: null,
      permissions: [],
      staffStatus: "active",
      mustChangePassword: false,
    });

    try {
      const userObjectId = new mongoose.Types.ObjectId(newUser._id);

      await createBaseAccountsForUser(userObjectId);
      await createDefaultExpenseTitlesForUser(userObjectId);

      invite.isUsed = true;
      await invite.save();
    } catch (setupError) {
      await User.findByIdAndDelete(newUser._id);

      console.error("User Setup Error:", setupError);

      return res.status(500).json({
        msg: "Account setup failed",
      });
    }

    return res.status(201).json({
      msg: "User registered successfully",
    });
  } catch (err) {
    console.error("Register Error:", err);

    if (err.code === 11000) {
      return res.status(409).json({
        msg: "User already exists",
      });
    }

    return res.status(500).json({
      msg: "Error in registration",
    });
  }
};

/* Login Owner or Staff */

const loginUser = async (req, res) => {
  try {
    const cleanEmail = normalizeEmail(req.body.email);
    const password = req.body.password;

    if (!cleanEmail || !password) {
      return res.status(400).json({
        msg: "Email and password are required",
      });
    }

    const deviceId = generateDeviceId(req);

    const user = await User.findOne({
      email: cleanEmail,
      isDeleted: false,
    });

    if (user) {
      const isMatch = await bcrypt.compare(password, user.password);

      if (!isMatch) {
        return res.status(401).json({
          msg: "Invalid password",
        });
      }

      // Legacy users without accountRole are treated as Owner
      const accountRole = user.accountRole || "owner";

      if (accountRole === "staff" && user.staffStatus === "blocked") {
        return res.status(403).json({
          msg: "Your staff account has been blocked by owner",
        });
      }

      if (accountRole === "staff" && !user.businessOwnerId) {
        return res.status(403).json({
          msg: "Staff account is not linked with a business owner",
        });
      }

      const businessOwnerId =
        accountRole === "staff" ? user.businessOwnerId : user._id;

      const businessOwner =
        accountRole === "staff" ? await User.findById(businessOwnerId) : user;

      if (!businessOwner) {
        return res.status(403).json({
          msg: "Business owner account not found",
        });
      }

      // Owner account calculations
      setTimeout(async () => {
        try {
          await recalculateAllUserAccounts(businessOwnerId);
          await fixLegacyExpenseTitles(businessOwnerId);
        } catch (backgroundError) {
          console.error(
            "Login Background Task Error:",
            backgroundError.message,
          );
        }
      }, 0);

      // Every user can have separate devices
      let installation = await Installation.findOne({
        userId: user._id,
        deviceId,
      });

      if (!installation) {
        installation = await Installation.create({
          userId: user._id,
          deviceId,
          isActive: true,
        });
      }

      if (!installation.isActive) {
        return res.status(403).json({
          msg: "Your account has been blocked by admin",
        });
      }

      await UserDevice.findOneAndUpdate(
        {
          userId: user._id,
          deviceId,
        },
        {
          userId: user._id,
          deviceId,
          deviceName: req.headers["user-agent"] || "Unknown Device",
          lastLogin: new Date(),
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        },
      );

      await LocalSession.findOneAndUpdate(
        {
          email: cleanEmail,
          deviceId,
        },
        {
          userId: user._id,
          email: cleanEmail,
          password: user.password,
          deviceId,
          installationId: installation._id,
          lastLogin: new Date(),
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        },
      );

      const token = jwt.sign(
        {
          id: user._id,
          role: user.role,
        },
        process.env.JWT_SECRET,
        {
          expiresIn: "30d",
        },
      );

      // Login activity context
      req.actorId = user._id;
      req.userId = businessOwnerId;
      req.user = {
        id: businessOwnerId,
        actorId: user._id,
        businessOwnerId,
        role: user.role,
        accountRole,
        permissions: user.permissions || [],
      };

      await logActivity({
        req,
        action: "login",
        module: "auth",
        entityType: "User",
        entityId: user._id,
        title: user.fullName || user.name,
        description: `${user.email} logged in`,
        metadata: {
          mode: "online",
          accountRole,
        },
      });

      return res.json({
        token,

        user: {
          // Actual logged-in Owner or Staff ID
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,

          accountRole,
          businessOwnerId,
          permissions: user.permissions || [],
          staffStatus: user.staffStatus || "active",
          mustChangePassword: Boolean(user.mustChangePassword),

          // Business profile comes from Owner
          fullName:
            accountRole === "staff"
              ? businessOwner.fullName || businessOwner.name
              : user.fullName,

          cnic: businessOwner.cnic || "",
          mobile:
            accountRole === "staff"
              ? user.mobile || businessOwner.mobile || ""
              : user.mobile || "",

          address: businessOwner.address || "",
          businessName: businessOwner.businessName || "",
          businessType: businessOwner.businessType || "",
          currency: businessOwner.currency || "",
          taxNumber: businessOwner.taxNumber || "",
        },

        mode: "online",
      });
    }

    /* Offline Login */

    const localUser = await LocalSession.findOne({
      email: cleanEmail,
      deviceId,
    });

    if (!localUser) {
      return res.status(400).json({
        msg: "Offline login not available. Please connect to internet first.",
      });
    }

    const installationCheck = await Installation.findOne({
      _id: localUser.installationId,
      userId: localUser.userId,
      deviceId,
      isActive: true,
    });

    if (!installationCheck) {
      return res.status(403).json({
        msg: "Invalid or blocked device. Please login again online.",
      });
    }

    const isMatch = await bcrypt.compare(password, localUser.password);

    if (!isMatch) {
      return res.status(401).json({
        msg: "Invalid password",
      });
    }

    const offlineUser = await User.findById(localUser.userId);

    if (!offlineUser) {
      return res.status(404).json({
        msg: "User account not found",
      });
    }

    const accountRole = offlineUser.accountRole || "owner";

    if (accountRole === "staff" && offlineUser.staffStatus === "blocked") {
      return res.status(403).json({
        msg: "Your staff account has been blocked by owner",
      });
    }

    const businessOwnerId =
      accountRole === "staff" ? offlineUser.businessOwnerId : offlineUser._id;

    if (!businessOwnerId) {
      return res.status(403).json({
        msg: "Business owner account not found",
      });
    }

    const businessOwner =
      accountRole === "staff"
        ? await User.findById(businessOwnerId)
        : offlineUser;

    if (!businessOwner) {
      return res.status(403).json({
        msg: "Business owner account not found",
      });
    }

    const token = jwt.sign(
      {
        id: offlineUser._id,
        role: offlineUser.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "30d",
      },
    );

    return res.json({
      token,

      user: {
        _id: offlineUser._id,
        name: offlineUser.name,
        email: offlineUser.email,
        role: offlineUser.role,

        accountRole,
        businessOwnerId,
        permissions: offlineUser.permissions || [],
        staffStatus: offlineUser.staffStatus || "active",
        mustChangePassword: Boolean(offlineUser.mustChangePassword),

        fullName:
          accountRole === "staff"
            ? businessOwner.fullName || businessOwner.name
            : offlineUser.fullName,

        cnic: businessOwner.cnic || "",
        mobile:
          accountRole === "staff"
            ? offlineUser.mobile || businessOwner.mobile || ""
            : offlineUser.mobile || "",

        address: businessOwner.address || "",
        businessName: businessOwner.businessName || "",
        businessType: businessOwner.businessType || "",
        currency: businessOwner.currency || "",
        taxNumber: businessOwner.taxNumber || "",
      },

      mode: "offline",
    });
  } catch (err) {
    console.error("Login Error:", err);

    return res.status(500).json({
      msg: "Login error",
    });
  }
};

/* Forgot Password */

const forgotPassword = async (req, res) => {
  try {
    const cleanEmail = normalizeEmail(req.body.email);

    if (!cleanEmail) {
      return res.status(400).json({
        msg: "Email is required",
      });
    }

    const user = await User.findOne({
      email: cleanEmail,
    });

    if (!user) {
      return res.status(404).json({
        msg: "Email not found",
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await PasswordReset.deleteMany({
      email: cleanEmail,
    });

    await PasswordReset.create({
      email: cleanEmail,
      otp,
    });

    await sendEmail(cleanEmail, otp);

    return res.json({
      msg: "OTP sent to email",
    });
  } catch (err) {
    console.error("Forgot Password Error:", err);

    return res.status(500).json({
      msg: "Server error",
    });
  }
};

/* Verify OTP */

const verifyOtp = async (req, res) => {
  try {
    const cleanEmail = normalizeEmail(req.body.email);
    const otp = String(req.body.otp || "").trim();

    if (!cleanEmail || !otp) {
      return res.status(400).json({
        msg: "Email and OTP are required",
      });
    }

    const record = await PasswordReset.findOne({
      email: cleanEmail,
      otp,
    });

    if (!record) {
      return res.status(400).json({
        msg: "Invalid or expired OTP",
      });
    }

    return res.json({
      msg: "OTP verified",
    });
  } catch (err) {
    console.error("Verify OTP Error:", err);

    return res.status(500).json({
      msg: "Server error",
    });
  }
};

/* Reset Password */

const resetPassword = async (req, res) => {
  try {
    const cleanEmail = normalizeEmail(req.body.email);
    const otp = String(req.body.otp || "").trim();
    const newPassword = req.body.newPassword;

    if (!cleanEmail || !otp || !newPassword) {
      return res.status(400).json({
        msg: "Email, OTP and new password are required",
      });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({
        msg: "Password must be at least 6 characters",
      });
    }

    const record = await PasswordReset.findOne({
      email: cleanEmail,
      otp,
    });

    if (!record) {
      return res.status(400).json({
        msg: "Invalid or expired OTP",
      });
    }

    const user = await User.findOne({
      email: cleanEmail,
    });

    if (!user) {
      return res.status(404).json({
        msg: "User not found",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    user.password = hashedPassword;
    user.mustChangePassword = false;

    await user.save();

    // Offline login password بھی Update ہوگا
    await LocalSession.updateMany(
      {
        userId: user._id,
      },
      {
        $set: {
          password: hashedPassword,
        },
      },
    );

    await PasswordReset.deleteMany({
      email: cleanEmail,
    });

    return res.json({
      msg: "Password reset successful",
    });
  } catch (err) {
    console.error("Reset Password Error:", err);

    return res.status(500).json({
      msg: "Server error",
    });
  }
};

/* Device Startup Check */

const checkDeviceAuth = async (req, res) => {
  try {
    const deviceId = generateDeviceId(req);

    const installation = await Installation.findOne({
      deviceId,
      isActive: true,
    });

    if (!installation) {
      return res.status(403).json({
        msg: "Unauthorized device. Please login again.",
      });
    }

    return res.json({
      msg: "Device authorized",
    });
  } catch (err) {
    console.error("Startup Check Error:", err);

    return res.status(500).json({
      msg: "Startup check error",
    });
  }
};

/* System Admin: Deactivate User Devices */

const deactivateDevice = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        msg: "Access denied",
      });
    }

    const { userId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        msg: "Invalid user ID",
      });
    }

    const targetUser = await User.findOne({
      _id: userId,
      $or: [{ accountRole: "owner" }, { accountRole: { $exists: false } }],
    }).select("_id");

    if (!targetUser) {
      return res.status(404).json({
        msg: "Software user not found",
      });
    }

    const result = await Installation.updateMany(
      {
        userId: targetUser._id,
      },
      {
        $set: {
          isActive: false,
        },
      },
    );

    if (result.matchedCount === 0) {
      await Installation.create({
        userId: targetUser._id,
        deviceId: `admin-blocked-${targetUser._id}`,
        isActive: false,
      });
    }

    return res.json({
      msg: "User devices deactivated successfully",
    });
  } catch (err) {
    console.error("Deactivate Device Error:", err);

    return res.status(500).json({
      msg: "Server error",
    });
  }
};

/* System Admin: Get Software Users */

const getAllUsers = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({
        msg: "Access denied",
      });
    }

    const users = await User.aggregate([
      {
        // Business Staff کو Super Admin list میں نہیں دکھانا
        $match: {
          isDeleted: false,
          $or: [{ accountRole: "owner" }, { accountRole: { $exists: false } }],
        },
      },
      {
        $lookup: {
          from: "installations",
          localField: "_id",
          foreignField: "userId",
          as: "installations",
        },
      },
      {
        $addFields: {
          isActive: {
            $cond: [
              { $eq: [{ $size: "$installations" }, 0] },
              true,
              {
                $anyElementTrue: {
                  $map: {
                    input: "$installations",
                    as: "installation",
                    in: {
                      $eq: ["$$installation.isActive", true],
                    },
                  },
                },
              },
            ],
          },

          deviceCount: {
            $size: "$installations",
          },

          lastLogin: {
            $max: "$installations.updatedAt",
          },
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          email: 1,
          role: 1,
          accountRole: 1,
          businessName: 1,
          mobile: 1,
          isActive: 1,
          deviceCount: 1,
          lastLogin: 1,
        },
      },
      {
        $sort: {
          createdAt: -1,
        },
      },
    ]);

    return res.json(users);
  } catch (err) {
    console.error("Get Users Error:", err);

    return res.status(500).json({
      msg: "Server error",
    });
  }
};

/* System Admin: Activate User Devices */

const activateDevice = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        msg: "Access denied",
      });
    }

    const { userId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        msg: "Invalid user ID",
      });
    }

    const targetUser = await User.findOne({
      _id: userId,
      $or: [{ accountRole: "owner" }, { accountRole: { $exists: false } }],
    }).select("_id");

    if (!targetUser) {
      return res.status(404).json({
        msg: "Software user not found",
      });
    }

    const result = await Installation.updateMany(
      {
        userId: targetUser._id,
      },
      {
        $set: {
          isActive: true,
        },
      },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        msg: "Device not found",
      });
    }

    return res.json({
      msg: "User devices activated successfully",
    });
  } catch (err) {
    console.error("Activate Device Error:", err);

    return res.status(500).json({
      msg: "Server error",
    });
  }
};

module.exports = {
  registerUser,
  loginUser,
  forgotPassword,
  verifyOtp,
  resetPassword,
  checkDeviceAuth,
  deactivateDevice,
  activateDevice,
  getAllUsers,
};
