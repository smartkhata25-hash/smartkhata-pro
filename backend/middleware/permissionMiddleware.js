const { hasPermission } = require("../utils/permissionList");

const requirePermission = (...requiredPermissions) => {
  return (req, res, next) => {
    try {
      const accountRole = req.user?.accountRole;
      const permissions = req.user?.permissions || [];

      // Owner کو ہر اجازت حاصل ہوگی
      if (accountRole === "owner") {
        return next();
      }

      if (accountRole !== "staff") {
        return res.status(403).json({
          message: "Business access denied",
        });
      }

      if (requiredPermissions.length === 0) {
        return next();
      }

      const allowed = requiredPermissions.some((permission) =>
        hasPermission(permissions, permission),
      );

      if (!allowed) {
        return res.status(403).json({
          message: "You do not have permission to perform this action",
          requiredPermissions,
        });
      }

      next();
    } catch (error) {
      console.error("Permission middleware error:", error.message);

      return res.status(500).json({
        message: "Permission check failed",
      });
    }
  };
};

const requireAllPermissions = (...requiredPermissions) => {
  return (req, res, next) => {
    try {
      const accountRole = req.user?.accountRole;
      const permissions = req.user?.permissions || [];

      if (accountRole === "owner") {
        return next();
      }

      if (accountRole !== "staff") {
        return res.status(403).json({
          message: "Business access denied",
        });
      }

      const allowed = requiredPermissions.every((permission) =>
        hasPermission(permissions, permission),
      );

      if (!allowed) {
        return res.status(403).json({
          message: "You do not have all required permissions",
          requiredPermissions,
        });
      }

      next();
    } catch (error) {
      console.error("Permission middleware error:", error.message);

      return res.status(500).json({
        message: "Permission check failed",
      });
    }
  };
};

const ownerOnly = (req, res, next) => {
  if (req.user?.accountRole !== "owner") {
    return res.status(403).json({
      message: "Only business owner can perform this action",
    });
  }

  next();
};

module.exports = {
  requirePermission,
  requireAllPermissions,
  ownerOnly,
};
