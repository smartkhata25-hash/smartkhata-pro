const ExpenseTitle = require("../models/ExpenseTitle");
const Account = require("../models/Account");
const mongoose = require("mongoose");

exports.getExpenseTitles = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const search = String(req.query.search || "").trim();

    const query = {
      userId,
      isDeleted: false,
    };

    if (search) {
      const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      query.name = {
        $regex: safeSearch,
        $options: "i",
      };
    }

    const titles = await ExpenseTitle.find(query)
      .select("name categoryId isDefault")
      .populate("categoryId", "name")
      .sort({ name: 1, _id: 1 })
      .limit(50)
      .lean();

    return res.json(titles);
  } catch (error) {
    console.error("Get Expense Titles Error:", error);

    return res.status(500).json({
      error: "Failed to fetch expense titles",
    });
  }
};

exports.createExpenseTitle = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { name, categoryId } = req.body;

    // 🔒 Validation
    if (!name || !name.trim()) {
      return res.status(400).json({
        error: "Title name is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return res.status(400).json({
        error: "Invalid category ID",
      });
    }

    const account = await Account.findOne({
      _id: categoryId,
      userId,
      type: "Expense",
    });

    if (!account) {
      return res.status(400).json({
        error: "Invalid expense category",
      });
    }

    const trimmedName = name.trim();

    const existing = await ExpenseTitle.findOne({
      userId,
      isDeleted: false,
      name: {
        $regex: `^${trimmedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
        $options: "i",
      },
    }).lean();

    if (existing) {
      return res.status(400).json({
        error: "Title already exists",
      });
    }

    const newTitle = new ExpenseTitle({
      name: trimmedName,
      categoryId,
      userId,
      isDefault: false,
    });

    await newTitle.save();

    // 🔁 populate before response
    await newTitle.populate("categoryId", "name");

    res.status(201).json(newTitle);
  } catch (error) {
    // 🔥 Duplicate index error fallback
    if (error.code === 11000) {
      return res.status(400).json({
        error: "Title already exists",
      });
    }

    console.error("Create Expense Title Error:", error);
    res.status(500).json({
      error: "Failed to create expense title",
    });
  }
};

exports.deleteExpenseTitle = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        error: "Invalid title ID",
      });
    }

    const title = await ExpenseTitle.findOne({
      _id: id,
      userId,
      isDeleted: false,
    });

    if (!title) {
      return res.status(404).json({
        error: "Title not found",
      });
    }

    // 🔒 Default titles cannot be deleted
    if (title.isDefault) {
      return res.status(403).json({
        error: "Default titles cannot be deleted",
      });
    }

    // 🗑️ Soft delete
    title.isDeleted = true;
    await title.save();

    res.json({
      message: "Title deleted successfully",
    });
  } catch (error) {
    console.error("Delete Expense Title Error:", error);
    res.status(500).json({
      error: "Failed to delete title",
    });
  }
};

exports.updateExpenseTitle = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { id } = req.params;
    const { name, categoryId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        error: "Invalid title ID",
      });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({
        error: "Title name is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return res.status(400).json({
        error: "Invalid category ID",
      });
    }

    const title = await ExpenseTitle.findOne({
      _id: id,
      userId,
      isDeleted: false,
    });

    if (!title) {
      return res.status(404).json({
        error: "Title not found",
      });
    }

    if (title.isDefault) {
      return res.status(403).json({
        error: "Default titles cannot be modified",
      });
    }

    const trimmedName = name.trim();

    const existing = await ExpenseTitle.findOne({
      userId,
      _id: { $ne: id },
      isDeleted: false,
      name: {
        $regex: `^${trimmedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
        $options: "i",
      },
    }).lean();

    if (existing) {
      return res.status(400).json({
        error: "Title already exists",
      });
    }

    // 🔎 Validate category again
    const account = await Account.findOne({
      _id: categoryId,
      userId,
      type: "Expense",
    });

    if (!account) {
      return res.status(400).json({
        error: "Invalid expense category",
      });
    }

    title.name = trimmedName;
    title.categoryId = categoryId;

    await title.save();

    await title.populate("categoryId", "name");

    res.json(title);
  } catch (error) {
    console.error("Update Expense Title Error:", error);
    res.status(500).json({
      error: "Failed to update title",
    });
  }
};
