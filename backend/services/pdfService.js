const chromium = require("@sparticuz/chromium");

const puppeteerCore = require("puppeteer-core");

const puppeteer = require("puppeteer");

let browserInstance = null;

/**
 * Launch browser once
 */
const getBrowser = async () => {
  try {
    console.log("🟡 getBrowser() called");

    if (!browserInstance) {
      console.log("🚀 Launching Chromium Browser...");

      console.log("🔥 BEFORE BROWSER LAUNCH");

      /* ================= PRODUCTION ================= */
      if (process.env.NODE_ENV === "production") {
        const executablePath = await chromium.executablePath();

        console.log("📍 Production Chromium Path:", executablePath);

        browserInstance = await puppeteerCore.launch({
          args: chromium.args,
          defaultViewport: chromium.defaultViewport,
          executablePath,
          headless: chromium.headless,
        });

        console.log("🌍 Production Browser Started");
      } else {

      /* ================= LOCAL DEVELOPMENT ================= */
        console.log("💻 Local Puppeteer Launch");

        browserInstance = await puppeteer.launch({
          headless: true,
        });

        console.log("💻 Local Browser Started");
      }

      console.log("🔥 AFTER BROWSER LAUNCH");

      console.log("✅ Chromium Browser Started");
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
  console.log("📄 Starting PDF generation...");

  console.log("📏 HTML Length:", html?.length);

  console.log("🟡 Calling getBrowser()...");

  const browser = await getBrowser();

  console.log("✅ Browser object received");

  console.log("🟡 Creating new page...");

  const page = await browser.newPage();

  console.log("✅ New page created");

  try {
    console.log("📄 Setting HTML...");

    await page.setContent(html, {
      waitUntil: "networkidle0",
    });

    console.log("✅ HTML loaded");

    await page.emulateMediaType("screen");

    console.log("✅ Screen media emulated");

    console.log("🟡 Generating PDF buffer...");

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });

    console.log("✅ PDF generated");

    console.log("📦 Is Buffer:", Buffer.isBuffer(pdfBuffer));

    console.log("📏 Buffer Length:", pdfBuffer?.length);

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
    } catch (_) {}

    throw error;
  }
};

const closeBrowser = async () => {
  try {
    console.log("🟡 closeBrowser() called");

    if (browserInstance) {
      console.log("🛑 Closing browser...");

      await browserInstance.close();

      console.log("✅ Browser closed");

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
