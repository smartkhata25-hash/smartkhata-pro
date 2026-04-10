const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const UserDevice = require("../models/UserDevice");
const { generateDeviceId } = require("../utils/deviceHelper");
const Installation = require("../models/Installation");
const LocalSession = require("../models/LocalSession");
const { recalculateAllUserAccounts } = require("../utils/accountHelper");
const mongoose = require("mongoose");
const createBaseAccountsForUser = require("../utils/createBaseAccounts");
const createDefaultExpenseTitlesForUser = require("../utils/createDefaultExpenseTitles");
const InviteCode = require("../models/InviteCode");

const PasswordReset = require("../models/PasswordReset");
const sendEmail = require("../utils/sendEmail");

/* ================= REGISTER ================= */

const registerUser = async (req, res) => {
  const { name, email, password, role, code } = req.body;

  try {
    const invite = await InviteCode.findOne({
      email,
      code,
      isUsed: false,
    });

    if (!invite) {
      return res.status(400).json({ msg: "Invalid or expired code" });
    }

    invite.isUsed = true;
    await invite.save();

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ msg: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ name, email, password: hashedPassword, role });
    await newUser.save();

    const userObjectId = new mongoose.Types.ObjectId(newUser._id);
    await createBaseAccountsForUser(userObjectId);
    await createDefaultExpenseTitlesForUser(userObjectId);

    res.status(201).json({ msg: "User registered successfully" });
  } catch (err) {
    res.status(500).json({ msg: "Error in registration" });
  }
};

/* ================= LOGIN ================= */

const loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    const deviceId = generateDeviceId(req);

    // ================= ONLINE LOGIN =================
    const user = await User.findOne({ email });

    if (user) {
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ msg: "Invalid password" });
      }

      recalculateAllUserAccounts(user._id).catch((err) => {
        console.error("Recalculate Error:", err);
      });

      // 🔒 Installation Check (Device Lock with User)

      let installation = await Installation.findOne({ deviceId });

      if (!installation) {
        // 👉 First time device → bind with user
        installation = await Installation.create({
          userId: user._id,
          deviceId,
        });
      } else {
        // ❌ اگر device کسی اور user کے ساتھ bind ہے
        if (installation.userId.toString() !== user._id.toString()) {
          return res.status(403).json({
            msg: "This device is already registered with another user",
          });
        }

        // ❌ اگر device inactive ہے
        if (!installation.isActive) {
          return res
            .status(403)
            .json({ msg: "Your account has been blocked by admin" });
        }
      }

      // 📱 Device Tracking
      let existingDevice = await UserDevice.findOne({
        userId: user._id,
        deviceId,
      });

      if (!existingDevice) {
        await UserDevice.create({
          userId: user._id,
          deviceId,
          deviceName: req.headers["user-agent"] || "Unknown Device",
        });
      } else {
        existingDevice.lastLogin = new Date();
        await existingDevice.save();
      }

      // 💾 Save Local Session (with installation binding)
      await LocalSession.findOneAndUpdate(
        { email, deviceId },
        {
          userId: user._id,
          email,
          password: user.password,
          deviceId,
          installationId: installation._id,
          lastLogin: new Date(),
        },
        { upsert: true },
      );

      const token = jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "1d" },
      );

      return res.json({
        token,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          fullName: user.fullName,
          cnic: user.cnic,
          mobile: user.mobile,
          address: user.address,
          businessName: user.businessName,
          businessType: user.businessType,
          currency: user.currency,
          taxNumber: user.taxNumber,
        },
        mode: "online",
      });
    }

    // ================= OFFLINE LOGIN =================
    const localUser = await LocalSession.findOne({ email, deviceId });

    if (!localUser) {
      return res.status(400).json({
        msg: "Offline login not available. Please connect to internet first.",
      });
    }

    // 🔒 installation check (device lock)
    const installationCheck = await Installation.findOne({
      _id: localUser.installationId,
      deviceId,
    });

    if (!installationCheck) {
      return res.status(403).json({
        msg: "Invalid device. Please login again online.",
      });
    }

    const isMatch = await bcrypt.compare(password, localUser.password);

    if (!isMatch) {
      return res.status(401).json({ msg: "Invalid password" });
    }

    const token = jwt.sign(
      { id: localUser.userId, role: "user" },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    );

    return res.json({
      token,
      user: {
        _id: localUser.userId,
        email: localUser.email,
      },
      mode: "offline",
    });
  } catch (err) {
    res.status(500).json({ msg: "Login error" });
  }
};

/* ================= FORGOT PASSWORD ================= */

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ msg: "Email not found" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await PasswordReset.deleteMany({ email });

    await PasswordReset.create({ email, otp });

    await sendEmail(email, otp);

    res.json({ msg: "OTP sent to email" });
  } catch (err) {
    res.status(500).json({ msg: "Server error" });
  }
};

/* ================= VERIFY OTP ================= */

const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const record = await PasswordReset.findOne({ email, otp });
    if (!record) {
      return res.status(400).json({ msg: "Invalid or expired OTP" });
    }

    res.json({ msg: "OTP verified" });
  } catch (err) {
    res.status(500).json({ msg: "Server error" });
  }
};

/* ================= RESET PASSWORD ================= */

const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    const record = await PasswordReset.findOne({ email, otp });
    if (!record) {
      return res.status(400).json({ msg: "Invalid or expired OTP" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await User.updateOne({ email }, { password: hashedPassword });

    await PasswordReset.deleteMany({ email });

    res.json({ msg: "Password reset successful" });
  } catch (err) {
    res.status(500).json({ msg: "Server error" });
  }
};
/* ================= STARTUP CHECK ================= */

const checkDeviceAuth = async (req, res) => {
  try {
    const deviceId = generateDeviceId(req);

    const installation = await Installation.findOne({ deviceId });

    if (!installation || !installation.isActive) {
      return res.status(403).json({
        msg: "Unauthorized device. Please login again.",
      });
    }

    res.json({ msg: "Device authorized" });
  } catch (err) {
    res.status(500).json({ msg: "Startup check error" });
  }
};
/* ================= ADMIN: DEACTIVATE DEVICE ================= */

const deactivateDevice = async (req, res) => {
  try {
    // 🔒 صرف admin allowed
    if (req.user.role !== "admin") {
      return res.status(403).json({ msg: "Access denied" });
    }

    const { userId } = req.body;

    const installation = await Installation.findOne({ userId });

    if (!installation) {
      // 🔥 اگر device نہیں ہے تو admin خود create کرے گا
      const newInstallation = await Installation.create({
        userId,
        deviceId: "admin-created-device",
        isActive: false,
      });

      return res.json({ msg: "User blocked (device created by admin)" });
    }

    installation.isActive = false;
    await installation.save();

    res.json({ msg: "Device deactivated successfully" });
  } catch (err) {
    res.status(500).json({ msg: "Server error" });
  }
};
/* ================= ADMIN: GET ALL USERS ================= */

const getAllUsers = async (req, res) => {
  try {
    // 🔒 Admin check
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ msg: "Access denied" });
    }

    // 🔗 Users + Installation join
    const users = await User.aggregate([
      {
        $lookup: {
          from: "installations",
          localField: "_id",
          foreignField: "userId",
          as: "installation",
        },
      },
      {
        $unwind: {
          path: "$installation",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          email: 1,
          isActive: "$installation.isActive",
        },
      },
    ]);

    res.json(users);
  } catch (err) {
    console.error("GET USERS ERROR:", err);
    res.status(500).json({ msg: "Server error" });
  }
};
/* ================= ADMIN: ACTIVATE DEVICE ================= */

const activateDevice = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ msg: "Access denied" });
    }

    const { userId } = req.body;

    const installation = await Installation.findOne({ userId });

    if (!installation) {
      return res.status(404).json({ msg: "Device not found" });
    }

    installation.isActive = true;
    await installation.save();

    res.json({ msg: "Device activated successfully" });
  } catch (err) {
    res.status(500).json({ msg: "Server error" });
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
