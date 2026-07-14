const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const User = require("../models/User");
const LocalSession = require("../models/LocalSession");
const Installation = require("../models/Installation");
const UserDevice = require("../models/UserDevice");

const {
  ALL_PERMISSIONS,
  DEFAULT_STAFF_PERMISSIONS,
  sanitizePermissions,
} = require("../utils/permissionList");

const { logActivity } = require("../utils/activityLogger");

const STAFF_FIELDS =
  "_id name fullName email mobile accountRole staffStatus permissions mustChangePassword isDeleted createdAt updatedAt";

const normalizeEmail = (email = "") =>
  String(email || "")
    .trim()
    .toLowerCase();

const getOwnerId = (req) =>
  req.user?.businessOwnerId || req.user?.id || req.userId;

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const findOwnerStaff = async (ownerId, staffId) => {
  if (!ownerId || !isValidId(staffId)) return null;

  return User.findOne({
    _id: staffId,
    accountRole: "staff",
    businessOwnerId: ownerId,
    isDeleted: { $ne: true },
  });
};

/* =========================================================
   CREATE STAFF
========================================================= */

const createStaff = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);

    const { name, fullName, email, mobile, password, permissions } = req.body;

    if (!ownerId) {
      return res.status(401).json({
        message: "Business owner not found",
      });
    }

    const cleanName = String(name || "").trim();
    const cleanFullName = String(fullName || "").trim();
    const cleanMobile = String(mobile || "").trim();
    const cleanEmail = normalizeEmail(email);

    if (!cleanName) {
      return res.status(400).json({
        message: "Staff name is required",
      });
    }

    if (!cleanEmail) {
      return res.status(400).json({
        message: "Email is required",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({
        message: "Invalid email format",
      });
    }

    if (!password || String(password).length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters",
      });
    }

    const existingUser = await User.findOne({
      email: cleanEmail,
    }).select("_id");

    if (existingUser) {
      return res.status(409).json({
        message: "A user with this email already exists",
      });
    }

    const cleanPermissions =
      permissions === undefined
        ? DEFAULT_STAFF_PERMISSIONS
        : sanitizePermissions(permissions);

    const hashedPassword = await bcrypt.hash(String(password), 12);

    const staff = await User.create({
      name: cleanName,
      fullName: cleanFullName || cleanName,
      email: cleanEmail,
      mobile: cleanMobile,
      password: hashedPassword,

      role: "staff",
      accountRole: "staff",
      businessOwnerId: ownerId,
      createdByOwner: ownerId,

      permissions: cleanPermissions,
      staffStatus: "active",
      mustChangePassword: true,
      isDeleted: false,
    });

    await logActivity({
      req,
      action: "create",
      module: "staff",
      entityType: "User",
      entityId: staff._id,
      title: staff.fullName || staff.name,
      description: `Staff user ${staff.email} created`,
      after: {
        name: staff.name,
        fullName: staff.fullName,
        email: staff.email,
        mobile: staff.mobile,
        permissions: staff.permissions,
        staffStatus: staff.staffStatus,
        isDeleted: staff.isDeleted,
      },
    });

    const safeStaff = await User.findById(staff._id).select(STAFF_FIELDS);

    return res.status(201).json({
      message: "Staff created successfully",
      staff: safeStaff,
    });
  } catch (error) {
    console.error("Create Staff Error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        message: "A user with this email already exists",
      });
    }

    return res.status(500).json({
      message: "Failed to create staff",
    });
  }
};

/* =========================================================
   GET STAFF LIST
========================================================= */

const getStaffList = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);

    if (!ownerId) {
      return res.status(401).json({
        message: "Business owner not found",
      });
    }

    const { search = "", status = "all", page = 1, limit = 50 } = req.query;

    const query = {
      accountRole: "staff",
      businessOwnerId: ownerId,
      isDeleted: { $ne: true },
    };

    if (["active", "blocked"].includes(status)) {
      query.staffStatus = status;
    }

    if (String(search).trim()) {
      const safeSearch = String(search)
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      query.$or = [
        { name: { $regex: safeSearch, $options: "i" } },
        { fullName: { $regex: safeSearch, $options: "i" } },
        { email: { $regex: safeSearch, $options: "i" } },
        { mobile: { $regex: safeSearch, $options: "i" } },
      ];
    }

    const safePage = Math.max(Number(page) || 1, 1);
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const skip = (safePage - 1) * safeLimit;

    const [staff, total] = await Promise.all([
      User.find(query)
        .select(STAFF_FIELDS)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),

      User.countDocuments(query),
    ]);

    return res.json({
      staff,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        pages: Math.ceil(total / safeLimit),
      },
    });
  } catch (error) {
    console.error("Get Staff List Error:", error);

    return res.status(500).json({
      message: "Failed to fetch staff",
    });
  }
};

/* =========================================================
   GET SINGLE STAFF
========================================================= */

const getStaffById = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);
    const { id } = req.params;

    const staff = await findOwnerStaff(ownerId, id);

    if (!staff) {
      return res.status(404).json({
        message: "Staff user not found",
      });
    }

    return res.json({
      staff: {
        _id: staff._id,
        name: staff.name,
        fullName: staff.fullName,
        email: staff.email,
        mobile: staff.mobile,
        accountRole: staff.accountRole,
        staffStatus: staff.staffStatus,
        permissions: staff.permissions || [],
        mustChangePassword: Boolean(staff.mustChangePassword),
        createdAt: staff.createdAt,
        updatedAt: staff.updatedAt,
      },

      availablePermissions: ALL_PERMISSIONS,
    });
  } catch (error) {
    console.error("Get Staff Error:", error);

    return res.status(500).json({
      message: "Failed to fetch staff details",
    });
  }
};

/* =========================================================
   UPDATE STAFF INFORMATION
========================================================= */

const updateStaff = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);
    const { id } = req.params;
    const { name, fullName, email, mobile } = req.body;

    const staff = await findOwnerStaff(ownerId, id);

    if (!staff) {
      return res.status(404).json({
        message: "Staff user not found",
      });
    }

    const oldEmail = staff.email;

    const before = {
      name: staff.name,
      fullName: staff.fullName,
      email: staff.email,
      mobile: staff.mobile,
    };

    if (name !== undefined) {
      const cleanName = String(name).trim();

      if (!cleanName) {
        return res.status(400).json({
          message: "Staff name cannot be empty",
        });
      }

      staff.name = cleanName;
    }

    if (fullName !== undefined) {
      staff.fullName = String(fullName).trim();
    }

    if (mobile !== undefined) {
      staff.mobile = String(mobile).trim();
    }

    if (email !== undefined) {
      const cleanEmail = normalizeEmail(email);
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!emailRegex.test(cleanEmail)) {
        return res.status(400).json({
          message: "Invalid email format",
        });
      }

      const emailExists = await User.exists({
        _id: { $ne: staff._id },
        email: cleanEmail,
      });

      if (emailExists) {
        return res.status(409).json({
          message: "A user with this email already exists",
        });
      }

      staff.email = cleanEmail;
    }

    await staff.save();

    if (oldEmail !== staff.email) {
      await LocalSession.updateMany(
        {
          userId: staff._id,
        },
        {
          $set: {
            email: staff.email,
          },
        },
      );
    }

    await logActivity({
      req,
      action: "update",
      module: "staff",
      entityType: "User",
      entityId: staff._id,
      title: staff.fullName || staff.name,
      description: `Staff information updated for ${staff.email}`,
      before,
      after: {
        name: staff.name,
        fullName: staff.fullName,
        email: staff.email,
        mobile: staff.mobile,
      },
    });

    const safeStaff = await User.findById(staff._id).select(STAFF_FIELDS);

    return res.json({
      message: "Staff updated successfully",
      staff: safeStaff,
    });
  } catch (error) {
    console.error("Update Staff Error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        message: "A user with this email already exists",
      });
    }

    return res.status(500).json({
      message: "Failed to update staff",
    });
  }
};

/* =========================================================
   UPDATE STAFF PERMISSIONS
========================================================= */

const updateStaffPermissions = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);
    const { id } = req.params;
    const { permissions } = req.body;

    if (!Array.isArray(permissions)) {
      return res.status(400).json({
        message: "Permissions must be an array",
      });
    }

    const staff = await findOwnerStaff(ownerId, id);

    if (!staff) {
      return res.status(404).json({
        message: "Staff user not found",
      });
    }

    const oldPermissions = [...(staff.permissions || [])];
    const cleanPermissions = sanitizePermissions(permissions);

    staff.permissions = cleanPermissions;

    await staff.save();

    await logActivity({
      req,
      action: "permission_update",
      module: "staff",
      entityType: "User",
      entityId: staff._id,
      title: staff.fullName || staff.name,
      description: `Permissions updated for ${staff.email}`,
      before: {
        permissions: oldPermissions,
      },
      after: {
        permissions: cleanPermissions,
      },
    });

    return res.json({
      message: "Permissions updated successfully",
      permissions: cleanPermissions,
    });
  } catch (error) {
    console.error("Update Staff Permissions Error:", error);

    return res.status(500).json({
      message: "Failed to update permissions",
    });
  }
};

/* =========================================================
   BLOCK OR UNBLOCK STAFF
========================================================= */

const updateStaffStatus = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);
    const { id } = req.params;
    const { status } = req.body;

    if (!["active", "blocked"].includes(status)) {
      return res.status(400).json({
        message: "Status must be active or blocked",
      });
    }

    const staff = await findOwnerStaff(ownerId, id);

    if (!staff) {
      return res.status(404).json({
        message: "Staff user not found",
      });
    }

    const oldStatus = staff.staffStatus;

    staff.staffStatus = status;
    await staff.save();

    if (status === "blocked") {
      await Promise.all([
        Installation.updateMany(
          {
            userId: staff._id,
          },
          {
            $set: {
              isActive: false,
            },
          },
        ),

        LocalSession.deleteMany({
          userId: staff._id,
        }),
      ]);
    }

    if (status === "active") {
      await Installation.updateMany(
        {
          userId: staff._id,
        },
        {
          $set: {
            isActive: true,
          },
        },
      );
    }

    await logActivity({
      req,
      action: status === "blocked" ? "block" : "unblock",
      module: "staff",
      entityType: "User",
      entityId: staff._id,
      title: staff.fullName || staff.name,
      description: `${staff.email} was ${status}`,
      before: {
        staffStatus: oldStatus,
      },
      after: {
        staffStatus: status,
      },
    });

    return res.json({
      message:
        status === "blocked"
          ? "Staff blocked successfully"
          : "Staff activated successfully",

      staffStatus: status,
    });
  } catch (error) {
    console.error("Update Staff Status Error:", error);

    return res.status(500).json({
      message: "Failed to update staff status",
    });
  }
};

/* =========================================================
   RESET STAFF PASSWORD
========================================================= */

const resetStaffPassword = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({
        message: "New password must be at least 6 characters",
      });
    }

    const staff = await findOwnerStaff(ownerId, id);

    if (!staff) {
      return res.status(404).json({
        message: "Staff user not found",
      });
    }

    staff.password = await bcrypt.hash(String(newPassword), 12);
    staff.mustChangePassword = true;

    await staff.save();

    await LocalSession.deleteMany({
      userId: staff._id,
    });

    await logActivity({
      req,
      action: "password_reset",
      module: "staff",
      entityType: "User",
      entityId: staff._id,
      title: staff.fullName || staff.name,
      description: `Password reset for ${staff.email}`,
      metadata: {
        mustChangePassword: true,
      },
    });

    return res.json({
      message: "Staff password reset successfully",
    });
  } catch (error) {
    console.error("Reset Staff Password Error:", error);

    return res.status(500).json({
      message: "Failed to reset staff password",
    });
  }
};

/* =========================================================
   SOFT DELETE STAFF
========================================================= */

const deleteStaff = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);
    const { id } = req.params;

    const staff = await findOwnerStaff(ownerId, id);

    if (!staff) {
      return res.status(404).json({
        message: "Staff user not found",
      });
    }

    const staffSnapshot = {
      name: staff.name,
      fullName: staff.fullName,
      email: staff.email,
      mobile: staff.mobile,
      permissions: staff.permissions,
      staffStatus: staff.staffStatus,
      isDeleted: staff.isDeleted,
    };

    staff.staffStatus = "blocked";
    staff.permissions = [];
    staff.isDeleted = true;

    await staff.save();

    await Promise.all([
      LocalSession.deleteMany({
        userId: staff._id,
      }),

      Installation.updateMany(
        {
          userId: staff._id,
        },
        {
          $set: {
            isActive: false,
          },
        },
      ),

      UserDevice.deleteMany({
        userId: staff._id,
      }),
    ]);

    await logActivity({
      req,
      action: "delete",
      module: "staff",
      entityType: "User",
      entityId: staff._id,
      title: staff.fullName || staff.name,
      description: `Staff user ${staff.email} removed`,
      before: staffSnapshot,
      after: {
        staffStatus: "blocked",
        permissions: [],
        isDeleted: true,
      },
    });

    return res.json({
      message: "Staff removed successfully",
    });
  } catch (error) {
    console.error("Delete Staff Error:", error);

    return res.status(500).json({
      message: "Failed to remove staff",
    });
  }
};

module.exports = {
  createStaff,
  getStaffList,
  getStaffById,
  updateStaff,
  updateStaffPermissions,
  updateStaffStatus,
  resetStaffPassword,
  deleteStaff,
};
