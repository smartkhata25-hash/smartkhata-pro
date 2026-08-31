const Traveler = require("../../models/Traveler");
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
  ensureCustomerBelongsToUser,
  ensureObjectId,
  escapeRegex,
  getListLimit,
  getUserId,
  hasOwn,
  nullableDate,
  sendControllerError,
} = require("./travelMasterHelpers");

const getTravelerPayload = async (body, userId, { partial = false } = {}) => {
  const payload = {};

  if (!partial || hasOwn(body, "fullName")) {
    const fullName = cleanString(body.fullName);

    if (!fullName) {
      throw createHttpError(400, "Traveler full name is required");
    }

    payload.fullName = fullName;
  }

  if (hasOwn(body, "customerId")) {
    payload.customerId = await ensureCustomerBelongsToUser(
      body.customerId,
      userId,
    );
  }

  if (hasOwn(body, "fatherOrHusbandName")) {
    payload.fatherOrHusbandName = cleanString(body.fatherOrHusbandName);
  }

  if (hasOwn(body, "gender")) {
    payload.gender = cleanString(body.gender);
  }

  if (hasOwn(body, "dateOfBirth")) {
    payload.dateOfBirth = nullableDate(body.dateOfBirth);
  }

  if (hasOwn(body, "nationality")) {
    payload.nationality = cleanString(body.nationality);
  }

  if (hasOwn(body, "cnic")) {
    payload.cnic = cleanString(body.cnic);
  }

  if (hasOwn(body, "passportNumber")) {
    payload.passportNumber = cleanUpperString(body.passportNumber);
  }

  if (hasOwn(body, "passportIssueDate")) {
    payload.passportIssueDate = nullableDate(body.passportIssueDate);
  }

  if (hasOwn(body, "passportExpiryDate")) {
    payload.passportExpiryDate = nullableDate(body.passportExpiryDate);
  }

  if (hasOwn(body, "passportCountry")) {
    payload.passportCountry = cleanString(body.passportCountry);
  }

  if (hasOwn(body, "mobile")) {
    payload.mobile = cleanString(body.mobile);
  }

  if (hasOwn(body, "email")) {
    payload.email = cleanString(body.email).toLowerCase();
  }

  if (hasOwn(body, "notes")) {
    payload.notes = cleanString(body.notes);
  }

  if (hasOwn(body, "isActive")) {
    payload.isActive = body.isActive !== false;
  }

  return payload;
};

exports.getTravelers = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { search = "", customerId = "", limit } = req.query;

    const query = applyActiveFilter({ userId }, req.query);

    if (customerId) {
      ensureObjectId(customerId, "customer ID");
      query.customerId = customerId;
    }

    const cleanSearch = cleanString(search);

    if (cleanSearch) {
      const safeSearch = escapeRegex(cleanSearch);

      query.$or = [
        { fullName: { $regex: safeSearch, $options: "i" } },
        { passportNumber: { $regex: safeSearch, $options: "i" } },
        { cnic: { $regex: safeSearch, $options: "i" } },
        { mobile: { $regex: safeSearch, $options: "i" } },
      ];
    }

    const travelers = await Traveler.find(query)
      .select(
        "customerId fullName fatherOrHusbandName gender dateOfBirth nationality cnic passportNumber passportIssueDate passportExpiryDate passportCountry mobile email notes isActive createdAt updatedAt",
      )
      .populate("customerId", "name phone")
      .sort({ updatedAt: -1, fullName: 1 })
      .limit(getListLimit(limit))
      .lean();

    return res.json(travelers);
  } catch (error) {
    return sendControllerError(res, error, "Traveler fetch failed");
  }
};

exports.createTraveler = async (req, res) => {
  try {
    const userId = getUserId(req);
    const payload = await getTravelerPayload(req.body, userId);

    const traveler = await Traveler.create({
      ...payload,
      userId,
    });

    await logActivity({
      req,
      action: "create",
      module: "travel.travelers",
      entityType: "Traveler",
      entityId: traveler._id,
      title: `Traveler ${traveler.fullName}`,
      description: `Traveler ${traveler.fullName} created`,
      after: traveler,
    });

    return res.status(201).json(traveler);
  } catch (error) {
    return sendControllerError(res, error, "Traveler create failed");
  }
};

exports.updateTraveler = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    ensureObjectId(id, "traveler ID");

    const traveler = await Traveler.findOne({
      _id: id,
      userId,
      isDeleted: false,
    });

    if (!traveler) {
      return res.status(404).json({ message: "Traveler not found" });
    }

    const before = traveler.toObject();
    const payload = await getTravelerPayload(req.body, userId, { partial: true });

    Object.assign(traveler, payload);

    await traveler.save();

    await logActivity({
      req,
      action: "update",
      module: "travel.travelers",
      entityType: "Traveler",
      entityId: traveler._id,
      title: `Traveler ${traveler.fullName}`,
      description: `Traveler ${traveler.fullName} updated`,
      before,
      after: traveler,
    });

    return res.json(traveler);
  } catch (error) {
    return sendControllerError(res, error, "Traveler update failed");
  }
};

exports.updateTravelerStatus = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    ensureObjectId(id, "traveler ID");

    const traveler = await Traveler.findOne({
      _id: id,
      userId,
      isDeleted: false,
    });

    if (!traveler) {
      return res.status(404).json({ message: "Traveler not found" });
    }

    const before = { isActive: traveler.isActive };

    traveler.isActive = req.body?.isActive !== false;

    await traveler.save();

    await logActivity({
      req,
      action: "update",
      module: "travel.travelers",
      entityType: "Traveler",
      entityId: traveler._id,
      title: `Traveler ${traveler.fullName}`,
      description: `Traveler ${traveler.fullName} status updated`,
      before,
      after: { isActive: traveler.isActive },
    });

    return res.json(traveler);
  } catch (error) {
    return sendControllerError(res, error, "Traveler status update failed");
  }
};

exports.deleteTraveler = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    ensureObjectId(id, "traveler ID");

    const traveler = await Traveler.findOne({
      _id: id,
      userId,
      isDeleted: false,
    });

    if (!traveler) {
      return res.status(404).json({ message: "Traveler not found" });
    }

    const before = traveler.toObject();

    applySoftDeleteFields(traveler, {
      actorId: req.actorId || userId,
      reason: getSoftDeleteReason(req),
    });

    await traveler.save();

    await logActivity({
      req,
      action: "delete",
      module: "travel.travelers",
      entityType: "Traveler",
      entityId: traveler._id,
      title: `Traveler ${traveler.fullName}`,
      description: `Traveler ${traveler.fullName} archived`,
      before,
      after: {
        isDeleted: traveler.isDeleted,
        isActive: traveler.isActive,
        deleteReason: traveler.deleteReason,
      },
    });

    return res.json({
      message: "Traveler archived successfully",
      traveler,
    });
  } catch (error) {
    return sendControllerError(res, error, "Traveler delete failed");
  }
};
