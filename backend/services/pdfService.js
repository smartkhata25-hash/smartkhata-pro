const puppeteer = require("puppeteer");

let browserInstance = null;

/**
 * Launch browser once (Reusable Instance)
 */
const getBrowser = async () => {
  if (!browserInstance) {
    browserInstance = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
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

    const pdfBuffer = await page.pdf({
      printBackground: true,
      displayHeaderFooter: false,
      preferCSSPageSize: true,
    });
    await page.close();

    return pdfBuffer;
  } catch (error) {
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
