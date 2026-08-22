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
  // Ledger والا original نمبر
  if (payment && payment.billNo) {
    return payment.billNo;
  }

  // fallback
  if (payment && payment._id) {
    return `RCV-${payment._id.toString().slice(-6)}`;
  }

  return `RCV-${Date.now().toString().slice(-6)}`;
};

const buildReceivePaymentPrint = (
  payment = {},
  paymentEntries = [],
  options = {},
) => {
  const { company = {}, pageWidth = "standard", previousBalance = 0 } = options;

  const safePayment = payment || {};

  const discountAmount = safeNumber(safePayment.discountAmount);

  const totalAmount = safeNumber(safePayment.amount);

  const receiptNo = generateReceiptNo(safePayment);

  const receivedAmount = safeNumber(totalAmount);

  const prevBalance = safeNumber(previousBalance);

  const remainingBalance = prevBalance - receivedAmount - discountAmount;

  const payments = (paymentEntries || []).map((entry, index) => ({
    index: index + 1,
    accountName:
      entry.account?.name || entry.accountName || entry.account || "",
    paymentType: formatPaymentType(entry.paymentType),
    amount: safeNumber(entry.amount),
  }));

  if (payments.length === 0) {
    payments.push({
      index: "",
      accountName: "",
      paymentType: "",
      amount: "",
    });
  }

  return {
    documentTitle: "Receive Payment Receipt",

    header: {
      companyName: company.companyName || "",
      address: company.address || "",
      phone: company.phone || "",
      taxNumber: company.taxNumber || "",
      showLogo: company.showLogo || false,
    },

    documentInfo: {
      receiptNo: receiptNo,
      date: formatDate(safePayment.date),
      time: safePayment.time || "",
    },

    party: {
      label: "Customer",
      name: safePayment.customer?.name || safePayment.customerName || "",
      phone: safePayment.customer?.phone || safePayment.customerPhone || "",
    },

    payments: payments,

    totals: {
      previousBalance: prevBalance,
      receivedAmount: receivedAmount,
      discountAmount: discountAmount,
      remainingBalance: remainingBalance,
      totalAmount: receivedAmount + discountAmount,
    },

    extra: {
      description: safePayment.description || "",
      attachment: safePayment.attachment || "",
    },

    footer: {
      message: "Thank you for your business!",
      showStamp: false,
    },

    page: {
      pageWidth: pageWidth,
    },
  };
};

module.exports = {
  buildReceivePaymentPrint,
};
