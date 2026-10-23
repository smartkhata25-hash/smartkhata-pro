const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");

const PrintSetting = require("../models/PrintSetting");
const { _test: printSettingTest } = require("../controllers/printSettingController");
const buildCustomerLedgerPrint = require("../services/ledgerPrintBuilder");
const {
  resolveLedgerPrintHeader,
} = require("../services/ledgerPrintHeaderService");
const generateCustomerLedgerHTML = require("../templates/customerLedgerTemplate");
const buildPartyLedgerPrint = require("../services/partyLedgerPrintBuilder");
const generatePartyLedgerHTML = require("../templates/partyLedgerTemplate");
const buildCustomerDetailLedgerPrint = require("../services/customerDetailLedgerPrintBuilder");
const generateCustomerDetailLedgerHTML = require("../templates/customerDetailLedgerTemplate");
const buildPartyDetailLedgerPrint = require("../services/partyDetailLedgerPrintBuilder");
const generatePartyDetailLedgerHTML = require("../templates/partyDetailLedgerTemplate");
const { t } = require("../i18n/i18n");
const {
  renderLedgerBusinessHeader,
} = require("../templates/ledgerBusinessHeader");
const {
  _test: { renderDocument: renderWeavingLedgerDocument },
} = require("../controllers/weavingLedgerPrintController");

const ledgerInput = () => ({
  customerName: "Travel Customer",
  openingBalance: 0,
  ledger: [
    {
      date: "2026-09-01",
      billNo: "TI-1",
      sourceType: "sale_invoice",
      debit: 18750,
      credit: 0,
    },
    {
      date: "2026-09-02",
      billNo: "RP-1",
      sourceType: "receive_payment",
      debit: 0,
      credit: 7500,
    },
  ],
});

const settings = () => ({
  sales: {
    settings: { showHeader: true },
    header: {
      companyName: "Trading Company",
      phone: "111",
      address: "Trading Address",
      showCompanyPhone: true,
      showCompanyAddress: true,
      showLogo: false,
      logoKey: "",
    },
  },
  travelInvoice: {
    settings: { showHeader: true },
    header: {
      companyName: "Travel Company",
      phone: "222",
      address: "Travel Address",
      showCompanyPhone: true,
      showCompanyAddress: true,
      showLogo: false,
      logoKey: "",
    },
  },
});

const textContent = (html) =>
  String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const countText = (value, fragment) =>
  value.split(fragment).length - 1;

const tableRows = (html) =>
  [...String(html).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) =>
    [...match[1].matchAll(/<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)].map(
      (cell) => textContent(cell[1]),
    ),
  );

const blockContaining = (html, classPrefix, billNo) => {
  const blocks = String(html).split(`<div class="${classPrefix}`);
  const block = blocks.find((candidate) => candidate.includes(`#${billNo}`));

  assert.ok(block, `Expected a rendered block for bill ${billNo}`);
  return textContent(block);
};

test("Travel customer ledger print maps credit to Money In and debit to Money Out", () => {
  const built = buildCustomerLedgerPrint(ledgerInput());

  assert.equal(built.rows[0].moneyIn, null);
  assert.equal(built.rows[0].moneyOut, 18750);
  assert.equal(built.rows[1].moneyIn, 7500);
  assert.equal(built.rows[1].moneyOut, null);
  assert.equal(built.summary.totalMoneyIn, 7500);
  assert.equal(built.summary.totalMoneyOut, 18750);
  assert.equal(built.summary.closingBalance, 11250);
});

test("Trading customer ledger print uses the same Money In and Money Out convention", () => {
  const built = buildCustomerLedgerPrint(ledgerInput());
  const html = generateCustomerLedgerHTML({ ...built, lang: "en" });

  const rows = tableRows(html);

  assert.match(html, /7,500/);
  assert.match(html, /18,750/);
  assert.equal(built.rows[0].debit, 18750);
  assert.equal(built.rows[1].credit, 7500);
  assert.deepEqual(rows[0].slice(3, 5), ["Money In", "Money Out"]);
  assert.deepEqual(rows[1].slice(3, 5), ["-", "18,750"]);
  assert.deepEqual(rows[2].slice(3, 5), ["7,500", "-"]);
});

test("customer detailed ledger labels debit as Money Out and credit as Money In", () => {
  const built = buildCustomerDetailLedgerPrint({
    customerName: "ELAHI FARM",
    openingBalance: 0,
    ledger: [
      { date: "2026-09-01", billNo: "4021", sourceType: "sale_invoice", debit: 21600, credit: 0 },
      { date: "2026-09-02", billNo: "RP-1", sourceType: "receive_payment", debit: 0, credit: 5000 },
      { date: "2026-09-03", billNo: "R-1129", sourceType: "refund_invoice", debit: 0, credit: 2000 },
    ],
  });

  assert.equal(built.summary.totalDebit, 21600);
  assert.equal(built.summary.totalCredit, 7000);
  assert.equal(built.summary.closingBalance, 14600);

  for (const lang of ["en", "ur"]) {
    const html = generateCustomerDetailLedgerHTML({ ...built, lang });
    const documentText = textContent(html);
    const sale = blockContaining(html, "ledger-block", "4021");
    const payment = blockContaining(html, "ledger-block", "RP-1");
    const refund = blockContaining(html, "ledger-block", "R-1129");

    assert.ok(documentText.includes(`${t("credit", lang)} 21,600`));
    assert.ok(documentText.includes(`${t("debit", lang)} 7,000`));
    assert.ok(sale.includes(`${t("credit", lang)} 21,600`));
    assert.ok(payment.includes(`${t("debit", lang)} 5,000`));
    assert.ok(refund.includes(`${t("debit", lang)} 2,000`));
    assert.ok(documentText.includes(`${t("ledger.closing", lang)} 14,600`));
  }
});

test("party ledger columns align debit with Money Out and credit with Money In", () => {
  const built = buildPartyLedgerPrint({
    partyName: "Combined Party",
    role: "both",
    openingBalance: 0,
    ledger: [
      { date: "2026-09-01", billNo: "D-1", sourceType: "sale_invoice", debit: 10000, credit: 0 },
      { date: "2026-09-02", billNo: "C-1", sourceType: "receive_payment", debit: 0, credit: 4000 },
    ],
  });

  assert.deepEqual(built.summary, {
    opening: 0,
    totalDebit: 10000,
    totalCredit: 4000,
    closingBalance: 6000,
  });

  for (const lang of ["en", "ur"]) {
    const html = generatePartyLedgerHTML({ ...built, lang });
    const rows = tableRows(html);
    const documentText = textContent(html);

    assert.deepEqual(rows[0].slice(3, 5), [t("credit", lang), t("debit", lang)]);
    assert.deepEqual(rows[1].slice(3, 6), ["10,000", "-", "10,000"]);
    assert.deepEqual(rows[2].slice(3, 6), ["-", "4,000", "6,000"]);
    assert.deepEqual(rows[3].slice(1, 4), ["10,000", "4,000", "6,000"]);
    assert.ok(documentText.includes(`${t("credit", lang)}: 10,000`));
    assert.ok(documentText.includes(`${t("debit", lang)}: 4,000`));
  }
});

test("party detailed ledger fixes top summary, blocks, and bottom totals without changing balances", () => {
  const built = buildPartyDetailLedgerPrint({
    partyName: "Combined Party",
    role: "both",
    openingBalance: 0,
    ledger: [
      { date: "2026-09-01", billNo: "D-1", sourceType: "sale_invoice", debit: 10000, credit: 0 },
      { date: "2026-09-02", billNo: "C-1", sourceType: "receive_payment", debit: 0, credit: 4000 },
    ],
  });

  assert.equal(built.blocks[0].balance, 10000);
  assert.equal(built.blocks[1].balance, 6000);
  assert.equal(built.summary.closingBalance, 6000);

  for (const lang of ["en", "ur"]) {
    const html = generatePartyDetailLedgerHTML({ ...built, lang });
    const documentText = textContent(html);
    const debitBlock = blockContaining(html, "block ", "D-1");
    const creditBlock = blockContaining(html, "block ", "C-1");

    assert.equal(countText(documentText, `${t("credit", lang)}: 10,000`), 2);
    assert.equal(countText(documentText, `${t("debit", lang)}: 4,000`), 2);
    assert.ok(debitBlock.includes(`${t("credit", lang)} 10,000`));
    assert.ok(debitBlock.includes(`${t("balance", lang)} 10,000`));
    assert.ok(creditBlock.includes(`${t("debit", lang)} 4,000`));
    assert.ok(creditBlock.includes(`${t("balance", lang)} 6,000`));
  }
});

test("print and PDF handlers share each corrected ledger template", () => {
  const controllers = [
    ["detailLedgerPrintController.js", "generateCustomerDetailLedgerHTML"],
    ["partyLedgerPrintController.js", "generatePartyLedgerHTML"],
    ["partyDetailLedgerPrintController.js", "generatePartyDetailLedgerHTML"],
  ];

  for (const [fileName, renderer] of controllers) {
    const source = fs.readFileSync(path.join(__dirname, "..", "controllers", fileName), "utf8");
    assert.equal(countText(source, `const html = ${renderer}(`), 2);
  }
});

test("ledger header without a logo renders business details without an image placeholder", () => {
  const header = resolveLedgerPrintHeader(settings(), "trading");
  const html = generateCustomerLedgerHTML({
    ...buildCustomerLedgerPrint({ ...ledgerInput(), header }),
    lang: "en",
  });

  assert.match(html, /Trading Company/);
  assert.match(html, /111/);
  assert.match(html, /Customer Ledger/);
  assert.doesNotMatch(html, /<div class="title">/);
  assert.ok(html.indexOf("Trading Company") < html.indexOf("Travel Customer"));
  assert.doesNotMatch(renderLedgerBusinessHeader(header), /<img/);
});

test("party ledger uses the company as its main heading instead of a ledger title", () => {
  const header = resolveLedgerPrintHeader(settings(), "trading");
  const built = buildPartyLedgerPrint({
    partyName: "Ledger Party",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    header,
  });
  const html = generatePartyLedgerHTML({ ...built, lang: "en" });

  assert.ok(html.indexOf("Trading Company") < html.indexOf("Ledger Party"));
  assert.doesNotMatch(html, /<h2>Party Ledger<\/h2>/);
  assert.match(html, /From/);
  assert.match(html, /To/);
});

test("stored logo renders only when showLogo is enabled", () => {
  const originalPublicUrl = process.env.R2_PUBLIC_URL;
  process.env.R2_PUBLIC_URL = "https://files.example.com";
  try {
    const value = settings();
    value.sales.header.logoKey = "users/1/print-logos/logo.webp";
    value.sales.header.showLogo = true;
    const shown = renderLedgerBusinessHeader(
      resolveLedgerPrintHeader(value, "trading"),
    );
    assert.match(shown, /<img/);
    assert.match(shown, /logo\.webp/);

    value.sales.header.showLogo = false;
    const hidden = renderLedgerBusinessHeader(
      resolveLedgerPrintHeader(value, "trading"),
    );
    assert.doesNotMatch(hidden, /<img/);
  } finally {
    if (originalPublicUrl === undefined) delete process.env.R2_PUBLIC_URL;
    else process.env.R2_PUBLIC_URL = originalPublicUrl;
  }
});

test("print settings store an optional logo key and expose a usable preview URL", () => {
  const originalPublicUrl = process.env.R2_PUBLIC_URL;
  process.env.R2_PUBLIC_URL = "https://files.example.com";
  try {
    const setting = new PrintSetting({
      userId: new mongoose.Types.ObjectId(),
      sales: {
        header: {
          logoKey: "users/1/print-logos/logo.webp",
          showLogo: true,
        },
      },
    });
    const serialized = printSettingTest.serializePrintSetting(setting);

    assert.equal(serialized.sales.header.logoKey, "users/1/print-logos/logo.webp");
    assert.equal(
      serialized.sales.header.logoUrl,
      "https://files.example.com/users/1/print-logos/logo.webp",
    );
  } finally {
    if (originalPublicUrl === undefined) delete process.env.R2_PUBLIC_URL;
    else process.env.R2_PUBLIC_URL = originalPublicUrl;
  }
});

test("Trading and Travel ledger headers remain module-separated", () => {
  const value = settings();
  const trading = resolveLedgerPrintHeader(value, "trading");
  const travel = resolveLedgerPrintHeader(value, "travel");

  assert.equal(trading.companyName, "Trading Company");
  assert.equal(travel.companyName, "Travel Company");
  assert.notEqual(trading.phone, travel.phone);
});

test("Weaving party ledger adds the business header without changing financial rows", () => {
  const html = renderWeavingLedgerDocument({
    header: { companyName: "Weaving Company", phone: "333", address: "Mill Road" },
    ledger: {
      party: { _id: "party-1", name: "Fabric Buyer", phone: "444" },
      period: { from: "2026-09-01", to: "2026-09-30" },
      summary: { opening: 10, debit: 100, credit: 40, closing: 70 },
      rows: [
        {
          date: "2026-09-05T00:00:00.000Z",
          reference: "WS-1",
          type: "Sale",
          description: "Fabric sale",
          debit: 100,
          credit: 40,
          runningBalance: 70,
        },
      ],
    },
  });

  assert.match(html, /Weaving Company/);
  assert.match(html, /Fabric Buyer/);
  assert.doesNotMatch(html, /<h1>Party Ledger<\/h1>/);
  assert.match(html, /Party: Fabric Buyer/);
  assert.match(html, /From: 2026-09-01 \| To: 2026-09-30/);
  assert.match(html, /Rs\. 100/);
  assert.match(html, /Rs\. 40/);
  assert.match(html, /Rs\. 70/);
});
