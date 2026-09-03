const mongoose = require("mongoose");

const Customer = require("../../models/Customer");
const Party = require("../../models/Party");
const Supplier = require("../../models/Supplier");

const {
  MODULE_SCOPES,
  applyModuleScopeFilter,
  applySupplierModuleScopeFilter,
} = require("../../utils/moduleScope");

const TRAVEL_PARTY_OPENING_ORIGIN = "travel_party_opening_balance";

const CUSTOMER_TYPES = Object.freeze({
  CUSTOMER: "customer",
  PARTY: "party",
});

const VENDOR_TYPES = Object.freeze({
  VENDOR: "vendor",
  PARTY: "party",
});

const makeHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const cleanString = (value = "") => String(value || "").trim();

const getRecordId = (value) => {
  if (!value) {
    return "";
  }

  if (typeof value === "object") {
    return String(value._id || value.id || "");
  }

  return String(value);
};

const ensureObjectIdString = (value, label) => {
  const id = getRecordId(value);

  if (!id) {
    return "";
  }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw makeHttpError(400, `Invalid ${label}`);
  }

  return id;
};

const getSessionQuery = (query, session) =>
  session ? query.session(session) : query;

const normalizeCustomerCounterpartyInput = (source = {}, existing = {}) => {
  const requestedType = cleanString(
    source.customerType ||
      source.customerCounterpartyType ||
      source.counterpartyType,
  ).toLowerCase();

  const existingType =
    cleanString(existing.customerType).toLowerCase() ||
    (getRecordId(existing.customerPartyId) ? CUSTOMER_TYPES.PARTY : "");

  const customerPartyId = ensureObjectIdString(
    source.customerPartyId ||
      source.partyId ||
      (requestedType === CUSTOMER_TYPES.PARTY
        ? source.customerId || source.customer
        : "") ||
      existing.customerPartyId,
    "party",
  );

  const type =
    requestedType === CUSTOMER_TYPES.PARTY || customerPartyId
      ? CUSTOMER_TYPES.PARTY
      : requestedType === CUSTOMER_TYPES.CUSTOMER
        ? CUSTOMER_TYPES.CUSTOMER
        : existingType || CUSTOMER_TYPES.CUSTOMER;

  if (type === CUSTOMER_TYPES.PARTY) {
    return {
      customerType: CUSTOMER_TYPES.PARTY,
      customerId: null,
      customerPartyId:
        customerPartyId ||
        ensureObjectIdString(existing.customerPartyId, "party") ||
        null,
    };
  }

  return {
    customerType: CUSTOMER_TYPES.CUSTOMER,
    customerId:
      ensureObjectIdString(
        source.customerId || source.customer || existing.customerId,
        "customer",
      ) || null,
    customerPartyId: null,
  };
};

const normalizeVendorCounterpartyInput = (source = {}, existing = {}) => {
  const requestedType = cleanString(
    source.vendorType ||
      source.vendorCounterpartyType ||
      source.supplierType ||
      source.counterpartyType,
  ).toLowerCase();

  const existingType =
    cleanString(existing.vendorType).toLowerCase() ||
    (getRecordId(existing.vendorPartyId) ? VENDOR_TYPES.PARTY : "");

  const vendorPartyId = ensureObjectIdString(
    source.vendorPartyId ||
      source.partyId ||
      (requestedType === VENDOR_TYPES.PARTY
        ? source.vendorId || source.supplier
        : "") ||
      existing.vendorPartyId,
    "party",
  );

  const type =
    requestedType === VENDOR_TYPES.PARTY || vendorPartyId
      ? VENDOR_TYPES.PARTY
      : requestedType === VENDOR_TYPES.VENDOR
        ? VENDOR_TYPES.VENDOR
        : existingType || VENDOR_TYPES.VENDOR;

  if (type === VENDOR_TYPES.PARTY) {
    return {
      vendorType: VENDOR_TYPES.PARTY,
      vendorId: null,
      vendorPartyId:
        vendorPartyId ||
        ensureObjectIdString(existing.vendorPartyId, "party") ||
        null,
    };
  }

  return {
    vendorType: VENDOR_TYPES.VENDOR,
    vendorId:
      ensureObjectIdString(
        source.vendorId || source.supplier || existing.vendorId,
        "vendor",
      ) || null,
    vendorPartyId: null,
  };
};

const buildTravelPartyRoleQuery = (userId, role) => {
  const query = applyModuleScopeFilter(
    {
      userId,
      isDeleted: false,
      isActive: {
        $ne: false,
      },
    },
    MODULE_SCOPES.TRAVEL,
  );

  if (role === CUSTOMER_TYPES.CUSTOMER) {
    query.role = { $in: ["customer", "both"] };
  }

  if (role === VENDOR_TYPES.VENDOR || role === "supplier") {
    query.role = { $in: ["supplier", "both"] };
  }

  return query;
};

const resolveTravelCustomerCounterparty = async ({
  userId,
  source = {},
  existing = {},
  session = null,
}) => {
  const normalized = normalizeCustomerCounterpartyInput(source, existing);

  if (normalized.customerType === CUSTOMER_TYPES.PARTY) {
    if (!normalized.customerPartyId) {
      throw makeHttpError(400, "Customer party is required");
    }

    const query = Party.findOne({
      ...buildTravelPartyRoleQuery(userId, CUSTOMER_TYPES.CUSTOMER),
      _id: normalized.customerPartyId,
    }).populate("account");

    const party = await getSessionQuery(query, session);

    if (!party || !party.account) {
      throw makeHttpError(404, "Travel party account not found");
    }

    return {
      entityType: CUSTOMER_TYPES.PARTY,
      customerType: CUSTOMER_TYPES.PARTY,
      id: party._id,
      partyId: party._id,
      customerId: null,
      accountId: party.account._id || party.account,
      record: party,
      name: party.name || "",
      phone: party.phone || "",
      email: party.email || "",
    };
  }

  if (!normalized.customerId) {
    throw makeHttpError(400, "Customer is required");
  }

  const query = Customer.findOne(
    applyModuleScopeFilter(
      {
        _id: normalized.customerId,
        createdBy: userId,
        isActive: {
          $ne: false,
        },
      },
      MODULE_SCOPES.TRAVEL,
    ),
  ).populate("account");

  const customer = await getSessionQuery(query, session);

  if (!customer || !customer.account) {
    throw makeHttpError(404, "Travel customer account not found");
  }

  return {
    entityType: CUSTOMER_TYPES.CUSTOMER,
    customerType: CUSTOMER_TYPES.CUSTOMER,
    id: customer._id,
    partyId: null,
    customerId: customer._id,
    accountId: customer.account._id || customer.account,
    record: customer,
    name: customer.name || "",
    phone: customer.phone || "",
    email: customer.email || "",
  };
};

const resolveTravelVendorCounterparty = async ({
  userId,
  source = {},
  existing = {},
  session = null,
}) => {
  const normalized = normalizeVendorCounterpartyInput(source, existing);

  if (normalized.vendorType === VENDOR_TYPES.PARTY) {
    if (!normalized.vendorPartyId) {
      throw makeHttpError(400, "Vendor party is required");
    }

    const query = Party.findOne({
      ...buildTravelPartyRoleQuery(userId, VENDOR_TYPES.VENDOR),
      _id: normalized.vendorPartyId,
    }).populate("account");

    const party = await getSessionQuery(query, session);

    if (!party || !party.account) {
      throw makeHttpError(404, "Travel party account not found");
    }

    return {
      entityType: VENDOR_TYPES.PARTY,
      vendorType: VENDOR_TYPES.PARTY,
      id: party._id,
      partyId: party._id,
      supplierId: null,
      vendorId: null,
      accountId: party.account._id || party.account,
      record: party,
      name: party.name || "",
      phone: party.phone || "",
      email: party.email || "",
    };
  }

  if (!normalized.vendorId) {
    throw makeHttpError(400, "Vendor is required");
  }

  const query = Supplier.findOne(
    applySupplierModuleScopeFilter(
      {
        _id: normalized.vendorId,
        userId,
        isDeleted: false,
      },
      MODULE_SCOPES.TRAVEL,
    ),
  ).populate("account");

  const vendor = await getSessionQuery(query, session);

  if (!vendor || !vendor.account) {
    throw makeHttpError(404, "Travel vendor account not found");
  }

  return {
    entityType: VENDOR_TYPES.VENDOR,
    vendorType: VENDOR_TYPES.VENDOR,
    id: vendor._id,
    partyId: null,
    supplierId: vendor._id,
    vendorId: vendor._id,
    accountId: vendor.account._id || vendor.account,
    record: vendor,
    name: vendor.name || "",
    phone: vendor.phone || "",
    email: vendor.email || "",
  };
};

const getCustomerJournalIdentity = (counterparty) =>
  counterparty?.entityType === CUSTOMER_TYPES.PARTY
    ? {
        customerId: null,
        partyId: counterparty.partyId || counterparty.id,
      }
    : {
        customerId: counterparty?.customerId || counterparty?.id || null,
        partyId: null,
      };

const getVendorJournalIdentity = (counterparty) =>
  counterparty?.entityType === VENDOR_TYPES.PARTY
    ? {
        supplierId: null,
        partyId: counterparty.partyId || counterparty.id,
      }
    : {
        supplierId: counterparty?.supplierId || counterparty?.id || null,
        partyId: null,
      };

const serializeCounterparty = (counterparty) => {
  if (!counterparty) {
    return null;
  }

  const record = counterparty.record || counterparty;

  return {
    _id: record._id || counterparty.id,
    name: record.name || counterparty.name || "",
    phone: record.phone || counterparty.phone || "",
    email: record.email || counterparty.email || "",
    role: record.role || "",
    moduleScope: record.moduleScope || MODULE_SCOPES.TRAVEL,
    entityType: counterparty.entityType || "party",
    counterpartyType:
      counterparty.customerType || counterparty.vendorType || counterparty.entityType || "party",
  };
};

module.exports = {
  CUSTOMER_TYPES,
  VENDOR_TYPES,
  TRAVEL_PARTY_OPENING_ORIGIN,
  buildTravelPartyRoleQuery,
  getCustomerJournalIdentity,
  getVendorJournalIdentity,
  normalizeCustomerCounterpartyInput,
  normalizeVendorCounterpartyInput,
  resolveTravelCustomerCounterparty,
  resolveTravelVendorCounterparty,
  serializeCounterparty,
};
