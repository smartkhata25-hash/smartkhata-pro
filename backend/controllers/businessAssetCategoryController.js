const mongoose = require("mongoose");

const BusinessAssetCategory = require("../models/BusinessAssetCategory");
const BusinessAsset = require("../models/BusinessAsset");

const DEFAULT_CATEGORIES = [
  "Furniture",
  "Electronics",
  "Machinery",
  "Vehicle",
  "Shop Equipment",
  "Other",
];

const ensureDefaultCategories = async (userId, actorId) => {
  const existingCategories = await BusinessAssetCategory.find({
    userId,
    isDeleted: false,
  })
    .select("normalizedName")
    .lean();

  const existingNames = new Set(
    existingCategories.map((category) => category.normalizedName),
  );

  const missingCategories = DEFAULT_CATEGORIES.filter(
    (name) => !existingNames.has(name.toLowerCase()),
  );

  if (!missingCategories.length) {
    return;
  }

  await BusinessAssetCategory.insertMany(
    missingCategories.map((name) => ({
      userId,
      name,
      normalizedName: name.toLowerCase(),
      isSystem: true,
      isActive: true,
      isDeleted: false,
      createdBy: actorId,
      updatedBy: actorId,
    })),
  );
};

exports.createCategory = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const actorId = new mongoose.Types.ObjectId(
      req.user.actorId || req.actorId || req.user.id,
    );

    const name = String(req.body.name || "").trim();
    const description = String(req.body.description || "").trim();

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Category name is required.",
      });
    }

    const normalizedName = name.toLowerCase();

    const duplicate = await BusinessAssetCategory.findOne({
      userId,
      normalizedName,
      isDeleted: false,
    });

    if (duplicate) {
      return res.status(400).json({
        success: false,
        message: "This category already exists.",
      });
    }

    const category = await BusinessAssetCategory.create({
      userId,
      name,
      normalizedName,
      description,
      isSystem: false,
      isActive: true,
      isDeleted: false,
      createdBy: actorId,
      updatedBy: actorId,
    });

    res.status(201).json({
      success: true,
      message: "Category created successfully.",
      category,
    });
  } catch (error) {
    console.error("Create Business Asset Category Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create category.",
      error: error.message,
    });
  }
};

exports.getCategories = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const actorId = new mongoose.Types.ObjectId(
      req.user.actorId || req.actorId || req.user.id,
    );

    const includeInactive = req.query.includeInactive === "true";

    await ensureDefaultCategories(userId, actorId);

    const filter = {
      userId,
      isDeleted: false,
    };

    if (!includeInactive) {
      filter.isActive = true;
    }

    const categories = await BusinessAssetCategory.find(filter)
      .sort({
        isSystem: -1,
        name: 1,
      })
      .lean();

    res.json({
      success: true,
      categories,
    });
  } catch (error) {
    console.error("Get Business Asset Categories Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load categories.",
      error: error.message,
    });
  }
};

exports.getCategoryById = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category ID.",
      });
    }

    const category = await BusinessAssetCategory.findOne({
      _id: req.params.id,
      userId,
      isDeleted: false,
    }).lean();

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found.",
      });
    }

    res.json({
      success: true,
      category,
    });
  } catch (error) {
    console.error("Get Business Asset Category Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load category.",
      error: error.message,
    });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const actorId = new mongoose.Types.ObjectId(
      req.user.actorId || req.actorId || req.user.id,
    );

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category ID.",
      });
    }

    const category = await BusinessAssetCategory.findOne({
      _id: req.params.id,
      userId,
      isDeleted: false,
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found.",
      });
    }

    const name =
      req.body.name !== undefined
        ? String(req.body.name || "").trim()
        : category.name;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Category name is required.",
      });
    }

    const normalizedName = name.toLowerCase();

    const duplicate = await BusinessAssetCategory.findOne({
      _id: { $ne: category._id },
      userId,
      normalizedName,
      isDeleted: false,
    });

    if (duplicate) {
      return res.status(400).json({
        success: false,
        message: "This category already exists.",
      });
    }

    category.name = name;
    category.normalizedName = normalizedName;

    if (req.body.description !== undefined) {
      category.description = String(req.body.description || "").trim();
    }

    if (req.body.isActive !== undefined) {
      category.isActive = Boolean(req.body.isActive);
    }

    category.updatedBy = actorId;

    await category.save();

    res.json({
      success: true,
      message: "Category updated successfully.",
      category,
    });
  } catch (error) {
    console.error("Update Business Asset Category Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update category.",
      error: error.message,
    });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const actorId = new mongoose.Types.ObjectId(
      req.user.actorId || req.actorId || req.user.id,
    );

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category ID.",
      });
    }

    const category = await BusinessAssetCategory.findOne({
      _id: req.params.id,
      userId,
      isDeleted: false,
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found.",
      });
    }

    const assetExists = await BusinessAsset.exists({
      userId,
      categoryId: category._id,
      isDeleted: false,
    });

    if (assetExists) {
      return res.status(400).json({
        success: false,
        message: "This category is being used by an asset.",
      });
    }

    category.isDeleted = true;
    category.isActive = false;
    category.updatedBy = actorId;

    await category.save();

    res.json({
      success: true,
      message: "Category deleted successfully.",
    });
  } catch (error) {
    console.error("Delete Business Asset Category Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to delete category.",
      error: error.message,
    });
  }
};

exports.restoreCategory = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const actorId = new mongoose.Types.ObjectId(
      req.user.actorId || req.actorId || req.user.id,
    );

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category ID.",
      });
    }

    const category = await BusinessAssetCategory.findOne({
      _id: req.params.id,
      userId,
      isDeleted: true,
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Deleted category not found.",
      });
    }

    const duplicate = await BusinessAssetCategory.findOne({
      _id: { $ne: category._id },
      userId,
      normalizedName: category.normalizedName,
      isDeleted: false,
    });

    if (duplicate) {
      return res.status(400).json({
        success: false,
        message: "An active category with this name already exists.",
      });
    }

    category.isDeleted = false;
    category.isActive = true;
    category.updatedBy = actorId;

    await category.save();

    res.json({
      success: true,
      message: "Category restored successfully.",
      category,
    });
  } catch (error) {
    console.error("Restore Business Asset Category Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to restore category.",
      error: error.message,
    });
  }
};
