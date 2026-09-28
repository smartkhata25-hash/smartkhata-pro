const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const mongoose = require("mongoose");
let rows = {}, idCounter = 10;
const uid = "000000000000000000000001";
const nextId = () => (++idCounter).toString(16).padStart(24, "0");
const match = (row, filter) => Object.entries(filter).every(([key, value]) => {
  if (value && typeof value === "object") {
    if ("$exists" in value) return (row[key] !== undefined) === value.$exists;
    if ("$in" in value) return value.$in.some((id) => String(row[key] ?? '') === String(id ?? ''));
    if ("$ne" in value) return String(row[key]) !== String(value.$ne);
    if (typeof value.test === "function") return value.test(row[key] || "");
  }
  return String(row[key]) === String(value);
});
const query = (value) => ({ select() { return this; }, sort() { return this; }, lean() { return this; }, session() { return this; }, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });
const models = {};
const model = (name) => models[name] ||= {
  find: (filter) => query((rows[name] || []).filter((row) => match(row, filter))),
  findOne: (filter) => query((rows[name] || []).find((row) => match(row, filter))),
  countDocuments: async (filter) => (rows[name] || []).filter((row) => match(row, filter)).length,
  async updateOne(filter, update) { const row = (rows[name] || []).find((row) => match(row, filter)); if (row) Object.assign(row, update.$set); },
  async findOneAndUpdate(filter, update, options) {
    let row = (rows[name] || []).find((value) => match(value, filter));
    if (!row && options?.upsert) { row = { _id: nextId(), ...filter, ...update.$setOnInsert }; (rows[name] ||= []).push(row); }
    if (row) Object.assign(row, update.$set || {});
    return row;
  },
};
const load = (file, requireFake, append = "") => {
  const sandbox = { module: { exports: {} }, exports: {}, require: requireFake, console };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, file), "utf8") + append, sandbox);
  return sandbox.module.exports;
};
const master = load("../services/employee/weavingEmployeeMasterService.js", (name) => name === "mongoose" ? mongoose : model(path.basename(name)));
const controller = load("../controllers/employeeController.js", (name) => {
  if (name === "mongoose") return mongoose;
  if (name.startsWith("../models/")) return model(path.basename(name));
  if (name.endsWith("weavingEmployeeMasterService")) return master;
  if (name.endsWith("employeeAccountingService")) return { createHttpError: (message, statusCode) => Object.assign(new Error(message), { statusCode }), getSessionQuery: (q) => q, roundMoney: (v) => Math.round((Number(v) || 0) * 100) / 100 };
  return {};
}, "\nmodule.exports.testPayload = buildEmployeePayload; module.exports.testShift = buildShiftPayload;");
(async () => {
  rows.WeavingDepartment = [{ _id: nextId(), userId: uid, moduleScope: "weaving", name: "  wEAVING  ", normalizedName: "weaving", isActive: false, isDeleted: true }];
  await Promise.all([master.seed(uid), master.seed(uid)]);
  assert.strictEqual(rows.WeavingDepartment.length, 18);
  const counts = Object.fromEntries(Object.entries(rows).map(([key, values]) => [key, values.length]));
  const hidden = rows.WeavingDepartment[0];
  assert(hidden.isDeleted && !hidden.isActive);
  hidden.name = "Custom renamed department";
  const helper = rows.EmployeeDesignation.find((row) => row.name === "Helper");
  assert(helper.departmentIds.length > 1);
  helper.departmentIds = [];
  rows.WeavingShift[0].isDeleted = true;
  await master.seed(uid);
  assert.deepStrictEqual(Object.fromEntries(Object.entries(rows).map(([key, values]) => [key, values.length])), counts);
  assert.strictEqual(helper.departmentIds.length, 0, "user mappings stay unchanged");
  assert(rows.WeavingShift[0].isDeleted);
  const department = rows.WeavingDepartment.find((row) => row.name === "Accounts / Finance");
  const designation = rows.EmployeeDesignation.find((row) => row.name === "Accountant");
  const shift = rows.WeavingShift.find((row) => !row.isDeleted);
  const unit = { _id: nextId(), userId: uid, moduleScope: "weaving", unitNo: 1, name: "Main", isActive: true, isDeleted: false };
  rows.WeavingUnit = [unit];
  const form = { phone: "03001234567", unitId: unit._id, departmentId: department._id, designationId: designation._id, shiftId: shift._id, salaryType: "monthly", baseSalary: 45000, dutyHours: 8, joiningDate: "2026-09-01" };
  const build = (payload, existing, moduleScope = "weaving") => controller.testPayload({ userId: uid, moduleScope, payload, existing, employeeId: existing?._id });
  const valid = await build(form);
  assert.strictEqual(valid.name, "EMP-001");
  assert.strictEqual(valid.fatherName, "");
  assert.strictEqual(valid.cnic, "");
  for (const field of ["phone", "unitId", "departmentId", "designationId", "shiftId", "joiningDate", "salaryType"]) await assert.rejects(build({ ...form, [field]: "" }));
  for (const salaryType of ["monthly", "daily"]) await assert.rejects(build({ ...form, salaryType, baseSalary: 0 }), /Salary/);
  for (const dutyHours of ["", 0, -1, 25, "invalid"]) {
    await assert.rejects(build({ ...form, dutyHours }), /Duty/);
    await assert.rejects(build({ ...form, dutyHours }, { ...valid, _id: nextId() }), /Duty/);
  }
  await assert.rejects(build({ ...form, joiningDate: "2026-02-31" }), /Joining Date/);
  await assert.rejects(build({ ...form, cnic: "invalid" }), /CNIC/);
  await assert.rejects(build({ ...form, departmentId: hidden._id }), /Department/);
  const another = rows.WeavingDepartment.find((row) => row.name === "Sizing");
  await assert.rejects(build({ ...form, departmentId: another._id }), /linked/);
  // Existing hidden/unmapped references remain editable without remapping history.
  designation.departmentIds = []; designation.isActive = false; department.isActive = false; shift.isActive = false; unit.isActive = false;
  const existing = { ...valid, _id: nextId(), employeeNo: "EMP-099", account: "original-account" };
  assert.strictEqual((await build(form, existing)).employeeNo, "EMP-099");
  await assert.rejects(build(form), /not found/);
  for (const row of [designation, department, shift, unit]) row.isActive = true;
  designation.departmentIds = [department._id];
  const temp = rows.EmployeeDesignation.find((row) => row.name === "Temporary Worker");
  const temporary = await build({ ...form, designationId: temp._id, salaryType: "daily", baseSalary: 1800, employmentType: "temporary" });
  assert.strictEqual(temporary.employmentType, "temporary");
  assert.strictEqual(temporary.salaryType, "daily");
  const knotter = rows.EmployeeDesignation.find((row) => row.name === "Beam Knotting Worker");
  const knotting = { ...form, departmentId: knotter.departmentIds[0], designationId: knotter._id };
  for (const method of ["per_beam", "per_set", "monthly_per_beam", "monthly_per_set"]) {
    const piece = method.startsWith("per_");
    assert.strictEqual((await build({ ...knotting, knottingPaymentMethod: method, baseSalary: piece ? 0 : 10000, knottingDefaultRate: 500 })).baseSalary, piece ? 0 : 10000);
    await assert.rejects(build({ ...knotting, knottingPaymentMethod: method, knottingDefaultRate: 0 }), /Knotting Rate/);
    if (!piece) await assert.rejects(build({ ...knotting, knottingPaymentMethod: method, baseSalary: 0, knottingDefaultRate: 500 }), /Salary/);
  }
  for (const scope of ["trading", "travel"]) {
    await assert.rejects(build({ name: "" }, null, scope), /name is required/);
    const other = await build({ name: "Other module", baseSalary: 0 }, null, scope);
    assert.strictEqual(other.name, "Other module");
    assert.strictEqual(other.baseSalary, 0);
  }
  const overnight = controller.testShift({ name: "Night", startTime: "20:00", endTime: "08:00" });
  assert.strictEqual(overnight.startTime, "20:00"); assert.strictEqual(overnight.endTime, "08:00");
  assert.throws(() => controller.testShift({ name: "Bad", startTime: "25:00", endTime: "08:00" }), /valid Shift time/);
  // Photo endpoint scope, upload, replacement, removal and independent failure.
  let uploaded = 0, deleted = [], failUpload = false;
  rows.Employee = [{ _id: nextId(), userId: uid, moduleScope: "weaving", isDeleted: false, name: "EMP-100", account: "original-account" }];
  const photos = load("../controllers/weavingEmployeePhotoController.js", (name) => {
    if (name.endsWith("Employee")) return model("Employee");
    if (name.endsWith("employeeAccountingService")) return { getModuleScopeFromRequest: (req) => req.scope };
    return { uploadFile: async () => { if (failUpload) throw Error("offline"); return { key: `photo-${++uploaded}` }; }, getFileUrl: (key) => `https://images/${key}`, deleteFile: async (key) => deleted.push(key) };
  });
  const request = { userId: uid, scope: "weaving", method: "POST", params: { id: rows.Employee[0]._id }, file: { mimetype: "image/png", size: 100, buffer: Buffer.from("image") } };
  const call = async (req) => { const result = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; await photos.save(req, result); return result; };
  assert.strictEqual((await call(request)).statusCode, 200);
  assert.strictEqual((await call(request)).statusCode, 200);
  assert.deepStrictEqual(deleted, ["photo-1"]);
  failUpload = true;
  assert.strictEqual((await call(request)).statusCode, 400);
  assert.strictEqual(rows.Employee[0].photoKey, "photo-2");
  assert.strictEqual((await call({ ...request, method: "DELETE" })).statusCode, 200);
  assert.strictEqual(rows.Employee[0].photoUrl, "");
  assert.strictEqual(rows.Employee[0].account, "original-account");
  assert.strictEqual((await call({ ...request, scope: "travel" })).statusCode, 404);
  assert.strictEqual((await call({ ...request, file: { mimetype: "application/pdf" } })).statusCode, 400);
  console.log("Weaving Employee Master: defaults, hidden references, mapping, full/temporary validation, shared-module isolation, shifts and photo lifecycle passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
