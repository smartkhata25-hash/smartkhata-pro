const User = require("../models/User");
const PrintSetting = require("../models/PrintSetting");
const { defaultSettings } = require("./printSettingController");

/* ================= PERSONAL INFO SAVE ================= */

const savePersonalInfo = async (req, res) => {
  try {
    const { fullName, cnic, mobile, address } = req.body;

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    user.fullName = fullName;
    user.cnic = cnic;
    user.mobile = mobile;
    user.address = address;

    await user.save();

    /* ================= FIND OR CREATE PRINT SETTING ================= */

    let printSetting = await PrintSetting.findOne({ userId: user._id });

    if (!printSetting) {
      const defaults = await defaultSettings(user._id);
      printSetting = await PrintSetting.create(defaults);
    } else {
      if (!printSetting.sales?.header) {
        const defaults = await defaultSettings(user._id);
        printSetting.sales.header = defaults.sales.header;
      }

      printSetting.sales.header.address = user.address || "";
      printSetting.sales.header.phone = user.mobile || "";

      await printSetting.save();
    }

    res.json({ msg: "Personal Info saved successfully" });
  } catch (err) {
    console.error("Personal Info Save Error:", err);
    res.status(500).json({ msg: "Server error" });
  }
};

/* ================= BUSINESS INFO SAVE ================= */

const saveBusinessInfo = async (req, res) => {
  try {
    const { businessName, businessType, currency, taxNumber } = req.body;

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    user.businessName = businessName;
    user.businessType = businessType;
    user.currency = currency;
    user.taxNumber = taxNumber;

    await user.save();

    /* ================= FIND OR CREATE PRINT SETTING ================= */

    let printSetting = await PrintSetting.findOne({ userId: user._id });

    if (!printSetting) {
      const defaults = await defaultSettings(user._id);
      printSetting = await PrintSetting.create(defaults);
    } else {
      if (!printSetting.sales?.header) {
        const defaults = await defaultSettings(user._id);
        printSetting.sales.header = defaults.sales.header;
      }

      printSetting.sales.header.companyName = user.businessName || "";
      printSetting.sales.header.taxNumber = user.taxNumber || "";

      await printSetting.save();
    }

    res.json({ msg: "Business Info saved successfully" });
  } catch (err) {
    console.error("Business Info Save Error:", err);
    res.status(500).json({ msg: "Server error" });
  }
};

module.exports = { savePersonalInfo, saveBusinessInfo };
