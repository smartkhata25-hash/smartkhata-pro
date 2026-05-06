const puppeteer = require("puppeteer");

let browserInstance = null;

/**
 * Launch browser once
 */
const getBrowser = async () => {
  if (!browserInstance) {
    console.log("🚀 Launching Puppeteer Browser...");

    // ✅ Auto detect chrome path
    const executablePath = puppeteer.executablePath();

    console.log("📍 Chrome Executable Path:", executablePath);

    browserInstance = await puppeteer.launch({
      headless: true,
      executablePath,

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
 * @param {string} html
 * @returns {Buffer}
 */
const generatePdfFromHtml = async (html) => {
  console.log("📄 Starting PDF generation...");

  // ✅ HTML DEBUG
  console.log("📏 HTML Length:", html?.length);

  console.log("🧪 HTML Preview:", html?.substring(0, 300));

  const browser = await getBrowser();

  console.log("🌐 Opening new page...");

  const page = await browser.newPage();

  try {
    console.log("📄 Setting HTML content...");

    await page.setContent(html, {
      waitUntil: "networkidle0",
    });

    console.log("✅ HTML loaded in browser");

    console.log("🖨️ Generating PDF...");

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: false,
      preferCSSPageSize: true,
    });

    console.log("✅ PDF generated");

    // ✅ BUFFER DEBUG
    console.log("📦 Is Buffer:", Buffer.isBuffer(pdfBuffer));

    console.log("📏 Buffer Length:", pdfBuffer?.length);

    console.log("🧪 First Bytes:", pdfBuffer?.subarray(0, 20).toString());

    await page.close();

    console.log("✅ Page closed");

    return pdfBuffer;
  } catch (error) {
    console.error("❌ PDF SERVICE ERROR FULL:", {
      message: error.message,
      stack: error.stack,
    });

    try {
      await page.close();
    } catch (e) {
      console.error("❌ Error closing page:", e.message);
    }

    throw error;
  }
};

/**
 * Gracefully close browser
 */
const closeBrowser = async () => {
  if (browserInstance) {
    console.log("🛑 Closing Puppeteer Browser...");

    await browserInstance.close();

    browserInstance = null;

    console.log("✅ Browser Closed");
  }
};

module.exports = {
  generatePdfFromHtml,
  closeBrowser,
};
