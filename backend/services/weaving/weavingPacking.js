const number = (value) => Math.max(0, Number(value) || 0);

const normalizePacking = (source = {}, defaults = {}) => {
  const packageType = source.packageType === "carton" ? "carton" : source.packageType === "bag" ? "bag" : "";
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

module.exports = { normalizePacking };
