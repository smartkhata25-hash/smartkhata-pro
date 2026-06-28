const mongoose = require("mongoose");
const JournalEntry = require("../models/JournalEntry");
const Customer = require("../models/Customer");

// 🧾 Get Ledger for a Specific Customer (journal-based)

const getCustomerLedger = async (req, res) => {
  try {
    const { customerId } = req.params;

    const { startDate, endDate } = req.query;

    const userId = new mongoose.Types.ObjectId(req.user?.id || req.userId);

    // ✅ Step 1: Fetch customer using ACCOUNT ID
    const customer = await Customer.findOne({
      account: customerId,
      createdBy: userId,
    }).populate("account");

    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // ✅ Step 2: Resolve accountId safely
    const account =
      typeof customer.account === "object" && customer.account?._id
        ? customer.account._id
        : customer.account;

    if (!account) {
      return res
        .status(400)
        .json({ message: "No account linked with customer" });
    }

    const accountId = account.toString();

    const objectId = new mongoose.Types.ObjectId(accountId);

    // ✅ Step 3: Build filter
    const matchFilter = {
      createdBy: userId,
      isDeleted: false,
      sourceType: { $ne: "reversal" },
      "lines.account": objectId,
    };

    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);

      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      matchFilter.date = {
        $gte: start,
        $lte: end,
      };
    }

    // ✅ Step 4: Get entries
    const entries = await JournalEntry.find(matchFilter)
      .select(
        "date time billNo description sourceType originModule lines paymentType attachmentUrl attachmentType invoiceId referenceId",
      )
      .sort({ date: 1, time: 1 })
      .lean();

    // ✅ Step 5: Opening balance
    let opening = 0;

    if (startDate) {
      const result = await JournalEntry.aggregate([
        {
          $match: {
            createdBy: userId,
            isDeleted: false,
            sourceType: { $ne: "reversal" },
            "lines.account": objectId,
            date: {
              $lt: new Date(new Date(startDate).setHours(0, 0, 0, 0)),
            },
          },
        },
        { $unwind: "$lines" },
        {
          $match: {
            "lines.account": objectId,
          },
        },
        {
          $group: {
            _id: null,
            balance: {
              $sum: {
                $cond: [
                  { $eq: ["$lines.type", "debit"] },
                  "$lines.amount",
                  { $multiply: ["$lines.amount", -1] },
                ],
              },
            },
          },
        },
      ]);

      opening = result[0]?.balance || 0;
    }

    // ✅ Step 6: Running balance calculation
    let balance = opening;
    const ledger = [];

    for (let entry of entries) {
      for (let line of entry.lines) {
        if (line.account?.toString() === accountId) {
          const debit = line.type === "debit" ? line.amount : 0;
          const credit = line.type === "credit" ? line.amount : 0;
          balance += debit - credit;

          ledger.push({
            _id: entry._id,
            date: entry.date,
            time: entry.time || "",
            billNo: entry.billNo || "",
            description: entry.description || "",
            sourceType: entry.sourceType || "",
            originModule: entry.originModule || "",
            sourceLabel:
              entry.sourceType === "sale_invoice"
                ? entry.description?.includes("Discount")
                  ? "Discount"
                  : entry.description?.includes("Payment")
                    ? "Payment"
                    : "Sale Invoice"
                : entry.sourceType === "opening_sale_invoice"
                  ? "Opening Balance"
                  : entry.sourceType === "receive_payment"
                    ? "Receive Payment"
                    : entry.sourceType === "receive_payment_discount"
                      ? "Receive Payment Discount"
                      : entry.sourceType === "refund_invoice"
                        ? "Refund Invoice"
                        : entry.sourceType === "opening_refund_invoice"
                          ? "Opening Balance"
                          : "-",
            debit,
            credit,

            paymentType: line.paymentType || entry.paymentType || "-",

            balance,
            runningBalance: Number(balance.toFixed(2)),
            attachmentUrl: entry.attachmentUrl || "",
            attachmentType: entry.attachmentType || "",
            invoiceId: entry.invoiceId || null,
            referenceId: entry.referenceId || null,
          });
        }
      }
    }

    // ✅ Final Response
    res.json({
      customerName: customer.name,
      openingBalance: opening,
      ledger,
    });
  } catch (err) {
    console.error("❌ Ledger fetch error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

module.exports = {
  getCustomerLedger,
};
