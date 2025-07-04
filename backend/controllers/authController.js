const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { recalculateAllUserAccounts } = require("../utils/accountHelper"); // ✅ نیا import

const registerUser = async (req, res) => {
  const { name, email, password, role } = req.body;

  try {
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ msg: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ name, email, password: hashedPassword, role });
    await newUser.save();

    res.status(201).json({ msg: "User registered successfully" });
  } catch (err) {
    res.status(500).json({ msg: "Error in registration" });
  }
};

const loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ msg: "Invalid password" });

    // ✅ New: Recalculate all account balances
    await recalculateAllUserAccounts(user._id);

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      {
        expiresIn: "1d",
      }
    );

    res.json({
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
    });
  } catch (err) {
    res.status(500).json({ msg: "Login error" });
  }
};

module.exports = { registerUser, loginUser };
