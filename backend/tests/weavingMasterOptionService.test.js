const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const mongoose = require("mongoose");

const WeavingMasterOption = require("../models/WeavingMasterOption");
const {
  listMasterOptions,
  quickAddMasterOption,
} = require("../services/weaving/weavingMasterOptionService");

const userA = new mongoose.Types.ObjectId();
const userB = new mongoose.Types.ObjectId();

const matches = (row, query) =>
  Object.entries(query).every(([key, value]) => {
    if (value && typeof value === "object" && "$ne" in value) {
      return row[key] !== value.$ne;
    }
    return String(row[key]) === String(value);
  });

const createOptionModel = () => {
  const rows = [];
  return {
    rows,
    async findOneAndUpdate(query, update) {
      let row = rows.find((item) => matches(item, query));
      if (!row) {
        row = {
          _id: new mongoose.Types.ObjectId(),
          ...update.$setOnInsert,
          isActive: true,
        };
        rows.push(row);
      } else {
        Object.assign(row, update.$set);
      }
      return { ...row };
    },
    async findOne(query) {
      return rows.find((item) => matches(item, query)) || null;
    },
    find(query) {
      return {
        lean: async () => rows.filter((item) => matches(item, query)).map((item) => ({ ...item })),
      };
    },
  };
};

const source = (valuesByUser = {}) => ({
  distinct: async (_field, query) => valuesByUser[String(query.userId)] || [],
});

const configFor = (overrides = {}) => ({
  yarn_mill_brand: { Model: source(), field: "millBrand", starters: [] },
  yarn_quality: { Model: source(), field: "quality", starters: ["Carded", "Combed", "Open End"] },
  fabric_weave: { Model: source(), field: "weave", starters: ["Plain", "Twill", "Satin"] },
  loom_brand: { Model: source(), field: "brand", starters: [] },
  loom_model: { Model: source(), field: "model", starters: [] },
  loom_type: { Model: source(), field: "loomType", starters: ["Projectile", "Air Jet", "Rapier", "Water Jet", "Shuttle"] },
  ...overrides,
});

test("model normalizes whitespace and has a tenant/type/value unique index", async () => {
  const option = new WeavingMasterOption({
    userId: userA,
    type: "loom_brand",
    value: "  SOLZER   TEXTILE  ",
  });
  await option.validate();
  assert.equal(option.value, "SOLZER TEXTILE");
  assert.equal(option.normalizedValue, "solzer textile");
  assert.ok(WeavingMasterOption.schema.indexes().some(([fields, settings]) =>
    fields.userId === 1 &&
    fields.type === 1 &&
    fields.normalizedValue === 1 &&
    settings.unique === true
  ));
});

test("Quick Add is idempotent across case and surrounding whitespace", async () => {
  const OptionModel = createOptionModel();
  const first = await quickAddMasterOption({ userId: userA, type: "loom_brand", value: "SOLZER", OptionModel });
  const exact = await quickAddMasterOption({ userId: userA, type: "loom_brand", value: "SOLZER", OptionModel });
  const caseDuplicate = await quickAddMasterOption({ userId: userA, type: "loom_brand", value: "solzer", OptionModel });
  const whitespaceDuplicate = await quickAddMasterOption({ userId: userA, type: "loom_brand", value: "  SOLZER  ", OptionModel });

  assert.equal(OptionModel.rows.length, 1);
  assert.equal(first.value, "SOLZER");
  assert.equal(String(exact._id), String(first._id));
  assert.equal(String(caseDuplicate._id), String(first._id));
  assert.equal(String(whitespaceDuplicate._id), String(first._id));
});

test("the same value is separate by type and tenant", async () => {
  const OptionModel = createOptionModel();
  await quickAddMasterOption({ userId: userA, type: "loom_brand", value: "SOLZER", OptionModel });
  await quickAddMasterOption({ userId: userA, type: "loom_model", value: "SOLZER", OptionModel });
  await quickAddMasterOption({ userId: userB, type: "loom_brand", value: "SOLZER", OptionModel });
  assert.equal(OptionModel.rows.length, 3);

  const optionsA = await listMasterOptions({ userId: userA, type: "loom_brand", OptionModel, optionConfig: configFor() });
  const optionsB = await listMasterOptions({ userId: userB, type: "loom_brand", OptionModel, optionConfig: configFor() });
  assert.equal(optionsA.loom_brand.length, 1);
  assert.equal(optionsB.loom_brand.length, 1);
  assert.notEqual(String(optionsA.loom_brand[0]._id), String(optionsB.loom_brand[0]._id));
});

test("persisted options survive independently of a parent form save", async () => {
  const OptionModel = createOptionModel();
  await quickAddMasterOption({ userId: userA, type: "loom_model", value: "PU", OptionModel });
  const afterCancelOrRefresh = await listMasterOptions({ userId: userA, type: "loom_model", OptionModel, optionConfig: configFor() });
  assert.deepEqual(afterCancelOrRefresh.loom_model.map((item) => item.value), ["PU"]);
});

test("legacy parent values and starter Loom Types remain available and deduplicated", async () => {
  const OptionModel = createOptionModel();
  const optionConfig = configFor({
    loom_brand: {
      Model: source({ [String(userA)]: ["Legacy Brand", " legacy   brand "] }),
      field: "brand",
      starters: [],
    },
  });
  const result = await listMasterOptions({ userId: userA, OptionModel, optionConfig });
  assert.deepEqual(result.loom_brand.map((item) => item.value), ["Legacy Brand"]);
  assert.deepEqual(result.loom_type.map((item) => item.value), ["Air Jet", "Projectile", "Rapier", "Shuttle", "Water Jet"]);
});

test("all six supported categories persist and list independently", async () => {
  const OptionModel = createOptionModel();
  const types = ["yarn_mill_brand", "yarn_quality", "fabric_weave", "loom_brand", "loom_model", "loom_type"];
  for (const type of types) {
    await quickAddMasterOption({ userId: userA, type, value: `Value ${type}`, OptionModel });
  }
  const result = await listMasterOptions({ userId: userA, OptionModel, optionConfig: configFor() });
  types.forEach((type) => {
    assert.ok(result[type].some((option) => option.value === `Value ${type}`));
  });
});

test("routes and backup/restore include persistent master options", () => {
  const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  assert.match(read("routes/weavingOperationsRoutes.js"), /post\("\/master-options".*WEAVING_MASTERS\.CREATE/);
  assert.match(read("services/backupService.js"), /weavingmasteroptions: \{ field: "userId"/);
  assert.match(read("services/restoreService.js"), /weavingmasteroptions: \(\) => require\("\.\.\/models\/WeavingMasterOption"\)/);
});
