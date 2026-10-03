const { MODULE_SCOPES, normalizeModuleScope } = require("./moduleScope");

const tradingAndTravelDefaultTitles = Object.freeze([
  ["Electricity Bill", "UTILITY_EXP", "TRAVEL_UTILITY_EXP"], ["Gas Bill", "UTILITY_EXP", "TRAVEL_UTILITY_EXP"], ["Water Bill", "UTILITY_EXP", "TRAVEL_UTILITY_EXP"], ["Internet Bill", "UTILITY_EXP", "TRAVEL_UTILITY_EXP"], ["Mobile Load", "UTILITY_EXP", "TRAVEL_UTILITY_EXP"], ["Telephone Bill", "UTILITY_EXP", "TRAVEL_UTILITY_EXP"],
  ["Office Rent", "RENT_EXP", "TRAVEL_RENT_EXP"], ["Shop Rent", "RENT_EXP", "TRAVEL_RENT_EXP"], ["Warehouse Rent", "RENT_EXP", "TRAVEL_RENT_EXP"], ["Salary Expense", "SALARY_EXP", "TRAVEL_SALARY_EXP"], ["Wages", "SALARY_EXP", "TRAVEL_SALARY_EXP"], ["Staff Salary", "SALARY_EXP", "TRAVEL_SALARY_EXP"],
  ["Petrol", "TRANSPORT_EXP", "TRAVEL_TRANSPORT_EXP"], ["Fuel Expense", "TRANSPORT_EXP", "TRAVEL_TRANSPORT_EXP"], ["Delivery Charges", "TRANSPORT_EXP", "TRAVEL_TRANSPORT_EXP"], ["Transport Expense", "TRANSPORT_EXP", "TRAVEL_TRANSPORT_EXP"], ["Rickshaw / Loader", "TRANSPORT_EXP", "TRAVEL_TRANSPORT_EXP"],
  ["Office Maintenance", "MAINTENANCE_EXP", "TRAVEL_MAINTENANCE_EXP"], ["Repair Expense", "MAINTENANCE_EXP", "TRAVEL_MAINTENANCE_EXP"], ["Equipment Repair", "MAINTENANCE_EXP", "TRAVEL_MAINTENANCE_EXP"], ["Marketing Expense", "MARKETING_EXP", "TRAVEL_MARKETING_EXP"], ["Advertisement", "MARKETING_EXP", "TRAVEL_MARKETING_EXP"], ["Facebook Ads", "MARKETING_EXP", "TRAVEL_MARKETING_EXP"], ["Google Ads", "MARKETING_EXP", "TRAVEL_MARKETING_EXP"], ["Printing & Banners", "MARKETING_EXP", "TRAVEL_MARKETING_EXP"],
  ["Packing Material", "PURCHASE", "TRAVEL_PURCHASE_EXP"], ["Office Supplies", "PURCHASE", "TRAVEL_PURCHASE_EXP"], ["Stationery", "PURCHASE", "TRAVEL_PURCHASE_EXP"], ["Tea Expense", "OTHER_EXP", "TRAVEL_OTHER_EXP"], ["Lunch Expense", "OTHER_EXP", "TRAVEL_OTHER_EXP"], ["Staff Food", "OTHER_EXP", "TRAVEL_OTHER_EXP"], ["Bank Charges", "OTHER_EXP", "TRAVEL_OTHER_EXP"], ["Transaction Fee", "OTHER_EXP", "TRAVEL_OTHER_EXP"], ["Tax Payment", "OTHER_EXP", "TRAVEL_OTHER_EXP"], ["Government Fee", "OTHER_EXP", "TRAVEL_OTHER_EXP"], ["General Expense", "OTHER_EXP", "TRAVEL_OTHER_EXP"], ["Misc Expense", "OTHER_EXP", "TRAVEL_OTHER_EXP"], ["Other Expense", "OTHER_EXP", "TRAVEL_OTHER_EXP"],
].map(([name, tradingCode, travelCode]) => ({ name, tradingCode, travelCode })));

const weavingDefaultTitles = Object.freeze([
  ["Electricity Bill", "WEAVING_POWER_EXP"], ["Power Expense", "WEAVING_POWER_EXP"], ["Salary Expense", "WEAVING_SALARY_EXP"], ["Wages", "WEAVING_SALARY_EXP"], ["Sizing Charges", "WEAVING_SIZING_EXP"], ["Folding Charges", "WEAVING_FOLDING_EXP"], ["Loom Repair", "WEAVING_MAINTENANCE_EXP"], ["Machine Maintenance", "WEAVING_MAINTENANCE_EXP"], ["Factory Rent", "WEAVING_RENT_EXP"], ["Transport Expense", "WEAVING_TRANSPORT_EXP"], ["General Expense", "WEAVING_OTHER_EXP"], ["Other Expense", "WEAVING_OTHER_EXP"],
].map(([name, code]) => ({ name, weavingCode: code })));

const normalizeName = (value = "") => String(value || "").trim().toLowerCase();
const getDefinitionsForScope = (scope) => scope === MODULE_SCOPES.WEAVING ? weavingDefaultTitles : tradingAndTravelDefaultTitles;
const getExpectedCode = (definition, scope) => scope === MODULE_SCOPES.WEAVING ? definition?.weavingCode : scope === MODULE_SCOPES.TRAVEL ? definition?.travelCode : definition?.tradingCode;
const getDefinition = (name, scope) => getDefinitionsForScope(scope).find((row) => normalizeName(row.name) === normalizeName(name)) || null;
const accountBelongsToScope = (account, scope) => {
  const accountScope = String(account?.moduleScope || "").trim().toLowerCase();
  return accountScope === scope || (scope === MODULE_SCOPES.TRADING && !accountScope);
};
const isValidDefaultAccount = ({ account, userId, scope, definition }) => Boolean(account) && String(account.userId) === String(userId) && account.type === "Expense" && account.isActive !== false && accountBelongsToScope(account, normalizeModuleScope(scope)) && account.code === getExpectedCode(definition, normalizeModuleScope(scope));

module.exports = { accountBelongsToScope, getDefinition, getDefinitionsForScope, getExpectedCode, isValidDefaultAccount, normalizeName };
