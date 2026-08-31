const mongoose = require("mongoose");

const BusinessLiability = require("../models/BusinessLiability");

const BusinessLiabilityPayment = require("../models/BusinessLiabilityPayment");
const {
  applyBusinessValueScopeFilter,
  getControllerStatusCode,
  requireBusinessValueModuleScope,
} = require("../utils/businessValueModuleScope");

const DEFAULT_LIABILITY_TITLES = [
  "Business Loan",
  "Bank Loan",
  "Personal Loan Used in Business",
  "Supplier Outstanding",
  "Credit Purchase",
  "Equipment Installment",
  "Vehicle Installment",
  "Shop Advance",
  "Tax Payable",
  "Utility Payable",
  "Salary Payable",
  "Rent Payable",
  "Other Liability",
];

const ALLOWED_CATEGORIES = [
  "loan",
  "bank_loan",
  "supplier",
  "credit",
  "tax",
  "other",
];

const getUserIds = (req) => ({
  userId: new mongoose.Types.ObjectId(req.user.id),

  actorId: new mongoose.Types.ObjectId(
    req.user.actorId || req.actorId || req.user.id,
  ),
});

exports.getLiabilityTitles = async (req, res) => {
  try {
    res.json({
      success: true,
      titles: DEFAULT_LIABILITY_TITLES,
      allowCustomTitle: true,
    });
  } catch (error) {
    console.error("Get Business Liability Titles Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load liability titles.",
      error: error.message,
    });
  }
};

exports.createLiability = async (req, res) => {
  try {
    const { userId, actorId } = getUserIds(req);
    const moduleScope = requireBusinessValueModuleScope(req);

    const {
      title,
      category = "other",
      originalAmount = 0,
      remainingAmount,
      startDate,
      notes = "",
      status = "active",
    } = req.body;

    const cleanTitle = String(title || "").trim();

    if (!cleanTitle) {
      return res.status(400).json({
        success: false,
        message: "Liability title is required.",
      });
    }

    if (!ALLOWED_CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        message: "Invalid liability category.",
      });
    }

    if (!["active", "closed"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid liability status.",
      });
    }

    const totalAmount = Number(originalAmount);

    const balanceAmount =
      remainingAmount === undefined ? totalAmount : Number(remainingAmount);

    if (!Number.isFinite(totalAmount) || totalAmount < 0) {
      return res.status(400).json({
        success: false,
        message: "Original amount cannot be negative.",
      });
    }

    if (!Number.isFinite(balanceAmount) || balanceAmount < 0) {
      return res.status(400).json({
        success: false,
        message: "Remaining amount cannot be negative.",
      });
    }

    if (balanceAmount > totalAmount) {
      return res.status(400).json({
        success: false,
        message: "Remaining amount cannot exceed original amount.",
      });
    }

    const finalStatus = balanceAmount === 0 ? "closed" : "active";

    const liability = await BusinessLiability.create({
      userId,
      moduleScope,
      title: cleanTitle,
      category,
      originalAmount: totalAmount,
      remainingAmount: balanceAmount,
      startDate: startDate || null,
      notes: String(notes || "").trim(),
      status: finalStatus,
      isDeleted: false,
      createdBy: actorId,
      updatedBy: actorId,
    });

    res.status(201).json({
      success: true,
      message: "Liability created successfully.",
      liability,
    });
  } catch (error) {
    console.error("Create Business Liability Error:", error);
    const statusCode = getControllerStatusCode(error);

    res.status(statusCode).json({
      success: false,
      message: "Failed to create liability.",
      error: error.message,
    });
  }
};

exports.getLiabilities = async (req, res) => {
  try {
    const { userId } = getUserIds(req);
    const moduleScope = requireBusinessValueModuleScope(req);

    const {
      search = "",
      category,
      status,
      includeClosed = "false",
      page = "1",
      limit = "100",
    } = req.query;

    const filter = {
      userId,
      isDeleted: false,
    };

    applyBusinessValueScopeFilter(filter, moduleScope);

    if (search.trim()) {
      filter.title = {
        $regex: search.trim(),
        $options: "i",
      };
    }

    if (category && ALLOWED_CATEGORIES.includes(category)) {
      filter.category = category;
    }

    if (status && ["active", "closed"].includes(status)) {
      filter.status = status;
    }

    if (includeClosed !== "true" && !status) {
      filter.status = "active";
    }

    const pageNumber = Math.max(Number(page) || 1, 1);
    const pageLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const skip = (pageNumber - 1) * pageLimit;

    const [liabilities, total] = await Promise.all([
      BusinessLiability.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageLimit)
        .lean(),

      BusinessLiability.countDocuments(filter),
    ]);

    const totalRemainingAmount = liabilities.reduce(
      (sum, item) => sum + Number(item.remainingAmount || 0),
      0,
    );

    res.json({
      success: true,
      liabilities,
      summary: {
        totalLiabilities: liabilities.length,
        totalRemainingAmount: Number(totalRemainingAmount.toFixed(2)),
      },
      pagination: {
        page: pageNumber,
        limit: pageLimit,
        total,
        totalPages: Math.ceil(total / pageLimit),
      },
    });
  } catch (error) {
    console.error("Get Business Liabilities Error:", error);
    const statusCode = getControllerStatusCode(error);

    res.status(statusCode).json({
      success: false,
      message: "Failed to load liabilities.",
      error: error.message,
    });
  }
};

exports.getLiabilityById = async (req, res) => {
  try {
    const { userId } = getUserIds(req);
    const moduleScope = requireBusinessValueModuleScope(req);

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid liability ID.",
      });
    }

    const query = {
      _id: req.params.id,
      userId,
      isDeleted: false,
    };

    applyBusinessValueScopeFilter(query, moduleScope);

    const liability = await BusinessLiability.findOne(query).lean();

    if (!liability) {
      return res.status(404).json({
        success: false,
        message: "Liability not found.",
      });
    }

    res.json({
      success: true,
      liability,
    });
  } catch (error) {
    console.error("Get Business Liability Error:", error);
    const statusCode = getControllerStatusCode(error);

    res.status(statusCode).json({
      success: false,
      message: "Failed to load liability.",
      error: error.message,
    });
  }
};

exports.updateLiability = async (req, res) => {
  try {
    const { userId, actorId } = getUserIds(req);
    const moduleScope = requireBusinessValueModuleScope(req);

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid liability ID.",
      });
    }

    const query = {
      _id: req.params.id,
      userId,
      isDeleted: false,
    };

    applyBusinessValueScopeFilter(query, moduleScope);

    const liability = await BusinessLiability.findOne(query);

    if (!liability) {
      return res.status(404).json({
        success: false,
        message: "Liability not found.",
      });
    }

    const paymentQuery = {
      userId,
      liabilityId: liability._id,
      isReversed: false,
    };

    applyBusinessValueScopeFilter(paymentQuery, moduleScope);

    const hasPaymentHistory = await BusinessLiabilityPayment.exists(paymentQuery);

    if (
      hasPaymentHistory &&
      (req.body.originalAmount !== undefined ||
        req.body.remainingAmount !== undefined)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Amounts cannot be edited after payments have been recorded. Use liability payment or payment reversal instead.",
      });
    }

    if (req.body.title !== undefined) {
      const cleanTitle = String(req.body.title || "").trim();

      if (!cleanTitle) {
        return res.status(400).json({
          success: false,
          message: "Liability title is required.",
        });
      }

      liability.title = cleanTitle;
    }

    if (req.body.category !== undefined) {
      if (!ALLOWED_CATEGORIES.includes(req.body.category)) {
        return res.status(400).json({
          success: false,
          message: "Invalid liability category.",
        });
      }

      liability.category = req.body.category;
    }

    if (req.body.originalAmount !== undefined) {
      const originalAmount = Number(req.body.originalAmount);

      if (!Number.isFinite(originalAmount) || originalAmount < 0) {
        return res.status(400).json({
          success: false,
          message: "Original amount cannot be negative.",
        });
      }

      liability.originalAmount = originalAmount;
    }

    if (req.body.remainingAmount !== undefined) {
      const remainingAmount = Number(req.body.remainingAmount);

      if (!Number.isFinite(remainingAmount) || remainingAmount < 0) {
        return res.status(400).json({
          success: false,
          message: "Remaining amount cannot be negative.",
        });
      }

      liability.remainingAmount = remainingAmount;
    }

    if (liability.remainingAmount > liability.originalAmount) {
      return res.status(400).json({
        success: false,
        message: "Remaining amount cannot exceed original amount.",
      });
    }

    if (req.body.startDate !== undefined) {
      liability.startDate = req.body.startDate || null;
    }

    if (req.body.notes !== undefined) {
      liability.notes = String(req.body.notes || "").trim();
    }

    liability.status =
      Number(liability.remainingAmount || 0) > 0 ? "active" : "closed";

    liability.updatedBy = actorId;

    await liability.save();

    res.json({
      success: true,
      message: "Liability updated successfully.",
      liability,
    });
  } catch (error) {
    console.error("Update Business Liability Error:", error);
    const statusCode = getControllerStatusCode(error);

    res.status(statusCode).json({
      success: false,
      message: "Failed to update liability.",
      error: error.message,
    });
  }
};

exports.deleteLiability = async (req, res) => {
  try {
    const { userId, actorId } = getUserIds(req);
    const moduleScope = requireBusinessValueModuleScope(req);

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid liability ID.",
      });
    }

    const query = {
      _id: req.params.id,
      userId,
      isDeleted: false,
    };

    applyBusinessValueScopeFilter(query, moduleScope);

    const liability = await BusinessLiability.findOne(query);

    if (!liability) {
      return res.status(404).json({
        success: false,
        message: "Liability not found.",
      });
    }

    const paymentQuery = {
      userId,
      liabilityId: liability._id,
      isReversed: false,
    };

    applyBusinessValueScopeFilter(paymentQuery, moduleScope);

    const hasPaymentHistory = await BusinessLiabilityPayment.exists(paymentQuery);

    if (hasPaymentHistory) {
      return res.status(400).json({
        success: false,
        message:
          "This liability has payment history. Reverse its payments before deleting it.",
      });
    }

    liability.isDeleted = true;
    liability.updatedBy = actorId;

    await liability.save();

    res.json({
      success: true,
      message: "Liability deleted successfully.",
    });
  } catch (error) {
    console.error("Delete Business Liability Error:", error);
    const statusCode = getControllerStatusCode(error);

    res.status(statusCode).json({
      success: false,
      message: "Failed to delete liability.",
      error: error.message,
    });
  }
};

exports.restoreLiability = async (req, res) => {
  try {
    const { userId, actorId } = getUserIds(req);
    const moduleScope = requireBusinessValueModuleScope(req);

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid liability ID.",
      });
    }

    const query = {
      _id: req.params.id,
      userId,
      isDeleted: true,
    };

    applyBusinessValueScopeFilter(query, moduleScope);

    const liability = await BusinessLiability.findOne(query);

    if (!liability) {
      return res.status(404).json({
        success: false,
        message: "Deleted liability not found.",
      });
    }

    liability.isDeleted = false;
    liability.status =
      Number(liability.remainingAmount || 0) > 0 ? "active" : "closed";
    liability.updatedBy = actorId;

    await liability.save();

    res.json({
      success: true,
      message: "Liability restored successfully.",
      liability,
    });
  } catch (error) {
    console.error("Restore Business Liability Error:", error);
    const statusCode = getControllerStatusCode(error);

    res.status(statusCode).json({
      success: false,
      message: "Failed to restore liability.",
      error: error.message,
    });
  }
};
