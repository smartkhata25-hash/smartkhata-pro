const mongoose = require("mongoose");

const BusinessReceivableLoan = require("../models/BusinessReceivableLoan");

const BusinessReceivableLoanPayment = require("../models/BusinessReceivableLoanPayment");

const Account = require("../models/Account");
const JournalEntry = require("../models/JournalEntry");

const ALLOWED_BORROWER_TYPES = [
  "person",
  "employee",
  "customer",
  "supplier",
  "other",
];

const PAYMENT_METHOD_CATEGORIES = {
  cash: ["cash"],
  bank: ["bank"],
  online: ["online"],
  cheque: ["cheque"],
};

const getSafeNumber = (value) => {
  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
};

const getBusinessUserId = (req) => {
  return req.user?.id || req.userId;
};

const getActorId = (req) => {
  return req.actorId || req.user?.actorId || req.user?.id || req.userId;
};

const getJournalPaymentType = (paymentMethod) => {
  if (["cash", "online", "cheque"].includes(paymentMethod)) {
    return paymentMethod;
  }

  return undefined;
};

const getOrCreateLoanReceivableAccount = async (userId) => {
  return Account.findOneAndUpdate(
    {
      userId,
      code: "LOAN_RECEIVABLE",
    },
    {
      $setOnInsert: {
        userId,
        name: "Loan Receivable",
        type: "Asset",
        category: "receivable",
        code: "LOAN_RECEIVABLE",
        normalBalance: "debit",
        openingBalance: 0,
        isSystem: true,
        isActive: true,
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  );
};

const getPaymentAccount = async ({ userId, accountId, paymentMethod }) => {
  if (!accountId || !mongoose.Types.ObjectId.isValid(accountId)) {
    return {
      error: "Please select a valid payment account",
    };
  }

  const paymentAccount = await Account.findOne({
    _id: accountId,
    userId,
    type: "Asset",
    isActive: { $ne: false },
  });

  if (!paymentAccount) {
    return {
      error: "Payment account not found",
    };
  }

  const allowedCategories = PAYMENT_METHOD_CATEGORIES[paymentMethod] || [];

  if (!allowedCategories.includes(paymentAccount.category)) {
    return {
      error: `Selected account does not match ${paymentMethod} payment method`,
    };
  }

  return {
    account: paymentAccount,
  };
};

// CREATE LOAN GIVEN

exports.createReceivableLoan = async (req, res) => {
  let createdLoan = null;
  let createdJournal = null;

  try {
    const userId = getBusinessUserId(req);
    const actorId = getActorId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const {
      title,
      borrowerName,
      borrowerType = "person",
      originalAmount,
      startDate,
      dueDate,
      notes = "",
      paymentMethod,
      accountId,
    } = req.body;

    const cleanTitle = String(title || "").trim();

    const cleanBorrowerName = String(borrowerName || "").trim();

    if (!cleanTitle) {
      return res.status(400).json({
        success: false,
        message: "Loan title is required",
      });
    }

    if (!cleanBorrowerName) {
      return res.status(400).json({
        success: false,
        message: "Borrower name is required",
      });
    }

    if (!ALLOWED_BORROWER_TYPES.includes(borrowerType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid borrower type",
      });
    }

    const amount = getSafeNumber(originalAmount);

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Loan amount must be greater than zero",
      });
    }

    if (!Object.keys(PAYMENT_METHOD_CATEGORIES).includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method",
      });
    }

    const parsedStartDate = startDate ? new Date(startDate) : new Date();

    if (Number.isNaN(parsedStartDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid loan date",
      });
    }

    let parsedDueDate = null;

    if (dueDate) {
      parsedDueDate = new Date(dueDate);

      if (Number.isNaN(parsedDueDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid due date",
        });
      }

      if (parsedDueDate < parsedStartDate) {
        return res.status(400).json({
          success: false,
          message: "Due date cannot be before loan date",
        });
      }
    }

    const paymentAccountResult = await getPaymentAccount({
      userId,
      accountId,
      paymentMethod,
    });

    if (paymentAccountResult.error) {
      return res.status(400).json({
        success: false,
        message: paymentAccountResult.error,
      });
    }

    const paymentAccount = paymentAccountResult.account;

    const receivableAccount = await getOrCreateLoanReceivableAccount(userId);

    createdLoan = await BusinessReceivableLoan.create({
      userId,

      title: cleanTitle,

      borrowerName: cleanBorrowerName,

      borrowerType,

      originalAmount: amount,

      remainingAmount: amount,

      startDate: parsedStartDate,

      dueDate: parsedDueDate,

      notes: String(notes || "").trim(),

      status: "active",

      isDeleted: false,

      createdBy: actorId,

      updatedBy: actorId,
    });

    const journalPaymentType = getJournalPaymentType(paymentMethod);

    const receivableLine = {
      account: receivableAccount._id,
      type: "debit",
      amount,
    };

    const paymentLine = {
      account: paymentAccount._id,
      type: "credit",
      amount,
    };

    if (journalPaymentType) {
      receivableLine.paymentType = journalPaymentType;

      paymentLine.paymentType = journalPaymentType;
    }

    createdJournal = await JournalEntry.create({
      date: parsedStartDate,

      description: `Loan given - ${cleanBorrowerName}`,

      note: String(notes || "").trim(),

      lines: [receivableLine, paymentLine],

      createdBy: userId,

      sourceType: "payment",

      originModule: "business_receivable_loan",

      referenceId: createdLoan._id,

      accounts: [receivableAccount._id, paymentAccount._id],
    });

    return res.status(201).json({
      success: true,

      message: "Receivable loan created successfully",

      loan: createdLoan,

      journalEntryId: createdJournal._id,
    });
  } catch (error) {
    console.error("Create Business Receivable Loan Error:", error);

    try {
      if (createdJournal?._id) {
        await JournalEntry.findByIdAndDelete(createdJournal._id);
      }

      if (createdLoan?._id) {
        await BusinessReceivableLoan.findByIdAndDelete(createdLoan._id);
      }
    } catch (rollbackError) {
      console.error("Receivable Loan Rollback Error:", rollbackError);
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create receivable loan",
      error: error.message,
    });
  }
};

// GET ALL LOANS

exports.getReceivableLoans = async (req, res) => {
  try {
    const userId = getBusinessUserId(req);

    const {
      search = "",
      borrowerType,
      status,
      includeClosed = "false",
      page = "1",
      limit = "100",
    } = req.query;

    const filter = {
      userId,
      isDeleted: false,
    };

    if (search.trim()) {
      const query = search.trim();

      filter.$or = [
        {
          title: {
            $regex: query,
            $options: "i",
          },
        },
        {
          borrowerName: {
            $regex: query,
            $options: "i",
          },
        },
        {
          notes: {
            $regex: query,
            $options: "i",
          },
        },
      ];
    }

    if (borrowerType && ALLOWED_BORROWER_TYPES.includes(borrowerType)) {
      filter.borrowerType = borrowerType;
    }

    if (status && ["active", "closed"].includes(status)) {
      filter.status = status;
    }

    if (includeClosed !== "true" && !status) {
      filter.status = "active";
    }

    const pageNumber = Math.max(Number(page) || 1, 1);

    const pageLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);

    const skip = (pageNumber - 1) * pageLimit;

    const [loans, total] = await Promise.all([
      BusinessReceivableLoan.find(filter)
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(pageLimit)
        .lean(),

      BusinessReceivableLoan.countDocuments(filter),
    ]);

    const summary = loans.reduce(
      (acc, loan) => {
        const original = getSafeNumber(loan.originalAmount);

        const remaining = getSafeNumber(loan.remainingAmount);

        acc.totalOriginalAmount += original;

        acc.totalRemainingAmount += remaining;

        acc.totalReceivedAmount += Math.max(original - remaining, 0);

        return acc;
      },
      {
        totalOriginalAmount: 0,
        totalReceivedAmount: 0,
        totalRemainingAmount: 0,
      },
    );

    return res.json({
      success: true,

      loans,

      summary: {
        totalLoans: total,

        totalOriginalAmount: Number(summary.totalOriginalAmount.toFixed(2)),

        totalReceivedAmount: Number(summary.totalReceivedAmount.toFixed(2)),

        totalRemainingAmount: Number(summary.totalRemainingAmount.toFixed(2)),
      },

      pagination: {
        page: pageNumber,
        limit: pageLimit,
        total,
        totalPages: Math.ceil(total / pageLimit),
      },
    });
  } catch (error) {
    console.error("Get Business Receivable Loans Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load receivable loans",
      error: error.message,
    });
  }
};

// GET SINGLE LOAN

exports.getReceivableLoanById = async (req, res) => {
  try {
    const userId = getBusinessUserId(req);

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid loan ID",
      });
    }

    const loan = await BusinessReceivableLoan.findOne({
      _id: id,
      userId,
      isDeleted: false,
    }).lean();

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: "Receivable loan not found",
      });
    }

    return res.json({
      success: true,
      loan,
    });
  } catch (error) {
    console.error("Get Receivable Loan Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load receivable loan",
      error: error.message,
    });
  }
};

// UPDATE LOAN

exports.updateReceivableLoan = async (req, res) => {
  try {
    const userId = getBusinessUserId(req);

    const actorId = getActorId(req);

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid loan ID",
      });
    }

    const loan = await BusinessReceivableLoan.findOne({
      _id: id,
      userId,
      isDeleted: false,
    });

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: "Receivable loan not found",
      });
    }

    if (
      req.body.originalAmount !== undefined ||
      req.body.remainingAmount !== undefined ||
      req.body.status !== undefined
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Loan amounts and status cannot be edited manually. Use repayment or reversal instead.",
      });
    }

    if (req.body.title !== undefined) {
      const cleanTitle = String(req.body.title || "").trim();

      if (!cleanTitle) {
        return res.status(400).json({
          success: false,
          message: "Loan title is required",
        });
      }

      loan.title = cleanTitle;
    }

    if (req.body.borrowerName !== undefined) {
      const borrowerName = String(req.body.borrowerName || "").trim();

      if (!borrowerName) {
        return res.status(400).json({
          success: false,
          message: "Borrower name is required",
        });
      }

      loan.borrowerName = borrowerName;
    }

    if (req.body.borrowerType !== undefined) {
      if (!ALLOWED_BORROWER_TYPES.includes(req.body.borrowerType)) {
        return res.status(400).json({
          success: false,
          message: "Invalid borrower type",
        });
      }

      loan.borrowerType = req.body.borrowerType;
    }

    if (req.body.startDate !== undefined) {
      const startDate = req.body.startDate
        ? new Date(req.body.startDate)
        : null;

      if (startDate && Number.isNaN(startDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid loan date",
        });
      }

      loan.startDate = startDate;
    }

    if (req.body.dueDate !== undefined) {
      const dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;

      if (dueDate && Number.isNaN(dueDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid due date",
        });
      }

      if (dueDate && loan.startDate && dueDate < loan.startDate) {
        return res.status(400).json({
          success: false,
          message: "Due date cannot be before loan date",
        });
      }

      loan.dueDate = dueDate;
    }

    if (req.body.notes !== undefined) {
      loan.notes = String(req.body.notes || "").trim();
    }

    loan.updatedBy = actorId;

    await loan.save();

    return res.json({
      success: true,
      message: "Receivable loan updated successfully",
      loan,
    });
  } catch (error) {
    console.error("Update Receivable Loan Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update receivable loan",
      error: error.message,
    });
  }
};

// DELETE LOAN

exports.deleteReceivableLoan = async (req, res) => {
  let reversalJournal = null;

  try {
    const userId = getBusinessUserId(req);

    const actorId = getActorId(req);

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid loan ID",
      });
    }

    const loan = await BusinessReceivableLoan.findOne({
      _id: id,
      userId,
      isDeleted: false,
    });

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: "Receivable loan not found",
      });
    }

    const hasPaymentHistory = await BusinessReceivableLoanPayment.exists({
      userId,
      loanId: loan._id,
      isReversed: false,
    });

    if (hasPaymentHistory) {
      return res.status(400).json({
        success: false,
        message:
          "This loan has repayment history. Reverse all repayments before deleting it.",
      });
    }

    const originalJournal = await JournalEntry.findOne({
      createdBy: userId,
      referenceId: loan._id,
      originModule: "business_receivable_loan",
      isDeleted: {
        $ne: true,
      },
      isReversed: {
        $ne: true,
      },
    }).sort({
      createdAt: 1,
    });

    if (originalJournal) {
      const reversalLines = originalJournal.lines.map((line) => {
        const newLine = {
          account: line.account,

          type: line.type === "debit" ? "credit" : "debit",

          amount: line.amount,
        };

        if (line.paymentType) {
          newLine.paymentType = line.paymentType;
        }

        return newLine;
      });

      reversalJournal = await JournalEntry.create({
        date: new Date(),

        description: `Reversal - Loan given - ${loan.borrowerName}`,

        note: `Reversal of receivable loan ${loan._id}`,

        lines: reversalLines,

        createdBy: userId,

        sourceType: "reversal",

        originModule: "business_receivable_loan_reversal",

        referenceId: loan._id,

        isReversal: true,

        reversalOf: originalJournal._id,

        accounts: reversalLines.map((line) => line.account),
      });

      originalJournal.isReversed = true;

      await originalJournal.save();
    }

    loan.isDeleted = true;

    loan.updatedBy = actorId;

    await loan.save();

    return res.json({
      success: true,
      message: "Receivable loan deleted successfully",
    });
  } catch (error) {
    console.error("Delete Receivable Loan Error:", error);

    if (reversalJournal?._id) {
      try {
        await JournalEntry.findByIdAndDelete(reversalJournal._id);
      } catch (cleanupError) {
        console.error("Loan Reversal Cleanup Error:", cleanupError);
      }
    }

    return res.status(500).json({
      success: false,
      message: "Failed to delete receivable loan",
      error: error.message,
    });
  }
};
