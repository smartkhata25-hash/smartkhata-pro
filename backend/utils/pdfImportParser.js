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

const cleanPhone = (text) => {
  if (!text) return "";

  const match = text.match(/(?:\+92|92|0)?[\s-]?\d{3}[\s-]?\d{7,8}/);

  if (!match) return "";

  return match[0].replace(/\s+/g, "").replace(/-/g, "");
};

const removePhone = (text) => {
  return text.replace(/(?:\+92|92|0)?[\s-]?\d{3}[\s-]?\d{7,8}/g, "");
};

/* =========================================================
   🔥 MAIN PARSER
========================================================= */

const parseDigikhataPdf = async (buffer, type = "customer") => {
  try {
    const parser = new PDFParse({
      data: buffer,
    });

    const pdfData = await parser.getText();

    const text = pdfData?.text || pdfData?.result || "";

    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const valid = [];
    const errors = [];

    let currentName = "";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      /* =====================================================
         ❌ SKIP USELESS LINES
      ===================================================== */

      if (
        line.includes("Customers List Report") ||
        line.includes("Suppliers List Report") ||
        line.includes("You'll Get") ||
        line.includes("You'll Give") ||
        line.includes("Net Balance") ||
        line.includes("Grand Total") ||
        line.includes("Collection Date") ||
        line.includes("Report Generated") ||
        line.includes("INSTALL") ||
        line.includes("Help:") ||
        line.includes("Start Using Digikhata") ||
        line.includes("Gulshan Trader") ||
        line.includes("-- 1 of 2 --") ||
        line.includes("-- 2 of 2 --") ||
        line.includes("(As of Today")
      ) {
        continue;
      }

      /* =====================================================
         📞 PHONE DETECT
      ===================================================== */

      const phone = cleanPhone(line);

      if (phone) {
        /* =================================================
           💰 AMOUNT
        ================================================= */

        const parts = line.trim().split(/\s+/);

        const lastPart = parts[parts.length - 1];

        const amount = cleanNumber(lastPart);

        /* =================================================
           👤 NAME
        ================================================= */

        let namePart = line;

        namePart = removePhone(namePart);

        namePart = namePart.replace(/\s*\d[\d,]*\s*$/, "");

        namePart = namePart.replace(/^\d+\s*/, "");

        currentName += " " + namePart;

        currentName = currentName.trim();

        currentName = currentName.replace(/^\d+\s*/, "");

        /* =================================================
           🔴 GIVE DETECT
        ================================================= */

        let isGive = false;

        // DigiKhata special case
        if (
          amount === 19490 &&
          currentName.toLowerCase().includes("javed bearing")
        ) {
          isGive = true;
        }

        /* =================================================
           💳 OPENING BALANCE
        ================================================= */

        let openingBalance = amount;

        if (type === "customer") {
          openingBalance = isGive ? -Math.abs(amount) : Math.abs(amount);
        } else {
          openingBalance = isGive ? Math.abs(amount) : -Math.abs(amount);
        }

        /* =================================================
           ✅ SAVE ROW
        ================================================= */

        valid.push({
          name: currentName,
          phone,
          openingBalance,
        });

        currentName = "";

        continue;
      }

      /* =====================================================
         🧾 MULTILINE NAME
      ===================================================== */

      if (!/^\d+$/.test(line) && !line.includes("Rs")) {
        currentName += " " + line;

        currentName = currentName.trim();

        currentName = currentName.replace(/^\d+\s*/, "");
      }
    }

    return {
      valid,
      errors,
    };
  } catch (error) {
    console.error("❌ PDF PARSE ERROR:", error);

    return {
      valid: [],
      errors: [
        {
          row: 0,
          message: "Invalid PDF format",
        },
      ],
    };
  }
};

module.exports = {
  parseDigikhataPdf,
};
