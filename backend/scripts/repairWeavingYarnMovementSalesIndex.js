require("dotenv").config();
const mongoose = require("mongoose");

const indexName = "userId_1_salesInvoiceId_1_movementType_1";
const key = { userId: 1, salesInvoiceId: 1, movementType: 1 };
const partialFilterExpression = {
  salesInvoiceId: { $type: "objectId" },
  movementType: "sale_out",
};

const hasExpectedPartialFilter = (index) =>
  index?.partialFilterExpression?.salesInvoiceId?.$type === "objectId" &&
  index?.partialFilterExpression?.movementType === "sale_out";

const run = async () => {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not configured");
  await mongoose.connect(process.env.MONGO_URI);
  const collection = mongoose.connection.collection("weavingyarnmovements");
  const existing = (await collection.indexes()).find((index) => index.name === indexName);

  if (existing && (!existing.unique || !hasExpectedPartialFilter(existing))) {
    await collection.dropIndex(indexName);
  }

  const afterDrop = (await collection.indexes()).find((index) => index.name === indexName);
  if (!afterDrop) {
    await collection.createIndex(key, { name: indexName, unique: true, partialFilterExpression });
  }
};

run()
  .then(() => console.log("Weaving yarn sales movement index is correct."))
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
