const Department = require("../../models/WeavingDepartment");
const Designation = require("../../models/EmployeeDesignation");
const Shift = require("../../models/WeavingShift");
const mongoose = require("mongoose");
const scope = "weaving";
const fail = (message) => Object.assign(new Error(message), { statusCode: 400 });
const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const defaults = [
  ["Management / Administration", ["Administration", "Management"], "General Manager|Assistant General Manager|Factory Manager|Production Manager|Admin Manager|Office Manager|Supervisor|Office Assistant"],
  ["Accounts / Finance", ["Accounts", "Finance"], "Accounts Manager|Accountant|Assistant Accountant|Cashier"],
  ["HR / Time Office", ["HR", "Time Office"], "HR Manager|HR Officer|Time Keeper|Attendance Clerk"],
  ["Weaving / Production", ["Weaving", "Production"], "Weaving Manager|Weaving Master|Shift Incharge|Foreman|Loom Supervisor|Weaver|Loom Operator|Loom Fixer|Oil Man|Helper"],
  ["Beam / Warping / Knotting", ["Beam / Loading", "Beam Knotting", "Knotting", "Warping"], "Beam Master|Warping Operator|Beamer|Creeler|Beam Knotting Worker|Beam Loader|Helper"],
  ["Sizing", [], "Sizing Manager|Sizing Incharge|Sizing Master|Sizing Operator|Sizing Helper"],
  ["Winding / Preparation", ["Winding", "Preparation"], "Winding Incharge|Winder|Rewinder|Helper"],
  ["Quality / Fabric Checking", ["Quality", "Quality Control", "Fabric Checking"], "Quality Manager|Quality Incharge|Quality Inspector|Fabric Checker|Meter Checker"],
  ["Electrical", [], "Electrical Supervisor|Electrician|Electrician Helper"],
  ["Mechanical / Maintenance", ["Mechanical", "Maintenance"], "Maintenance Manager|Mechanical Supervisor|Mechanic|Fitter|Welder|Carpenter|Maintenance Helper"],
  ["Store / Inventory", ["Store", "Stores", "Inventory"], "Store Incharge|Store Keeper|Store Assistant"],
  ["Yarn / Godown", ["Yarn", "Godown"], "Godown Incharge|Yarn Store Keeper|Yarn Checker|Loader|Helper"],
  ["Folding / Packing", ["Folding", "Packing"], "Folding Incharge|Folding Worker|Packing Incharge|Packing Worker|Packing Helper"],
  ["Dispatch / Loading", ["Dispatch", "Loading"], "Dispatch Incharge|Dispatch Clerk|Loader|Driver"],
  ["Purchase / Procurement", ["Purchase", "Procurement"], "Purchase Manager|Purchase Officer|Purchase Assistant"],
  ["Sales / Marketing", ["Sales", "Marketing"], "Sales Manager|Sales Officer|Marketing Officer"],
  ["Security", [], "Security Supervisor|Security Guard|Gate Keeper"],
  ["Cleaning / General Labour", ["Cleaning", "General Labour", "General Labor"], "Cleaner|Sweeper|General Labour|Helper|Temporary Worker"],
];

async function ensureRecord(Model, records, userId, name, aliases = [], extra = {}) {
  const defaultKey = normalize(name);
  const names = [name, ...aliases].map(normalize);
  let record = records.find((row) => row.defaultKey === defaultKey || names.includes(normalize(row.name)));
  if (record) {
    // Remember identity across later user renames; do not reactivate or rename.
    if (!record.defaultKey) await Model.updateOne({ _id: record._id, defaultKey: { $exists: false } }, { $set: { defaultKey } });
    return record;
  }
  try {
    record = await Model.findOneAndUpdate({ userId, moduleScope: scope, normalizedName: name.toLowerCase() }, { $setOnInsert: { userId, moduleScope: scope, name, normalizedName: name.toLowerCase(), defaultKey, isActive: true, isDeleted: false, ...extra } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
    record = await Model.findOne({ userId, moduleScope: scope, normalizedName: name.toLowerCase() });
    if (!record) throw error;
  }
  records.push(record);
  return record;
}

async function seed(userId) {
  // Include hidden/deleted records so seeding cannot resurrect them.
  const departments = await Department.find({ userId, moduleScope: scope }).lean();
  const designations = await Designation.find({ userId, moduleScope: scope }).lean();
  const shifts = await Shift.find({ userId, moduleScope: scope }).lean();
  const roles = new Map();
  for (const [name, aliases, names] of defaults) {
    const department = await ensureRecord(Department, departments, userId, name, aliases);
    for (const role of names.split("|")) roles.set(role, [...(roles.get(role) || []), department._id]);
  }
  roles.set("Temporary Worker", departments.map((row) => row._id));
  for (const [name, departmentIds] of roles) {
    const row = await ensureRecord(Designation, designations, userId, name, [], { departmentIds });
    // Only initialize unmapped legacy defaults; explicit user mappings (even []) win.
    await Designation.updateOne({ _id: row._id, departmentIds: { $exists: false } }, { $set: { departmentIds } });
  }
  await ensureRecord(Shift, shifts, userId, "General Shift", ["Day Shift"], { startTime: "08:00", endTime: "20:00" });
  await ensureRecord(Shift, shifts, userId, "Night Shift", [], { startTime: "20:00", endTime: "08:00" });
}

async function designationPayload(userId, payload) {
  if (!Array.isArray(payload.departmentIds) || !payload.departmentIds.length || payload.departmentIds.some((id) => !mongoose.isValidObjectId(id))) throw fail("Select at least one Department for this Designation.");
  const departmentIds = [...new Set(payload.departmentIds.map(String))];
  const count = await Department.countDocuments({ userId, moduleScope: scope, _id: { $in: departmentIds } });
  if (count !== departmentIds.length) throw fail("Select valid Departments.");
  return { departmentIds, isActive: payload.isActive !== false };
}

function validateEmployee(payload, designation, department, existing) {
  if (!designation) throw fail("Designation is required");
  const unchanged = existing && String(existing.designationId) === String(designation._id) && String(existing.departmentId) === String(department._id);
  if (!unchanged && !(designation.departmentIds || []).some((id) => String(id) === String(department._id))) throw fail("Select a Designation linked to the selected Department.");
  const date = String(payload.joiningDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw fail("Salary Start / Joining Date is required and must be valid.");
  if (!["monthly", "daily"].includes(payload.salaryType)) throw fail("Select a Salary Type.");
  if (!(Number(payload.dutyHours) > 0 && Number(payload.dutyHours) <= 24)) throw fail("Duty Hours must be greater than zero and no more than 24.");
  const knotting = designation.name === "Beam Knotting Worker";
  const method = knotting ? payload.knottingPaymentMethod || "monthly" : "monthly";
  if (!["per_beam", "per_set"].includes(method) && !(Number.isFinite(Number(payload.baseSalary)) && Number(payload.baseSalary) >= 0.01)) throw fail("Salary / Rate must be greater than zero.");
  if (knotting && !["monthly", "fixed_monthly"].includes(method) && !(Number.isFinite(Number(payload.knottingDefaultRate)) && Number(payload.knottingDefaultRate) >= 0.01)) throw fail("Default Knotting Rate must be greater than zero.");
}

const pendingSeeds = new Map();
const ensureDefaults = (userId) => {
  const key = String(userId);
  if (!pendingSeeds.has(key)) pendingSeeds.set(key, seed(userId).finally(() => pendingSeeds.delete(key)));
  return pendingSeeds.get(key);
};
module.exports = { seed: ensureDefaults, designationPayload, validateEmployee, defaults };
