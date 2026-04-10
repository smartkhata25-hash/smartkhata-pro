/* =========================================================
   HELPER FUNCTIONS
========================================================= */

const formatDate = (date) => {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleDateString("en-GB");
};

const safeNumber = (num) => {
  return Number(num || 0);
};

const formatPaymentType = (type) => {
  if (!type) return "";
  return type.charAt(0).toUpperCase() + type.slice(1);
};

const generateReceiptNo = (payment) => {
  // اگر ID ہے تو original receipt
  if (payment && payment._id) {
    return `RCV-${payment._id.toString().slice(-6)}`;
  }

  // اگر preview ہے تو بھی clean receipt number دیں
  return `RCV-${Date.now().toString().slice(-6)}`;
};
/* =========================================================
   MAIN BUILDER
========================================================= */

const buildReceivePaymentPrint = (
  payment = {},
  paymentEntries = [],
  options = {},
) => {
  const {
    company = {},
    pageWidth = "standard", // standard | narrow | thermal
    previousBalance = 0,
  } = options;

  /* ================= SAFE PAYMENT ================= */

  const safePayment = payment || {};

  const totalAmount = safeNumber(safePayment.amount);

  const receiptNo = generateReceiptNo(safePayment);

  const receivedAmount = safeNumber(totalAmount);

  const prevBalance = safeNumber(previousBalance);

  const remainingBalance = prevBalance - receivedAmount;

  /* ================= PAYMENTS ================= */

  const payments = (paymentEntries || []).map((entry, index) => ({
    index: index + 1,
    accountName:
      entry.account?.name || entry.accountName || entry.account || "",
    paymentType: formatPaymentType(entry.paymentType),
    amount: safeNumber(entry.amount),
  }));

  /* ================= EMPTY PAYMENT ROW ================= */

  if (payments.length === 0) {
    payments.push({
      index: "",
      accountName: "",
      paymentType: "",
      amount: "",
    });
  }

  /* ================= RETURN OBJECT ================= */

  return {
    documentTitle: "Receive Payment Receipt",

    /* ================= HEADER ================= */

    header: {
      companyName: company.companyName || "",
      address: company.address || "",
      phone: company.phone || "",
      taxNumber: company.taxNumber || "",
      showLogo: company.showLogo || false,
    },

    /* ================= DOCUMENT INFO ================= */

    documentInfo: {
      receiptNo: receiptNo,
      date: formatDate(safePayment.date),
      time: safePayment.time || "",
    },

    /* ================= CUSTOMER ================= */

    party: {
      label: "Customer",
      name: safePayment.customer?.name || safePayment.customerName || "",
      phone: safePayment.customer?.phone || safePayment.customerPhone || "",
    },

    /* ================= PAYMENTS ================= */

    payments: payments,

    /* ================= TOTALS ================= */

    totals: {
      previousBalance: prevBalance,
      receivedAmount: receivedAmount,
      remainingBalance: remainingBalance,
      totalAmount: receivedAmount,
    },

    /* ================= EXTRA INFO ================= */

    extra: {
      description: safePayment.description || "",
      attachment: safePayment.attachment || "",
    },

    /* ================= FOOTER ================= */

    footer: {
      message: "Thank you for your business!",
      showStamp: false,
    },

    /* ================= PAGE SETTINGS ================= */

    page: {
      pageWidth: pageWidth, // thermal | narrow | standard
    },
  };
};

/* =========================================================
   EXPORT
========================================================= */

module.exports = {
  buildReceivePaymentPrint,
};
