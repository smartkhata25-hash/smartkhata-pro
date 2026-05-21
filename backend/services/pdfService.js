const chromium = require("@sparticuz/chromium");

const puppeteerCore = require("puppeteer-core");

const puppeteer = require("puppeteer");

let browserInstance = null;

/**
 * Launch browser once
 */
const getBrowser = async () => {
  try {
    if (!browserInstance) {
      /* ================= PRODUCTION ================= */
      if (process.env.NODE_ENV === "production") {
        const executablePath = await chromium.executablePath();

        browserInstance = await puppeteerCore.launch({
          args: chromium.args,
          defaultViewport: chromium.defaultViewport,
          executablePath,
          headless: chromium.headless,
        });

        console.log("🌍 Production Browser Started");
      } else {
        /* ================= LOCAL DEVELOPMENT ================= */

        browserInstance = await puppeteer.launch({
          headless: true,
        });
      }
    } else {
      console.log("♻️ Reusing existing browser instance");
    }

    return browserInstance;
  } catch (error) {
    console.error("❌ BROWSER LAUNCH ERROR FULL:", {
      message: error.message,
      stack: error.stack,
    });

    throw error;
  }
};

/**
 * Generate PDF from HTML
 */
const generatePdfFromHtml = async (html) => {
  const browser = await getBrowser();

  const page = await browser.newPage();

  try {
    await page.setContent(html, {
      waitUntil: "networkidle0",
    });
    await page.emulateMediaType("screen");

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });

    await page.close();

    return pdfBuffer;
  } catch (error) {
    console.error("❌ PDF SERVICE ERROR FULL:", {
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
  try {
    if (browserInstance) {
      await browserInstance.close();

      browserInstance = null;
    }
  } catch (error) {
    console.error("❌ CLOSE BROWSER ERROR:", {
      message: error.message,
      stack: error.stack,
    });
  }
};

module.exports = {
  generatePdfFromHtml,
  closeBrowser,
};
