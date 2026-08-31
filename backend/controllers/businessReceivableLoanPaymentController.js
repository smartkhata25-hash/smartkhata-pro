const mongoose = require("mongoose");

const BusinessReceivableLoan = require("../models/BusinessReceivableLoan");

const BusinessReceivableLoanPayment = require("../models/BusinessReceivableLoanPayment");

const Account = require("../models/Account");
const JournalEntry = require("../models/JournalEntry");
const {
  applyBusinessValueScopeFilter,
  getControllerStatusCode,
  getScopedBusinessValueAccountConfig,
  getScopedBusinessValueOrigin,
  requireBusinessValueModuleScope,
} = require("../utils/businessValueModuleScope");
const {
  MODULE_SCOPES,
  applyModuleScopeFilter,
} = require("../utils/moduleScope");

const PAYMENT_METHOD_CATEGORIES = {
  cash: ["cash"],
  bank: ["bank"],
  online: ["online"],
  cheque: ["cheque"],
};

const ALLOWED_PAYMENT_METHODS = ["cash", "bank", "online", "cheque"];

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

const getCurrentRemaining = (loan) => {
  if (loan.remainingAmount !== undefined && loan.remainingAmount !== null) {
    return getSafeNumber(loan.remainingAmount);
  }

  return getSafeNumber(loan.originalAmount);
};

const getJournalPaymentType = (paymentMethod) => {
  if (["cash", "online", "cheque"].includes(paymentMethod)) {
    return paymentMethod;
  }

  return undefined;
};

const LOAN_RECEIVABLE_ACCOUNT_CONFIG = {
  name: "Loan Receivable",
  type: "Asset",
  category: "receivable",
  code: "LOAN_RECEIVABLE",
  normalBalance: "debit",
};

const getOrCreateLoanReceivableAccount = async (userId, moduleScope) => {
  const config = getScopedBusinessValueAccountConfig(
    LOAN_RECEIVABLE_ACCOUNT_CONFIG,
    moduleScope,
  );
  const query = {
    userId,
    code: config.code,
  };

  if (moduleScope === MODULE_SCOPES.TRAVEL) {
    query.moduleScope = MODULE_SCOPES.TRAVEL;
  } else {
    applyModuleScopeFilter(query, MODULE_SCOPES.TRADING);
  }

  return Account.findOneAndUpdate(
    query,
    {
      $setOnInsert: {
        userId,
        moduleScope: config.moduleScope,
        name: config.name,
        type: config.type,
        category: config.category,
        code: config.code,
        normalBalance: config.normalBalance,
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

const getReceivingAccount = async ({
  userId,
  accountId,
  paymentMethod,
  moduleScope,
}) => {
  if (!accountId || !mongoose.Types.ObjectId.isValid(accountId)) {
    return {
      error: "Please select a valid receiving account",
    };
  }

  const query = {
    _id: accountId,
    userId,
    type: "Asset",
    isActive: { $ne: false },
  };

  applyModuleScopeFilter(query, moduleScope);

  const account = await Account.findOne(query);

  if (!account) {
    return {
      error: "Receiving account not found",
    };
  }

  const allowedCategories = PAYMENT_METHOD_CATEGORIES[paymentMethod] || [];

  if (!allowedCategories.includes(account.category)) {
    return {
      error: `Selected account does not match ${paymentMethod} payment method`,
    };
  }

  return {
    account,
  };
};

// RECEIVE LOAN REPAYMENT

exports.createReceivableLoanPayment = async (req, res) => {
  let createdJournal = null;
  let createdPayment = null;
  let loanUpdated = false;

  try {
    const userId = getBusinessUserId(req);
    const moduleScope = requireBusinessValueModuleScope(req);

    const actorId = getActorId(req);

    const { loanId } = req.params;

    const {
      amount,
      paymentDate,
      paymentMethod,
      accountId,
      referenceNo = "",
      note = "",
    } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    if (!loanId || !mongoose.Types.ObjectId.isValid(loanId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid loan ID",
      });
    }

    const paymentAmount = getSafeNumber(amount);

    if (paymentAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Received amount must be greater than zero",
      });
    }

    if (!ALLOWED_PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method",
      });
    }

    const parsedPaymentDate = paymentDate ? new Date(paymentDate) : new Date();

    if (Number.isNaN(parsedPaymentDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment date",
      });
    }

    const loanQuery = {
      _id: loanId,
      userId,
      isDeleted: false,
    };

    applyBusinessValueScopeFilter(loanQuery, moduleScope);

    const loan = await BusinessReceivableLoan.findOne(loanQuery);

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: "Receivable loan not found",
      });
    }

    const remainingBefore = getCurrentRemaining(loan);

    if (remainingBefore <= 0) {
      return res.status(400).json({
        success: false,
        message: "This loan has already been fully received",
      });
    }

    if (paymentAmount > remainingBefore) {
      return res.status(400).json({
        success: false,
        message: `Received amount cannot exceed remaining amount of Rs. ${remainingBefore.toLocaleString(
          "en-PK",
        )}`,
      });
    }

    const receivingAccountResult = await getReceivingAccount({
      userId,
      accountId,
      paymentMethod,
      moduleScope,
    });

    if (receivingAccountResult.error) {
      return res.status(400).json({
        success: false,
        message: receivingAccountResult.error,
      });
    }

    const receivingAccount = receivingAccountResult.account;

    const receivableAccount = await getOrCreateLoanReceivableAccount(
      userId,
      moduleScope,
    );

    const remainingAfter = Number(
      Math.max(remainingBefore - paymentAmount, 0).toFixed(2),
    );

    const journalPaymentType = getJournalPaymentType(paymentMethod);

    const receivingLine = {
      account: receivingAccount._id,
      type: "debit",
      amount: paymentAmount,
    };

    const receivableLine = {
      account: receivableAccount._id,
      type: "credit",
      amount: paymentAmount,
    };

    if (journalPaymentType) {
      receivingLine.paymentType = journalPaymentType;

      receivableLine.paymentType = journalPaymentType;
    }

    createdJournal = await JournalEntry.create({
      date: parsedPaymentDate,

      description: `Loan repayment received - ${loan.borrowerName}`,

      note: String(note || "").trim(),

      lines: [receivingLine, receivableLine],

      createdBy: userId,

      sourceType: "receive_payment",

      originModule: getScopedBusinessValueOrigin(
        "business_receivable_loan_payment",
        moduleScope,
      ),

      referenceId: loan._id,

      accounts: [receivingAccount._id, receivableAccount._id],
    });

    createdPayment = await BusinessReceivableLoanPayment.create({
      userId,
      moduleScope,

      loanId: loan._id,

      amount: paymentAmount,

      paymentDate: parsedPaymentDate,

      paymentMethod,

      accountId: receivingAccount._id,

      referenceNo: String(referenceNo || "").trim(),

      note: String(note || "").trim(),

      remainingBefore,

      remainingAfter,

      journalEntryId: createdJournal._id,

      createdBy: actorId,
    });

    loan.remainingAmount = remainingAfter;

    loan.status = remainingAfter <= 0 ? "closed" : "active";

    loan.updatedBy = actorId;

    await loan.save();

    loanUpdated = true;

    return res.status(201).json({
      success: true,

      message:
        remainingAfter <= 0
          ? "Loan fully received and closed successfully"
          : "Loan repayment received successfully",

      data: {
        payment: createdPayment,

        loan: {
          _id: loan._id,

          title: loan.title,

          borrowerName: loan.borrowerName,

          originalAmount: getSafeNumber(loan.originalAmount),

          receivedAmount: Math.max(
            getSafeNumber(loan.originalAmount) - remainingAfter,
            0,
          ),

          remainingAmount: remainingAfter,

          status: loan.status,
        },

        journalEntryId: createdJournal._id,
      },
    });
  } catch (error) {
    console.error("Create Receivable Loan Payment Error:", error);
    const statusCode = getControllerStatusCode(error);

    try {
      if (loanUpdated && createdPayment?.loanId) {
        await BusinessReceivableLoan.findByIdAndUpdate(createdPayment.loanId, {
          $set: {
            remainingAmount: createdPayment.remainingBefore,

            status: createdPayment.remainingBefore > 0 ? "active" : "closed",
          },
        });
      }

      if (createdPayment?._id) {
        await BusinessReceivableLoanPayment.findByIdAndDelete(
          createdPayment._id,
        );
      }

      if (createdJournal?._id) {
        await JournalEntry.findByIdAndDelete(createdJournal._id);
      }
    } catch (rollbackError) {
      console.error("Receivable Loan Payment Rollback Error:", rollbackError);
    }

    return res.status(statusCode).json({
      success: false,
      message: "Failed to receive loan repayment",
      error: error.message,
    });
  }
};

// PAYMENT HISTORY

exports.getReceivableLoanPayments = async (req, res) => {
  try {
    const userId = getBusinessUserId(req);
    const moduleScope = requireBusinessValueModuleScope(req);

    const { loanId } = req.params;

    if (!loanId || !mongoose.Types.ObjectId.isValid(loanId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid loan ID",
      });
    }

    const loanQuery = {
      _id: loanId,
      userId,
      isDeleted: false,
    };

    applyBusinessValueScopeFilter(loanQuery, moduleScope);

    const loan = await BusinessReceivableLoan.findOne(loanQuery).lean();

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: "Receivable loan not found",
      });
    }

    const paymentQuery = {
      userId,
      loanId,
    };

    applyBusinessValueScopeFilter(paymentQuery, moduleScope);

    const payments = await BusinessReceivableLoanPayment.find(paymentQuery)
      .populate("accountId", "name code category")
      .sort({
        paymentDate: -1,
        createdAt: -1,
      })
      .lean();

    const activePayments = payments.filter(
      (payment) => payment.isReversed !== true,
    );

    const totalReceived = activePayments.reduce(
      (sum, payment) => sum + getSafeNumber(payment.amount),
      0,
    );

    const originalAmount = getSafeNumber(loan.originalAmount);

    const remainingAmount = getCurrentRemaining(loan);

    const progress =
      originalAmount > 0
        ? Math.min(
            Number(((totalReceived / originalAmount) * 100).toFixed(2)),
            100,
          )
        : 0;

    return res.json({
      success: true,

      data: {
        loan: {
          _id: loan._id,

          title: loan.title,

          borrowerName: loan.borrowerName,

          borrowerType: loan.borrowerType,

          originalAmount,

          totalReceived,

          remainingAmount,

          status: loan.status,
        },

        summary: {
          totalPayments: activePayments.length,

          totalReceived,

          remainingAmount,

          progress,
        },

        payments,
      },
    });
  } catch (error) {
    console.error("Get Receivable Loan Payments Error:", error);
    const statusCode = getControllerStatusCode(error);

    return res.status(statusCode).json({
      success: false,
      message: "Failed to load loan repayment history",
      error: error.message,
    });
  }
};

// REVERSE REPAYMENT

exports.reverseReceivableLoanPayment = async (req, res) => {
  let reversalJournal = null;

  try {
    const userId = getBusinessUserId(req);

    const actorId = getActorId(req);
    const moduleScope = requireBusinessValueModuleScope(req);

    const { loanId, paymentId } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(loanId) ||
      !mongoose.Types.ObjectId.isValid(paymentId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid loan or payment ID",
      });
    }

    const paymentQuery = {
      _id: paymentId,
      loanId,
      userId,
    };

    applyBusinessValueScopeFilter(paymentQuery, moduleScope);

    const payment = await BusinessReceivableLoanPayment.findOne(paymentQuery);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Loan repayment not found",
      });
    }

    if (payment.isReversed === true) {
      return res.status(400).json({
        success: false,
        message: "This repayment has already been reversed",
      });
    }

    const loanQuery = {
      _id: loanId,
      userId,
      isDeleted: false,
    };

    applyBusinessValueScopeFilter(loanQuery, moduleScope);

    const loan = await BusinessReceivableLoan.findOne(loanQuery);

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: "Receivable loan not found",
      });
    }

    const originalJournal = payment.journalEntryId
      ? await JournalEntry.findOne({
          _id: payment.journalEntryId,

          createdBy: userId,
          originModule: getScopedBusinessValueOrigin(
            "business_receivable_loan_payment",
            moduleScope,
          ),

          isDeleted: {
            $ne: true,
          },
        })
      : null;

    if (!originalJournal) {
      return res.status(400).json({
        success: false,
        message: "Original accounting entry for this repayment was not found",
      });
    }

    if (originalJournal.isReversed === true) {
      return res.status(400).json({
        success: false,
        message: "Accounting entry has already been reversed",
      });
    }

    const reversalLines = originalJournal.lines.map((line) => {
      const reversalLine = {
        account: line.account,

        type: line.type === "debit" ? "credit" : "debit",

        amount: line.amount,
      };

      if (line.paymentType) {
        reversalLine.paymentType = line.paymentType;
      }

      return reversalLine;
    });

    reversalJournal = await JournalEntry.create({
      date: new Date(),

      description: `Reversal - Loan repayment received - ${loan.borrowerName}`,

      note: `Reversal of receivable loan payment ${payment._id}`,

      lines: reversalLines,

      createdBy: userId,

      sourceType: "reversal",

      originModule: getScopedBusinessValueOrigin(
        "business_receivable_loan_payment_reversal",
        moduleScope,
      ),

      referenceId: payment._id,

      isReversal: true,

      reversalOf: originalJournal._id,

      accounts: reversalLines.map((line) => line.account),
    });

    const currentRemaining = getCurrentRemaining(loan);

    const restoredRemaining = Math.min(
      Number((currentRemaining + getSafeNumber(payment.amount)).toFixed(2)),

      getSafeNumber(loan.originalAmount),
    );

    loan.remainingAmount = restoredRemaining;

    loan.status = restoredRemaining > 0 ? "active" : "closed";

    loan.updatedBy = actorId;

    await loan.save();

    payment.isReversed = true;

    payment.reversedAt = new Date();

    payment.reversalJournalEntryId = reversalJournal._id;

    await payment.save();

    originalJournal.isReversed = true;

    await originalJournal.save();

    return res.json({
      success: true,

      message: "Loan repayment reversed successfully",

      data: {
        paymentId: payment._id,

        remainingAmount: restoredRemaining,

        status: loan.status,

        reversalJournalEntryId: reversalJournal._id,
      },
    });
  } catch (error) {
    console.error("Reverse Receivable Loan Payment Error:", error);
    const statusCode = getControllerStatusCode(error);

    if (reversalJournal?._id) {
      try {
        await JournalEntry.findByIdAndDelete(reversalJournal._id);
      } catch (cleanupError) {
        console.error(
          "Receivable Repayment Reversal Cleanup Error:",
          cleanupError,
        );
      }
    }

    return res.status(statusCode).json({
      success: false,
      message: "Failed to reverse loan repayment",
      error: error.message,
    });
  }
};
