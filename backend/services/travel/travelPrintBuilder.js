const { formatBusinessDate } = require("../../utils/businessDate");

const formatDate = (date) => formatBusinessDate(date) || "";

const safeNumber = (value) => {
  const amount = Number(value || 0);

  return Number.isFinite(amount) ? amount : 0;
};

const formatMoney = (value, currency = "PKR") =>
  `${String(currency || "PKR").toUpperCase()} ${safeNumber(value).toLocaleString(
    "en-GB",
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    },
  )}`;

const humanize = (value = "") =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const getName = (record, fallback = "") => {
  if (!record) return fallback;

  if (typeof record === "object") {
    return record.name || record.fullName || record.code || fallback;
  }

  return String(record || fallback);
};

const joinValues = (...values) => values.filter(Boolean).join(" - ");

const getAccountLabel = (account) => {
  if (!account) return "";

  if (typeof account !== "object") {
    return "";
  }

  return joinValues(account.name, account.code);
};

const buildSharedTravelPrintShell = (printSetting) => {
  if (!printSetting?.travelInvoice) {
    throw new Error("Travel print settings missing");
  }

  const doc = printSetting.travelInvoice;
  const settings = doc.settings || {};
  const headerSettings = doc.header || {};
  const layout = doc.layout || {};

  return {
    header:
      settings.showHeader === false
        ? null
        : {
            companyName: headerSettings.companyName || "",
            address: headerSettings.showCompanyAddress
              ? headerSettings.address || ""
              : "",
            phone: headerSettings.showCompanyPhone
              ? headerSettings.phone || ""
              : "",
            taxNumber: headerSettings.showTaxNumber
              ? headerSettings.taxNumber || ""
              : "",
          },
    footer:
      settings.showFooter === false
        ? null
        : {
            message: headerSettings.footerMessage || "",
            showStamp: settings.showStamp !== false,
          },
    page: {
      pageWidth: layout.pageWidth || "standard",
    },
  };
};

const getItemTravelers = (booking, item) => {
  const travelersById = new Map(
    (booking.travelers || []).map((traveler) => [
      String(traveler?._id || traveler),
      traveler,
    ]),
  );

  return (item.travelerIds || [])
    .map((traveler) => {
      if (traveler && typeof traveler === "object") {
        return getName(traveler);
      }

      return getName(travelersById.get(String(traveler)));
    })
    .filter(Boolean)
    .join(", ");
};

const summarizePassengerRows = (rows = []) =>
  rows
    .map((row) =>
      joinValues(
        row.passengerName || getName(row.travelerId),
        row.passportNumber,
        row.ticketNumber || row.reference,
      ),
    )
    .filter(Boolean);

const buildItemDetails = (booking, item) => {
  const details = [];
  const type = String(item.itemType || "").toLowerCase();
  const travelers = getItemTravelers(booking, item);

  if (travelers) {
    details.push(`Travelers: ${travelers}`);
  }

  if (type === "air_ticket") {
    const ticket = item.ticketDetails || {};
    const airline = getName(ticket.airlineId, ticket.airline);

    details.push(
      joinValues(
        "Ticket",
        airline,
        [ticket.origin, ticket.destination].filter(Boolean).join(" to "),
      ),
    );

    if (ticket.pnr || ticket.ticketNumber) {
      details.push(joinValues("PNR/Ticket", ticket.pnr, ticket.ticketNumber));
    }

    summarizePassengerRows(ticket.passengerTickets).forEach((row) =>
      details.push(row),
    );
  }

  if (type === "visit_visa") {
    const visa = item.visaDetails || {};

    details.push(
      joinValues(
        "Visa",
        visa.country,
        visa.visaType,
        visa.duration,
        visa.reference,
      ),
    );

    summarizePassengerRows(visa.travelerVisas).forEach((row) =>
      details.push(row),
    );
  }

  if (type === "hotel") {
    const hotel = item.hotelDetails || {};

    details.push(
      joinValues(
        "Hotel",
        getName(hotel.hotelId),
        formatDate(hotel.checkIn),
        formatDate(hotel.checkOut),
        hotel.confirmationNumber,
      ),
    );
  }

  if (type === "umrah_package") {
    const umrah = item.umrahDetails || {};

    details.push(
      joinValues(
        "Umrah",
        umrah.packageName,
        formatDate(umrah.departureDate),
        formatDate(umrah.returnDate),
      ),
    );

    details.push(
      joinValues("Makkah", getName(umrah.makkahHotelId)),
      joinValues("Madinah", getName(umrah.madinahHotelId)),
    );

    (umrah.components || []).forEach((component) => {
      details.push(
        joinValues(
          humanize(component.componentType),
          component.label || getName(component.serviceId),
          getName(component.hotelId),
        ),
      );
    });
  }

  if (type === "transport") {
    const transport = item.transportDetails || {};

    details.push(
      joinValues(
        "Transport",
        transport.pickup,
        transport.dropoff,
        formatDate(transport.dateTime),
        transport.vehicleType,
      ),
    );
  }

  if (item.description) {
    details.push(item.description);
  }

  return details.filter(Boolean);
};

const buildTravelInvoicePrint = (booking, printSetting) => {
  if (!printSetting?.travelInvoice) {
    throw new Error("Travel invoice print settings missing");
  }

  const doc = printSetting.travelInvoice;
  const settings = doc.settings || {};
  const headerSettings = doc.header || {};
  const layout = doc.layout || {};
  const currency = booking.baseCurrency || "PKR";
  const customer = booking.customer || booking.customerPartyId || booking.customerId;

  return {
    documentTitle: "Travel Invoice",
    header:
      settings.showHeader === false
        ? null
        : {
            companyName: headerSettings.companyName || "",
            address: headerSettings.showCompanyAddress
              ? headerSettings.address || ""
              : "",
            phone: headerSettings.showCompanyPhone
              ? headerSettings.phone || ""
              : "",
            taxNumber: headerSettings.showTaxNumber
              ? headerSettings.taxNumber || ""
              : "",
          },
    documentInfo: {
      invoiceNumber: booking.invoiceNumber || booking.bookingNumber || "",
      bookingNumber: booking.bookingNumber || "",
      date: formatDate(booking.invoiceDate || booking.createdAt),
      status: humanize(booking.status),
      serviceType: humanize(booking.serviceType || "mixed"),
    },
    customer: {
      name: getName(customer, "Customer"),
      phone: customer?.phone || "",
      email: customer?.email || "",
    },
    travelers: (booking.travelers || []).map((traveler) => ({
      name: getName(traveler),
      passportNumber: traveler.passportNumber || "",
      mobile: traveler.mobile || "",
    })),
    items: (booking.bookingItems || []).map((item, index) => ({
      index: index + 1,
      type: humanize(item.itemType || "service"),
      title: item.title || getName(item.serviceId) || humanize(item.itemType),
      details: buildItemDetails(booking, item),
      amount: formatMoney(
        item.estimatedSellingBase ?? item.sellingPrice,
        item.estimatedSellingBase !== undefined ? currency : item.sellingCurrency || currency,
      ),
    })),
    totals: {
      sale: formatMoney(booking.sellingTotal, currency),
      discount:
        safeNumber(booking.discountAmount) > 0
          ? formatMoney(booking.discountAmount, currency)
          : null,
      netSale: formatMoney(booking.netSale, currency),
      received: settings.showPaid === false ? null : formatMoney(booking.receivedAmount, currency),
      due: settings.showBalance === false ? null : formatMoney(booking.customerDue, currency),
      refunded:
        safeNumber(booking.customerRefundedAmount || booking.refundedAmount) > 0
          ? formatMoney(
              booking.customerRefundedAmount || booking.refundedAmount,
              currency,
            )
          : null,
    },
    notes: booking.notes || "",
    footer:
      settings.showFooter === false
        ? null
        : {
            message: headerSettings.footerMessage || "",
            showStamp: settings.showStamp !== false,
          },
    page: {
      pageWidth: layout.pageWidth || "standard",
    },
  };
};

const buildTravelPaymentReceiptPrint = (payment, printSetting) => {
  const isVendor = payment.documentType === "vendor";
  const currency = payment.currency || "PKR";

  return {
    ...buildSharedTravelPrintShell(printSetting),
    documentTitle: isVendor
      ? "Travel Vendor Payment Receipt"
      : "Travel Customer Payment Receipt",
    documentInfo: {
      number: payment.receiptNumber || payment.referenceNo || "",
      date: formatDate(payment.date),
      time: payment.time || "",
      relatedInvoice: payment.invoiceNo || "",
    },
    party: {
      label: isVendor ? "Vendor" : "Customer",
      name: getName(payment.party, isVendor ? "Vendor" : "Customer"),
      phone: payment.party?.phone || "",
      email: payment.party?.email || "",
    },
    payment: {
      amount: formatMoney(payment.amount, currency),
      method: humanize(payment.paymentMethod),
      account: getAccountLabel(payment.paymentAccount),
      reference: payment.referenceNo || payment.receiptNumber || "",
      notes: payment.notes || "",
      handledBy: payment.handledBy || "",
    },
  };
};

const buildTravelRefundPrint = (refund, printSetting) => {
  const currency = refund.baseCurrency || refund.originalInvoiceId?.baseCurrency || "PKR";
  const customer = refund.customer || refund.customerPartyId || refund.customerId;

  return {
    ...buildSharedTravelPrintShell(printSetting),
    documentTitle: "Travel Refund",
    documentInfo: {
      number: refund.refundNumber || "",
      date: formatDate(refund.refundDate),
      time: refund.refundTime || "",
      originalInvoice:
        refund.originalInvoiceNumber ||
        refund.originalInvoiceId?.invoiceNumber ||
        refund.originalInvoiceId?.bookingNumber ||
        "",
    },
    customer: {
      name: getName(customer, "Customer"),
      phone: customer?.phone || "",
      email: customer?.email || "",
    },
    items: (refund.refundItems || []).map((item, index) => ({
      index: index + 1,
      title: item.title || humanize(item.itemType || "service"),
      type: humanize(item.itemType || "service"),
      originalAmount: formatMoney(item.originalAmount, currency),
      refundAmount: formatMoney(item.refundAmount, currency),
    })),
    totals: {
      grossRefundAmount: formatMoney(refund.grossRefundAmount, currency),
      penaltyAmount:
        safeNumber(refund.penaltyAmount) > 0
          ? formatMoney(refund.penaltyAmount, currency)
          : null,
      customerRefundAmount: formatMoney(refund.customerRefundAmount, currency),
      paidBackAmount:
        safeNumber(refund.paidBackAmount) > 0
          ? formatMoney(refund.paidBackAmount, currency)
          : null,
    },
    payment: {
      method: humanize(refund.paymentType),
      account: getAccountLabel(refund.accountId),
    },
    notes: refund.notes || "",
  };
};

const buildTravelVendorReturnPrint = (vendorReturn, printSetting) => {
  const currency =
    vendorReturn.baseCurrency || vendorReturn.originalInvoiceId?.baseCurrency || "PKR";
  const vendor = vendorReturn.vendor || vendorReturn.vendorPartyId || vendorReturn.vendorId;

  return {
    ...buildSharedTravelPrintShell(printSetting),
    documentTitle: "Travel Vendor Return",
    documentInfo: {
      number: vendorReturn.returnNumber || "",
      date: formatDate(vendorReturn.returnDate),
      time: vendorReturn.returnTime || "",
      originalInvoice:
        vendorReturn.originalInvoiceNumber ||
        vendorReturn.originalInvoiceId?.invoiceNumber ||
        vendorReturn.originalInvoiceId?.bookingNumber ||
        "",
    },
    vendor: {
      name: getName(vendor, "Vendor"),
      phone: vendor?.phone || "",
      email: vendor?.email || "",
    },
    service: {
      label: vendorReturn.serviceLabel || "Travel service",
      originalCost: formatMoney(vendorReturn.originalCost, currency),
      vendorReturnAmount: formatMoney(vendorReturn.vendorReturnAmount, currency),
      vendorPenaltyAmount:
        safeNumber(vendorReturn.vendorPenaltyAmount) > 0
          ? formatMoney(vendorReturn.vendorPenaltyAmount, currency)
          : null,
      amountReceivedNow:
        safeNumber(vendorReturn.amountReceivedNow) > 0
          ? formatMoney(vendorReturn.amountReceivedNow, currency)
          : null,
      paymentMethod: humanize(vendorReturn.paymentType),
      paymentAccount: getAccountLabel(vendorReturn.accountId),
    },
    notes: vendorReturn.notes || "",
  };
};

module.exports = {
  buildTravelInvoicePrint,
  buildTravelPaymentReceiptPrint,
  buildTravelRefundPrint,
  buildTravelVendorReturnPrint,
};
