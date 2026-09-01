const ActivityLog = require("../models/ActivityLog");

const getClientIp = (req) => {
  const forwarded = req.headers["x-forwarded-for"];

  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  return (
    req.headers["cf-connecting-ip"] ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    req.ip ||
    ""
  );
};

const cleanObject = (value) => {
  if (value === undefined || value === null) {
    return value ?? null;
  }

  try {
    if (typeof value.toObject === "function") {
      return value.toObject();
    }

    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return null;
  }
};

const logActivity = async ({
  req,
  action,
  module,
  moduleScope = "",
  entityType = "",
  entityId = null,
  title = "",
  description = "",
  billNo = "",
  before = null,
  after = null,
  metadata = {},
}) => {
  try {
    if (!req) {
      console.warn("Activity log skipped: request missing");
      return null;
    }

    const businessOwnerId =
      req.user?.businessOwnerId || req.user?.id || req.userId;

    const performedBy = req.actorId || req.user?.actorId || businessOwnerId;

    if (!businessOwnerId || !performedBy) {
      console.warn("Activity log skipped: user information missing");
      return null;
    }

    if (!action || !module) {
      console.warn("Activity log skipped: action or module missing");
      return null;
    }

    const cleanModule = String(module).trim().toLowerCase();

    const requestedScope = String(
      moduleScope || req.body?.moduleScope || req.query?.moduleScope || "",
    )
      .trim()
      .toLowerCase();

    const resolvedModuleScope =
      requestedScope === "travel" ||
      requestedScope === "trading" ||
      requestedScope === "both"
        ? requestedScope
        : req.originalUrl?.startsWith("/api/travel") ||
            cleanModule.startsWith("travel.")
          ? "travel"
          : "trading";

    const activity = await ActivityLog.create({
      businessOwnerId,
      performedBy,

      action: String(action).trim().toLowerCase(),
      module: cleanModule,
      moduleScope: resolvedModuleScope,

      entityType: entityType ? String(entityType).trim() : "",
      entityId: entityId || null,

      title: title ? String(title).trim() : "",
      description: description ? String(description).trim() : "",
      billNo: billNo ? String(billNo).trim() : "",

      before: cleanObject(before),
      after: cleanObject(after),
      metadata: cleanObject(metadata) || {},

      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"] || "",
      deviceId: req.headers["x-device-id"] || req.body?.deviceId || "",
    });

    return activity;
  } catch (error) {
    console.error("Activity Log Error:", error.message);
    return null;
  }
};

const createActivityLogger = ({
  action,
  module,
  entityType = "",
  getEntityId = null,
  getTitle = null,
  getDescription = null,
  getBillNo = null,
  getMetadata = null,
}) => {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);

    res.json = async (body) => {
      try {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          const entityId =
            typeof getEntityId === "function" ? getEntityId(req, body) : null;

          const title =
            typeof getTitle === "function" ? getTitle(req, body) : "";

          const description =
            typeof getDescription === "function"
              ? getDescription(req, body)
              : "";

          const billNo =
            typeof getBillNo === "function" ? getBillNo(req, body) : "";

          const metadata =
            typeof getMetadata === "function" ? getMetadata(req, body) : {};

          await logActivity({
            req,
            action,
            module,
            entityType,
            entityId,
            title,
            description,
            billNo,
            metadata,
          });
        }
      } catch (error) {
        console.error("Activity middleware error:", error.message);
      }

      return originalJson(body);
    };

    next();
  };
};

module.exports = {
  logActivity,
  createActivityLogger,
};
