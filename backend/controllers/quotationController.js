const mongoose = require("mongoose");

const Counter = require("../models/Counter");
const Customer = require("../models/Customer");
const Party = require("../models/Party");
const Product = require("../models/Product");
const Quotation = require("../models/Quotation");

const money = (value) => Math.round(Number(value || 0) * 100) / 100;
const getUserId = (req) => req.user?.id || req.userId;
const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });

const normalizePayload = async (body, userId) => {
  const customerName = String(body.customerName || "").trim();
  const quotationDate = new Date(body.quotationDate);
  const sourceItems = Array.isArray(body.items) ? body.items : [];

  if (!customerName) throw badRequest("Customer name is required.");
  if (Number.isNaN(quotationDate.getTime())) throw badRequest("A valid quotation date is required.");
  if (!sourceItems.length) throw badRequest("Add at least one quotation item.");

  const productIds = [...new Set(sourceItems.map((item) => String(item.productId || "")))];
  if (productIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    throw badRequest("One or more selected products are invalid.");
  }

  const products = await Product.find({ _id: { $in: productIds }, userId }).lean();
  const productMap = new Map(products.map((product) => [String(product._id), product]));
  if (productMap.size !== productIds.length) {
    throw badRequest("One or more selected products are no longer available.");
  }

  const items = sourceItems.map((item) => {
    const product = productMap.get(String(item.productId));
    const quantity = Number(item.quantity || 0);
    const price = Number(item.price ?? item.rate ?? 0);
    if (quantity <= 0 || price <= 0) throw badRequest("Every item needs a quantity and rate greater than zero.");
    return {
      productId: product._id,
      name: product.name,
      description: product.description || "",
      uom: product.unit || "",
      quantity,
      price,
      total: money(quantity * price),
    };
  });

  const customerType = body.customerType === "party" ? "party" : "customer";
  const selectedId = customerType === "party" ? body.partyId : body.customerId;
  let customerId = null;
  let partyId = null;
  if (selectedId) {
    if (!mongoose.Types.ObjectId.isValid(selectedId)) throw badRequest("Selected customer is invalid.");
    if (customerType === "party") {
      const party = await Party.findOne({ _id: selectedId, userId }).select("_id").lean();
      if (!party) throw badRequest("Selected party was not found.");
      partyId = party._id;
    } else {
      const customer = await Customer.findOne({ _id: selectedId, createdBy: userId }).select("_id").lean();
      if (!customer) throw badRequest("Selected customer was not found.");
      customerId = customer._id;
    }
  }

  const subTotal = money(items.reduce((sum, item) => sum + item.total, 0));
  const discountPercent = Number(body.discountPercent || 0);
  if (discountPercent < 0 || discountPercent > 100) throw badRequest("Discount percent must be between 0 and 100.");
  const requestedDiscount = money(body.discountAmount || 0);
  const discountAmount = discountPercent > 0 ? money((subTotal * discountPercent) / 100) : requestedDiscount;
  if (discountAmount < 0 || discountAmount > subTotal) throw badRequest("Discount amount is invalid.");

  return {
    quotationDate,
    quotationTime: String(body.quotationTime || "").trim(),
    customerName,
    customerPhone: String(body.customerPhone || "").trim(),
    customerId,
    partyId,
    customerType,
    items,
    subTotal,
    discountPercent: money(discountPercent),
    discountAmount,
    grandTotal: money(subTotal - discountAmount),
    by: String(body.by || "").trim(),
    lang: body.lang === "ur" ? "ur" : "en",
  };
};

exports.getQuotations = async (req, res) => {
  try {
    const userId = getUserId(req);
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 200);
    const search = String(req.query.search || "").trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const query = { createdBy: userId };
    if (search) query.$or = [{ quotationNo: { $regex: search, $options: "i" } }, { customerName: { $regex: search, $options: "i" } }];
    const quotations = await Quotation.find(query)
      .select("quotationNo quotationDate quotationTime customerName customerPhone grandTotal updatedAt createdAt")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return res.json({ quotations, count: quotations.length });
  } catch (error) {
    console.error("Quotation list error:", error);
    return res.status(500).json({ message: "Could not load quotations." });
  }
};

exports.getQuotationById = async (req, res) => {
  try {
    const quotation = await Quotation.findOne({ _id: req.params.id, createdBy: getUserId(req) }).lean();
    if (!quotation) return res.status(404).json({ message: "Quotation not found." });
    return res.json(quotation);
  } catch (error) {
    return res.status(404).json({ message: "Quotation not found." });
  }
};

exports.createQuotation = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const userId = getUserId(req);
    const payload = await normalizePayload(req.body, userId);
    let quotation;
    await session.withTransaction(async () => {
      const counter = await Counter.findOneAndUpdate(
        { type: "quotation", userId },
        { $inc: { seq: 1 }, $setOnInsert: { type: "quotation", userId } },
        { new: true, upsert: true, session, setDefaultsOnInsert: true },
      );
      [quotation] = await Quotation.create([{ ...payload, quotationNo: `Q-${counter.seq}`, createdBy: userId }], { session });
    });
    return res.status(201).json(quotation);
  } catch (error) {
    console.error("Quotation create error:", error);
    return res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : "Could not save quotation." });
  } finally {
    await session.endSession();
  }
};

exports.updateQuotation = async (req, res) => {
  try {
    const userId = getUserId(req);
    const payload = await normalizePayload(req.body, userId);
    const quotation = await Quotation.findOneAndUpdate(
      { _id: req.params.id, createdBy: userId },
      { $set: payload },
      { new: true, runValidators: true },
    );
    if (!quotation) return res.status(404).json({ message: "Quotation not found." });
    return res.json(quotation);
  } catch (error) {
    console.error("Quotation update error:", error);
    return res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : "Could not update quotation." });
  }
};

exports.deleteQuotation = async (req, res) => {
  try {
    const quotation = await Quotation.findOneAndDelete({ _id: req.params.id, createdBy: getUserId(req) });
    if (!quotation) return res.status(404).json({ message: "Quotation not found." });
    return res.json({ message: "Quotation deleted.", id: quotation._id });
  } catch (error) {
    return res.status(404).json({ message: "Quotation not found." });
  }
};

exports._test = { normalizePayload };
