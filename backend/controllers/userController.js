const User = require("../models/User");
const PrintSetting = require("../models/PrintSetting");
const { defaultSettings } = require("./printSettingController");
const { logActivity } = require("../utils/activityLogger");

const ownerOnlyCheck = (req, res) => {
  if (req.user?.accountRole !== "owner") {
    res.status(403).json({
      msg: "Only business owner can update this information",
    });

    return false;
  }

  return true;
};

const getOrCreatePrintSetting = async (ownerId) => {
  let printSetting = await PrintSetting.findOne({
    userId: ownerId,
  });

  if (!printSetting) {
    const defaults = await defaultSettings(ownerId);
    return PrintSetting.create(defaults);
  }

  if (!printSetting.sales?.header) {
    const defaults = await defaultSettings(ownerId);

    if (!printSetting.sales) {
      printSetting.sales = defaults.sales;
    } else {
      printSetting.sales.header = defaults.sales.header;
    }
  }

  return printSetting;
};

/* Personal Info */

const savePersonalInfo = async (req, res) => {
  try {
    if (!ownerOnlyCheck(req, res)) return;

    const ownerId = req.userId;
    const { fullName, cnic, mobile, address } = req.body;

    const user = await User.findById(ownerId);

    if (!user) {
      return res.status(404).json({
        msg: "User not found",
      });
    }

    const before = {
      fullName: user.fullName || "",
      cnic: user.cnic || "",
      mobile: user.mobile || "",
      address: user.address || "",
    };

    user.fullName = String(fullName || "").trim();
    user.cnic = String(cnic || "").trim();
    user.mobile = String(mobile || "").trim();
    user.address = String(address || "").trim();

    await user.save();

    const printSetting = await getOrCreatePrintSetting(ownerId);

    printSetting.sales.header.address = user.address;
    printSetting.sales.header.phone = user.mobile;

    await printSetting.save();

    await logActivity({
      req,
      action: "update",
      module: "settings",
      entityType: "User",
      entityId: user._id,
      title: "Personal Information",
      description: "Business owner updated personal information",
      before,
      after: {
        fullName: user.fullName,
        cnic: user.cnic,
        mobile: user.mobile,
        address: user.address,
      },
    });

    return res.json({
      msg: "Personal Info saved successfully",
    });
  } catch (err) {
    console.error("Personal Info Save Error:", err);

    return res.status(500).json({
      msg: "Server error",
    });
  }
};

/* Business Info */

const saveBusinessInfo = async (req, res) => {
  try {
    if (!ownerOnlyCheck(req, res)) return;

    const ownerId = req.userId;
    const { businessName, businessType, currency, taxNumber } = req.body;

    const user = await User.findById(ownerId);

    if (!user) {
      return res.status(404).json({
        msg: "User not found",
      });
    }

    const before = {
      businessName: user.businessName || "",
      businessType: user.businessType || "",
      currency: user.currency || "",
      taxNumber: user.taxNumber || "",
    };

    user.businessName = String(businessName || "").trim();
    user.businessType = String(businessType || "").trim();
    user.currency = String(currency || "").trim();
    user.taxNumber = String(taxNumber || "").trim();

    await user.save();

    const printSetting = await getOrCreatePrintSetting(ownerId);

    printSetting.sales.header.companyName = user.businessName;
    printSetting.sales.header.taxNumber = user.taxNumber;

    await printSetting.save();

    await logActivity({
      req,
      action: "update",
      module: "settings",
      entityType: "User",
      entityId: user._id,
      title: "Business Information",
      description: "Business owner updated business information",
      before,
      after: {
        businessName: user.businessName,
        businessType: user.businessType,
        currency: user.currency,
        taxNumber: user.taxNumber,
      },
    });

    return res.json({
      msg: "Business Info saved successfully",
    });
  } catch (err) {
    console.error("Business Info Save Error:", err);

    return res.status(500).json({
      msg: "Server error",
    });
  }
};

/* Profile */

const getProfile = async (req, res) => {
  try {
    const ownerId = req.userId;
    const actorId = req.actorId || ownerId;

    const [owner, loggedInUser] = await Promise.all([
      User.findById(ownerId).select(
        "name fullName email cnic mobile address businessName businessType currency taxNumber",
      ),

      User.findById(actorId).select(
        "name fullName email mobile accountRole permissions staffStatus mustChangePassword",
      ),
    ]);

    if (!owner || !loggedInUser) {
      return res.status(404).json({
        msg: "User not found",
      });
    }

    return res.json({
      fullName: owner.fullName || "",
      cnic: owner.cnic || "",
      mobile: owner.mobile || "",
      address: owner.address || "",

      businessName: owner.businessName || "",
      businessType: owner.businessType || "",
      currency: owner.currency || "",
      taxNumber: owner.taxNumber || "",

      loggedInUser: {
        _id: loggedInUser._id,
        name: loggedInUser.name || "",
        fullName: loggedInUser.fullName || "",
        email: loggedInUser.email || "",
        mobile: loggedInUser.mobile || "",
        accountRole: loggedInUser.accountRole || "owner",
        permissions: loggedInUser.permissions || [],
        staffStatus: loggedInUser.staffStatus || "active",
        mustChangePassword: Boolean(loggedInUser.mustChangePassword),
      },
    });
  } catch (err) {
    console.error("Profile Fetch Error:", err);

    return res.status(500).json({
      msg: "Server error",
    });
  }
};

module.exports = {
  savePersonalInfo,
  saveBusinessInfo,
  getProfile,
};
