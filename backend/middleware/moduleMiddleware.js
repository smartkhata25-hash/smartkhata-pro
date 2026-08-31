const { isModuleEnabled, KNOWN_MODULES } = require("../utils/moduleConfig");

const requireModule = (moduleKey) => (req, res, next) => {
  if (!KNOWN_MODULES.includes(moduleKey)) {
    return res.status(500).json({
      msg: "Invalid module configuration",
    });
  }

  if (!isModuleEnabled(req.user, moduleKey)) {
    return res.status(403).json({
      msg: "This business module is not enabled",
    });
  }

  return next();
};

module.exports = {
  requireModule,
};
