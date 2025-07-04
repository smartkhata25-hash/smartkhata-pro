const User = require("../models/User");

// ✅ Personal Info Save
const savePersonalInfo = async (req, res) => {
  try {
    const { fullName, cnic, mobile, address } = req.body;

    const user = await User.findById(req.userId); // ✅ JWT سے حاصل
    if (!user) return res.status(404).json({ msg: "User not found" });

    user.fullName = fullName;
    user.cnic = cnic;
    user.mobile = mobile;
    user.address = address;

    await user.save();
    res.json({ msg: "Personal Info saved successfully" });
  } catch (err) {
    res.status(500).json({ msg: "Server error" });
  }
};

// ✅ Business Info Save
const saveBusinessInfo = async (req, res) => {
  try {
    const { businessName, businessType, currency, taxNumber } = req.body;

    const user = await User.findById(req.userId); // ✅ JWT سے حاصل
    if (!user) return res.status(404).json({ msg: "User not found" });

    user.businessName = businessName;
    user.businessType = businessType;
    user.currency = currency;
    user.taxNumber = taxNumber;

    await user.save();
    res.json({ msg: "Business Info saved successfully" });
  } catch (err) {
    res.status(500).json({ msg: "Server error" });
  }
};

module.exports = { savePersonalInfo, saveBusinessInfo };
