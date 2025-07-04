const JournalEntry = require("../models/JournalEntry");
const Account = require("../models/Account");

const getIncomeStatement = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const userId = req.user.id;

    // 🛡️ Validation
    if (!startDate || !endDate) {
      return res
        .status(400)
        .json({ message: "startDate and endDate are required." });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    console.log("📊 Generating Income Statement:", {
      startDate,
      endDate,
      userId,
    });

    const entries = await JournalEntry.find({
      date: { $gte: start, $lte: end },
      isDeleted: false,
      createdBy: userId, // ✅ Filter per user
    }).populate("lines.account");

    let revenue = 0;
    let expenses = 0;

    entries.forEach((entry) => {
      entry.lines.forEach((line) => {
        const acc = line.account;
        if (!acc || !acc.category) return;

        const amount = Number(line.amount || 0);

        if (
          acc.category.toLowerCase() === "revenue" &&
          line.type === "credit"
        ) {
          revenue += amount;
        }

        if (acc.category.toLowerCase() === "expense" && line.type === "debit") {
          expenses += amount;
        }
      });
    });

    const netIncome = revenue - expenses;

    res.status(200).json({
      revenue,
      expenses,
      netIncome,
      status: netIncome >= 0 ? "profit" : "loss",
      startDate,
      endDate,
    });
  } catch (error) {
    console.error("📛 Income Statement Error:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = { getIncomeStatement };
