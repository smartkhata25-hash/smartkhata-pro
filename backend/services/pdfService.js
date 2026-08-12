const chromium = require("@sparticuz/chromium");
const puppeteerCore = require("puppeteer-core");
const puppeteer = require("puppeteer");

let browserInstance = null;

const getBrowser = async () => {
  try {
    if (browserInstance && browserInstance.connected) {
      return browserInstance;
    }

    browserInstance = null;

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
      browserInstance = await puppeteer.launch({
        headless: true,
      });
    }

    browserInstance.on("disconnected", () => {
      browserInstance = null;
    });

    return browserInstance;
  } catch (error) {
    console.error("❌ BROWSER LAUNCH ERROR FULL:", {
      message: error.message,
      stack: error.stack,
    });

    browserInstance = null;
    throw error;
  }
};

const generatePdfFromHtml = async (html) => {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setContent(html, {
      waitUntil: "domcontentloaded",
    });

    await page.emulateMediaType("screen");

    if (page.evaluate) {
      await page.evaluate(async () => {
        if (document.fonts?.ready) {
          await document.fonts.ready;
        }
      });
    }

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });

    return pdfBuffer;
  } catch (error) {
    console.error("❌ PDF SERVICE ERROR FULL:", {
      message: error.message,
      stack: error.stack,
    });

    throw error;
  } finally {
    try {
      await page.close();
    } catch (_) {}
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

    browserInstance = null;
  }
};

module.exports = {
  generatePdfFromHtml,
  closeBrowser,
};
