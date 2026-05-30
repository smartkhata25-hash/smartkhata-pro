const { PDFParse } = require("pdf-parse");

/* =========================================================
   🧠 HELPERS
========================================================= */

const cleanNumber = (val) => {
  if (!val) return 0;

  try {
    let str = val.toString();

    str = str
      .replace(/rs\.?/gi, "")
      .replace(/,/g, "")
      .replace(/\s+/g, "")
      .trim();

    const num = Number(str);

    return isNaN(num) ? 0 : num;
  } catch {
    return 0;
  }
};

const cleanText = (text = "") => {
  return text.replace(/\t/g, " ").replace(/\s+/g, " ").trim();
};

const isNoiseLine = (line = "") => {
  const badWords = [
    "Items List Report",
    "All Items Report",
    "Report Generated",
    "Generated",
    "INSTALL",
    "Start Using Digikhata",
    "Help:",
    "Page",
    "Grand Total",
    "No. of Items",
    "Stock Value",
    "Collection Date",
    "JAVED BEARING",
    "# Item",
    "Unit Stock in Hand",
  ];

  return badWords.some((word) =>
    line.toLowerCase().includes(word.toLowerCase()),
  );
};

const isOnlyNumber = (line = "") => {
  return /^\d+$/.test(line.trim());
};

const containsUrdu = (text = "") => {
  return /[\u0600-\u06FF]/.test(text);
};

const isUnitLine = (line = "") => {
  return (
    line.includes("Pieces") || line.includes("(pcs)") || line.includes("pcs")
  );
};

const extractStock = (line = "") => {
  const match = line.match(/(\d+)\s*$/);

  if (!match) return 0;

  return cleanNumber(match[1]);
};

/* =========================================================
   🔥 MAIN PARSER
========================================================= */

const parseProductPdf = async (buffer) => {
  try {
    const parser = new PDFParse({
      data: buffer,
    });

    const pdfData = await parser.getText();

    const text = pdfData?.text || pdfData?.result || "";

    let lines = text
      .split("\n")
      .map((l) => cleanText(l))
      .filter(Boolean);

    // ✅ remove useless lines
    lines = lines.filter((line) => !isNoiseLine(line));

    const valid = [];
    const errors = [];

    /* =====================================================
       🔥 SMART MULTILINE PARSER
    ===================================================== */

    let currentItem = "";

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // ===============================================
      // ❌ skip serial numbers
      // ===============================================

      if (isOnlyNumber(line)) {
        continue;
      }

      // ===============================================
      // 🔥 remove starting serial
      // ===============================================

      line = line.replace(/^\d+\s+/, "").trim();

      // ===============================================
      // ❌ empty
      // ===============================================

      if (!line) continue;

      // ===============================================
      // 🔥 detect final stock line
      // ===============================================

      if (isUnitLine(line)) {
        const stock = extractStock(line);

        // remove unit text
        let cleanedLine = line
          .replace(/Pieces\s*\(pcs\)/gi, "")
          .replace(/pcs/gi, "")
          .trim();

        // remove ending stock
        cleanedLine = cleanedLine.replace(/\d+\s*$/, "").trim();

        // add remaining text if any
        if (cleanedLine) {
          currentItem += " " + cleanedLine;
        }

        currentItem = cleanText(currentItem);

        // remove random garbage
        currentItem = currentItem
          .replace(/\bMODEL\b/gi, "")
          .replace(/\bGENUINE\b/gi, "")
          .trim();

        // ===========================================
        // ✅ SAVE FINAL PRODUCT
        // ===========================================

        if (currentItem.length >= 2) {
          valid.push({
            name: currentItem,
            stock,
            unitCost: 0,
            salePrice: 0,
          });
        }

        currentItem = "";

        continue;
      }

      // ===============================================
      // 🔥 join multiline urdu/english names
      // ===============================================

      currentItem += " " + line;

      currentItem = cleanText(currentItem);
    }

    /* =====================================================
       🔥 REMOVE DUPLICATES
    ===================================================== */

    const uniqueMap = new Map();

    for (const item of valid) {
      const key = item.name.toLowerCase();

      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, item);
      }
    }

    const finalData = Array.from(uniqueMap.values());

    return {
      valid: finalData,
      errors,
    };
  } catch (error) {
    console.error("❌ PRODUCT PDF PARSE ERROR:", error);

    return {
      valid: [],
      errors: [
        {
          row: 0,
          message: "Invalid product PDF",
        },
      ],
    };
  }
};

module.exports = {
  parseProductPdf,
};
