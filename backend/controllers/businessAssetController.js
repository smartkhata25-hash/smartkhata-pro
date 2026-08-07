const mongoose = require("mongoose");

const BusinessAsset = require("../models/BusinessAsset");
const BusinessAssetCategory = require("../models/BusinessAssetCategory");

const DEFAULT_ASSET_TITLES = [
  "Rack",
  "Counter",
  "Shelf",
  "Table",
  "Chair",
  "Office Desk",
  "Cupboard",
  "Laptop",
  "Desktop Computer",
  "Monitor",
  "Keyboard",
  "Mouse",
  "Printer",
  "Scanner",
  "Mobile Phone",
  "Tablet",
  "Camera",
  "CCTV Camera",
  "DVR",
  "NVR",
  "LED TV",
  "Fan",
  "Air Conditioner",
  "Air Cooler",
  "Refrigerator",
  "UPS",
  "Battery",
  "Inverter",
  "Generator",
  "Solar Panel",
  "Internet Router",
  "Telephone",
  "Barcode Scanner",
  "Cash Drawer",
  "Weighing Scale",
  "Packing Machine",
  "Shop Machinery",
  "Delivery Motorcycle",
  "Delivery Vehicle",
  "Other",
];

const getUserIds = (req) => {
  return {
    userId: new mongoose.Types.ObjectId(req.user.id),

    actorId: new mongoose.Types.ObjectId(
      req.user.actorId || req.actorId || req.user.id,
    ),
  };
};

const validateCategory = async (categoryId, userId) => {
  if (!mongoose.Types.ObjectId.isValid(categoryId)) {
    return null;
  }

  return BusinessAssetCategory.findOne({
    _id: categoryId,
    userId,
    isDeleted: false,
    isActive: true,
  });
};

exports.getAssetTitles = async (req, res) => {
  try {
    res.json({
      success: true,
      titles: DEFAULT_ASSET_TITLES,
      allowCustomTitle: true,
    });
  } catch (error) {
    console.error("Get Business Asset Titles Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load asset titles.",
      error: error.message,
    });
  }
};

exports.createAsset = async (req, res) => {
  try {
    const { userId, actorId } = getUserIds(req);

    const {
      categoryId,
      name,
      quantity = 1,
      purchaseCost = 0,
      currentValue = 0,
      purchaseDate,
      notes = "",
      status = "active",
    } = req.body;

    const cleanName = String(name || "").trim();

    if (!cleanName) {
      return res.status(400).json({
        success: false,
        message: "Asset name is required.",
      });
    }

    const category = await validateCategory(categoryId, userId);

    if (!category) {
      return res.status(400).json({
        success: false,
        message: "Valid asset category is required.",
      });
    }

    const assetQuantity = Number(quantity);
    const assetPurchaseCost = Number(purchaseCost);
    const assetCurrentValue = Number(currentValue);

    if (!Number.isFinite(assetQuantity) || assetQuantity <= 0) {
      return res.status(400).json({
        success: false,
        message: "Quantity must be greater than zero.",
      });
    }

    if (!Number.isFinite(assetPurchaseCost) || assetPurchaseCost < 0) {
      return res.status(400).json({
        success: false,
        message: "Purchase cost cannot be negative.",
      });
    }

    if (!Number.isFinite(assetCurrentValue) || assetCurrentValue < 0) {
      return res.status(400).json({
        success: false,
        message: "Current value cannot be negative.",
      });
    }

    const asset = await BusinessAsset.create({
      userId,
      categoryId: category._id,
      name: cleanName,
      quantity: assetQuantity,
      purchaseCost: assetPurchaseCost,
      currentValue: assetCurrentValue,
      purchaseDate: purchaseDate || null,
      notes: String(notes || "").trim(),
      status,
      isActive: status === "active",
      isDeleted: false,
      createdBy: actorId,
      updatedBy: actorId,
    });

    const populatedAsset = await BusinessAsset.findById(asset._id)
      .populate("categoryId", "name")
      .lean();

    res.status(201).json({
      success: true,
      message: "Asset created successfully.",
      asset: populatedAsset,
    });
  } catch (error) {
    console.error("Create Business Asset Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create asset.",
      error: error.message,
    });
  }
};

exports.getAssets = async (req, res) => {
  try {
    const { userId } = getUserIds(req);

    const {
      search = "",
      categoryId,
      status,
      includeInactive = "false",
      page = "1",
      limit = "100",
    } = req.query;

    const filter = {
      userId,
      isDeleted: false,
    };

    if (search.trim()) {
      filter.name = {
        $regex: search.trim(),
        $options: "i",
      };
    }

    if (categoryId && mongoose.Types.ObjectId.isValid(categoryId)) {
      filter.categoryId = new mongoose.Types.ObjectId(categoryId);
    }

    if (status && ["active", "sold", "removed"].includes(status)) {
      filter.status = status;
    }

    if (includeInactive !== "true" && !status) {
      filter.status = "active";
      filter.isActive = true;
    }

    const pageNumber = Math.max(Number(page) || 1, 1);
    const pageLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const skip = (pageNumber - 1) * pageLimit;

    const [assets, total] = await Promise.all([
      BusinessAsset.find(filter)
        .populate("categoryId", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageLimit)
        .lean(),

      BusinessAsset.countDocuments(filter),
    ]);

    const rows = assets.map((asset) => ({
      ...asset,
      totalPurchaseValue:
        Number(asset.quantity || 0) * Number(asset.purchaseCost || 0),

      totalCurrentValue:
        Number(asset.quantity || 0) * Number(asset.currentValue || 0),
    }));

    res.json({
      success: true,
      assets: rows,
      pagination: {
        page: pageNumber,
        limit: pageLimit,
        total,
        totalPages: Math.ceil(total / pageLimit),
      },
    });
  } catch (error) {
    console.error("Get Business Assets Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load assets.",
      error: error.message,
    });
  }
};

exports.getAssetById = async (req, res) => {
  try {
    const { userId } = getUserIds(req);

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid asset ID.",
      });
    }

    const asset = await BusinessAsset.findOne({
      _id: req.params.id,
      userId,
      isDeleted: false,
    })
      .populate("categoryId", "name")
      .lean();

    if (!asset) {
      return res.status(404).json({
        success: false,
        message: "Asset not found.",
      });
    }

    res.json({
      success: true,
      asset: {
        ...asset,

        totalPurchaseValue:
          Number(asset.quantity || 0) * Number(asset.purchaseCost || 0),

        totalCurrentValue:
          Number(asset.quantity || 0) * Number(asset.currentValue || 0),
      },
    });
  } catch (error) {
    console.error("Get Business Asset Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load asset.",
      error: error.message,
    });
  }
};

exports.updateAsset = async (req, res) => {
  try {
    const { userId, actorId } = getUserIds(req);

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid asset ID.",
      });
    }

    const asset = await BusinessAsset.findOne({
      _id: req.params.id,
      userId,
      isDeleted: false,
    });

    if (!asset) {
      return res.status(404).json({
        success: false,
        message: "Asset not found.",
      });
    }

    if (req.body.categoryId !== undefined) {
      const category = await validateCategory(req.body.categoryId, userId);

      if (!category) {
        return res.status(400).json({
          success: false,
          message: "Valid asset category is required.",
        });
      }

      asset.categoryId = category._id;
    }

    if (req.body.name !== undefined) {
      const cleanName = String(req.body.name || "").trim();

      if (!cleanName) {
        return res.status(400).json({
          success: false,
          message: "Asset name is required.",
        });
      }

      asset.name = cleanName;
    }

    if (req.body.quantity !== undefined) {
      const quantity = Number(req.body.quantity);

      if (!Number.isFinite(quantity) || quantity <= 0) {
        return res.status(400).json({
          success: false,
          message: "Quantity must be greater than zero.",
        });
      }

      asset.quantity = quantity;
    }

    if (req.body.purchaseCost !== undefined) {
      const purchaseCost = Number(req.body.purchaseCost);

      if (!Number.isFinite(purchaseCost) || purchaseCost < 0) {
        return res.status(400).json({
          success: false,
          message: "Purchase cost cannot be negative.",
        });
      }

      asset.purchaseCost = purchaseCost;
    }

    if (req.body.currentValue !== undefined) {
      const currentValue = Number(req.body.currentValue);

      if (!Number.isFinite(currentValue) || currentValue < 0) {
        return res.status(400).json({
          success: false,
          message: "Current value cannot be negative.",
        });
      }

      asset.currentValue = currentValue;
    }

    if (req.body.purchaseDate !== undefined) {
      asset.purchaseDate = req.body.purchaseDate || null;
    }

    if (req.body.notes !== undefined) {
      asset.notes = String(req.body.notes || "").trim();
    }

    if (req.body.status !== undefined) {
      if (!["active", "sold", "removed"].includes(req.body.status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid asset status.",
        });
      }

      asset.status = req.body.status;
      asset.isActive = req.body.status === "active";
    }

    asset.updatedBy = actorId;

    await asset.save();

    const updatedAsset = await BusinessAsset.findById(asset._id)
      .populate("categoryId", "name")
      .lean();

    res.json({
      success: true,
      message: "Asset updated successfully.",
      asset: updatedAsset,
    });
  } catch (error) {
    console.error("Update Business Asset Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update asset.",
      error: error.message,
    });
  }
};

exports.deleteAsset = async (req, res) => {
  try {
    const { userId, actorId } = getUserIds(req);

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid asset ID.",
      });
    }

    const asset = await BusinessAsset.findOne({
      _id: req.params.id,
      userId,
      isDeleted: false,
    });

    if (!asset) {
      return res.status(404).json({
        success: false,
        message: "Asset not found.",
      });
    }

    asset.isDeleted = true;
    asset.isActive = false;
    asset.status = "removed";
    asset.updatedBy = actorId;

    await asset.save();

    res.json({
      success: true,
      message: "Asset deleted successfully.",
    });
  } catch (error) {
    console.error("Delete Business Asset Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to delete asset.",
      error: error.message,
    });
  }
};

exports.restoreAsset = async (req, res) => {
  try {
    const { userId, actorId } = getUserIds(req);

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid asset ID.",
      });
    }

    const asset = await BusinessAsset.findOne({
      _id: req.params.id,
      userId,
      isDeleted: true,
    });

    if (!asset) {
      return res.status(404).json({
        success: false,
        message: "Deleted asset not found.",
      });
    }

    const category = await validateCategory(asset.categoryId, userId);

    if (!category) {
      return res.status(400).json({
        success: false,
        message: "Restore the asset category first.",
      });
    }

    asset.isDeleted = false;
    asset.isActive = true;
    asset.status = "active";
    asset.updatedBy = actorId;

    await asset.save();

    res.json({
      success: true,
      message: "Asset restored successfully.",
      asset,
    });
  } catch (error) {
    console.error("Restore Business Asset Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to restore asset.",
      error: error.message,
    });
  }
};
