const mongoose = require("mongoose");

const BusinessLiability = require("../models/BusinessLiability");
const BusinessLiabilityPayment = require("../models/BusinessLiabilityPayment");

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
const {
  extractBusinessTime,
  getCurrentBusinessTimeInput,
  parseBusinessDateTime,
} = require("../utils/businessDate");

const PAYMENT_METHOD_CATEGORIES = {
  cash: ["cash"],
  bank: ["bank"],
  online: ["online"],
  cheque: ["cheque"],
};

const LIABILITY_ACCOUNT_CONFIG = {
  loan: {
    name: "Business Loan",
    category: "loan",
    code: "BUSINESS_LOAN",
  },

  bank_loan: {
    name: "Bank Loan",
    category: "loan",
    code: "BANK_LOAN",
  },

  supplier: {
    name: "Supplier Payable",
    category: "supplier",
    code: "SUPPLIER_PAYABLE",
  },

  credit: {
    name: "Credit Payable",
    category: "credit",
    code: "CREDIT_PAYABLE",
  },

  tax: {
    name: "Tax Payable",
    category: "tax",
    code: "TAX_PAYABLE",
  },

  other: {
    name: "Other Liability",
    category: "other",
    code: "OTHER_LIABILITY",
  },
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

const getCurrentRemaining = (liability) => {
  if (
    liability.remainingAmount !== undefined &&
    liability.remainingAmount !== null
  ) {
    return getSafeNumber(liability.remainingAmount);
  }

  return getSafeNumber(liability.originalAmount);
};

const getOrCreateLiabilityAccount = async (
  userId,
  liabilityCategory,
  moduleScope,
) => {
  const baseConfig =
    LIABILITY_ACCOUNT_CONFIG[liabilityCategory] ||
    LIABILITY_ACCOUNT_CONFIG.other;
  const config = getScopedBusinessValueAccountConfig(baseConfig, moduleScope);
  const query = {
    userId,
    code: config.code,
  };

  if (moduleScope === MODULE_SCOPES.TRAVEL) {
    query.moduleScope = MODULE_SCOPES.TRAVEL;
  } else {
    applyModuleScopeFilter(query, MODULE_SCOPES.TRADING);
  }

  const account = await Account.findOneAndUpdate(
    query,
    {
      $setOnInsert: {
        userId,
        moduleScope: config.moduleScope,
        name: config.name,
        type: "Liability",
        category: config.category,
        code: config.code,
        normalBalance: "credit",
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

  return account;
};

// PAY LIABILITY

exports.createLiabilityPayment = async (req, res) => {
  let createdPayment = null;
  let createdJournal = null;
  let liabilityUpdated = false;

  try {
    const userId = getBusinessUserId(req);
    const moduleScope = requireBusinessValueModuleScope(req);
    const actorId = getActorId(req);

    const { liabilityId } = req.params;

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

    if (!liabilityId || !mongoose.Types.ObjectId.isValid(liabilityId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid liability ID",
      });
    }

    if (!accountId || !mongoose.Types.ObjectId.isValid(accountId)) {
      return res.status(400).json({
        success: false,
        message: "Please select a valid payment account",
      });
    }

    const paymentAmount = getSafeNumber(amount);

    if (paymentAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Payment amount must be greater than zero",
      });
    }

    const allowedPaymentMethods = ["cash", "bank", "online", "cheque"];

    if (!allowedPaymentMethods.includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method",
      });
    }

    const paymentTime =
      extractBusinessTime(paymentDate) || getCurrentBusinessTimeInput();
    let parsedPaymentDate = null;

    try {
      parsedPaymentDate = parseBusinessDateTime(
        paymentDate || new Date(),
        paymentTime,
        {
          defaultTime: "00:00",
          label: "payment date",
        },
      );
    } catch {
      return res.status(400).json({
        success: false,
        message: "Invalid payment date",
      });
    }

    const liabilityQuery = {
      _id: liabilityId,
      userId,
      isDeleted: false,
    };

    applyBusinessValueScopeFilter(liabilityQuery, moduleScope);

    const liability = await BusinessLiability.findOne(liabilityQuery);

    if (!liability) {
      return res.status(404).json({
        success: false,
        message: "Business liability not found",
      });
    }

    const remainingBefore = getCurrentRemaining(liability);

    if (remainingBefore <= 0) {
      return res.status(400).json({
        success: false,
        message: "This liability is already fully paid",
      });
    }

    if (paymentAmount > remainingBefore) {
      return res.status(400).json({
        success: false,
        message: `Payment cannot exceed remaining amount of Rs. ${remainingBefore.toLocaleString(
          "en-PK",
        )}`,
      });
    }

    const accountQuery = {
      _id: accountId,
      userId,
      type: "Asset",
      isActive: { $ne: false },
    };

    applyModuleScopeFilter(accountQuery, moduleScope);

    const paymentAccount = await Account.findOne(accountQuery);

    if (!paymentAccount) {
      return res.status(404).json({
        success: false,
        message: "Payment account not found",
      });
    }

    const allowedAccountCategories =
      PAYMENT_METHOD_CATEGORIES[paymentMethod] || [];

    if (
      allowedAccountCategories.length > 0 &&
      !allowedAccountCategories.includes(paymentAccount.category)
    ) {
      return res.status(400).json({
        success: false,
        message: `Selected account does not match ${paymentMethod} payment method`,
      });
    }

    const liabilityAccount = await getOrCreateLiabilityAccount(
      userId,
      liability.category,
      moduleScope,
    );

    const remainingAfter = Number(
      Math.max(remainingBefore - paymentAmount, 0).toFixed(2),
    );

    const description = `Liability payment - ${liability.title}`;

    createdJournal = await JournalEntry.create({
      date: parsedPaymentDate,
      time: paymentTime,

      description,

      note: String(note || "").trim(),

      lines: [
        {
          account: liabilityAccount._id,
          type: "debit",
          amount: paymentAmount,
          paymentType: paymentMethod,
        },
        {
          account: paymentAccount._id,
          type: "credit",
          amount: paymentAmount,
          paymentType: paymentMethod,
        },
      ],

      createdBy: userId,

      sourceType: "payment",

      originModule: getScopedBusinessValueOrigin(
        "business_liability_payment",
        moduleScope,
      ),

      referenceId: liability._id,

      accounts: [liabilityAccount._id, paymentAccount._id],
    });

    createdPayment = await BusinessLiabilityPayment.create({
      userId,
      moduleScope,

      liabilityId: liability._id,

      amount: paymentAmount,

      paymentDate: parsedPaymentDate,

      paymentMethod,

      accountId: paymentAccount._id,

      referenceNo: String(referenceNo || "").trim(),

      note: String(note || "").trim(),

      remainingBefore,

      remainingAfter,

      journalEntryId: createdJournal._id,

      createdBy: actorId,
    });

    liability.remainingAmount = remainingAfter;

    liability.status = remainingAfter <= 0 ? "closed" : "active";

    await liability.save();

    liabilityUpdated = true;

    return res.status(201).json({
      success: true,

      message:
        remainingAfter <= 0
          ? "Liability fully paid and closed successfully"
          : "Liability payment recorded successfully",

      data: {
        payment: createdPayment,

        liability: {
          _id: liability._id,
          title: liability.title,
          originalAmount: getSafeNumber(liability.originalAmount),
          paidAmount: Math.max(
            getSafeNumber(liability.originalAmount) - remainingAfter,
            0,
          ),
          remainingAmount: remainingAfter,
          status: liability.status,
        },

        journalEntryId: createdJournal._id,
      },
    });
  } catch (error) {
    console.error("Business Liability Payment Error:", error);
    const statusCode = getControllerStatusCode(error);

    try {
      if (liabilityUpdated && createdPayment?.liabilityId) {
        await BusinessLiability.findByIdAndUpdate(createdPayment.liabilityId, {
          $set: {
            remainingAmount: createdPayment.remainingBefore,
            status: createdPayment.remainingBefore > 0 ? "active" : "closed",
          },
        });
      }

      if (createdPayment?._id) {
        await BusinessLiabilityPayment.findByIdAndDelete(createdPayment._id);
      }

      if (createdJournal?._id) {
        await JournalEntry.findByIdAndDelete(createdJournal._id);
      }
    } catch (rollbackError) {
      console.error("Liability Payment Rollback Error:", rollbackError);
    }

    return res.status(statusCode).json({
      success: false,
      message: "Failed to record liability payment",
      error: error.message,
    });
  }
};

// PAYMENT HISTORY

exports.getLiabilityPayments = async (req, res) => {
  try {
    const userId = getBusinessUserId(req);

    const { liabilityId } = req.params;

    if (!liabilityId || !mongoose.Types.ObjectId.isValid(liabilityId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid liability ID",
      });
    }

    const liabilityQuery = {
      _id: liabilityId,
      userId,
      isDeleted: false,
    };

    applyBusinessValueScopeFilter(liabilityQuery, moduleScope);

    const liability = await BusinessLiability.findOne(liabilityQuery).lean();

    if (!liability) {
      return res.status(404).json({
        success: false,
        message: "Business liability not found",
      });
    }

    const paymentQuery = {
      userId,
      liabilityId,
    };

    applyBusinessValueScopeFilter(paymentQuery, moduleScope);

    const payments = await BusinessLiabilityPayment.find(paymentQuery)
      .populate("accountId", "name code category")
      .sort({
        paymentDate: -1,
        createdAt: -1,
      })
      .lean();

    const activePayments = payments.filter(
      (payment) => payment.isReversed !== true,
    );

    const totalPaid = activePayments.reduce(
      (sum, payment) => sum + getSafeNumber(payment.amount),
      0,
    );

    const originalAmount = getSafeNumber(liability.originalAmount);

    const remainingAmount = getCurrentRemaining(liability);

    return res.json({
      success: true,

      data: {
        liability: {
          _id: liability._id,
          title: liability.title,
          category: liability.category,
          originalAmount,
          totalPaid,
          remainingAmount,
          status: liability.status,
        },

        summary: {
          totalPayments: activePayments.length,
          totalPaid,
          remainingAmount,
          progress:
            originalAmount > 0
              ? Math.min(
                  Number(((totalPaid / originalAmount) * 100).toFixed(2)),
                  100,
                )
              : 0,
        },

        payments,
      },
    });
  } catch (error) {
    console.error("Get Liability Payments Error:", error);
    const statusCode = getControllerStatusCode(error);

    return res.status(statusCode).json({
      success: false,
      message: "Failed to load liability payment history",
      error: error.message,
    });
  }
};

// REVERSE PAYMENT

exports.reverseLiabilityPayment = async (req, res) => {
  let reversalJournal = null;

  try {
    const userId = getBusinessUserId(req);
    const moduleScope = requireBusinessValueModuleScope(req);

    const { liabilityId, paymentId } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(liabilityId) ||
      !mongoose.Types.ObjectId.isValid(paymentId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid liability or payment ID",
      });
    }

    const paymentQuery = {
      _id: paymentId,
      liabilityId,
      userId,
    };

    applyBusinessValueScopeFilter(paymentQuery, moduleScope);

    const payment = await BusinessLiabilityPayment.findOne(paymentQuery);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Liability payment not found",
      });
    }

    if (payment.isReversed === true) {
      return res.status(400).json({
        success: false,
        message: "This payment has already been reversed",
      });
    }

    const liabilityQuery = {
      _id: liabilityId,
      userId,
      isDeleted: false,
    };

    applyBusinessValueScopeFilter(liabilityQuery, moduleScope);

    const liability = await BusinessLiability.findOne(liabilityQuery);

    if (!liability) {
      return res.status(404).json({
        success: false,
        message: "Business liability not found",
      });
    }

    const originalJournal = payment.journalEntryId
      ? await JournalEntry.findOne({
          _id: payment.journalEntryId,
          createdBy: userId,
          originModule: getScopedBusinessValueOrigin(
            "business_liability_payment",
            moduleScope,
          ),
          isDeleted: { $ne: true },
        })
      : null;

    if (!originalJournal) {
      return res.status(400).json({
        success: false,
        message: "Original accounting entry for this payment was not found",
      });
    }

    if (originalJournal.isReversed === true) {
      return res.status(400).json({
        success: false,
        message: "Accounting entry has already been reversed",
      });
    }

    const reversalLines = originalJournal.lines.map((line) => ({
      account: line.account,
      type: line.type === "debit" ? "credit" : "debit",
      amount: line.amount,
      paymentType: line.paymentType,
    }));

    const reversalTime = getCurrentBusinessTimeInput();

    reversalJournal = await JournalEntry.create({
      date: parseBusinessDateTime(new Date(), reversalTime, {
        defaultTime: "00:00",
        label: "liability payment reversal date",
      }),
      time: reversalTime,

      description: `Reversal - Liability payment - ${liability.title}`,

      note: `Reversal of liability payment ${payment._id}`,

      lines: reversalLines,

      createdBy: userId,

      sourceType: "reversal",

      originModule: getScopedBusinessValueOrigin(
        "business_liability_payment_reversal",
        moduleScope,
      ),

      referenceId: payment._id,

      isReversal: true,

      reversalOf: originalJournal._id,

      accounts: reversalLines.map((line) => line.account),
    });

    const currentRemaining = getCurrentRemaining(liability);

    const restoredRemaining = Math.min(
      Number((currentRemaining + getSafeNumber(payment.amount)).toFixed(2)),
      getSafeNumber(liability.originalAmount),
    );

    liability.remainingAmount = restoredRemaining;

    liability.status = restoredRemaining > 0 ? "active" : "closed";

    await liability.save();

    payment.isReversed = true;
    payment.reversedAt = new Date();
    payment.reversalJournalEntryId = reversalJournal._id;

    await payment.save();

    originalJournal.isReversed = true;

    await originalJournal.save();

    return res.json({
      success: true,

      message: "Liability payment reversed successfully",

      data: {
        paymentId: payment._id,

        remainingAmount: restoredRemaining,

        status: liability.status,

        reversalJournalEntryId: reversalJournal._id,
      },
    });
  } catch (error) {
    console.error("Reverse Liability Payment Error:", error);
    const statusCode = getControllerStatusCode(error);

    if (reversalJournal?._id) {
      try {
        await JournalEntry.findByIdAndDelete(reversalJournal._id);
      } catch (cleanupError) {
        console.error("Reversal Cleanup Error:", cleanupError);
      }
    }

    return res.status(statusCode).json({
      success: false,
      message: "Failed to reverse liability payment",
      error: error.message,
    });
  }
};
