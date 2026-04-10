const buildAgingPrintData = require("../services/agingPrintBuilder");
const generateAgingReportHTML = require("../templates/agingReportTemplate");
const { generatePdfFromHtml } = require("../services/pdfService");

// 🔹 existing aging report logic
const { getAgingReportData } = require("../services/agingService");

/* =========================================================
   GET AGING REPORT HTML (OPEN DIRECTLY IN BROWSER)
========================================================= */

const getAgingReportHtml = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { asOfDate, size } = req.query;

    // 🔹 Fetch Aging Data
    const agingData = await getAgingReportData({
      userId,
      asOfDate,
    });

    // 🔹 Build Print Data
    const built = buildAgingPrintData({
      asOfDate,
      aging: agingData,
    });

    // 🔹 Generate HTML
    const html = generateAgingReportHTML(built, size || "A5");

    res.set({
      "Content-Type": "text/html",
    });

    return res.send(html);
  } catch (error) {
    return res.status(500).send("Failed to generate aging HTML");
  }
};

/* =========================================================
   GENERATE AGING REPORT PDF
========================================================= */

const generateAgingReportPdf = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { asOfDate, size } = req.query;

    // 🔹 Fetch Aging Data
    const agingData = await getAgingReportData({
      userId,
      asOfDate,
    });

    // 🔹 Build Print Data
    const built = buildAgingPrintData({
      asOfDate,
      aging: agingData,
    });

    // 🔹 Generate HTML
    const html = generateAgingReportHTML(built, size || "A5");

    // 🔹 Convert to PDF
    const pdfBuffer = await generatePdfFromHtml(html);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=Customer-Aging-Report.pdf`,
      "Content-Length": pdfBuffer.length,
    });

    return res.send(pdfBuffer);
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Aging report PDF generation failed" });
  }
};

module.exports = {
  getAgingReportHtml,
  generateAgingReportPdf,
};
