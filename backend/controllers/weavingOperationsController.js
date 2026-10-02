const { attachLoomRuns, contractProgress, assertContractIdentityEdit } = require("../services/weaving/weavingProductionContextService");
const mongoose = require("mongoose");

const WeavingContract = require("../models/WeavingContract");
const Counter = require("../models/Counter");
const WeavingFabricQuality = require("../models/WeavingFabricQuality");
const WeavingGodown = require("../models/WeavingGodown");
const weavingSettingsService = require("../services/weaving/weavingSettingsService");
const WeavingLoom = require("../models/WeavingLoom");
const WeavingParty = require("../models/WeavingParty");
const WeavingStockTransaction = require("../models/WeavingStockTransaction");
const WeavingYarn = require("../models/WeavingYarn");
const { logActivity } = require("../utils/activityLogger");
const { kgFromInput } = require("../services/weaving/weavingOperationsUtils");
const { markWeavingCostingDirty } = require("../services/weaving/weavingCostingService");
const {
  listMasterOptions,
  quickAddMasterOption,
} = require("../services/weaving/weavingMasterOptionService");

const clean = (value = "") => String(value || "").trim();
const number = (value, label, { positive = false } = {}) => {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed < 0 || (positive && parsed <= 0)) {
    const error = new Error(`${label} must be ${positive ? "greater than zero" : "zero or greater"}`);
    error.statusCode = 400;
    throw error;
  }
  return Math.round(parsed * 1000000) / 1000000;
};
const userId = (req) => req.user?.id || req.userId;
const fail = (res, error, fallback) => {
  if (error?.code === 11000) return res.status(409).json({ message: "A record with this number or name already exists." });
  return res.status(error.statusCode || 500).json({ message: error.message || fallback });
};
const required = (value, label) => {
  const result = clean(value);
  if (!result) {
    const error = new Error(`${label} is required`);
    error.statusCode = 400;
    throw error;
  }
  return result;
};
const packagingProfiles = (body = {}) => {
  const source = Array.isArray(body.packagingProfiles) && body.packagingProfiles.length ? body.packagingProfiles : [{ packageType: body.defaultPackageType || "bag", packageWeight: body.packageWeight ?? 100, largeConesPerPackage: body.largeConesPerPackage ?? 24, smallConesPerPackage: body.smallConesPerPackage ?? 40 }];
  const profiles = [], seen = new Set();
  source.forEach((profile) => {
    const packageType = clean(profile.packageType).toLowerCase();
    if (!packageType || seen.has(packageType)) return;
    seen.add(packageType);
    profiles.push({ packageType, packageWeight: number(profile.packageWeight ?? 100, "Package weight"), largeConesPerPackage: number(profile.largeConesPerPackage ?? 24, "Large cones per package"), smallConesPerPackage: number(profile.smallConesPerPackage ?? 40, "Small cones per package") });
  });
  return profiles.length ? profiles : [{ packageType: "bag", packageWeight: 100, largeConesPerPackage: 24, smallConesPerPackage: 40 }];
};
const canonicalQuantity = (row, unit) => {
  if (unit !== "KG") return number(row.quantity, "Opening stock");
  const enteredUnit = row.sourceEntryUnit === "LBS" ? "LBS" : "KG";
  const value = kgFromInput({
    kg: row.kg ?? row.quantity,
    lbs: row.lbs ?? row.quantity,
    sourceEntryUnit: enteredUnit,
  });
  return number(value, "Opening stock");
};

const loadOpening = async (ownerId, itemType, itemIds) => {
  const rows = await WeavingStockTransaction.find({
    userId: ownerId,
    itemType,
    itemId: { $in: itemIds },
    transactionType: "opening",
  }).populate("godownId", "name").lean();
  return rows.reduce((map, row) => {
    const key = String(row.itemId);
    (map[key] ||= []).push(row);
    return map;
  }, {});
};

const reconcileOpening = async ({ ownerId, itemType, itemId, unit, rate, rows = [] }) => {
  const normalized = rows
    .map((row) => ({
      godownId: row.godownId,
      quantity: canonicalQuantity(row, unit),
      sourceEntryUnit: unit === "KG" && row.sourceEntryUnit === "LBS" ? "LBS" : unit,
      packageType: itemType === "yarn" ? clean(row.packageType).toLowerCase() : "",
      packageQty: itemType === "yarn" ? number(row.packageQty, "Package quantity") : 0,
      smallCones: itemType === "yarn" ? number(row.smallCones, "Small cones") : 0,
      largeCones: itemType === "yarn" ? number(row.largeCones, "Large cones") : 0,
    }))
    .filter((row) => row.quantity > 0);

  const ids = normalized.map((row) => String(row.godownId));
  if (new Set(ids).size !== ids.length) {
    const error = new Error("Select each Godown only once");
    error.statusCode = 400;
    throw error;
  }
  if (normalized.some((row) => !mongoose.Types.ObjectId.isValid(row.godownId))) {
    const error = new Error("Godown is required when opening stock is entered");
    error.statusCode = 400;
    throw error;
  }
  if (normalized.length) {
    const count = await WeavingGodown.countDocuments({
      _id: { $in: normalized.map((row) => row.godownId) }, userId: ownerId, isActive: true,
    });
    if (count !== normalized.length) {
      const error = new Error("One or more selected Godowns are invalid");
      error.statusCode = 400;
      throw error;
    }
  }

  await Promise.all(normalized.map((row) => WeavingStockTransaction.findOneAndUpdate(
    { userId: ownerId, itemType, itemId, godownId: row.godownId, transactionType: "opening" },
    { $set: { quantity: row.quantity, unit, rate, sourceEntryUnit: row.sourceEntryUnit, packageType: row.packageType, packageQty: row.packageQty, smallCones: row.smallCones, largeCones: row.largeCones } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )));
  await WeavingStockTransaction.deleteMany({
    userId: ownerId, itemType, itemId, transactionType: "opening",
    ...(ids.length ? { godownId: { $nin: ids } } : {}),
  });
};

const masterConfig = {
  yarn: {
    Model: WeavingYarn,
    itemType: "yarn",
    label: "Yarn",
    payload: (body) => {
      const profiles = packagingProfiles(body);
      const defaultProfile = profiles.find((profile) => profile.packageType === (clean(body.defaultPackageType).toLowerCase() || "bag")) || profiles[0];
      return {
      name: required(body.name, "Yarn Name"), count: required(body.count, "Count"),
      quality: clean(body.quality), millBrand: clean(body.millBrand), lotReference: clean(body.lotReference), stockUnit: "KG",
      openingRate: number(body.openingRate, "Opening rate"), notes: clean(body.notes),
      defaultPackageType: defaultProfile.packageType,
      packagingProfiles: profiles,
      packageWeight: defaultProfile.packageWeight,
      packageWeightUnit: "LBS",
      largeConesPerPackage: defaultProfile.largeConesPerPackage,
      smallConesPerPackage: defaultProfile.smallConesPerPackage,
      isActive: body.isActive !== false,
      };
    },
    unit: () => "KG",
  },
  fabric: {
    Model: WeavingFabricQuality,
    itemType: "fabric",
    label: "Fabric Quality",
    payload: (body) => {
      const primaryUnit = ["Meter", "Yard", "KG"].includes(body.primaryUnit) ? body.primaryUnit : "Meter";
      return {
        name: required(body.name, "Quality Name"), code: clean(body.code), construction: clean(body.construction),
        width: clean(body.width), weave: clean(body.weave), warpCount: clean(body.warpCount), weftCount: clean(body.weftCount), brand: clean(body.brand), cadReference: clean(body.cadReference), primaryUnit, openingRate: number(body.openingRate, "Opening rate"),
        notes: clean(body.notes), isActive: body.isActive !== false,
      };
    },
    unit: (payload) => payload.primaryUnit,
  },
};

exports.listMaster = async (req, res) => {
  try {
    const config = masterConfig[req.params.kind];
    if (!config) return res.status(404).json({ message: "Master not found" });
    const query = { userId: userId(req) };
    if (req.query.active === "true" || req.query.active === "false") query.isActive = req.query.active === "true";
    if (req.query.unit && req.params.kind === "fabric") query.primaryUnit = req.query.unit;
    const search = clean(req.query.search);
    if (search) query.$or = ["name", "code", "quality", "count", "millBrand", "lotReference", "construction", "width", "weave", "warpCount", "weftCount", "brand", "cadReference"].map((field) => ({ [field]: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } }));
    const records = await config.Model.find(query).sort({ name: 1 }).lean();
    const opening = await loadOpening(userId(req), config.itemType, records.map((row) => row._id));
    return res.json({ data: records.map((row) => ({ ...row, openingStock: opening[String(row._id)] || [] })) });
  } catch (error) { return fail(res, error, "Failed to load master data"); }
};

const saveMaster = async (req, res, editing) => {
  const config = masterConfig[req.params.kind];
  if (!config) return res.status(404).json({ message: "Master not found" });
  const ownerId = userId(req);
  const payload = config.payload(req.body);
  const record = editing
    ? await config.Model.findOneAndUpdate({ _id: req.params.id, userId: ownerId }, { $set: payload }, { new: true })
    : await config.Model.create({ ...payload, userId: ownerId });
  if (!record) return res.status(404).json({ message: `${config.label} not found` });
  await reconcileOpening({ ownerId, itemType: config.itemType, itemId: record._id, unit: config.unit(payload), rate: payload.openingRate, rows: req.body.openingStock });
  try {
    await markWeavingCostingDirty(ownerId, "opening_stock");
  } catch (error) {
    console.error("Failed to mark Weaving costing dirty", error);
  }
  await logActivity({ req, action: editing ? "update" : "create", module: `weaving.${config.itemType}`, moduleScope: "weaving", entityType: record.constructor.modelName, entityId: record._id, title: record.name });
  return res.status(editing ? 200 : 201).json({ data: record });
};
exports.createMaster = async (req, res) => { try { return await saveMaster(req, res, false); } catch (error) { return fail(res, error, "Failed to create master record"); } };
exports.updateMaster = async (req, res) => { try { return await saveMaster(req, res, true); } catch (error) { return fail(res, error, "Failed to update master record"); } };
exports.updateYarnPackaging = async (req, res) => {
  try {
    const profiles = packagingProfiles(req.body);
    const defaultProfile = profiles.find((profile) => profile.packageType === (clean(req.body.defaultPackageType).toLowerCase() || "bag")) || profiles[0];
    const record = await WeavingYarn.findOneAndUpdate({ _id: req.params.id, userId: userId(req) }, { $set: { packagingProfiles: profiles, defaultPackageType: defaultProfile.packageType, packageWeight: defaultProfile.packageWeight, packageWeightUnit: "LBS", largeConesPerPackage: defaultProfile.largeConesPerPackage, smallConesPerPackage: defaultProfile.smallConesPerPackage } }, { new: true });
    if (!record) return res.status(404).json({ message: "Yarn not found" });
    return res.json({ data: record });
  } catch (error) { return fail(res, error, "Failed to update Yarn packaging"); }
};

exports.listMasterOptions = async (req, res) => {
  try {
    const options = await listMasterOptions({
      userId: userId(req),
      type: clean(req.query.type),
    });
    return res.json({ data: options });
  } catch (error) {
    return fail(res, error, "Failed to load Weaving master options");
  }
};

exports.quickAddMasterOption = async (req, res) => {
  try {
    const option = await quickAddMasterOption({
      userId: userId(req),
      type: clean(req.body.type),
      value: req.body.value,
    });
    return res.status(201).json({ data: option });
  } catch (error) {
    return fail(res, error, "Failed to add Weaving master option");
  }
};

const loomPayload = (body) => {
  const loomNumber = required(body.loomNumber ?? body.name, "Loom No.").replace(/^loom\s+/i, "");
  const name = `Loom ${loomNumber}`;
  return {
  name, loomNumber, normalizedName: name.toLowerCase(),
  brand: clean(body.brand), model: clean(body.model), loomType: clean(body.loomType),
  reedSpace: clean(body.reedSpace), notes: clean(body.notes), isActive: body.isActive !== false,
}; };
exports.listLooms = async (req, res) => { try { const q = { userId: userId(req) }; if (req.query.search) q.name = { $regex: clean(req.query.search), $options: "i" }; return res.json({ data: await attachLoomRuns(userId(req), await WeavingLoom.find(q).collation({ locale: "en", numericOrdering: true }).sort({ loomNumber: 1, _id: 1 }).lean()) }); } catch (e) { return fail(res, e, "Failed to load Looms"); } };
exports.createLoom = async (req, res) => { try { const row = await WeavingLoom.create({ ...loomPayload(req.body), userId: userId(req) }); await logActivity({ req, action: "create", module: "weaving.loom", moduleScope: "weaving", entityType: "WeavingLoom", entityId: row._id, title: row.name }); return res.status(201).json({ data: row }); } catch (e) { return fail(res, e, "Failed to create Loom"); } };
exports.updateLoom = async (req, res) => { try { const row = await WeavingLoom.findOneAndUpdate({ _id: req.params.id, userId: userId(req) }, { $set: loomPayload(req.body) }, { new: true }); if (!row) return res.status(404).json({ message: "Loom not found" }); await logActivity({ req, action: "update", module: "weaving.loom", moduleScope: "weaving", entityType: "WeavingLoom", entityId: row._id, title: row.name }); return res.json({ data: row }); } catch (e) { return fail(res, e, "Failed to update Loom"); } };
exports.bulkCreateLooms = async (req, res) => { try {
  const count = Math.trunc(number(req.body.count, "Number of Looms", { positive: true }));
  const start = Math.trunc(number(req.body.startingNumber, "Starting Number", { positive: true }));
  if (count > 200) { const e = new Error("A maximum of 200 Looms can be created at once"); e.statusCode = 400; throw e; }
  const docs = Array.from({ length: count }, (_, i) => loomPayload({ ...req.body, loomNumber: String(start + i) }));
  const names = docs.map((row) => row.normalizedName);
  if (await WeavingLoom.exists({ userId: userId(req), normalizedName: { $in: names } })) { const e = new Error("One or more Loom numbers already exist"); e.statusCode = 409; throw e; }
  const rows = await WeavingLoom.insertMany(docs.map((row) => ({ ...row, userId: userId(req) })), { ordered: true });
  await logActivity({ req, action: "bulk_create", module: "weaving.loom", moduleScope: "weaving", entityType: "WeavingLoom", title: `${rows.length} Looms created`, metadata: { count: rows.length } });
  return res.status(201).json({ data: rows });
} catch (e) { return fail(res, e, "Failed to create Looms"); } };

const godownPayload = (body) => ({ name: required(body.name, "Godown Name / Number"), normalizedName: required(body.name, "Godown Name / Number").toLowerCase(), note: clean(body.note), isActive: body.isActive !== false });
exports.listGodowns = async (req, res) => { try { return res.json({ data: await WeavingGodown.find({ userId: userId(req) }).sort({ name: 1 }) }); } catch (e) { return fail(res, e, "Failed to load Godowns"); } };
exports.createGodown = async (req, res) => { try { const row = await WeavingGodown.create({ ...godownPayload(req.body), userId: userId(req) }); await logActivity({ req, action: "create", module: "weaving.settings", moduleScope: "weaving", entityType: "WeavingGodown", entityId: row._id, title: row.name }); return res.status(201).json({ data: row }); } catch (e) { return fail(res, e, "Failed to create Godown"); } };
exports.updateGodown = async (req, res) => { try { const row = await WeavingGodown.findOneAndUpdate({ _id: req.params.id, userId: userId(req) }, { $set: godownPayload(req.body) }, { new: true }); if (!row) return res.status(404).json({ message: "Godown not found" }); return res.json({ data: row }); } catch (e) { return fail(res, e, "Failed to update Godown"); } };
exports.getWeavingSettings = async (req, res) => { try { return res.json({ data: await weavingSettingsService.getSettings(userId(req)) }); } catch (e) { return fail(res, e, "Failed to load Weaving settings"); } };
exports.updateWeavingSettings = async (req, res) => { try { const previous = await weavingSettingsService.getSettings(userId(req)); const row = await weavingSettingsService.updateSettings(userId(req), req.body); await logActivity({ req, action: "update", module: "weaving.settings", moduleScope: "weaving", entityType: "WeavingSettings", entityId: row._id, title: "Production Tracking Method", description: `${previous.productionTrackingMode} to ${row.productionTrackingMode}` }); return res.json({ data: row }); } catch (e) { return fail(res, e, "Failed to update Weaving settings"); } };

const partyPayload = (body) => ({
  name: required(body.name, "Party Name"), normalizedName: required(body.name, "Party Name").toLowerCase(),
  role: ["customer", "supplier", "both"].includes(body.role) ? body.role : "both",
  phone: clean(body.phone), address: clean(body.address), notes: clean(body.notes), isActive: body.isActive !== false,
});
exports.listParties = async (req, res) => { try { const role = req.query.role; const query = { userId: userId(req), isActive: true, isHidden: false, ...(role === "customer" ? { role: { $in: ["customer", "both"] } } : role === "supplier" ? { role: { $in: ["supplier", "both"] } } : role === "both" ? { role: "both" } : {}) }; if (req.query.search) query.name = { $regex: clean(req.query.search), $options: "i" }; return res.json({ data: await WeavingParty.find(query).sort({ name: 1 }) }); } catch (e) { return fail(res, e, "Failed to load Parties"); } };
exports.createParty = async (req, res) => { try { const row = await WeavingParty.create({ ...partyPayload(req.body), userId: userId(req) }); await logActivity({ req, action: "create", module: "weaving.parties", moduleScope: "weaving", entityType: "WeavingParty", entityId: row._id, title: row.name }); return res.status(201).json({ data: row }); } catch (e) { return fail(res, e, "Failed to create Party"); } };

const nextContractNo = async (ownerId, type) => {
  const prefix = type === "sales" ? "SC" : "PC";
  const latest = await WeavingContract.findOne({ userId: ownerId, type }).sort({ createdAt: -1 }).select("contractNo").lean();
  const next = (Number(String(latest?.contractNo || "").match(/(\d+)$/)?.[1]) || 0) + 1;
  return `${prefix}-${String(next).padStart(5, "0")}`;
};
const PURCHASE_CONTRACT_COUNTER = "weaving_purchase_contract";
const legacyPurchaseEntryNo = (contractNo) => Number(String(contractNo || "").match(/^PC-(\d+)$/i)?.[1]) || 0;
const purchaseSequenceHighWater = async (ownerId) => {
  const rows = await WeavingContract.find({ userId: ownerId, type: "purchase" }).select("entryNo contractNo").lean();
  return rows.reduce((highest, row) => Math.max(highest, Number(row.entryNo) || 0, legacyPurchaseEntryNo(row.contractNo)), 0);
};
const ensurePurchaseCounter = async (ownerId, minimum) => {
  await Counter.findOneAndUpdate({ userId: ownerId, type: PURCHASE_CONTRACT_COUNTER, seq: { $lt: minimum } }, { $set: { seq: minimum } }, { new: true, setDefaultsOnInsert: false });
};
const nextPurchaseEntryNo = async (ownerId) => {
  const highWater = await purchaseSequenceHighWater(ownerId);
  await ensurePurchaseCounter(ownerId, highWater);
  let counter = await Counter.findOne({ userId: ownerId, type: PURCHASE_CONTRACT_COUNTER }).select("seq").lean();
  if (!counter) {
    try { counter = await Counter.create({ userId: ownerId, type: PURCHASE_CONTRACT_COUNTER, seq: highWater + 1 }); }
    catch (error) {
      if (error?.code !== 11000) throw error;
      counter = await Counter.findOneAndUpdate({ userId: ownerId, type: PURCHASE_CONTRACT_COUNTER }, { $inc: { seq: 1 } }, { new: true, setDefaultsOnInsert: false });
    }
  } else counter = await Counter.findOneAndUpdate({ userId: ownerId, type: PURCHASE_CONTRACT_COUNTER }, { $inc: { seq: 1 } }, { new: true, setDefaultsOnInsert: false });
  return counter.seq;
};
const previewPurchaseEntryNo = async (ownerId) => {
  const [counter, highWater] = await Promise.all([Counter.findOne({ userId: ownerId, type: PURCHASE_CONTRACT_COUNTER }).select("seq").lean(), purchaseSequenceHighWater(ownerId)]);
  return Math.max(Number(counter?.seq) || 0, highWater) + 1;
};
exports.contractMeta = async (req, res) => { try { const ownerId = userId(req); const [yarns, fabrics, parties, salesNo, purchaseNo] = await Promise.all([WeavingYarn.find({ userId: ownerId, isActive: true }).select("name millBrand quality count lotReference"), WeavingFabricQuality.find({ userId: ownerId, isActive: true }).select("name code construction width weave primaryUnit"), WeavingParty.find({ userId: ownerId, isActive: true, isHidden: false }).sort({ name: 1 }), nextContractNo(ownerId, "sales"), previewPurchaseEntryNo(ownerId)]); return res.json({ data: { yarns, fabrics, parties, nextNumbers: { sales: salesNo, purchase: purchaseNo } } }); } catch (e) { return fail(res, e, "Failed to load Contract setup"); } };
exports.listContracts = async (req, res) => { try { const q = { userId: userId(req) }; if (["sales", "purchase"].includes(req.query.type)) q.type = req.query.type; if (req.query.search) q.$or = ["contractNo", "partyName", "itemName"].map((field) => ({ [field]: { $regex: clean(req.query.search), $options: "i" } })); if (req.query.startDate || req.query.endDate) q.contractDate = { ...(req.query.startDate ? { $gte: req.query.startDate } : {}), ...(req.query.endDate ? { $lte: req.query.endDate } : {}) }; return res.json({ data: await contractProgress(userId(req), await WeavingContract.find(q).sort({ contractDate: -1, createdAt: -1 }).lean()) }); } catch (e) { return fail(res, e, "Failed to load Contracts"); } };
const contractPayload = async (ownerId, body) => {
  const type = body.type === "purchase" ? "purchase" : "sales";
  const purchaseItemType = body.purchaseItemType === "fabric" ? "fabric" : "yarn";
  const fabric = type === "sales" || purchaseItemType === "fabric";
  const Model = fabric ? WeavingFabricQuality : WeavingYarn;
  const item = await Model.findOne({ _id: body.itemId, userId: ownerId, isActive: true });
  if (!item) { const e = new Error(fabric ? "Fabric Quality is required" : "Yarn is required"); e.statusCode = 400; throw e; }
  const unit = fabric ? (["KG", "Meter", "Yard"].includes(body.unit) ? body.unit : item.primaryUnit || "Meter") : "KG";
  const quantity = unit === "KG" ? canonicalQuantity(body, "KG") : number(body.quantity, "Quantity", { positive: true });
  if (quantity <= 0) { const e = new Error("Quantity must be greater than zero"); e.statusCode = 400; throw e; }
  const party = await WeavingParty.findOne({ _id: body.partyId, userId: ownerId, isActive: true, isHidden: false, role: { $in: [type === "sales" ? "customer" : "supplier", "both"] } });
  if (!party) { const e = new Error(type === "sales" ? "Party / Customer is required" : "Supplier / Party is required"); e.statusCode = 400; throw e; }
  return { type, purchaseItemType, contractType: type === "sales" && body.contractType === "conversion" ? "conversion" : "fabric_sale", contractNo: type === "purchase" ? required(body.contractNo, "Contract No") : required(await nextContractNo(ownerId, type), "Contract No"), contractDate: required(body.contractDate, "Contract Date"), partyId: party._id, partyName: party.name, itemId: item._id, itemName: item.name, yarnCount: !fabric ? clean(item.count) : "", quantity, unit, rate: number(body.rate, "Rate"), sourceEntryUnit: unit === "KG" && body.sourceEntryUnit === "LBS" ? "LBS" : unit, deliveryDate: clean(body.deliveryDate), brokerName: clean(body.brokerName), commissionPercent: number(body.commissionPercent, "Commission"), creditDays: Math.trunc(number(body.creditDays, "Credit Days")), paymentTerms: clean(body.paymentTerms), packingTerms: clean(body.packingTerms), deliveryTerms: clean(body.deliveryTerms), expiryDate: clean(body.expiryDate), status: ["active", "complete", "expired"].includes(body.status) ? body.status : "active", notes: clean(body.notes) };
};
exports.createContract = async (req, res) => {
  try {
    const ownerId = userId(req);
    const requestKey = clean(req.body.requestKey);
    if (requestKey) {
      const existing = await WeavingContract.findOne({ userId: ownerId, requestKey });
      if (existing) return res.json({ data: existing });
    }

    const payload = await contractPayload(ownerId, req.body);
    if (payload.type === "purchase") payload.entryNo = await nextPurchaseEntryNo(ownerId);
    const row = await WeavingContract.create({ ...payload, ...(requestKey ? { requestKey } : {}), userId: ownerId });
    res.status(201).json({ data: row });
    void logActivity({ req, action: "create", module: "weaving.contracts", moduleScope: "weaving", entityType: "WeavingContract", entityId: row._id, title: row.contractNo });
  } catch (e) {
    if (e?.code === 11000 && clean(req.body.requestKey)) {
      const existing = await WeavingContract.findOne({ userId: userId(req), requestKey: clean(req.body.requestKey) });
      if (existing) return res.json({ data: existing });
    }
    if (e?.code === 11000) return res.status(409).json({ message: "A Purchase Contract with this Contract No already exists." });
    return fail(res, e, "Failed to create Contract");
  }
};
exports.updateContract = async (req, res) => { try { const ownerId = userId(req); const existing = await WeavingContract.findOne({ _id: req.params.id, userId: ownerId }); if (!existing) return res.status(404).json({ message: "Contract not found" }); if (req.body.type && req.body.type !== existing.type) throw Object.assign(new Error("Contract nature cannot be changed"), { statusCode: 400 }); const payload = await contractPayload(ownerId, { ...req.body, type: existing.type }); if (existing.type === "sales") payload.contractNo = existing.contractNo; if (existing.type === "purchase" && !existing.entryNo) { const legacyNo = legacyPurchaseEntryNo(existing.contractNo); if (legacyNo && !await WeavingContract.exists({ userId: ownerId, type: "purchase", entryNo: legacyNo, _id: { $ne: existing._id } })) { await ensurePurchaseCounter(ownerId, legacyNo); payload.entryNo = legacyNo; } else payload.entryNo = await nextPurchaseEntryNo(ownerId); } await assertContractIdentityEdit(ownerId, existing, payload); const row = await WeavingContract.findByIdAndUpdate(existing._id, { $set: payload }, { new: true }); await logActivity({ req, action: "update", module: "weaving.contracts", moduleScope: "weaving", entityType: "WeavingContract", entityId: row._id, title: row.contractNo }); return res.json({ data: row }); } catch (e) { if (e?.code === 11000) return res.status(409).json({ message: "A Purchase Contract with this Contract No already exists." }); return fail(res, e, "Failed to update Contract"); } };
