const AuditLog = require("../models/AuditLog");

const logAudit = async ({
  userId,
  action,
  entityType,
  entityId,
  before,
  after,
}) => {
  await AuditLog.create({
    userId,
    action,
    entityType,
    entityId,
    before,
    after,
  });
};

module.exports = { logAudit };
