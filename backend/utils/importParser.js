const XLSX = require("xlsx");

/* =========================================================
   🧠 SMART CLEANING ENGINE
========================================================= */

// Normalize header keys
const normalizeKey = (key) => {
  return key
    .toString()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");
};

// Clean cell values
const cleanValue = (val) => {
  if (val === null || val === undefined) return "";
  return val.toString().trim();
};

// Convert to number safely
const toNumber = (val) => {
  if (val === "" || val === null || val === undefined) return 0;

  try {
    let str = val.toString().toLowerCase().trim();

    str = str
      .replace(/rs\.?/g, "")
      .replace(/pkr/g, "")
      .replace(/,/g, "")
      .replace(/\s+/g, "");

    if (str.startsWith("(") && str.endsWith(")")) {
      str = "-" + str.slice(1, -1);
    }

    str = str.replace(/[^\d.-]/g, "");

    const num = Number(str);
    return isNaN(num) ? NaN : num;
  } catch {
    return NaN;
  }
};

/* =========================================================
   🔍 COLUMN DETECTION ENGINE
========================================================= */

const COLUMN_ALIASES = {
  name: [
    "name",
    "customer",
    "client",
    "vendor",
    "party",
    "item",
    "product",
    "productname",
    "itemname",
    "accountname",
    "title",
  ],

  // ✅ NEW (IMPORTANT)
  category: ["category", "group", "type", "itemcategory", "productcategory"],

  phone: ["phone", "mobile", "contact", "contactnumber", "phonenumber", "cell"],

  youget: ["youllget", "receive", "credit", "dr", "debit", "in"],
  yougive: ["youllgive", "pay", "debit", "cr", "credit", "out"],

  balance: [
    "balance",
    "openingbalance",
    "amount",
    "netbalance",
    "closingbalance",
  ],

  cost: ["cost", "purchaseprice", "buyprice", "unitcost", "costprice"],
  saleprice: ["saleprice", "price", "sellingprice", "sale", "retailprice"],

  stock: ["stock", "qty", "quantity", "quantityonhand", "onhand", "balanceqty"],
};

// Detect columns dynamically
const detectColumns = (row) => {
  const detected = {};

  Object.keys(row).forEach((key) => {
    const normalized = normalizeKey(key);

    for (let field in COLUMN_ALIASES) {
      if (COLUMN_ALIASES[field].includes(normalized)) {
        detected[field] = key;
      }
    }
  });

  return detected;
};

/* =========================================================
   📄 EXCEL PARSER
========================================================= */

const parseExcelFile = (buffer) => {
  try {
    const workbook = XLSX.read(buffer, { type: "buffer" });

    let bestSheet = workbook.SheetNames[0];
    let maxRows = 0;

    workbook.SheetNames.forEach((name) => {
      const sheet = workbook.Sheets[name];
      const data = XLSX.utils.sheet_to_json(sheet);
      if (data.length > maxRows) {
        maxRows = data.length;
        bestSheet = name;
      }
    });

    const sheet = workbook.Sheets[bestSheet];

    let data = XLSX.utils.sheet_to_json(sheet, {
      defval: "",
      raw: false,
    });

    return data.map((row) => {
      const cleaned = {};

      Object.keys(row).forEach((key) => {
        const cleanKey = normalizeKey(key);
        cleaned[cleanKey] = cleanValue(row[key]);
      });

      return cleaned;
    });
  } catch (error) {
    console.error("❌ Excel parsing error:", error);
    throw new Error("Invalid Excel file format");
  }
};

/* =========================================================
   👤 PARTY TRANSFORM
========================================================= */

const transformPartyData = (rows, type = "customer") => {
  const valid = [];
  const errors = [];

  if (!rows.length) {
    return { valid, errors: [{ row: 0, message: "Empty file" }] };
  }

  const detectedColumns = detectColumns(rows[0]);

  rows.forEach((row, index) => {
    const rowNumber = index + 2;

    try {
      let name =
        row[detectedColumns.name] ||
        row.name ||
        row.customer ||
        row.vendor ||
        "";

      if (name.includes(":")) {
        name = name.split(":").pop().trim();
      }

      const phone = row[detectedColumns.phone] || row.phone || "";

      let youGet =
        toNumber(row[detectedColumns.youget]) ?? toNumber(row.youget);

      let youGive =
        toNumber(row[detectedColumns.yougive]) ?? toNumber(row.yougive);

      let balance =
        toNumber(row[detectedColumns.balance]) ?? toNumber(row.balance);

      if (!name) {
        errors.push({ row: rowNumber, message: "Name is required" });
        return;
      }

      if (!isNaN(balance) && balance !== 0) {
        if (type === "customer") {
          youGet = balance > 0 ? balance : 0;
          youGive = balance < 0 ? Math.abs(balance) : 0;
        } else {
          youGive = balance > 0 ? balance : 0;
          youGet = balance < 0 ? Math.abs(balance) : 0;
        }
      }

      if (isNaN(youGet) || isNaN(youGive)) {
        errors.push({ row: rowNumber, message: "Invalid numeric values" });
        return;
      }

      const openingBalance =
        type === "customer" ? youGet - youGive : youGive - youGet;

      valid.push({
        name: name.toString().trim(),
        phone: phone.toString().trim(),
        openingBalance,
      });
    } catch {
      errors.push({ row: rowNumber, message: "Unexpected error in row" });
    }
  });

  return { valid, errors };
};

/* =========================================================
   📦 PRODUCT TRANSFORM (🔥 FINAL UNIVERSAL LOGIC)
========================================================= */

const transformProductData = (rows) => {
  const valid = [];
  const errors = [];

  if (!rows.length) {
    return { valid, errors: [{ row: 0, message: "Empty file" }] };
  }

  const detectedColumns = detectColumns(rows[0]);

  rows.forEach((row, index) => {
    const rowNumber = index + 2;

    try {
      let rawName =
        row[detectedColumns.name] || row.name || row.item || row.product || "";

      let name = rawName;
      let category = "";

      // ✅ PRIORITY 1 → Category column
      if (detectedColumns.category && row[detectedColumns.category]) {
        category = row[detectedColumns.category].trim();
      }

      // ✅ PRIORITY 2 → Colon split (only if no category column)
      else if (rawName.includes(":")) {
        const parts = rawName.split(":");
        category = parts[0]?.trim() || "";
        name = parts.slice(1).join(":").trim();
      }

      const unitCost = toNumber(row[detectedColumns.cost] ?? row.cost);
      const salePrice = toNumber(
        row[detectedColumns.saleprice] ?? row.saleprice,
      );

      const rawStock = toNumber(row[detectedColumns.stock] ?? row.stock);
      const stock = isNaN(rawStock) ? NaN : rawStock;

      if (!name) {
        errors.push({ row: rowNumber, message: "Name is required" });
        return;
      }

      if (isNaN(unitCost) || isNaN(salePrice) || isNaN(stock)) {
        errors.push({ row: rowNumber, message: "Invalid numeric values" });
        return;
      }

      valid.push({
        name: name.toString().trim(),
        category: category || "",
        unitCost,
        salePrice,
        stock,
      });
    } catch {
      errors.push({ row: rowNumber, message: "Unexpected error" });
    }
  });

  return { valid, errors };
};

/* =========================================================
   🚀 EXPORTS
========================================================= */

module.exports = {
  parseExcelFile,
  transformPartyData,
  transformProductData,
};
