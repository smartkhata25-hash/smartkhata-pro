const crypto = require("crypto");

const InviteCode = require("../models/InviteCode");
const sendInviteEmail = require("../utils/sendInviteEmail");

// 🔑 Generate Invite Code
const generateCode = async (req, res) => {
  try {
    // 🔒 Only Admin Allowed
    if (req.user.role !== "admin") {
      return res.status(403).json({
        msg: "Access denied",
      });
    }

    const cleanEmail = String(req.body.email || "")
      .trim()
      .toLowerCase();

    // ✅ Email required check
    if (!cleanEmail) {
      return res.status(400).json({
        msg: "Email is required",
      });
    }

    // ✅ Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({
        msg: "Invalid email format",
      });
    }

    // 🔢 Secure random 6 digit code
    const code = crypto.randomInt(100000, 1000000).toString();

    // 🧹 Remove previous unused invite codes
    await InviteCode.deleteMany({
      email: cleanEmail,
      isUsed: false,
    });

    // 💾 Save new invite code
    const invite = await InviteCode.create({
      email: cleanEmail,
      code,
      isUsed: false,
    });

    try {
      // 📧 Send invite code to user's email
      await sendInviteEmail(cleanEmail, code);
    } catch (emailError) {
      // Email fail ہونے پر unused invite بھی remove کر دیں
      await InviteCode.deleteOne({
        _id: invite._id,
      });

      console.error("Invite Email Error:", emailError.message);

      return res.status(500).json({
        msg: "Unable to send invite email. Please try again.",
      });
    }

    return res.json({
      success: true,
      msg: "Invite code sent successfully",
      email: invite.email,
      code: invite.code,
    });
  } catch (error) {
    console.error("Generate Code Error:", error);

    return res.status(500).json({
      msg: "Server error",
    });
  }
};

module.exports = {
  generateCode,
};
