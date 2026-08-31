require("dotenv").config();

const mongoose = require("mongoose");

const {
  processDueTravelReminders,
} = require("../services/travel/travelReminderService");

const run = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not configured");
  }

  await mongoose.connect(process.env.MONGO_URI);

  const result = await processDueTravelReminders({
    limit: process.env.TRAVEL_REMINDER_PROCESS_LIMIT || 50,
  });

  console.log(
    JSON.stringify(
      {
        message: "Travel reminder processor completed",
        ...result,
      },
      null,
      2,
    ),
  );
};

run()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("Travel reminder processor failed:", error);

    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }

    process.exit(1);
  });
