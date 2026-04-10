const ExpenseTitle = require("../models/ExpenseTitle");
const Account = require("../models/Account");
const mongoose = require("mongoose");

/* =========================================================
   🔍 GET TITLES (SEARCH + DROPDOWN)
========================================================= */

exports.getExpenseTitles = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { search = "" } = req.query;

    const query = {
      userId,
      isDeleted: false,
    };

    // 🔍 Search filter (case insensitive)
    if (search.trim()) {
      query.name = { $regex: search.trim(), $options: "i" };
    }

    const titles = await ExpenseTitle.find(query)

      .populate("categoryId", "name")
      .sort({ name: 1 })
      .limit(50);
    console.log("👉 QUERY:", query);
    console.log("👉 TOTAL FOUND:", titles.length);
    console.log(
      "👉 TITLES:",
      titles.map((t) => t.name),
    );

    res.json(titles);
  } catch (error) {
    console.error("Get Expense Titles Error:", error);
    res.status(500).json({
      error: "Failed to fetch expense titles",
    });
  }
};

/* =========================================================
   ➕ CREATE NEW TITLE (MODAL SAVE)
========================================================= */

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

    // 🔎 Check category exists & belongs to user
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

    // ❌ Duplicate check
    const existing = await ExpenseTitle.findOne({
      name: trimmedName,
      userId,
      isDeleted: false,
    });

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

/* =========================================================
   ❌ DELETE TITLE (SAFE DELETE)
========================================================= */

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

/* =========================================================
   ✏️ UPDATE TITLE (RENAME / CHANGE CATEGORY)
========================================================= */

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

    // 🔒 Default protection (optional rename allow karna ya nahi aap decide karein)
    if (title.isDefault) {
      return res.status(403).json({
        error: "Default titles cannot be modified",
      });
    }

    const trimmedName = name.trim();

    // ❌ Duplicate check
    const existing = await ExpenseTitle.findOne({
      name: trimmedName,
      userId,
      _id: { $ne: id },
      isDeleted: false,
    });

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
