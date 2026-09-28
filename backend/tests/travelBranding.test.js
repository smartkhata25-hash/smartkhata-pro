const test = require("node:test");
const assert = require("node:assert/strict");

const {
  OUTPUT_TYPES,
  isLogoEnabledForOutput,
  resolveTravelBranding,
} = require("../services/travel/travelBrandingService");
const {
  buildTravelInvoicePrint,
  buildTravelPaymentReceiptPrint,
  buildTravelRefundPrint,
  buildTravelVendorReturnPrint,
} = require("../services/travel/travelPrintBuilder");
const { renderTravelInvoiceHtml } = require("../templates/travelInvoiceTemplate");
const {
  renderTravelPaymentReceiptHtml,
} = require("../templates/travelPaymentReceiptTemplate");
const { renderTravelRefundHtml } = require("../templates/travelRefundTemplate");
const {
  renderTravelVendorReturnHtml,
} = require("../templates/travelVendorReturnTemplate");
const generateCustomerLedgerHTML = require("../templates/customerLedgerTemplate");
const generateCustomerDetailLedgerHTML = require("../templates/customerDetailLedgerTemplate");
const generateSupplierLedgerHTML = require("../templates/supplierLedgerTemplate");
const generateSupplierDetailLedgerHTML = require("../templates/supplierDetailLedgerTemplate");
const generatePartyLedgerHTML = require("../templates/partyLedgerTemplate");
const generatePartyDetailLedgerHTML = require("../templates/partyDetailLedgerTemplate");
const buildCustomerLedgerPrint = require("../services/ledgerPrintBuilder");
const buildCustomerDetailLedgerPrint = require("../services/customerDetailLedgerPrintBuilder");
const buildPartyLedgerPrint = require("../services/partyLedgerPrintBuilder");
const buildSupplierLedgerPrint = require("../services/supplierLedgerPrintBuilder");
const buildSupplierDetailLedgerPrint = require("../services/supplierDetailLedgerPrintBuilder");
const {
  _test: { buildDocumentHtml },
} = require("../controllers/employeeController");
const {
  _test: { applyPartyLedgerJournalScope, getLedgerModuleScope },
} = require("../controllers/partyDetailLedgerPrintController");

const userId = "64f000000000000000000001";
const logoKey = `users/${userId}/print-logos/logo.webp`;
const logoDataUrl = "data:image/webp;base64,dHJhdmVsLWxvZ28=";

const setting = (header = {}) => ({
  travelInvoice: {
    header: {
      companyName: "Central Travel",
      address: "Main Road",
      phone: "03000000000",
      taxNumber: "NTN-1",
      showCompanyAddress: true,
      showCompanyPhone: true,
      showTaxNumber: true,
      showLogo: true,
      logoKey,
      ...header,
    },
    settings: { showHeader: true, showFooter: true },
    layout: {},
  },
});

test("Travel logo visibility honors independent Print and PDF switches", () => {
  const cases = [
    [true, true, true, true],
    [true, false, true, false],
    [false, true, false, true],
    [false, false, false, false],
  ];

  cases.forEach(([showLogoOnPrint, showLogoOnPdf, printExpected, pdfExpected]) => {
    const header = { logoKey, showLogo: true, showLogoOnPrint, showLogoOnPdf };
    assert.equal(isLogoEnabledForOutput(header, OUTPUT_TYPES.PRINT), printExpected);
    assert.equal(isLogoEnabledForOutput(header, OUTPUT_TYPES.PDF), pdfExpected);
  });
});

test("Travel logo visibility handles no logo and legacy settings", () => {
  assert.equal(
    isLogoEnabledForOutput({ showLogo: true, logoKey: "" }, OUTPUT_TYPES.PRINT),
    false,
  );
  assert.equal(
    isLogoEnabledForOutput({ showLogo: true, logoKey }, OUTPUT_TYPES.PRINT),
    true,
  );
  assert.equal(
    isLogoEnabledForOutput({ showLogo: true, logoKey }, OUTPUT_TYPES.PDF),
    true,
  );
  assert.equal(
    isLogoEnabledForOutput({ showLogo: false, logoKey }, OUTPUT_TYPES.PDF),
    false,
  );
});

test("enabled Travel logo is embedded and unavailable logo fails clearly", async () => {
  const resolved = await resolveTravelBranding({
    userId,
    outputType: OUTPUT_TYPES.PDF,
    printSetting: setting({ showLogoOnPdf: true }),
    fileLoader: async () => ({
      buffer: Buffer.from("travel-logo"),
      mimeType: "image/webp",
    }),
  });

  assert.match(resolved.branding.logoUrl, /^data:image\/webp;base64,/);

  await assert.rejects(
    resolveTravelBranding({
      userId,
      outputType: OUTPUT_TYPES.PRINT,
      printSetting: setting({ showLogoOnPrint: true }),
      fileLoader: async () => {
        throw new Error("object missing");
      },
    }),
    /enabled but could not be loaded/i,
  );
});

const embeddedSetting = setting({
  logoUrl: logoDataUrl,
  showLogo: true,
  showLogoOnPrint: true,
  showLogoOnPdf: true,
});

test("all Travel operational document templates render the embedded logo", () => {
  const documents = [
    renderTravelInvoiceHtml(
      buildTravelInvoicePrint(
        {
          bookingNumber: "B-1",
          invoiceNumber: "I-1",
          customer: { name: "Customer" },
          bookingItems: [],
        },
        embeddedSetting,
      ),
    ),
    renderTravelPaymentReceiptHtml(
      buildTravelPaymentReceiptPrint(
        { documentType: "customer", party: { name: "Customer" }, amount: 100 },
        embeddedSetting,
      ),
    ),
    renderTravelRefundHtml(
      buildTravelRefundPrint(
        { customer: { name: "Customer" }, refundItems: [] },
        embeddedSetting,
      ),
    ),
    renderTravelVendorReturnHtml(
      buildTravelVendorReturnPrint(
        { vendor: { name: "Vendor" } },
        embeddedSetting,
      ),
    ),
  ];

  documents.forEach((html) => {
    assert.match(html, /<img[^>]+data:image\/webp;base64/);
    assert.doesNotMatch(html, /onerror="this\.remove\(\)"/);
  });
});

test("Travel logo is absent from operational HTML when its output switch is off", () => {
  const html = renderTravelInvoiceHtml(
    buildTravelInvoicePrint(
      { bookingNumber: "B-2", customer: { name: "Customer" }, bookingItems: [] },
      setting({ showLogo: false, logoUrl: "", showLogoOnPrint: false }),
    ),
  );

  assert.doesNotMatch(html, /<img/);
});

test("Travel invoice renders ledger description conditionally without replacing item descriptions", () => {
  const invoice = {
    bookingNumber: "B-DESCRIPTION",
    customer: { name: "Customer" },
    ledgerDescription: "Visa processing urgent\nCustomer requested priority handling",
    bookingItems: [
      {
        itemType: "visit_visa",
        title: "Visit Visa",
        description: "Item-level visa document review",
        sellingPrice: 100,
      },
    ],
  };
  const html = renderTravelInvoiceHtml(
    buildTravelInvoicePrint(invoice, embeddedSetting),
  );

  assert.match(html, /Visa processing urgent/);
  assert.match(html, /Customer requested priority handling/);
  assert.match(html, /Item-level visa document review/);
  assert.match(html, /<span class="label">Description<\/span>/);

  const withoutDescription = renderTravelInvoiceHtml(
    buildTravelInvoicePrint(
      { ...invoice, ledgerDescription: "   \n  " },
      embeddedSetting,
    ),
  );

  assert.doesNotMatch(
    withoutDescription,
    /<span class="label">Description<\/span>/,
  );
});

test("enabled Travel logo remains visible when legacy business header text is hidden", () => {
  const hiddenHeaderSetting = embeddedSetting;
  hiddenHeaderSetting.travelInvoice.settings.showHeader = false;
  const html = renderTravelInvoiceHtml(
    buildTravelInvoicePrint(
      { bookingNumber: "B-3", customer: { name: "Customer" }, bookingItems: [] },
      hiddenHeaderSetting,
    ),
  );
  hiddenHeaderSetting.travelInvoice.settings.showHeader = true;

  assert.match(html, /<img[^>]+data:image\/webp;base64/);
  assert.doesNotMatch(html, /Central Travel/);
});

test("all Travel ledger templates render the embedded central header", () => {
  const header = {
    companyName: "Central Travel",
    logoUrl: logoDataUrl,
    logoRequired: true,
  };
  const summary = { opening: 0, totalDebit: 0, totalCredit: 0, closingBalance: 0 };
  const htmlDocuments = [
    generateCustomerLedgerHTML({
      customer: { name: "Customer" },
      period: {},
      summary: { ...summary, totalMoneyIn: 0, totalMoneyOut: 0 },
      rows: [],
      header,
      lang: "en",
    }),
    generateCustomerDetailLedgerHTML({
      customer: { name: "Customer" }, period: {}, summary, blocks: [], header, lang: "en",
    }),
    generateSupplierLedgerHTML({
      documentTitle: "Supplier Ledger", supplier: { name: "Vendor" }, period: {}, summary, rows: [], header, lang: "en",
    }),
    generateSupplierDetailLedgerHTML({
      supplier: { name: "Vendor" }, period: {}, summary, blocks: [], header, lang: "en",
    }),
    generatePartyLedgerHTML({
      party: { name: "Party" }, period: {}, summary, rows: [], header, lang: "en",
    }),
    generatePartyDetailLedgerHTML({
      party: { name: "Party" }, period: {}, summary: { ...summary, balanceStatus: "Settled" }, blocks: [], header, lang: "en",
    }),
  ];

  htmlDocuments.forEach((html) => assert.match(html, /<img[^>]+data:image\/webp;base64/));
});

test("Travel ledger descriptions render safely without leaking into other scopes", () => {
  const description = "Urgent <visa> processing\nKeep documents ready";
  const entry = {
    date: "2026-09-01",
    billNo: "TR-1",
    sourceType: "travel_booking",
    sourceLabel: "Travel Invoice",
    description,
    debit: 100,
    credit: 0,
    items: [],
  };

  const normalCases = [
    [buildCustomerLedgerPrint, generateCustomerLedgerHTML, { customerName: "Customer" }],
    [buildPartyLedgerPrint, generatePartyLedgerHTML, { partyName: "Party" }],
    [buildSupplierLedgerPrint, generateSupplierLedgerHTML, { supplierName: "Supplier" }],
  ];

  normalCases.forEach(([build, render, base]) => {
    const travelHtml = render(build({ ...base, ledger: [entry], showDescription: true }));
    assert.match(travelHtml, /Urgent &lt;visa&gt; processing/);
    assert.match(travelHtml, /Keep documents ready/);

    const otherScopeHtml = render(build({ ...base, ledger: [entry], showDescription: false }));
    assert.doesNotMatch(otherScopeHtml, /Urgent &lt;visa&gt; processing/);

    const blankHtml = render(
      build({
        ...base,
        ledger: [{ ...entry, description: "  \n  " }],
        showDescription: true,
      }),
    );
    assert.doesNotMatch(blankHtml, /class="source-description"/);
  });

  const detailedCases = [
    [buildCustomerDetailLedgerPrint, generateCustomerDetailLedgerHTML, { customerName: "Customer" }],
    [buildSupplierDetailLedgerPrint, generateSupplierDetailLedgerHTML, { supplierName: "Supplier" }],
  ];

  detailedCases.forEach(([build, render, base]) => {
    const travelHtml = render(build({ ...base, ledger: [entry], showDescription: true }));
    assert.match(travelHtml, /Urgent &lt;visa&gt; processing/);
    assert.match(travelHtml, /Keep documents ready/);

    const otherScopeHtml = render(build({ ...base, ledger: [entry], showDescription: false }));
    assert.doesNotMatch(otherScopeHtml, /Urgent &lt;visa&gt; processing/);

    const blankHtml = render(
      build({
        ...base,
        ledger: [{ ...entry, description: "  \n  " }],
        showDescription: true,
      }),
    );
    assert.doesNotMatch(blankHtml, /class="description"/);
  });

  const partyDetailedHtml = generatePartyDetailLedgerHTML({
    party: { name: "Party" },
    period: {},
    summary: { opening: 0, totalDebit: 100, totalCredit: 0, closingBalance: 100 },
    blocks: [{ ...entry, balance: 100 }],
    lang: "en",
  });
  assert.match(partyDetailedHtml, /Urgent &lt;visa&gt; processing/);
});

test("Travel employee document shell brands ledger, salary slip, and payment voucher", () => {
  ["Employee Ledger", "Salary Slip", "Employee Payment Voucher"].forEach((title) => {
    const html = buildDocumentHtml({
      title,
      header: { companyName: "Central Travel", logoUrl: logoDataUrl, logoRequired: true },
    });
    assert.match(html, /<img[^>]+data:image\/webp;base64/);
  });
});

test("Party detailed ledger keeps Travel and Trading journal scopes isolated", () => {
  const travel = applyPartyLedgerJournalScope({}, getLedgerModuleScope({ moduleScope: "travel" }));
  const trading = applyPartyLedgerJournalScope({}, getLedgerModuleScope({}));

  assert.ok(travel.originModule.$in.includes("travel_invoice"));
  assert.equal(trading.originModule, undefined);
  assert.equal(trading.$and, undefined);
});
