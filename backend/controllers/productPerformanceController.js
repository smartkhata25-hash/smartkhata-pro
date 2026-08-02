const {
  getProductPerformanceReport,
  getProductPerformanceDetails,
} = require("../services/reports/productPerformanceService");

exports.getProductPerformanceReport = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user",
      });
    }

    const filters = req.productPerformanceFilters || {};

    const result = await getProductPerformanceReport({
      userId,
      filters,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error("Product Performance Report Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to generate product performance report",
      error: error.message,
    });
  }
};

exports.getProductPerformanceDetails = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user",
      });
    }

    const productId = req.validatedProductId || req.params.productId;

    const result = await getProductPerformanceDetails({
      userId,
      productId,
    });

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Product Performance Details Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch product performance details",
      error: error.message,
    });
  }
};
