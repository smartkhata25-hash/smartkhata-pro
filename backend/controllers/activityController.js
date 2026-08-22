const mongoose = require("mongoose");

const ActivityLog = require("../models/ActivityLog");
const User = require("../models/User");

const getOwnerId = (req) =>
  req.user?.businessOwnerId || req.user?.id || req.userId;

const escapeRegex = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

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

    if (!ownerId || !isValidObjectId(ownerId)) {
      return res.status(401).json({
        message: "Business owner not found",
      });
    }

    const ownerObjectId = new mongoose.Types.ObjectId(ownerId);

    const query = {
      businessOwnerId: ownerObjectId,
      isDeleted: false,
    };

    if (staffId) {
      if (!isValidObjectId(staffId)) {
        return res.status(400).json({
          message: "Invalid staff ID",
        });
      }

      query.performedBy = new mongoose.Types.ObjectId(staffId);
    }

    const cleanAction = String(action || "")
      .trim()
      .toLowerCase();

    if (cleanAction) {
      query.action = cleanAction;
    }

    const cleanModule = String(module || "")
      .trim()
      .toLowerCase();

    if (cleanModule) {
      query.module = cleanModule;
    }

    if (startDate || endDate) {
      query.createdAt = {};

      if (startDate) {
        const start = new Date(startDate);

        if (Number.isNaN(start.getTime())) {
          return res.status(400).json({
            message: "Invalid start date",
          });
        }

        start.setHours(0, 0, 0, 0);

        query.createdAt.$gte = start;
      }

      if (endDate) {
        const end = new Date(endDate);

        if (Number.isNaN(end.getTime())) {
          return res.status(400).json({
            message: "Invalid end date",
          });
        }

        end.setHours(23, 59, 59, 999);

        query.createdAt.$lte = end;
      }

      if (
        query.createdAt.$gte &&
        query.createdAt.$lte &&
        query.createdAt.$gte > query.createdAt.$lte
      ) {
        return res.status(400).json({
          message: "Start date cannot be after end date",
        });
      }
    }

    const cleanSearch = String(search || "").trim();

    if (cleanSearch) {
      const safeSearch = escapeRegex(cleanSearch);

      query.$or = [
        {
          title: {
            $regex: safeSearch,
            $options: "i",
          },
        },
        {
          description: {
            $regex: safeSearch,
            $options: "i",
          },
        },
        {
          billNo: {
            $regex: safeSearch,
            $options: "i",
          },
        },
        {
          entityType: {
            $regex: safeSearch,
            $options: "i",
          },
        },
        {
          module: {
            $regex: safeSearch,
            $options: "i",
          },
        },
      ];
    }

    const safePage = Math.max(Number.parseInt(page, 10) || 1, 1);

    const safeLimit = Math.min(
      Math.max(Number.parseInt(limit, 10) || 50, 1),
      100,
    );

    const skip = (safePage - 1) * safeLimit;

    const [activities, total] = await Promise.all([
      ActivityLog.find(query)

        .select(
          [
            "performedBy",
            "action",
            "module",
            "entityType",
            "entityId",
            "title",
            "description",
            "billNo",
            "createdAt",
          ].join(" "),
        )

        .populate("performedBy", "name fullName email mobile accountRole")

        .sort({
          createdAt: -1,
        })

        .skip(skip)

        .limit(safeLimit)

        .lean(),

      ActivityLog.countDocuments(query),
    ]);

    const totalPages = total > 0 ? Math.ceil(total / safeLimit) : 0;

    return res.json({
      activities,

      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        pages: totalPages,

        hasPreviousPage: safePage > 1,

        hasNextPage: safePage < totalPages,
      },
    });
  } catch (error) {
    console.error("Get Activities Error:", error);

    return res.status(500).json({
      message: "Failed to fetch activities",
    });
  }
};

const getActivityById = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);
    const { id } = req.params;

    if (!ownerId || !isValidObjectId(ownerId)) {
      return res.status(401).json({
        message: "Business owner not found",
      });
    }

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid activity ID",
      });
    }

    const activity = await ActivityLog.findOne({
      _id: new mongoose.Types.ObjectId(id),

      businessOwnerId: new mongoose.Types.ObjectId(ownerId),

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

const getActivityStaffList = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);

    if (!ownerId || !isValidObjectId(ownerId)) {
      return res.status(401).json({
        message: "Business owner not found",
      });
    }

    const ownerObjectId = new mongoose.Types.ObjectId(ownerId);

    const [staff, owner] = await Promise.all([
      User.find({
        businessOwnerId: ownerObjectId,
        accountRole: "staff",
        isDeleted: {
          $ne: true,
        },
      })

        .select("_id name fullName email staffStatus")

        .sort({
          name: 1,
        })

        .lean(),

      User.findById(ownerObjectId)

        .select("_id name fullName email")

        .lean(),
    ]);

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

const getActivitySummary = async (req, res) => {
  try {
    const ownerId = getOwnerId(req);

    if (!ownerId || !isValidObjectId(ownerId)) {
      return res.status(401).json({
        message: "Business owner not found",
      });
    }

    const ownerObjectId = new mongoose.Types.ObjectId(ownerId);

    const summary = await ActivityLog.aggregate([
      {
        $match: {
          businessOwnerId: ownerObjectId,
          isDeleted: false,
        },
      },

      {
        $project: {
          action: 1,
          module: 1,
          performedBy: 1,
          createdAt: 1,
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
                count: {
                  $sum: 1,
                },
              },
            },

            {
              $sort: {
                count: -1,
                _id: 1,
              },
            },
          ],

          byModule: [
            {
              $group: {
                _id: "$module",
                count: {
                  $sum: 1,
                },
              },
            },

            {
              $sort: {
                count: -1,
                _id: 1,
              },
            },
          ],

          recentUsers: [
            {
              $group: {
                _id: "$performedBy",

                count: {
                  $sum: 1,
                },

                lastActivity: {
                  $max: "$createdAt",
                },
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

                pipeline: [
                  {
                    $project: {
                      name: 1,
                      fullName: 1,
                      email: 1,
                    },
                  },
                ],

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
    ]).allowDiskUse(true);

    const data = summary?.[0] || {};

    return res.json({
      totalActivities: Number(data.total?.[0]?.count || 0),

      byAction: Array.isArray(data.byAction) ? data.byAction : [],

      byModule: Array.isArray(data.byModule) ? data.byModule : [],

      recentUsers: Array.isArray(data.recentUsers) ? data.recentUsers : [],
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
