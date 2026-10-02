const number = (value) => Math.max(0, Number(value) || 0);
const { LBS_TO_KG, roundQuantity } = require("./weavingOperationsUtils");

const normalizePacking = (source = {}, defaults = {}) => {
  const packageType = String(source.packageType || "").trim().toLowerCase();
  const coneSize = source.coneSize === "small" || source.coneSize === "large" ? source.coneSize : "";
  const packageQty = number(source.packageQty ?? source.bags);
  const defaultCones = coneSize === "small" ? defaults.smallConesPerPackage : coneSize === "large" ? defaults.largeConesPerPackage : 0;
  const conesPerPackage = number(source.conesPerPackage || defaultCones);
  const extraCones = number(source.extraCones);
  const totalCones = Math.round(packageQty * conesPerPackage + extraCones);
  const explicitSmall = source.smallCones !== undefined ? number(source.smallCones) : null;
  const explicitLarge = source.largeCones !== undefined ? number(source.largeCones) : null;
  return {
    packageType,
    packageQty,
    coneSize,
    conesPerPackage,
    extraCones,
    totalCones,
    smallCones: explicitSmall ?? (coneSize === "small" ? totalCones : 0),
    largeCones: explicitLarge ?? (coneSize === "large" ? totalCones : 0),
  };
};

const packageProfilesFor = (yarn = {}) => {
  const profiles = Array.isArray(yarn.packagingProfiles)
    ? yarn.packagingProfiles.filter((profile) => profile?.packageType).map((profile) => ({
        packageType: String(profile.packageType).trim().toLowerCase(),
        packageWeight: Number(profile.packageWeight || 0),
        packageWeightUnit: profile.packageWeightUnit || yarn.packageWeightUnit || "LBS",
        smallConesPerPackage: Number(profile.smallConesPerPackage || 0),
        largeConesPerPackage: Number(profile.largeConesPerPackage || 0),
      })) : [];
  if (!profiles.some((profile) => profile.packageType === "bag")) profiles.unshift({
    packageType: "bag",
    packageWeight: yarn.defaultPackageType === "bag" ? Number(yarn.packageWeight || 100) : 100,
    packageWeightUnit: yarn.packageWeightUnit || "LBS",
    smallConesPerPackage: yarn.defaultPackageType === "bag" ? Number(yarn.smallConesPerPackage || 40) : 40,
    largeConesPerPackage: yarn.defaultPackageType === "bag" ? Number(yarn.largeConesPerPackage || 24) : 24,
  });
  return profiles.length ? profiles : [{ packageType: "bag", packageWeight: 100, packageWeightUnit: "LBS", smallConesPerPackage: 40, largeConesPerPackage: 24 }];
};

const calculateYarnPacking = (source = {}, yarn = {}) => {
  for (const field of ["packageQty", "smallCones", "largeCones"]) {
    const value = Number(source[field] || 0);
    if (!Number.isFinite(value) || value < 0 || (field === "packageQty" && !Number.isInteger(value))) throw new Error(`${field} must be a zero or positive ${field === "packageQty" ? "integer" : "number"}`);
  }
  const profiles = packageProfilesFor(yarn);
  const requestedType = String(source.packageType || yarn.defaultPackageType || profiles[0]?.packageType || "").trim().toLowerCase();
  const profile = profiles.find((row) => row.packageType === requestedType);
  if (!profile) throw new Error("Invalid Package Type for selected Yarn");
  if (profile.packageWeightUnit !== "LBS" || profile.packageWeight <= 0) throw new Error("Selected Yarn has an invalid packaging profile");
  if (Number(source.smallCones || 0) > 0 && profile.smallConesPerPackage <= 0) throw new Error("Small cone packaging is not configured for selected Yarn");
  if (Number(source.largeCones || 0) > 0 && profile.largeConesPerPackage <= 0) throw new Error("Large cone packaging is not configured for selected Yarn");
  const packageQty = Number(source.packageQty || 0), smallCones = Number(source.smallCones || 0), largeCones = Number(source.largeCones || 0);
  const quantityLbs = roundQuantity(packageQty * profile.packageWeight + (smallCones / (profile.smallConesPerPackage || Infinity)) * profile.packageWeight + (largeCones / (profile.largeConesPerPackage || Infinity)) * profile.packageWeight);
  const quantityKg = roundQuantity(quantityLbs * LBS_TO_KG);
  if (quantityLbs <= 0 || quantityKg <= 0) throw new Error("Yarn quantity must be greater than zero");
  return { packageType: profile.packageType, packageQty, smallCones, largeCones, totalCones: smallCones + largeCones, quantityLbs, quantityKg,
    packageWeight: profile.packageWeight, packageWeightUnit: profile.packageWeightUnit, smallConesPerPackage: profile.smallConesPerPackage, largeConesPerPackage: profile.largeConesPerPackage };
};

module.exports = { normalizePacking, packageProfilesFor, calculateYarnPacking };
