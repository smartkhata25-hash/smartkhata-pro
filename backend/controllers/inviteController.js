const InviteCode = require("../models/InviteCode");
const sendEmail = require("../utils/sendEmail");

// 🔑 Generate Invite Code
const generateCode = async (req, res) => {
  try {
    // 🔒 Only Admin Allowed
    if (req.user.role !== "admin") {
      return res.status(403).json({ msg: "Access denied" });
    }
    const { email } = req.body;

    // ✅ Email required check
    if (!email) {
      return res.status(400).json({ msg: "Email is required" });
    }

    // ✅ Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return res.status(400).json({ msg: "Invalid email format" });
    }

    // 🔢 random 6 digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // 🧹 اگر پہلے سے کوئی unused code ہے تو delete کر دیں
    await InviteCode.deleteMany({ email, isUsed: false });

    // 💾 نیا code save کریں
    const invite = await InviteCode.create({
      email,
      code,
    });

    await sendEmail(email, code);

    res.json({
      msg: "Code generated and sent to email",
      email: invite.email,
      code: invite.code,
    });
  } catch (error) {
    console.error("Generate Code Error:", error);
    res.status(500).json({ msg: "Server error" });
  }
};

module.exports = { generateCode };
