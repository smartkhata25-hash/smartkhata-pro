const mongoose = require("mongoose");
const ActivityLog = require("../models/ActivityLog");
const User = require("../models/User");

const getOwnerId = (req) =>
  req.user?.businessOwnerId || req.user?.id || req.userId;

const escapeRegex = (value = "") =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// تمام Activity Logs
const getActivities = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);

    const {
      staffId = "",
      action = "",
      module = "",
      search = "",
      startDate = "",
      endDate = "",
      page = 1,
      limit = 50,
    } = req.query;

    if (!ownerId) {
      return res.status(401).json({
        message: "Business owner not found",
      });
    }

    const query = {
      businessOwnerId: ownerId,
      isDeleted: false,
    };

    if (staffId) {
      if (!mongoose.Types.ObjectId.isValid(staffId)) {
        return res.status(400).json({
          message: "Invalid staff ID",
        });
      }

      query.performedBy = new mongoose.Types.ObjectId(staffId);
    }

    if (action.trim()) {
      query.action = action.trim().toLowerCase();
    }

    if (module.trim()) {
      query.module = module.trim().toLowerCase();
    }

    if (startDate || endDate) {
      query.createdAt = {};

      if (startDate) {
        const start = new Date(startDate);

        if (isNaN(start.getTime())) {
          return res.status(400).json({
            message: "Invalid start date",
          });
        }

        start.setHours(0, 0, 0, 0);
        query.createdAt.$gte = start;
      }

      if (endDate) {
        const end = new Date(endDate);

        if (isNaN(end.getTime())) {
          return res.status(400).json({
            message: "Invalid end date",
          });
        }

        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    if (search.trim()) {
      const safeSearch = escapeRegex(search.trim());

      query.$or = [
        { title: { $regex: safeSearch, $options: "i" } },
        { description: { $regex: safeSearch, $options: "i" } },
        { billNo: { $regex: safeSearch, $options: "i" } },
        { entityType: { $regex: safeSearch, $options: "i" } },
        { module: { $regex: safeSearch, $options: "i" } },
      ];
    }

    const safePage = Math.max(Number(page) || 1, 1);
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const skip = (safePage - 1) * safeLimit;

    const [activities, total] = await Promise.all([
      ActivityLog.find(query)
        .populate("performedBy", "name fullName email mobile accountRole")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),

      ActivityLog.countDocuments(query),
    ]);

    return res.json({
      activities,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        pages: Math.ceil(total / safeLimit),
      },
    });
  } catch (error) {
    console.error("Get Activities Error:", error);

    return res.status(500).json({
      message: "Failed to fetch activities",
    });
  }
};

// ایک Activity کی مکمل تفصیل
const getActivityById = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid activity ID",
      });
    }

    const activity = await ActivityLog.findOne({
      _id: id,
      businessOwnerId: ownerId,
      isDeleted: false,
    })
      .populate("performedBy", "name fullName email mobile accountRole")
      .populate("businessOwnerId", "name fullName email businessName")
      .lean();

    if (!activity) {
      return res.status(404).json({
        message: "Activity not found",
      });
    }

    return res.json({
      activity,
    });
  } catch (error) {
    console.error("Get Activity Detail Error:", error);

    return res.status(500).json({
      message: "Failed to fetch activity detail",
    });
  }
};

// Activity filters کے لیے Staff list
const getActivityStaffList = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);

    const staff = await User.find({
      businessOwnerId: ownerId,
      accountRole: "staff",
    })
      .select("_id name fullName email staffStatus")
      .sort({ name: 1 })
      .lean();

    const owner = await User.findById(ownerId)
      .select("_id name fullName email")
      .lean();

    const users = [];

    if (owner) {
      users.push({
        ...owner,
        accountRole: "owner",
        staffStatus: "active",
      });
    }

    users.push(...staff);

    return res.json({
      users,
    });
  } catch (error) {
    console.error("Get Activity Staff List Error:", error);

    return res.status(500).json({
      message: "Failed to fetch users",
    });
  }
};

// Activity summary
const getActivitySummary = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);

    const ownerObjectId = new mongoose.Types.ObjectId(ownerId);

    const summary = await ActivityLog.aggregate([
      {
        $match: {
          businessOwnerId: ownerObjectId,
          isDeleted: false,
        },
      },
      {
        $facet: {
          total: [
            {
              $count: "count",
            },
          ],

          byAction: [
            {
              $group: {
                _id: "$action",
                count: { $sum: 1 },
              },
            },
            {
              $sort: {
                count: -1,
              },
            },
          ],

          byModule: [
            {
              $group: {
                _id: "$module",
                count: { $sum: 1 },
              },
            },
            {
              $sort: {
                count: -1,
              },
            },
          ],

          recentUsers: [
            {
              $group: {
                _id: "$performedBy",
                count: { $sum: 1 },
                lastActivity: { $max: "$createdAt" },
              },
            },
            {
              $sort: {
                lastActivity: -1,
              },
            },
            {
              $limit: 10,
            },
            {
              $lookup: {
                from: "users",
                localField: "_id",
                foreignField: "_id",
                as: "user",
              },
            },
            {
              $unwind: {
                path: "$user",
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $project: {
                _id: 1,
                count: 1,
                lastActivity: 1,
                name: "$user.name",
                fullName: "$user.fullName",
                email: "$user.email",
              },
            },
          ],
        },
      },
    ]);

    const data = summary[0] || {};

    return res.json({
      totalActivities: data.total?.[0]?.count || 0,
      byAction: data.byAction || [],
      byModule: data.byModule || [],
      recentUsers: data.recentUsers || [],
    });
  } catch (error) {
    console.error("Get Activity Summary Error:", error);

    return res.status(500).json({
      message: "Failed to fetch activity summary",
    });
  }
};

module.exports = {
  getActivities,
  getActivityById,
  getActivityStaffList,
  getActivitySummary,
};
