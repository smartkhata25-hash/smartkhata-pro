const TravelService = require("../../models/TravelService");
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
  ensureTravelCategoryBelongsToUser,
  ensureTravelCurrency,
  escapeRegex,
  getListLimit,
  getUserId,
  hasOwn,
  moneyNumber,
  sendControllerError,
} = require("./travelMasterHelpers");

const getServicePayload = async (body, userId, { partial = false } = {}) => {
  const payload = {};

  if (!partial || hasOwn(body, "name")) {
    const name = cleanString(body.name);

    if (!name) {
      throw createHttpError(400, "Travel service name is required");
    }

    payload.name = name;
  }

  if (!partial || hasOwn(body, "categoryId")) {
    payload.categoryId = await ensureTravelCategoryBelongsToUser(
      body.categoryId,
      userId,
    );
  }

  if (hasOwn(body, "code")) {
    payload.code = cleanUpperString(body.code);
  }

  if (hasOwn(body, "description")) {
    payload.description = cleanString(body.description);
  }

  if (hasOwn(body, "defaultSellingPrice")) {
    payload.defaultSellingPrice = moneyNumber(body.defaultSellingPrice);
  }

  if (hasOwn(body, "defaultSellingCurrency")) {
    payload.defaultSellingCurrency = ensureTravelCurrency(
      body.defaultSellingCurrency,
    );
  }

  if (hasOwn(body, "defaultCost")) {
    payload.defaultCost = moneyNumber(body.defaultCost);
  }

  if (hasOwn(body, "defaultCostCurrency")) {
    payload.defaultCostCurrency = ensureTravelCurrency(body.defaultCostCurrency);
  }

  if (hasOwn(body, "accountingMode")) {
    const accountingMode = cleanString(body.accountingMode) || "principal";

    if (!["principal", "commission"].includes(accountingMode)) {
      throw createHttpError(400, "Invalid accounting mode");
    }

    payload.accountingMode = accountingMode;
  }

  if (hasOwn(body, "isActive")) {
    payload.isActive = body.isActive !== false;
  }

  return payload;
};

exports.getTravelServices = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { search = "", categoryId = "", accountingMode = "", limit } = req.query;

    const query = applyActiveFilter({ userId }, req.query);

    if (categoryId) {
      ensureObjectId(categoryId, "category ID");
      query.categoryId = categoryId;
    }

    if (accountingMode) {
      query.accountingMode = accountingMode;
    }

    const cleanSearch = cleanString(search);

    if (cleanSearch) {
      const safeSearch = escapeRegex(cleanSearch);

      query.$or = [
        { name: { $regex: safeSearch, $options: "i" } },
        { code: { $regex: safeSearch, $options: "i" } },
        { description: { $regex: safeSearch, $options: "i" } },
      ];
    }

    const services = await TravelService.find(query)
      .select(
        "categoryId name code description defaultSellingPrice defaultSellingCurrency defaultCost defaultCostCurrency accountingMode isActive createdAt updatedAt",
      )
      .populate("categoryId", "name code isActive")
      .sort({ updatedAt: -1, name: 1 })
      .limit(getListLimit(limit))
      .lean();

    return res.json(services);
  } catch (error) {
    return sendControllerError(res, error, "Travel service fetch failed");
  }
};

exports.createTravelService = async (req, res) => {
  try {
    const userId = getUserId(req);
    const payload = await getServicePayload(req.body, userId);

    const service = await TravelService.create({
      ...payload,
      userId,
    });

    await service.populate("categoryId", "name code isActive");

    await logActivity({
      req,
      action: "create",
      module: "travel.services",
      entityType: "TravelService",
      entityId: service._id,
      title: `Travel service ${service.name}`,
      description: `Travel service ${service.name} created`,
      after: service,
    });

    return res.status(201).json(service);
  } catch (error) {
    return sendControllerError(res, error, "Travel service create failed");
  }
};

exports.updateTravelService = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    ensureObjectId(id, "service ID");

    const service = await TravelService.findOne({
      _id: id,
      userId,
      isDeleted: false,
    });

    if (!service) {
      return res.status(404).json({ message: "Travel service not found" });
    }

    const before = service.toObject();
    const payload = await getServicePayload(req.body, userId, { partial: true });

    Object.assign(service, payload);

    await service.save();
    await service.populate("categoryId", "name code isActive");

    await logActivity({
      req,
      action: "update",
      module: "travel.services",
      entityType: "TravelService",
      entityId: service._id,
      title: `Travel service ${service.name}`,
      description: `Travel service ${service.name} updated`,
      before,
      after: service,
    });

    return res.json(service);
  } catch (error) {
    return sendControllerError(res, error, "Travel service update failed");
  }
};

exports.updateTravelServiceStatus = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    ensureObjectId(id, "service ID");

    const service = await TravelService.findOne({
      _id: id,
      userId,
      isDeleted: false,
    });

    if (!service) {
      return res.status(404).json({ message: "Travel service not found" });
    }

    const before = { isActive: service.isActive };

    service.isActive = req.body?.isActive !== false;

    await service.save();
    await service.populate("categoryId", "name code isActive");

    await logActivity({
      req,
      action: "update",
      module: "travel.services",
      entityType: "TravelService",
      entityId: service._id,
      title: `Travel service ${service.name}`,
      description: `Travel service ${service.name} status updated`,
      before,
      after: { isActive: service.isActive },
    });

    return res.json(service);
  } catch (error) {
    return sendControllerError(res, error, "Travel service status update failed");
  }
};

exports.deleteTravelService = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    ensureObjectId(id, "service ID");

    const service = await TravelService.findOne({
      _id: id,
      userId,
      isDeleted: false,
    });

    if (!service) {
      return res.status(404).json({ message: "Travel service not found" });
    }

    const before = service.toObject();

    applySoftDeleteFields(service, {
      actorId: req.actorId || userId,
      reason: getSoftDeleteReason(req),
    });

    await service.save();
    await service.populate("categoryId", "name code isActive");

    await logActivity({
      req,
      action: "delete",
      module: "travel.services",
      entityType: "TravelService",
      entityId: service._id,
      title: `Travel service ${service.name}`,
      description: `Travel service ${service.name} archived`,
      before,
      after: {
        isDeleted: service.isDeleted,
        isActive: service.isActive,
        deleteReason: service.deleteReason,
      },
    });

    return res.json({
      message: "Travel service archived successfully",
      service,
    });
  } catch (error) {
    return sendControllerError(res, error, "Travel service delete failed");
  }
};
