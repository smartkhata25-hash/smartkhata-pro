const puppeteer = require("puppeteer");

let browserInstance = null;

/**
 * Launch browser once (Reusable Instance)
 */
const getBrowser = async () => {
  if (!browserInstance) {
    console.log("🚀 Launching Puppeteer Browser...");

    browserInstance = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    console.log("✅ Puppeteer Browser Started");
  }

  return browserInstance;
};

/**
 * Generate PDF from HTML
 * @param {string} html - Complete HTML string
 * @returns {Buffer} PDF Buffer
 */
const generatePdfFromHtml = async (html) => {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setContent(html, {
      waitUntil: "networkidle0",
    });

    console.log("✅ HTML loaded in browser");

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
    });

    console.log("✅ PDF generated");

    console.log("📦 Is Buffer:", Buffer.isBuffer(pdfBuffer));

    console.log("📏 Buffer Length:", pdfBuffer?.length);

    console.log("🧪 First Bytes:", pdfBuffer?.subarray(0, 20).toString());

    await page.close();

    return pdfBuffer;
  } catch (error) {
    console.error("❌ PDF SERVICE ERROR:", {
      message: error.message,
      stack: error.stack,
    });

    await page.close();

    throw error;
  }
};

/**
 * Gracefully close browser (optional future use)
 */
const closeBrowser = async () => {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
};

module.exports = {
  generatePdfFromHtml,
  closeBrowser,
};
