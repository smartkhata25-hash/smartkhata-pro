const { getTravelReportSummary } = require("../../services/travel/travelReportService");

exports.getTravelReportSummary = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const report = await getTravelReportSummary({
      userId,
      query: req.query || {},
    });

    res.set("Cache-Control", "private, max-age=30");

    return res.json(report);
  } catch (error) {
    const statusCode = error?.statusCode || 500;

    if (statusCode >= 500) {
      console.error("Travel report summary failed:", error);
    }

    return res.status(statusCode).json({
      message: error?.message || "Travel report summary failed",
    });
  }
};
