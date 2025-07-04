// backend/controllers/supplierController.js
const Supplier = require("../models/Supplier");
const Account = require("../models/Account");
const JournalEntry = require("../models/JournalEntry");
const XLSX = require("xlsx");
const fs = require("fs");
const { recalculateAccountBalance } = require("../utils/accountHelper");
const { getSupplierBalanceFromJournal } = require("../utils/balanceHelper");

/* ───────────── Create Supplier ───────────── */
exports.createSupplier = async (req, res) => {
  try {
    const { name, phone, email, address, notes, openingBalance, supplierType } =
      req.body;
    const userId = req.user.id;

    // ❌ Duplicate check
    const existing = await Supplier.findOne({ name, userId });
    if (existing) {
      return res.status(400).json({ message: "Supplier already exists" });
    }

    // ✅ Generate new account code
    const lastAccount = await Account.findOne({ userId }).sort({
      createdAt: -1,
    });
    const code = lastAccount
      ? `ACC-${String(Number(lastAccount.code.split("-")[1]) + 1).padStart(
          4,
          "0"
        )}`
      : "ACC-0001";

    // ✅ Create associated account (chart of account)
    const account = await Account.create({
      userId,
      name,
      code,
      type: "Liability", // must match enum
      category: "supplier", // or 'supplier' if enum supports it
      openingBalance: Number(openingBalance) || 0,
    });

    // ✅ Create supplier record
    const supplier = await Supplier.create({
      name,
      phone,
      email,
      address,
      notes,
      openingBalance,
      supplierType,
      userId,
      account: account._id,
    });

    // ✅ Create opening journal entry (if applicable)
    if (openingBalance > 0) {
      await JournalEntry.create({
        date: new Date(),
        description: "Opening Balance",
        createdBy: userId,
        sourceType: "supplier",
        referenceId: supplier._id,
        lines: [
          {
            account: account._id,
            type: "credit",
            amount: Number(openingBalance),
          },
        ],
      });

      await recalculateAccountBalance(account._id);
    }

    console.log("✅ Supplier created:", supplier.name);
    res.status(201).json(supplier);
  } catch (err) {
    console.error("❌ Supplier create error:", err);
    res.status(400).json({ message: err.message });
  }
};

/* ───────────── Get Suppliers ───────────── */
exports.getSuppliers = async (req, res) => {
  const {
    search = "",
    type = "",
    blocked = "",
    sort = "createdAt",
    page = 1,
    limit = 0,
  } = req.query;

  const query = { userId: req.user.id };

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  if (type) query.supplierType = type;
  if (blocked) query.supplierType = "blocked";

  try {
    const cursor = Supplier.find(query).sort({ [sort]: 1 });
    if (+limit) cursor.skip((page - 1) * limit).limit(+limit);
    const suppliers = await cursor;

    const suppliersWithBalance = await Promise.all(
      suppliers.map(async (sup) => {
        const balance = await getSupplierBalanceFromJournal(
          sup._id,
          req.user.id
        );
        return {
          ...sup.toObject(),
          balance,
        };
      })
    );

    res.json(suppliersWithBalance);
  } catch (err) {
    console.error("❌ Supplier fetch error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* ───────────── Update Supplier ───────────── */
exports.updateSupplier = async (req, res) => {
  try {
    const supplierId = req.params.id;
    const userId = req.user.id;

    const { name, phone, email, address, notes, openingBalance, supplierType } =
      req.body;

    const supplier = await Supplier.findOne({ _id: supplierId, userId });
    if (!supplier)
      return res.status(404).json({ message: "Supplier not found" });

    // ✅ Only update allowed fields
    supplier.name = name;
    supplier.phone = phone;
    supplier.email = email;
    supplier.address = address;
    supplier.notes = notes;
    supplier.openingBalance = openingBalance;
    supplier.supplierType = supplierType;

    await supplier.save();

    console.log("✅ Supplier updated:", supplier.name);
    res.status(200).json(supplier);
  } catch (err) {
    console.error("❌ Supplier update error:", err);
    res.status(400).json({ message: err.message });
  }
};

/* ───────────── Delete Supplier ───────────── */
exports.deleteSupplier = async (req, res) => {
  try {
    const s = await Supplier.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id,
    });
    if (!s) return res.status(404).json({ message: "Supplier not found" });

    // ✅ Soft delete journal entries
    await JournalEntry.updateMany(
      { referenceId: s._id, sourceType: "supplier" },
      { isDeleted: true }
    );

    console.log("🗑️ Supplier deleted:", s.name);
    res.json({ message: "Supplier deleted" });
  } catch (err) {
    console.error("❌ Supplier delete error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* ───────────── Import via Excel/CSV ───────────── */
exports.importSuppliers = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "File missing" });

    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const sh = wb.Sheets[wb.SheetNames[0]];
    let rows = XLSX.utils.sheet_to_json(sh);

    const inserted = [];

    for (let r of rows) {
      const account = await Account.create({
        name: r.Name || "",
        type: "liability",
        category: "supplier",
        userId: req.user.id,
      });

      const sup = await Supplier.create({
        name: r.Name || "",
        phone: r.Phone || "",
        email: r.Email || "",
        address: r.Address || "",
        notes: r.Notes || "",
        openingBalance: Number(r.OpeningBalance) || 0,
        supplierType: (r.Type || "vendor").toLowerCase(),
        userId: req.user.id,
        account: account._id,
      });

      if (sup.openingBalance > 0) {
        await JournalEntry.create({
          date: new Date(),
          description: "Opening Balance",
          createdBy: req.user.id,
          sourceType: "supplier",
          referenceId: sup._id,
          lines: [
            {
              account: account._id,
              type: "credit",
              amount: sup.openingBalance,
            },
          ],
        });

        await recalculateAccountBalance(account._id);
      }

      inserted.push(sup);
    }

    res.json({ message: `${inserted.length} suppliers imported.` });
  } catch (err) {
    console.error("❌ Import error:", err);
    res.status(500).json({ message: err.message });
  }
};
