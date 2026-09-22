const WeavingFabricQuality = require("../../models/WeavingFabricQuality");
const WeavingLoom = require("../../models/WeavingLoom");
const WeavingMasterOption = require("../../models/WeavingMasterOption");
const WeavingYarn = require("../../models/WeavingYarn");

const { OPTION_TYPES, normalizeOptionValue } = WeavingMasterOption;

const OPTION_CONFIG = Object.freeze({
  yarn_mill_brand: { Model: WeavingYarn, field: "millBrand", starters: [] },
  yarn_quality: {
    Model: WeavingYarn,
    field: "quality",
    starters: ["Carded", "Combed", "Open End"],
  },
  fabric_weave: {
    Model: WeavingFabricQuality,
    field: "weave",
    starters: ["Plain", "Twill", "Satin"],
  },
  loom_brand: { Model: WeavingLoom, field: "brand", starters: [] },
  loom_model: { Model: WeavingLoom, field: "model", starters: [] },
  loom_type: {
    Model: WeavingLoom,
    field: "loomType",
    starters: ["Projectile", "Air Jet", "Rapier", "Water Jet", "Shuttle"],
  },
});

const httpError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const assertType = (type) => {
  if (!OPTION_TYPES.includes(type)) {
    throw httpError("Invalid Weaving master option type");
  }
};

const normalizedKey = (value) =>
  normalizeOptionValue(value).toLocaleLowerCase("en");

const toPlainOption = (option) => {
  const row = typeof option?.toObject === "function" ? option.toObject() : option;
  return {
    ...(row?._id ? { _id: row._id } : {}),
    type: row.type,
    value: row.value,
    normalizedValue: row.normalizedValue,
    isActive: row.isActive !== false,
  };
};

const quickAddMasterOption = async ({
  userId,
  type,
  value,
  OptionModel = WeavingMasterOption,
}) => {
  assertType(type);
  const canonicalValue = normalizeOptionValue(value);
  if (!canonicalValue) throw httpError("Option value is required");
  const normalizedValue = normalizedKey(canonicalValue);
  const query = { userId, type, normalizedValue };

  try {
    const option = await OptionModel.findOneAndUpdate(
      query,
      {
        $set: { isActive: true },
        $setOnInsert: {
          userId,
          type,
          value: canonicalValue,
          normalizedValue,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return toPlainOption(option);
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const existing = await OptionModel.findOne(query);
    if (!existing) throw error;
    return toPlainOption(existing);
  }
};

const mergeOptions = ({ type, persisted = [], legacy = [], starters = [] }) => {
  const byNormalizedValue = new Map();
  const append = (value, persistedOption = null) => {
    const canonicalValue = normalizeOptionValue(value);
    if (!canonicalValue) return;
    const normalizedValue = normalizedKey(canonicalValue);
    if (byNormalizedValue.has(normalizedValue)) return;
    byNormalizedValue.set(normalizedValue, {
      ...(persistedOption?._id ? { _id: persistedOption._id } : {}),
      type,
      value: persistedOption?.value || canonicalValue,
      normalizedValue,
      isActive: true,
      persisted: Boolean(persistedOption),
    });
  };

  persisted.forEach((option) => append(option.value, option));
  legacy.forEach((value) => append(value));
  starters.forEach((value) => append(value));

  return [...byNormalizedValue.values()].sort((left, right) =>
    left.value.localeCompare(right.value, undefined, { sensitivity: "base" }),
  );
};

const listMasterOptions = async ({
  userId,
  type,
  OptionModel = WeavingMasterOption,
  optionConfig = OPTION_CONFIG,
}) => {
  if (type) assertType(type);
  const types = type ? [type] : OPTION_TYPES;
  const persistedQuery = { userId, isActive: { $ne: false } };
  if (type) persistedQuery.type = type;
  const persisted = await OptionModel.find(persistedQuery).lean();
  const persistedByType = persisted.reduce((map, option) => {
    (map[option.type] ||= []).push(option);
    return map;
  }, {});

  const entries = await Promise.all(types.map(async (optionType) => {
    const config = optionConfig[optionType];
    const legacy = await config.Model.distinct(config.field, { userId });
    return [optionType, mergeOptions({
      type: optionType,
      persisted: persistedByType[optionType] || [],
      legacy,
      starters: config.starters,
    })];
  }));

  return Object.fromEntries(entries);
};

module.exports = {
  OPTION_CONFIG,
  listMasterOptions,
  quickAddMasterOption,
  _test: {
    assertType,
    mergeOptions,
    normalizedKey,
  },
};
