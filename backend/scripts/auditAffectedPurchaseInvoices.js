/*
 * Read-only recovery candidate audit.  This script never repairs data.
 * Usage: node scripts/auditAffectedPurchaseInvoices.js
 */
require("dotenv").config();
const mongoose = require("mongoose");
const PurchaseInvoice = require("../models/PurchaseInvoice");
const { auditPurchaseInvoiceRecoveryCandidates } = require("../services/purchaseInvoiceRecoveryAuditService");

async function audit() {
  if (process.argv.includes("--apply")) {
    throw new Error("APPLY is intentionally not implemented. This audit is dry-run only.");
  }
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
  await mongoose.connect(process.env.MONGO_URI);
  // The endpoint scopes by owner; the standalone script retains its existing
  // all-owner audit behaviour and remains read-only.
  const owners = await PurchaseInvoice.distinct("userId", { isDeleted: false });
  const reports = await Promise.all(owners.map((userId) => auditPurchaseInvoiceRecoveryCandidates(userId)));
  console.log(JSON.stringify({ mode: "DRY_RUN", reports }, null, 2));
  await mongoose.disconnect();
}

audit().catch(async (error) => { console.error(error.message); await mongoose.disconnect(); process.exitCode = 1; });
