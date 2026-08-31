const TravelServiceCategory = require("../../models/TravelServiceCategory");
const { logActivity } = require("../../utils/activityLogger");
const {
  applySoftDeleteFields,
  getSoftDeleteReason,
} = require("../../services/travel/travelSoftDeleteService");
const {
  applyActiveFilter,
  cleanString,
  cleanUpperString,
  createHttpError,
  ensureObjectId,
  escapeRegex,
  getListLimit,
  getUserId,
  hasOwn,
  sendControllerError,
} = require("./travelMasterHelpers");

const getCategoryPayload = (body, { partial = false } = {}) => {
  const payload = {};

  if (!partial || hasOwn(body, "name")) {
    const name = cleanString(body.name);

    if (!name) {
      throw createHttpError(400, "Travel service category name is required");
    }

    payload.name = name;
  }

  if (hasOwn(body, "code")) {
    payload.code = cleanUpperString(body.code);
  }

  if (hasOwn(body, "description")) {
    payload.description = cleanString(body.description);
  }

  if (hasOwn(body, "iconKey")) {
    payload.iconKey = cleanString(body.iconKey).toLowerCase();
  }

  if (hasOwn(body, "sortOrder")) {
    payload.sortOrder = Number(body.sortOrder) || 0;
  }

  if (hasOwn(body, "isActive")) {
    payload.isActive = body.isActive !== false;
  }

  return payload;
};

exports.getTravelServiceCategories = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { search = "", limit } = req.query;

    const query = applyActiveFilter({ userId }, req.query);
    const cleanSearch = cleanString(search);

    if (cleanSearch) {
      const safeSearch = escapeRegex(cleanSearch);

      query.$or = [
        { name: { $regex: safeSearch, $options: "i" } },
        { code: { $regex: safeSearch, $options: "i" } },
        { description: { $regex: safeSearch, $options: "i" } },
      ];
    }

    const categories = await TravelServiceCategory.find(query)
      .select("name code description iconKey sortOrder isActive createdAt updatedAt")
      .sort({ sortOrder: 1, name: 1 })
      .limit(getListLimit(limit))
      .lean();

    return res.json(categories);
  } catch (error) {
    return sendControllerError(
      res,
      error,
      "Travel service category fetch failed",
    );
  }
};

exports.createTravelServiceCategory = async (req, res) => {
  try {
    const userId = getUserId(req);
    const payload = getCategoryPayload(req.body);

    const category = await TravelServiceCategory.create({
      ...payload,
      userId,
    });

    await logActivity({
      req,
      action: "create",
      module: "travel.services",
      entityType: "TravelServiceCategory",
      entityId: category._id,
      title: `Travel category ${category.name}`,
      description: `Travel service category ${category.name} created`,
      after: category,
    });

    return res.status(201).json(category);
  } catch (error) {
    return sendControllerError(
      res,
      error,
      "Travel service category create failed",
    );
  }
};

exports.updateTravelServiceCategory = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    ensureObjectId(id, "category ID");

    const category = await TravelServiceCategory.findOne({
      _id: id,
      userId,
      isDeleted: false,
    });

    if (!category) {
      return res.status(404).json({ message: "Travel service category not found" });
    }

    const before = category.toObject();
    const payload = getCategoryPayload(req.body, { partial: true });

    Object.assign(category, payload);

    await category.save();

    await logActivity({
      req,
      action: "update",
      module: "travel.services",
      entityType: "TravelServiceCategory",
      entityId: category._id,
      title: `Travel category ${category.name}`,
      description: `Travel service category ${category.name} updated`,
      before,
      after: category,
    });

    return res.json(category);
  } catch (error) {
    return sendControllerError(
      res,
      error,
      "Travel service category update failed",
    );
  }
};

exports.updateTravelServiceCategoryStatus = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    ensureObjectId(id, "category ID");

    const category = await TravelServiceCategory.findOne({
      _id: id,
      userId,
      isDeleted: false,
    });

    if (!category) {
      return res.status(404).json({ message: "Travel service category not found" });
    }

    const before = { isActive: category.isActive };

    category.isActive = req.body?.isActive !== false;

    await category.save();

    await logActivity({
      req,
      action: "update",
      module: "travel.services",
      entityType: "TravelServiceCategory",
      entityId: category._id,
      title: `Travel category ${category.name}`,
      description: `Travel service category ${category.name} status updated`,
      before,
      after: { isActive: category.isActive },
    });

    return res.json(category);
  } catch (error) {
    return sendControllerError(
      res,
      error,
      "Travel service category status update failed",
    );
  }
};

exports.deleteTravelServiceCategory = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    ensureObjectId(id, "category ID");

    const category = await TravelServiceCategory.findOne({
      _id: id,
      userId,
      isDeleted: false,
    });

    if (!category) {
      return res.status(404).json({ message: "Travel service category not found" });
    }

    const before = category.toObject();

    applySoftDeleteFields(category, {
      actorId: req.actorId || userId,
      reason: getSoftDeleteReason(req),
    });

    await category.save();

    await logActivity({
      req,
      action: "delete",
      module: "travel.services",
      entityType: "TravelServiceCategory",
      entityId: category._id,
      title: `Travel category ${category.name}`,
      description: `Travel service category ${category.name} archived`,
      before,
      after: {
        isDeleted: category.isDeleted,
        isActive: category.isActive,
        deleteReason: category.deleteReason,
      },
    });

    return res.json({
      message: "Travel service category archived successfully",
      category,
    });
  } catch (error) {
    return sendControllerError(
      res,
      error,
      "Travel service category delete failed",
    );
  }
};
