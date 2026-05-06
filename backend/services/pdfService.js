const puppeteer = require("puppeteer");

let browserInstance = null;

/**
 * Launch browser once
 */
const getBrowser = async () => {
  if (!browserInstance) {
    console.log("🚀 Launching Puppeteer Browser...");

    browserInstance = await puppeteer.launch({
      headless: true,

      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--single-process",
      ],
    });

    console.log("✅ Puppeteer Browser Started");
  }

  return browserInstance;
};

/**
 * Generate PDF from HTML
 */
const generatePdfFromHtml = async (html) => {
  console.log("📄 Starting PDF generation...");

  console.log("📏 HTML Length:", html?.length);

  const browser = await getBrowser();

  const page = await browser.newPage();

  try {
    console.log("📄 Setting HTML...");

    await page.setContent(html, {
      waitUntil: "networkidle0",
    });

    console.log("✅ HTML loaded");

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });

    console.log("✅ PDF generated");

    console.log("📦 Is Buffer:", Buffer.isBuffer(pdfBuffer));

    console.log("📏 Buffer Length:", pdfBuffer?.length);

    await page.close();

    return pdfBuffer;
  } catch (error) {
    console.error("❌ PDF SERVICE ERROR:", {
      message: error.message,
      stack: error.stack,
    });

    try {
      await page.close();
    } catch (_) {}

    throw error;
  }
};

const closeBrowser = async () => {
  if (browserInstance) {
    console.log("🛑 Closing browser...");

    await browserInstance.close();

    browserInstance = null;
  }
};

module.exports = {
  generatePdfFromHtml,
  closeBrowser,
};
