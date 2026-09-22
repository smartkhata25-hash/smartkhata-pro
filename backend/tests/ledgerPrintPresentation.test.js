const test = require("node:test");
const assert = require("node:assert/strict");
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

  assert.match(html, /7500\.00/);
  assert.match(html, /18750\.00/);
  assert.equal(built.rows[0].debit, 18750);
  assert.equal(built.rows[1].credit, 7500);
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
  assert.match(html, /100\.00/);
  assert.match(html, /40\.00/);
  assert.match(html, /70\.00/);
});
