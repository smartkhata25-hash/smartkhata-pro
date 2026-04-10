const formatDate = (date) => {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleDateString("en-GB");
};

const safeNumber = (num) => {
  return Number(num || 0);
};

const formatStatus = (status) => {
  if (!status) return "";
  return status.toUpperCase();
};

const formatPaymentType = (type) => {
  if (!type) return "";
  return type.charAt(0).toUpperCase() + type.slice(1);
};

/* =========================================================
   COMMON BUILDER FUNCTION
========================================================= */
const buildInvoice = (data, docConfig, title) => {
  const setting = docConfig.settings;
  const headerSetting = docConfig.header;
  const layout = docConfig.layout;

  const total = safeNumber(data.totalAmount);
  const discount = safeNumber(data.discountAmount);
  const grandTotal =
    data.grandTotal !== undefined
      ? safeNumber(data.grandTotal)
      : total - discount;

  const paid = safeNumber(data.paidAmount);
  const balance =
    data.balance !== undefined && data.balance !== null
      ? safeNumber(data.balance)
      : grandTotal - paid;
  const invoiceType = (() => {
    if (grandTotal <= 0) return "PAID";
    if (paid > grandTotal) return "ADVANCE";
    if (paid === grandTotal) return "PAID";
    if (paid > 0 && paid < grandTotal) return "PARTIAL";
    return "CREDIT";
  })();

  return {
    documentTitle: title,

    /* ================= HEADER ================= */
    header: setting.showHeader
      ? {
          companyName: headerSetting.companyName || "",
          address: headerSetting.showCompanyAddress
            ? headerSetting.address || ""
            : "",
          phone: headerSetting.showCompanyPhone
            ? headerSetting.phone || ""
            : "",
          taxNumber: headerSetting.showTaxNumber
            ? headerSetting.taxNumber || ""
            : "",
          showLogo: headerSetting.showLogo || false,
          headerSize: layout?.headerSize || "normal",
        }
      : null,

    /* ================= DOCUMENT INFO ================= */
    documentInfo: {
      billNo: data.billNo || "",
      date: formatDate(data.invoiceDate),
      time: data.invoiceTime || "",
      status: setting.showStatus ? formatStatus(data.status) : null,
      type: invoiceType,
    },

    /* ================= PARTY ================= */
    party: {
      label: data.partyLabel || "Customer",
      name: data.customerName || "",
      phone: data.customerPhone || "",
      by: setting.showBy ? data.by || "" : "",
    },

    /* ================= TABLE STRUCTURE ================= */
    columns: {
      showDescription: setting.showDescription,
      showUOM: setting.showUOM,
      rowHeight: layout?.rowHeight || "medium",
      tableDensity: layout?.tableDensity || "standard",

      // ✅ NEW: COLUMN SIZE CONTROL
      columnSizes: layout?.columnSizes || {
        name: "medium",
        description: "medium",
        uom: "medium",
        quantity: "medium",
        price: "medium",
        total: "medium",
      },
    },

    /* ================= ITEMS ================= */
    items: (data.items || []).map((item) => ({
      productId: item.productId,
      name: item.name || item.productId?.name || "",
      description: item.description || "",
      uom: item.uom || "",
      quantity: safeNumber(item.quantity),
      price: safeNumber(item.price),
      total: safeNumber(item.total),
    })),

    /* ================= TOTALS ================= */
    totals: {
      totalAmount: total,
      discountAmount: discount > 0 ? discount : null,
      grandTotal: grandTotal,
      paidAmount: setting.showPaid && paid !== null ? paid : null,
      balance: setting.showBalance && balance !== null ? balance : null,
    },
    /* ================= PAYMENT ================= */
    paymentInfo: setting.showPaymentType
      ? {
          paymentType: formatPaymentType(data.paymentType),
        }
      : null,

    /* ================= FOOTER ================= */
    footer: setting.showFooter
      ? {
          message: headerSetting.footerMessage || "",
          showStamp: setting.showStamp,
          footerSize: layout?.footerSize || "normal",
          footerBehavior:
            layout?.footerBehavior === "hideIfNoSpace"
              ? "hideIfNoSpace"
              : "auto",
        }
      : null,

    /* ================= PAGE SETTINGS ================= */
    page: {
      pageWidth: layout?.pageWidth || "standard",
    },
  };
};

/* =========================================================
   SALE INVOICE PRINT BUILDER
========================================================= */
const buildSaleInvoicePrint = (invoice, printSetting) => {
  if (!printSetting || !printSetting.sales) {
    throw new Error("Sales print settings missing");
  }

  const doc = printSetting.sales;

  return buildInvoice(invoice, doc, "Sale Invoice");
};
/* =========================================================
   SALE RETURN PRINT BUILDER
========================================================= */
const buildSaleReturnPrint = (refund, printSetting) => {
  if (!printSetting || !printSetting.saleReturn) {
    throw new Error("Sale return print settings missing");
  }

  const doc = printSetting.saleReturn;

  return buildInvoice(refund, doc, "Sale Return");
};

module.exports = {
  buildSaleInvoicePrint,
  buildSaleReturnPrint,
};
