const Employee = require("../models/Employee");
const { getModuleScopeFromRequest } = require("../services/employee/employeeAccountingService");

exports.save = async (req, res) => {
  if (getModuleScopeFromRequest(req) !== "weaving") return res.status(404).json({ message: "Not found" });
  const userId = req.user?.id || req.userId;
  const filter = { _id: req.params.id, userId, moduleScope: "weaving", isDeleted: false };
  let uploaded;
  const storage = require("../services/r2FileService");
  try {
    const employee = await Employee.findOne(filter);
    if (!employee) return res.status(404).json({ message: "Employee not found" });
    const previousKey = employee.photoKey;
    if (req.method !== "DELETE") {
      if (!req.file || !["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(req.file.mimetype)) return res.status(400).json({ message: "Select a JPG, PNG or WEBP photo." });
      if (req.file.size > 5 * 1024 * 1024) return res.status(400).json({ message: "Photo must be 5MB or less." });
      uploaded = await storage.uploadFile({ buffer: req.file.buffer, userId, moduleName: "weaving-employees", originalName: req.file.originalname, mimeType: req.file.mimetype });
    }
    const updated = await Employee.findOneAndUpdate({ ...filter, photoKey: employee.photoKey ? employee.photoKey : { $in: ["", null] } }, { $set: { photoKey: uploaded?.key || "", photoUrl: uploaded ? storage.getFileUrl(uploaded.key) : "" } }, { new: true });
    if (!updated) {
      if (uploaded) await storage.deleteFile(uploaded.key).catch(() => {});
      return res.status(409).json({ message: "Employee photo changed. Reload and try again." });
    }
    if (previousKey) await storage.deleteFile(previousKey).catch(() => {});
    return res.json({ data: { photoUrl: updated.photoUrl } });
  } catch (error) {
    if (uploaded) await storage.deleteFile(uploaded.key).catch(() => {});
    return res.status(400).json({ message: "Could not save the employee photo. Please try a valid image again." });
  }
};
