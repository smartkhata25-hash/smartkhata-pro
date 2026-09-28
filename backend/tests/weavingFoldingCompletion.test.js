const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// Actual Folding and Beam services, with a transactional database adapter.
let state, failure;
const session = {
  async withTransaction(work) {
    const snapshot = JSON.stringify(state);
    try { await work(); } catch (error) { state = JSON.parse(snapshot); throw error; }
  },
  async endSession() {},
};
const match = (row, filter) => Object.entries(filter).every(([key, value]) => {
  if (key === "$or") return value.some((part) => match(row, part));
  if (value && typeof value === "object" && "$ne" in value) return row[key] !== value.$ne;
  return value == null ? row[key] == null : String(row[key]) === String(value);
});
const wrap = (row, name) => {
  if (!row) return row;
  Object.defineProperty(row, "save", { configurable: true, value: async (options) => {
    if (options) assert.strictEqual(options.session, session);
    if (failure === name) throw new Error("Injected " + name);
    if (name === "WeavingBeam" && row.status === "loaded") {
      const conflict = state.WeavingBeam.some((beam) => beam !== row && beam.status === "loaded" && (beam.activeLoomId === row.activeLoomId || beam.loomNumber === row.loomNumber));
      if (conflict) throw Object.assign(new Error("duplicate Loom"), { code: 11000, keyPattern: { activeLoomId: 1 } });
    }
    return row;
  } });
  return row;
};
const models = {};
const model = (name) => models[name] ||= {
  find(filter) { return query(name, filter, false); },
  findOne(filter) { return query(name, filter, true); },
  async exists(filter) { return (state[name] || []).some((row) => match(row, filter)); },
  async create(input, options) {
    if (options) assert.strictEqual(options.session, session);
    if (failure === name) throw new Error("Injected " + name);
    const rows = (Array.isArray(input) ? input : [input]).map((row) => wrap({ _id: `than-${(state[name] || []).length + 1}`, status: "posted", beamCompletionTriggered: false, ...row }, name));
    (state[name] ||= []).push(...rows);
    return Array.isArray(input) ? rows : rows[0];
  },
  async updateOne(filter, update, options) {
    assert.strictEqual(options.session, session);
    if (failure === name) throw new Error("Injected " + name);
    Object.assign(state[name].find((row) => match(row, filter)), update.$set);
  },
  async findOneAndUpdate(filter, update) {
    assert.strictEqual(name, "Counter");
    state.seq = Math.max(state.seq || 0, update.$max?.seq || 0) + (update.$inc?.seq || 0);
    return { seq: state.seq };
  },
};
function query(name, filter, single) {
  return {
    session(active) { assert.strictEqual(active, session); return this; },
    select() { return this; }, lean() { return this; }, sort() { return this; },
    then(resolve, reject) {
      const rows = (state[name] || []).filter((row) => match(row, filter)).map((row) => wrap(row, name));
      return Promise.resolve(single ? rows[0] : rows).then(resolve, reject);
    },
  };
}
const context = {
  attachLoomRuns: async (_user, looms) => looms.map((loom) => {
    const beam = state.WeavingBeam.find((row) => row.status === "loaded" && (row.activeLoomId === loom._id || row.loomNumber === loom.loomNumber));
    return { ...loom, currentRun: beam ? { beam, beamSet: state.WeavingBeamSet[0], quality: state.WeavingFabricQuality[0], ownershipType: "own" } : null };
  }),
  runningContexts: async () => [],
};
let beamService;
const requireFake = (name) => {
  if (name === "mongoose") return { startSession: async () => session };
  if (name.startsWith("../../models/")) return model(path.basename(name));
  if (name === "./weavingBeamService") return beamService;
  if (name === "./weavingProductionContextService") return context;
  if (name === "./weavingCostingService") return { withCostingInvalidation: (fn) => fn };
  if (name === "./weavingOperationsUtils") return { lbsFromKg: (kg) => kg * 2.2046226218 };
  if (name === "../employee/employeeAccountingService") return {
    createHttpError: (message, statusCode) => Object.assign(new Error(message), { statusCode }),
    getSessionQuery: (query, active) => active ? query.session(active) : query,
  };
  return {};
};
const load = (name) => {
  const sandbox = { module: { exports: {} }, require: requireFake };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, `../services/weaving/${name}.js`), "utf8"), sandbox);
  return sandbox.module.exports;
};
beamService = load("weavingBeamService");
const folding = load("weavingFoldingService");
const reset = () => {
  failure = null;
  state = {
    WeavingLoom: [{ _id: "loom", userId: "user", loomNumber: "7", isActive: true }],
    WeavingBeam: [{ _id: "beam", userId: "user", beamNo: "B-01", beamSetId: "set", status: "loaded", activeLoomId: "loom", loomNumber: "7", loadedAt: "original-load" }],
    WeavingBeamSet: [{ _id: "set", status: "loaded" }],
    WeavingFabricQuality: [{ _id: "quality", userId: "user", isActive: true, name: "Fabric" }],
    WeavingFoldingEntry: [],
  };
};
const form = { loomId: "loom", date: "2026-09-26", fabricQualityId: "quality", ownershipType: "own", meter: 100, weightKg: 20, grade: "a", expectedBeamId: "beam" };
const assertRun = (status) => {
  assert.strictEqual(state.WeavingBeam[0].status, status);
  assert.strictEqual(state.WeavingBeam[0].activeLoomId, status === "loaded" ? "loom" : null);
  assert.strictEqual(state.WeavingBeamSet[0].status, status);
};
(async () => {
  reset();
  const first = await folding.create("user", { ...form, beamCompletionTriggered: false });
  await folding.create("user", form);
  assertRun("loaded");
  const last = await folding.create("user", { ...form, beamCompletionTriggered: true });
  assertRun("completed");
  assert.strictEqual(state.WeavingFoldingEntry.length, 3);
  assert(!first.beamCompletionTriggered && last.beamCompletionTriggered);
  const stock = (row) => JSON.stringify([row._id, row.thanNo, row.meter, row.weightKg, row.weightLbs, row.grade, row.godownId, row.goodMeter]);
  const originalStock = state.WeavingFoldingEntry.map(stock);
  await folding.update("user", last._id, { ...form, beamCompletionTriggered: false });
  assertRun("loaded");
  assert.deepStrictEqual(state.WeavingFoldingEntry.map(stock), originalStock);
  assert.strictEqual(state.WeavingBeam[0].loadedAt, "original-load");
  await folding.create("user", form);
  const realLast = await folding.create("user", { ...form, beamCompletionTriggered: true });
  assertRun("completed");
  state.WeavingBeam.push({ _id: "other-beam", userId: "user", beamNo: "B-02", status: "loaded", activeLoomId: "loom", loomNumber: "7", beamSetId: "other-set" });
  const beforeConflict = JSON.stringify(state);
  await assert.rejects(folding.update("user", realLast._id, { ...form, beamCompletionTriggered: false }), /Loom 7 currently has Beam B-02 loaded/);
  assert.strictEqual(JSON.stringify(state), beforeConflict);
  state.WeavingBeam.pop();
  await folding.update("user", realLast._id, { ...form, beamCompletionTriggered: false });
  await folding.update("user", first._id, { ...form, beamCompletionTriggered: true });
  assertRun("completed");
  assert.strictEqual(state.WeavingFoldingEntry.filter((row) => row.beamCompletionTriggered).length, 1);
  await assert.rejects(folding.update("user", realLast._id, { ...form, beamCompletionTriggered: true }), /Only a loaded Beam/);
  // Fail after Beam/Set updates: neither completion nor the entry can commit.
  for (const injected of ["WeavingBeamSet", "WeavingFoldingEntry"]) {
    reset(); failure = injected;
    await assert.rejects(folding.create("user", { ...form, beamCompletionTriggered: true }), /Injected/);
    assertRun("loaded");
    assert.strictEqual(state.WeavingFoldingEntry.length, 0);
    failure = null;
    const entry = await folding.create("user", { ...form, beamCompletionTriggered: true });
    const beforeUndo = JSON.stringify(state);
    failure = injected;
    await assert.rejects(folding.update("user", entry._id, { ...form, beamCompletionTriggered: false }), /Injected/);
    assert.strictEqual(JSON.stringify(state), beforeUndo);
  }
  reset();
  await folding.create("user", form);
  await beamService.completeBeam({ userId: "user", beamId: "beam" });
  await beamService.completeBeam({ userId: "user", beamId: "beam" });
  assertRun("completed");
  assert(!state.WeavingFoldingEntry[0].beamCompletionTriggered);
  reset(); state.WeavingBeam[0].activeLoomId = "different-loom";
  await assert.rejects(folding.create("user", { ...form, beamCompletionTriggered: true }), /not currently loaded/);
  assert.strictEqual(state.WeavingFoldingEntry.length, 0);
  console.log("Folding completion/undo: multiple Thans, stock preservation, conflicts, rollback, manual completion and Beam Set status passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
