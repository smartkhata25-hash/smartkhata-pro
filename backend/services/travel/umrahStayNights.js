const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

const parseOptionalStayNights = (value) => {
  if (value === "" || value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : null;
};

const normalizeCity = (value) => {
  const city = String(value || "").trim().toLowerCase();
  if (["makkah", "mecca"].includes(city)) return "makkah";
  if (["madinah", "madina", "medina"].includes(city)) return "madinah";
  return city;
};

const resolvePlannerNights = (plannerInfo, city) => {
  if (!plannerInfo || typeof plannerInfo !== "object") return null;
  const direct = plannerInfo[`${city}Nights`] ?? plannerInfo.cityNights?.[city];
  const parsedDirect = parseOptionalStayNights(direct);
  if (parsedDirect !== null) return parsedDirect;

  const stays = Array.isArray(plannerInfo.stays)
    ? plannerInfo.stays
    : Array.isArray(plannerInfo.travelInfos)
      ? plannerInfo.travelInfos
      : [];
  const stay = stays.find((entry) => normalizeCity(entry?.city) === city);
  return parseOptionalStayNights(stay?.nights ?? stay?.totalNights);
};

const resolveUmrahCityNights = (umrahDetails = {}, cityValue) => {
  const city = normalizeCity(cityValue);
  if (!["makkah", "madinah"].includes(city)) return null;

  const explicitKey = `${city}Nights`;
  if (hasOwn(umrahDetails, explicitKey)) {
    return parseOptionalStayNights(umrahDetails[explicitKey]);
  }

  const component = (umrahDetails.components || []).find(
    (entry) =>
      entry?.componentType === "hotel" &&
      normalizeCity(entry?.hotelPricing?.city) === city,
  );
  const componentNights = parseOptionalStayNights(component?.hotelPricing?.nights);
  if (componentNights !== null) return componentNights;

  const summary = umrahDetails.pricingSummary?.hotels?.[city];
  const summaryNights = parseOptionalStayNights(
    summary?.totalNights ?? summary?.nights,
  );
  if (summaryNights !== null) return summaryNights;

  return resolvePlannerNights(umrahDetails.plannerInfo, city);
};

const formatStayNights = (value) => {
  const nights = parseOptionalStayNights(value);
  if (nights === null || nights <= 0) return "";
  return `${nights} ${nights === 1 ? "Night" : "Nights"}`;
};

module.exports = {
  formatStayNights,
  parseOptionalStayNights,
  resolveUmrahCityNights,
};
