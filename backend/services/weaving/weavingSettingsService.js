const WeavingSettings = require("../../models/WeavingSettings");
const WeavingParty = require("../../models/WeavingParty");
const WeavingGodown = require("../../models/WeavingGodown");
const { runningContexts } = require("./weavingProductionContextService");

const defaults = Object.freeze({ productionTrackingMode: "detailed", simpleProductionOwnershipType: "own", simpleProductionOwnerPartyId: null, simpleProductionGodownId: null });
const fail = (message, statusCode = 400, extra = {}) => Object.assign(new Error(message), { statusCode, ...extra });

const getSettings = async (userId) => (await WeavingSettings.findOne({ userId }).lean()) || { userId, moduleScope: "weaving", ...defaults };
const getMode = async (userId) => (await WeavingSettings.findOne({ userId }).select("productionTrackingMode").lean())?.productionTrackingMode || "detailed";
const requireMode = async (userId, allowed, message) => {
  const mode = await getMode(userId);
  if (!allowed.includes(mode)) throw fail(message || `This action is not available in ${mode} production mode.`, 409);
  return mode;
};

const updateSettings = async (userId, body) => {
  const existing = await getSettings(userId);
  const mode = body.productionTrackingMode || existing.productionTrackingMode;
  if (!["detailed", "loom_wise", "quality_total"].includes(mode)) throw fail("Select a valid Production Tracking Method.");
  if (existing.productionTrackingMode === "detailed" && mode !== "detailed") {
    const runs = await runningContexts(userId);
    if (runs.length) {
      const activeRuns = runs.map((run) => ({
        beamId: run.beam._id,
        beamNo: run.beam.beamNo || "",
        loomId: run.beam.activeLoomId || null,
        loomNumber: run.beam.loomNumber || "",
        reference: run.beamSet?.setNo || run.beamSet?.receiptNo || "",
        qualityName: run.quality?.name || "",
      })).sort((left, right) => String(left.loomNumber).localeCompare(String(right.loomNumber), undefined, { numeric: true, sensitivity: "base" }));
      throw fail("Complete or unload all active Detailed Loom runs before changing the Production Tracking Method.", 409, {
        code: "ACTIVE_DETAILED_LOOM_RUNS",
        details: { activeRuns },
      });
    }
  }
  const ownershipType = body.simpleProductionOwnershipType || existing.simpleProductionOwnershipType || "own";
  if (!["own", "party"].includes(ownershipType)) throw fail("Select a valid simple-production ownership type.");
  let ownerPartyId = null;
  if (ownershipType === "party") {
    ownerPartyId = body.simpleProductionOwnerPartyId || existing.simpleProductionOwnerPartyId;
    if (!ownerPartyId || !await WeavingParty.exists({ _id: ownerPartyId, userId, isActive: true, isHidden: false })) throw fail("Select a valid active production Party.");
  }
  const godownId = Object.prototype.hasOwnProperty.call(body, "simpleProductionGodownId") ? body.simpleProductionGodownId || null : existing.simpleProductionGodownId;
  if (godownId && !await WeavingGodown.exists({ _id: godownId, userId, isActive: true })) throw fail("Select a valid active production Godown.");
  return WeavingSettings.findOneAndUpdate({ userId }, { $set: { productionTrackingMode: mode, simpleProductionOwnershipType: ownershipType, simpleProductionOwnerPartyId: ownerPartyId, simpleProductionGodownId: godownId }, $setOnInsert: { moduleScope: "weaving" } }, { upsert: true, new: true, setDefaultsOnInsert: true });
};

module.exports = { defaults, getMode, getSettings, requireMode, updateSettings };
