const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const { calculateManualStock } = require("../services/weaving/weavingManualStockService");
const { _test } = require("../services/weaving/weavingSalesService");

const bucket = { fabricQualityId: "quality", godownId: null, category: "normal", ownershipType: "own", ownerPartyId: null };
let sequence = 0;
const move = (type, meter, extra = {}) => ({ ...bucket, _id: String(++sequence), createdAt: new Date(sequence * 1000), movementType: type, direction: ["sale_out", "kacchi_out", "quality_transfer_out"].includes(type) ? "out" : "in", meter, weightKg: 0, thanCount: 0, ...extra });
assert.deepStrictEqual(calculateManualStock([]), []);
const purchase = move("purchase_in", 100);
const exactSale = move("sale_out", 60, { sourceFoldingEntryId: "than-1" });
const manualSale = move("kacchi_out", 30, { stockIdentity: "untracked" });
assert.strictEqual(calculateManualStock([purchase, exactSale, manualSale])[0].meter, 70, "exact Thans must not consume or create manual stock");
const recovery = move("rejection_recovery", 60);
assert.strictEqual(calculateManualStock([purchase, manualSale, recovery])[0].meter, 130, "physical Fresh recovery is meter stock");
const transferOut = move("quality_transfer_out", 150, { stockAdjustmentId: "transfer" });
const transferIn = move("quality_transfer_in", 150, { godownId: "target", stockAdjustmentId: "transfer" });
assert.strictEqual(calculateManualStock([purchase, transferOut, transferIn]).find((r) => r.godownId === "target").meter, 0, "ambiguous transferred tracked stock must not appear as manual stock");
transferOut.meter = 50; transferIn.meter = 50;
assert.strictEqual(calculateManualStock([purchase, transferOut, transferIn]).find((r) => r.godownId === "target").meter, 50);
assert.strictEqual(calculateManualStock([purchase, { ...manualSale, isVoided: true }])[0].meter, 100);
assert.strictEqual(calculateManualStock([purchase, move("sale_return", 20)])[0].meter, 100, "anonymous legacy returns do not invent manual stock");
assert.strictEqual(calculateManualStock([purchase, move("sale_return", 20, { stockIdentity: "untracked" })])[0].meter, 120);
assert.strictEqual(calculateManualStock([purchase, move("sale_out", 40, { ownershipType: "party", ownerPartyId: "party" })]).find((r) => r.ownershipType === "own").meter, 100);
assert.strictEqual(_test.stockCategory({ saleNature: "other", otherSubtype: "waste", accountingOnly: true }), null);
assert.strictEqual(_test.normalizeOtherLines([{ description: "Scrap", uom: "KG", quantity: 2.5, rate: 40 }])[0].amount, 100);
assert.throws(() => _test.normalizeOtherLines([{ description: "", uom: "KG", quantity: 1, rate: 20 }]));
assert.throws(() => _test.chequeDetails("cheque", {}), /Cheque/);
assert.strictEqual(_test.chequeDetails("cheque", { chequeNo: "123", chequeBank: "Bank", chequeDate: "2026-09-25", chequeDueDate: "2026-10-01" }).chequeStatus, "pending");

// Exercise the real orchestration with a transactional in-memory adapter.
// Every read/write must receive the same session; late failure discards ALL writes.
const uid = "000000000000000000000001", kacchiId = "000000000000000000000002";
let state, injectFailure, unsupported = false;
const initial = () => ({
  WeavingKacchiParchi: [{ _id: kacchiId, userId: uid, status: "confirmed", pakkiId: null, kacchiNo: "KC-1", totalMeter: 100, totalKg: 20, totalThan: 2, contractId: "contract", partyId: "party", fabricQualityId: "quality", godownId: null, ownershipType: "own", dispatchDate: "2026-09-25" }],
  WeavingContract: [{ _id: "contract", userId: uid, rate: 10, contractType: "fabric_sale", creditDays: 7 }],
  WeavingParty: [{ _id: "party", userId: uid, name: "Customer", role: "customer", isActive: true, isHidden: false }],
  Account: [{ _id: "cash", userId: uid, isActive: true, moduleScope: "weaving", category: "bank" }],
});
const session = {
  async withTransaction(work) {
    if (unsupported) throw new Error("Transaction numbers are only allowed on a replica set member");
    const before = JSON.parse(JSON.stringify(state));
    try { await work(); } catch (error) { state = before; throw error; }
  },
  async endSession() {},
};
const match = (row, filter) => Object.entries(filter).every(([key, value]) => {
  if (key === "$or") return value.some((item) => match(row, item));
  if (value && typeof value === "object") {
    if (value.$regex) return new RegExp(value.$regex).test(row[key] || "");
    if (value.$in) return value.$in.includes(row[key]);
    if ("$ne" in value) return row[key] !== value.$ne;
  }
  return row[key] === value || (value === null && row[key] == null);
});
const doc = (row) => {
  if (!row) return null;
  Object.defineProperty(row, "toObject", { configurable: true, value: () => JSON.parse(JSON.stringify(row)) });
  Object.defineProperty(row, "markModified", { configurable: true, value: () => {} });
  Object.defineProperty(row, "save", { configurable: true, value: async (options) => {
    assert.strictEqual(options.session, session);
    if (injectFailure === "invoice-save" && row.status === "posted") throw new Error("Injected final invoice failure");
    return row;
  } });
  return row;
};
const models = {};
const model = (name) => models[name] ||= {
  collection: { createIndex: async () => {}, indexes: async () => [] },
  deleteMany: async () => {},
  deleteOne: async () => {},

  find(filter) {
    let active;
    return { session(value) { active = value; return this; }, select() { return this; }, lean() { return this; }, then(resolve, reject) {
      try { if (active) assert.strictEqual(active, session); return Promise.resolve((state[name] || []).filter((row) => match(row, filter)).map(doc)).then(resolve, reject); }
      catch (error) { return Promise.reject(error).then(resolve, reject); }
    } };
  },
  exists(filter) { return this.findOne(filter); },
  async updateOne(filter, update, options) {
    assert.strictEqual(options.session, session);
    const row = (state[name] || []).find((item) => match(item, filter));
    if (!row) return { modifiedCount: 0 };
    Object.assign(row, update.$set || {});
    for (const [key, value] of Object.entries(update.$inc || {})) row[key] = (row[key] || 0) + value;
    return { modifiedCount: 1 };
  },
  findOne(filter) {
    let active;
    return { session(value) { active = value; return this; }, lean() { return this; }, sort() { return this; }, then(resolve, reject) {
      try { if (active) assert.strictEqual(active, session, name + " read session"); return Promise.resolve(doc((state[name] || []).find((row) => match(row, filter)))).then(resolve, reject); }
      catch (error) { return Promise.reject(error).then(resolve, reject); }
    } };
  },
  async create(rows, options) {
    if (name === "WeavingStockLock") return {};
    assert.strictEqual(options.session, session, name + " write session");
    if (injectFailure === name) throw new Error("Injected " + name + " failure");
    if (name === "WeavingSalesInvoice" && legacyInvoiceIndex && (state[name] || []).some((row) => row.pakkiId == null) && rows.some((row) => row.pakkiId == null)) throw new Error("E11000 userId_1_pakkiId_1");
    const result = rows.map((row) => doc({ editHistory: [], receivedMeter: 0, isVoided: false, isReversed: false, _id: name + "-" + ((state[name] || []).length + 1), status: name === "WeavingSalesInvoice" ? "draft" : name === "WeavingMoneyTransaction" ? "posted" : "finalized", isDeleted: false, ...row }));
    (state[name] ||= []).push(...result);
    return result;
  },
  async updateMany(filter, update, options) {
    for (const row of (state[name] || []).filter((item) => match(item, filter))) await this.updateOne({ _id: row._id }, update, options);
  },
  async insertMany(rows, options) { return this.create(rows, options); },
  async findOneAndUpdate(filter, update, options) {
    assert.strictEqual(options.session, session);
    if (name !== "Counter") {
      const row = (state[name] || []).find((item) => match(item, filter));
      if (!row) return options.upsert ? (await this.create([{ ...filter, ...update.$setOnInsert }], options))[0] : null;
      await this.updateOne({ _id: row._id }, update, options);
      return doc(row);
    }
    const counters = state.Counter ||= [];
    let counter = counters.find((row) => match(row, filter));
    if (!counter) { counter = { ...filter, seq: 0 }; counters.push(counter); }
    counter.seq = Math.max(counter.seq, update[0].$set.seq.$add[0].$max[1]) + 1;
    return { ...counter };
  },
};
const sandbox = { module: { exports: {} }, require(name) {
  if (name === "mongoose") return { startSession: async () => session, isValidObjectId: (value) => /^[0-9a-f]{24}$/.test(value) };
  if (name.startsWith("../../models/")) return model(path.basename(name));
  if (name === "./weavingThanLocationService") return locationModule.module.exports;
  if (name === "./weavingYarnStockService") return { getGodownBalance: async () => ({ kg: 1000 }) };
  if (name === "./weavingManualStockService") return { getManualStock: async () => calculateManualStock(state.WeavingFabricMovement || []), key: (row) => [row.fabricQualityId, row.godownId, row.category, row.ownershipType, row.ownerPartyId].map((v) => String(v || "")).join(":") };
  if (name === "./weavingCostingService") return { withCostingInvalidation: (fn) => fn };
  if (name === "./weavingCommercialService") return {
    ensurePartyAccount: async (_user, _party, active) => { assert.strictEqual(active, session); return { _id: "receivable" }; },
    ensureAccount: async (_user, code, active) => { assert.strictEqual(active, session); return { _id: code }; },
  };
  if (name === "../../utils/accountHelper") return { recalculateAccountBalances: async (_ids, active) => {
    assert.strictEqual(active, session);
    if (injectFailure === "balances") throw new Error("Injected balances failure");
  } };
  return {};
} };
const locationModule = { module: { exports: {} }, require: (name) => model(path.basename(name)) };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../services/weaving/weavingThanLocationService.js"), "utf8"), locationModule);
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../services/weaving/weavingSalesService.js"), "utf8"), sandbox);
const confirm = sandbox.module.exports.confirmPakkiInvoice;
const payload = { kacchiId, pakkiDate: "2026-09-25", rejectionMeter: 10, saleTerms: "partial", receivedNow: 200, paymentAccountId: "cash", paymentMethod: "cheque", chequeNo: "123", chequeBank: "Bank", chequeDate: "2026-09-25", chequeDueDate: "2026-10-01" };
let legacyInvoiceIndex = false;
(async () => {
  const invoiceCollection = model("WeavingSalesInvoice").collection;
  const oldIndex = { name: "userId_1_pakkiId_1", unique: true, key: { userId: 1, pakkiId: 1 } };
  let replacementReady = false, dropCount = 0;
  invoiceCollection.createIndex = async (key, options) => {
    assert.deepStrictEqual(JSON.parse(JSON.stringify(key)), { userId: 1, sourcePakkiId: 1, activeForPakki: 1 });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(options)), { unique: true, partialFilterExpression: { sourcePakkiId: { $type: "objectId" }, activeForPakki: true } });
    replacementReady = true;
  };
  invoiceCollection.indexes = async () => legacyInvoiceIndex ? [oldIndex, { name: "userId_1_invoiceNo_1", unique: true }] : [];
  invoiceCollection.dropIndex = async (name) => { assert(replacementReady); assert.strictEqual(name, oldIndex.name); legacyInvoiceIndex = false; dropCount++; };
  // Fresh service instances represent restarts, including a concurrent index removal.
  for (const scenario of ["exists", "absent", "already-removed", "concurrent-removal", "replacement-fails"]) {
    legacyInvoiceIndex = ["exists", "concurrent-removal", "replacement-fails"].includes(scenario);
    const fresh = { ...sandbox, module: { exports: {} } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../services/weaving/weavingSalesService.js"), "utf8") + "\nmodule.exports.ensureIndexForTest = ensureSalesInvoiceIndex;", fresh);
    const create = invoiceCollection.createIndex, drop = invoiceCollection.dropIndex;
    if (scenario === "replacement-fails") invoiceCollection.createIndex = async () => { throw new Error("index build failed"); };
    if (scenario === "concurrent-removal") invoiceCollection.dropIndex = async () => { legacyInvoiceIndex = false; throw Object.assign(new Error("IndexNotFound"), { code: 27 }); };
    if (scenario === "replacement-fails") {
      await assert.rejects(fresh.module.exports.ensureIndexForTest(), /index build failed/);
      assert(legacyInvoiceIndex, "old protection must remain if replacement fails");
      invoiceCollection.createIndex = create;
    }
    await fresh.module.exports.ensureIndexForTest();
    await fresh.module.exports.ensureIndexForTest();
    assert(!legacyInvoiceIndex);
    invoiceCollection.dropIndex = drop;
  }
  assert.strictEqual(dropCount, 2);
  for (const receivedNow of [0, 5]) {
    state = initial(); injectFailure = null; legacyInvoiceIndex = receivedNow === 0;
    const partyId = "000000000000000000000010", godownId = "000000000000000000000011";
    state.WeavingParty[0]._id = partyId;
    state.WeavingGodown = [{ _id: godownId, userId: uid, isActive: true }];
    state.WeavingYarn = [{ _id: "yarn", userId: uid, isActive: true }];
    state.WeavingFabricQuality = [{ _id: "quality", userId: uid, isActive: true, name: "Fabric" }];
    state.WeavingFabricMovement = [{ ...purchase, userId: uid, isVoided: false }];
    state.WeavingMoneyTransaction = [1, 2, 5].map((number) => ({ userId: uid, transactionNo: `RCV-${String(number).padStart(5, "0")}`, status: "void" }));
    state.Counter = [{ userId: uid, type: "weaving_receive_payment", seq: 0 }];
    for (const saleNature of ["fabric", "yarn", "other"]) {
      const form = { requestKey: saleNature, partyId, invoiceDate: "2026-09-25", saleNature, entryMode: "manual", fabricQualityId: "quality", yarnId: "yarn", godownId: saleNature === "yarn" ? godownId : null, quantity: 10, finalRate: 2, accountingOnly: saleNature === "other", otherSubtype: "other", description: "Other Sale", receivedNow, paymentAccountId: "cash", paymentMethod: "cash" };
      const invoice = await sandbox.module.exports.createDirectInvoice(uid, form, uid);
      assert.strictEqual(invoice.status, "posted");
      assert.strictEqual(invoice.paidAmount || 0, receivedNow);
      assert.strictEqual((await sandbox.module.exports.createDirectInvoice(uid, form, uid))._id, invoice._id);
    }
    assert.strictEqual(state.WeavingSalesInvoice.length, 3);
    assert.strictEqual(state.WeavingMoneyTransaction.length, receivedNow ? 6 : 3);
    if (receivedNow) assert.deepStrictEqual(state.WeavingMoneyTransaction.slice(3).map((row) => row.transactionNo), ["RCV-00006", "RCV-00007", "RCV-00008"]);
  }
  const than = { _id: "than-1", userId: uid, status: "posted", grade: "a", goodMeter: 60, meter: 60, weightKg: 12, fabricQualityId: "quality", godownId: null, ownershipType: "own", ownerPartyId: null, thanNo: "T-1", createdAt: new Date(0) };
  let ledger = [purchase, manualSale];
  const locations = { module: { exports: {} }, require(name) {
    return { find: () => ({ select() { return this; }, lean: () => Promise.resolve(name.endsWith("WeavingFoldingEntry") ? [than] : name.endsWith("WeavingFabricMovement") ? ledger : []) }) };
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../services/weaving/weavingThanLocationService.js"), "utf8"), locations);
  const resolve = locations.module.exports.resolveCurrentThans;
  assert.strictEqual((await resolve(uid))[0].locationState, "known", "manual stock must leave tracked Thans selectable");
  ledger = [purchase, exactSale];
  assert.strictEqual((await resolve(uid)).length, 0, "referenced sale consumes exact Than");
  ledger.push(move("sale_return", 60, { sourceFoldingEntryId: "than-1", salesInvoiceId: "invoice" }));
  assert.strictEqual((await resolve(uid)).length, 1, "referenced return restores exact Than");
  for (const failure of ["WeavingSalesInvoice", "JournalEntry", "WeavingMoneyTransaction", "invoice-save", "balances"]) {
    state = initial(); injectFailure = failure;
    await assert.rejects(confirm(uid, payload, uid), /Injected/);
    assert.deepStrictEqual(state, initial(), failure + " must roll back Pakki, invoice, due, payment, journal and Kacchi links");
  }
  state = initial(); injectFailure = null;
  const result = await confirm(uid, payload, uid);
  assert.strictEqual(result.status, "posted");
  assert.strictEqual(result.grandTotal, 900);
  assert.strictEqual(result.paidAmount, 200);
  assert.strictEqual(result.balanceDue, 700);
  assert.strictEqual(state.JournalEntry.length, 2);
  assert.strictEqual(state.WeavingRejectionDue[0].pendingMeter, 10);
  assert.strictEqual(state.WeavingMoneyTransaction[0].chequeNo, "123");
  await confirm(uid, payload, uid);
  assert.strictEqual(state.WeavingPakkiSettlement.length, 1);
  assert.strictEqual(state.WeavingSalesInvoice.length, 1);
  assert.strictEqual(state.JournalEntry.length, 2);
  assert.strictEqual(state.WeavingMoneyTransaction.length, 1, "retry must not duplicate payment");
  state = initial();
  const credit = await confirm(uid, { ...payload, saleTerms: "credit", receivedNow: 0, paymentAccountId: null }, uid);
  assert.strictEqual(credit.balanceDue, 900);
  assert.strictEqual(state.WeavingMoneyTransaction, undefined);
  assert.strictEqual(state.WeavingFabricMovement, undefined, "rejection due must not recover stock");
  state = initial();
  const paid = await confirm(uid, { ...payload, saleTerms: "paid", receivedNow: 900, paymentMethod: "bank" }, uid);
  assert.strictEqual(paid.balanceDue, 0);
  assert.strictEqual(paid.paidAmount, 900);

  for (const received of [0, 100000, 250000, 300000]) {
    state = initial(); state.WeavingContract[0].rate = 2500;
    state.JournalEntry = [{ _id: "prior", lines: [{ account: "receivable", type: "debit", amount: 40000 }, { account: "income", type: "credit", amount: 40000 }] }];
    const posted = await confirm(uid, { ...payload, rejectionMeter: 0, receivedNow: received, paymentMethod: "bank", paymentAccountId: received ? "cash" : null }, uid);
    assert.strictEqual(posted.paidAmount || 0, Math.min(250000, received));
    assert.strictEqual(posted.balanceDue, Math.max(0, 250000 - received));
    assert.strictEqual(posted.paymentStatus || "unpaid", received === 0 ? "unpaid" : received < 250000 ? "partial" : "paid");
    const ledgerBalance = state.JournalEntry.flatMap((j) => j.lines).filter((line) => line.account === "receivable").reduce((sum, line) => sum + (line.type === "debit" ? line.amount : -line.amount), 0);
    assert.strictEqual(ledgerBalance, 40000 + 250000 - received);
    if (received) assert.strictEqual(state.WeavingMoneyTransaction[0].amount, received);
  }
  assert.throws(() => _test.normalizeSaleTerms({ receivedNow: 1, paymentMethod: "cash" }, 250000), /Account/);
  assert.throws(() => _test.normalizeSaleTerms({ receivedNow: 1, paymentAccountId: "cash" }, 250000), /Method/);
  const edit = sandbox.module.exports.updatePostedInvoice;
  state = initial();
  const original = await confirm(uid, { ...payload, receivedNow: 0, paymentAccountId: null }, uid);
  const pk = state.WeavingPakkiSettlement[0];
  const edited = await sandbox.module.exports.updatePakki(uid, pk._id, { editRequestKey: "pakki-edit", rejectionMeter: 5, receivedNow: 1200, paymentAccountId: "cash", paymentMethod: "bank" }, uid);
  assert.strictEqual(edited.grandTotal, 950);
  assert.strictEqual(edited.paidAmount, 950);
  assert.strictEqual(edited.balanceDue, 0);
  assert.strictEqual(state.WeavingRejectionDue[0].pendingMeter, 5);
  assert.strictEqual(state.WeavingMoneyTransaction.filter((r) => r.status === "posted")[0].amount, 1200);
  const journalCount = state.JournalEntry.length;
  await sandbox.module.exports.updatePakki(uid, pk._id, { editRequestKey: "pakki-edit" }, uid);
  assert.strictEqual(state.JournalEntry.length, journalCount, "Pakki edit retry must not duplicate journals");
  state.WeavingRejectionDue[0].receivedMeter = 4;
  await assert.rejects(sandbox.module.exports.updatePakki(uid, pk._id, { rejectionMeter: 3 }, uid), /physically received/);
  const editedLedger = state.JournalEntry.flatMap((j) => j.lines).filter((l) => l.account === "receivable").reduce((n, l) => n + (l.type === "debit" ? l.amount : -l.amount), 0);
  assert.strictEqual(editedLedger, 950 - 1200, "edit reversal and new receipt retain party credit");
  // Reuse a posted invoice fixture to exercise each direct edit stock branch.
  state = initial();
  const direct = await confirm(uid, { ...payload, receivedNow: 0 }, uid);
  direct.saleSource = "direct"; direct.saleNature = "other"; direct.accountingOnly = true; direct.sourcePakkiId = null; direct.pakkiId = null;
  const waste = await edit(uid, direct._id, { editRequestKey: "waste-edit", lines: [{ description: "Scrap", uom: "KG", quantity: 5, rate: 20 }], receivedNow: 150, paymentAccountId: "cash", paymentMethod: "bank" }, uid);
  assert.strictEqual(waste.grandTotal, 100); assert.strictEqual(waste.paidAmount, 100);
  assert.strictEqual(waste.lines[0].amount, 100);
  await edit(uid, waste._id, { editRequestKey: "waste-payment-edit", receivedNow: 40, paymentAccountId: "cash", paymentMethod: "bank" }, uid);
  assert.strictEqual(waste.balanceDue, 60); assert.strictEqual(state.WeavingMoneyTransaction.filter((r) => r.status === "posted").length, 1);
  waste.saleNature = "yarn"; waste.accountingOnly = false; waste.lines = []; waste.yarnId = "yarn"; waste.godownId = "source";
  state.WeavingYarn = [{ _id: "yarn", userId: uid, isActive: true }];
  state.WeavingGodown = [{ _id: "source", userId: uid, isActive: true }];
  state.WeavingYarnMovement = [{ _id: "yarn-out", userId: uid, salesInvoiceId: waste._id, yarnId: "yarn", sourceGodownId: "source", movementType: "sale_out", quantityKg: 5 }];
  await edit(uid, waste._id, { editRequestKey: "yarn-edit", quantity: 8, finalRate: 20, rateOverrideReason: "Correction", receivedNow: 0 }, uid);
  assert.strictEqual(state.WeavingYarnMovement[0].quantityKg, 8);
  assert.strictEqual(waste.grandTotal, 160);


  state = initial();
  const fabricInvoice = await confirm(uid, { ...payload, receivedNow: 0 }, uid);
  const firstThan = "000000000000000000000011", secondThan = "000000000000000000000012";
  Object.assign(fabricInvoice, { saleSource: "direct", saleNature: "fabric", entryMode: "than", fabricQualityId: "quality", fabricCategory: "normal", godownId: "source", sourcePakkiId: null, pakkiId: null, foldingEntryIds: [firstThan], quantity: 100, stockRevision: 0 });
  state.WeavingGodown = [{ _id: "source", userId: uid, isActive: true }];
  state.WeavingFabricQuality = [{ _id: "quality", userId: uid, isActive: true, name: "Fabric" }];
  state.WeavingFoldingEntry = [firstThan, secondThan].map((_id, index) => ({ _id, userId: uid, status: "posted", grade: "a", thanNo: "T-" + index, meter: index ? 60 : 100, goodMeter: index ? 60 : 100, weightKg: index ? 12 : 20, fabricQualityId: "quality", godownId: "source", ownershipType: "own", ownerPartyId: null, activeSalesInvoiceId: index ? null : fabricInvoice._id, activeKacchiId: null, stockRevision: 0, createdAt: "2026-01-01" }));
  state.WeavingFabricMovement = [{ _id: "original-out", userId: uid, movementType: "sale_out", direction: "out", salesInvoiceId: fabricInvoice._id, sourceFoldingEntryId: firstThan, fabricQualityId: "quality", godownId: "source", ownershipType: "own", ownerPartyId: null, category: "normal", meter: 100, weightKg: 20, thanCount: 1, isVoided: false, createdAt: "2026-01-02" }];
  const snapshot = JSON.parse(JSON.stringify(state));
  injectFailure = "balances";
  await assert.rejects(edit(uid, fabricInvoice._id, { editRequestKey: "exact-edit", foldingEntryIds: [secondThan], quantity: 60, receivedNow: 0 }, uid), /Injected/);
  assert.deepStrictEqual(state, snapshot, "late exact edit failure restores old claims, movement and accounting");
  injectFailure = null;
  await edit(uid, fabricInvoice._id, { editRequestKey: "exact-edit", foldingEntryIds: [secondThan], quantity: 60, receivedNow: 0 }, uid);
  assert.strictEqual(state.WeavingFoldingEntry[0].activeSalesInvoiceId, null);
  assert.strictEqual(state.WeavingFoldingEntry[1].activeSalesInvoiceId, fabricInvoice._id);
  assert.strictEqual(state.WeavingFabricMovement.filter((row) => !row.isVoided).length, 1);
  assert.strictEqual(state.WeavingFabricMovement.find((row) => !row.isVoided).sourceFoldingEntryId, secondThan);
  await edit(uid, fabricInvoice._id, { editRequestKey: "exact-edit", foldingEntryIds: [secondThan], quantity: 60 }, uid);
  assert.strictEqual(state.WeavingFabricMovement.length, 2, "retry does not consume or restore exact stock twice");

  // Exact Kacchi create/edit retains old movement history and changes claims once.
  const partyId = "000000000000000000000021", qualityId = "000000000000000000000022", contractId = "000000000000000000000023";
  state = { WeavingParty: [{ _id: partyId, userId: uid, role: "customer", isActive: true, isHidden: false }], WeavingFabricQuality: [{ _id: qualityId, userId: uid, isActive: true, name: "Fabric" }], WeavingContract: [{ _id: contractId, userId: uid, type: "sales", status: "active", contractType: "fabric_sale", partyId, itemId: qualityId }] };
  state.WeavingFoldingEntry = [firstThan, secondThan].map((_id) => ({ _id, userId: uid, status: "posted", grade: "a", thanNo: _id, fabricQualityId: qualityId, godownId: null, ownershipType: "own", ownerPartyId: null, contractId, meter: 50, goodMeter: 50, weightKg: 10, stockRevision: 0, activeKacchiId: null, activeSalesInvoiceId: null }));
  const dispatch = { requestKey: "kacchi-create", dispatchDate: "2026-09-25", partyId, fabricQualityId: qualityId, contractId, godownId: null, foldingEntryIds: [firstThan] };
  const kacchi = await sandbox.module.exports.createKacchi(uid, dispatch);
  kacchi.status = "confirmed"; kacchi.pakkiId = null;
  await sandbox.module.exports.updateKacchi(uid, kacchi._id, { ...dispatch, foldingEntryIds: [secondThan] });
  assert.strictEqual(state.WeavingFoldingEntry[0].activeKacchiId, null);
  assert.strictEqual(state.WeavingFoldingEntry[1].activeKacchiId, kacchi._id);
  assert.strictEqual(state.WeavingFabricMovement.filter((row) => !row.isVoided).length, 1);


  state.WeavingFabricMovement.push({ _id: "purchase-manual", userId: uid, movementType: "purchase_in", direction: "in", fabricQualityId: qualityId, godownId: null, category: "normal", ownershipType: "own", ownerPartyId: null, meter: 80, weightKg: 0, thanCount: 0, isVoided: false });
  const manual = await sandbox.module.exports.createKacchi(uid, { ...dispatch, requestKey: "manual-create", entryMode: "manual", foldingEntryIds: [], totalMeter: 30 });
  manual.status = "confirmed"; manual.pakkiId = null;
  await sandbox.module.exports.updateKacchi(uid, manual._id, { ...dispatch, entryMode: "manual", foldingEntryIds: [], totalMeter: 50 });
  assert.strictEqual(calculateManualStock(state.WeavingFabricMovement).find((row) => row.fabricQualityId === qualityId).meter, 30, "manual edit consumes only the replacement amount");
  await assert.rejects(sandbox.module.exports.updateKacchi(uid, manual._id, { ...dispatch, entryMode: "manual", foldingEntryIds: [], totalMeter: 81 }), /meter-based/);
  assert.strictEqual(calculateManualStock(state.WeavingFabricMovement).find((row) => row.fabricQualityId === qualityId).meter, 30, "failed manual edit restores the previous movement");

  // Exercise the shared browser-side confirmation helper without a browser.
  const babel = require("../../frontend/node_modules/@babel/core");
  const frontendRoot = path.join(__dirname, "../../frontend/src");
  const paymentSource = fs.readFileSync(path.join(frontendRoot, "components/weaving/WeavingSalePaymentSection.js"), "utf8");
  const transformed = babel.transformSync(paymentSource, { babelrc: false, configFile: false, plugins: [require("../../frontend/node_modules/@babel/plugin-transform-react-jsx"), require("../../frontend/node_modules/@babel/plugin-transform-modules-commonjs")] }).code;
  let confirmationCalls = 0, allowExcess = false;
  const paymentModule = { exports: {}, require(name) {
    if (name === "react") return {};
    if (name.includes("i18n")) return { t: (key) => key };
    if (name.includes("WeavingFeedbackModal")) return { requestWeavingConfirmation: async () => { confirmationCalls++; return allowExcess; } };
    throw new Error(name);
  } };
  vm.runInNewContext(transformed, paymentModule);
  const ui = paymentModule.exports;
  assert.strictEqual(ui.paymentError({ receivedNow: 300000, paymentAccountId: "cash", paymentMethod: "bank" }, 250000), "");
  assert.strictEqual(await ui.confirmExcessPayment({ receivedNow: 300000 }, 250000), false);
  allowExcess = true;
  assert.strictEqual(await ui.confirmExcessPayment({ receivedNow: 300000 }, 250000), true);
  assert.strictEqual(await ui.confirmExcessPayment({ receivedNow: 0 }, 250000), true);
  assert.strictEqual(confirmationCalls, 2);
  const directSource = fs.readFileSync(path.join(frontendRoot, "components/weaving/WeavingDirectSaleModal.js"), "utf8");
  const clearSource = directSource.match(/const clear = (\(\) => \{[^\n]+\});/)[1];
  for (const editing of [false, true]) {
    let resetValue;
    const initial = { quantity: 10, receivedNow: 7 };
    const context = { current: editing, initial, defaults: () => ({ quantity: "", receivedNow: "", requestKey: "fresh" }), setForm: (value) => { resetValue = value; }, setError: () => {}, localStorage: { removeItem: () => {} }, recoveryKey: "temporary", kind: "fabric" };
    vm.runInNewContext("(" + clearSource + ")()", context);
    assert.strictEqual(resetValue.quantity, editing ? 10 : "");
    assert.strictEqual(resetValue.receivedNow, editing ? 7 : "");
  }

  const soldState = () => ({
    WeavingSalesInvoice: [{ _id: "sale", userId: uid, status: "posted", paidAmount: 0, saleSource: "direct", entryMode: "than", invoiceNo: "WS-1", stockMovementId: "out", stockMovementModel: "WeavingFabricMovement" }],
    WeavingFoldingEntry: [{ _id: "than-1", userId: uid, activeSalesInvoiceId: "sale", activeKacchiId: null, stockRevision: 1 }],
    WeavingFabricMovement: [{ _id: "out", userId: uid, salesInvoiceId: "sale", sourceFoldingEntryId: "than-1", movementType: "sale_out", direction: "out", isVoided: false, fabricQualityId: "quality", godownId: "source", ownershipType: "own", ownerPartyId: null, category: "normal", meter: 60, weightKg: 12, thanCount: 1 }],
  });
  const voidSale = sandbox.module.exports.voidInvoice;
  state = soldState(); injectFailure = "WeavingFabricMovement";
  await assert.rejects(voidSale(uid, "sale", uid, "Correction"), /Injected/);
  assert.deepStrictEqual(state, soldState(), "failed return must retain invoice and exact Than claim");
  state = soldState(); injectFailure = null;
  await voidSale(uid, "sale", uid, "Correction");
  const returned = state.WeavingFabricMovement.find((row) => row.movementType === "sale_return");
  for (const field of ["sourceFoldingEntryId", "fabricQualityId", "godownId", "ownershipType", "ownerPartyId", "category", "meter", "weightKg", "thanCount"]) assert.strictEqual(returned[field], soldState().WeavingFabricMovement[0][field]);
  assert.strictEqual(state.WeavingFoldingEntry[0].activeSalesInvoiceId, null);
  assert.strictEqual(state.WeavingSalesInvoice[0].status, "void");
  await assert.rejects(voidSale(uid, "sale", uid, "Retry"), /Posted Invoice not found/);
  assert.strictEqual(state.WeavingFabricMovement.filter((row) => row.movementType === "sale_return").length, 1);
  state = initial(); unsupported = true;
  await assert.rejects(confirm(uid, payload, uid), /transaction support/);
  assert.deepStrictEqual(state, initial(), "no standalone nontransactional fallback");
  console.log("Sales Pro payment, excess ledger, edits, Clear, confirmation, stock, rollback and retry tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
