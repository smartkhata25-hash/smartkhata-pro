const mongoose = require("mongoose");

const {
  PERFORMANCE_VIEWS,
  PERFORMANCE_SORT_FIELDS,
  SORT_DIRECTIONS,
  STOCK_MOVEMENT_DAYS,
  PERFORMANCE_DEFAULTS,
} = require("../utils/productPerformanceRules");

const getAllowedValues = (object) => Object.values(object);

const parseBoolean = (value, defaultValue = false) => {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();

  if (["true", "1", "yes"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no"].includes(normalized)) {
    return false;
  }

  return null;
};

const parsePositiveInteger = (value, defaultValue) => {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    return null;
  }

  return number;
};

const parseDate = (value, endOfDay = false) => {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (endOfDay && String(value).length === 10) {
    date.setHours(23, 59, 59, 999);
  }

  if (!endOfDay && String(value).length === 10) {
    date.setHours(0, 0, 0, 0);
  }

  return date;
};

const sanitizeSearch = (value) => {
  if (!value) return "";

  return String(value).trim().slice(0, 100);
};

const validateProductPerformanceQuery = (req, res, next) => {
  try {
    const errors = [];

    const {
      view = PERFORMANCE_DEFAULTS.VIEW,
      page = PERFORMANCE_DEFAULTS.PAGE,
      limit = PERFORMANCE_DEFAULTS.LIMIT,
      sortBy = PERFORMANCE_DEFAULTS.SORT_BY,
      sortOrder = PERFORMANCE_DEFAULTS.SORT_ORDER,
      deadAfterDays = PERFORMANCE_DEFAULTS.DEAD_AFTER_DAYS,
      hideZeroStock = PERFORMANCE_DEFAULTS.HIDE_ZERO_STOCK,
      inStockOnly = PERFORMANCE_DEFAULTS.IN_STOCK_ONLY,
      includeNegativeStock = PERFORMANCE_DEFAULTS.INCLUDE_NEGATIVE_STOCK,
      search = PERFORMANCE_DEFAULTS.SEARCH,
      categoryId = PERFORMANCE_DEFAULTS.CATEGORY_ID,
      startDate = PERFORMANCE_DEFAULTS.START_DATE,
      endDate = PERFORMANCE_DEFAULTS.END_DATE,
    } = req.query;

    const allowedViews = getAllowedValues(PERFORMANCE_VIEWS);

    if (!allowedViews.includes(view)) {
      errors.push(`Invalid view. Allowed values: ${allowedViews.join(", ")}`);
    }

    const parsedPage = parsePositiveInteger(page, PERFORMANCE_DEFAULTS.PAGE);

    if (parsedPage === null) {
      errors.push("Page must be a positive integer");
    }

    const parsedLimit = parsePositiveInteger(limit, PERFORMANCE_DEFAULTS.LIMIT);

    if (parsedLimit === null) {
      errors.push("Limit must be a positive integer");
    }

    if (parsedLimit !== null && parsedLimit > PERFORMANCE_DEFAULTS.MAX_LIMIT) {
      errors.push(`Limit cannot exceed ${PERFORMANCE_DEFAULTS.MAX_LIMIT}`);
    }

    const allowedSortFields = getAllowedValues(PERFORMANCE_SORT_FIELDS);

    if (!allowedSortFields.includes(sortBy)) {
      errors.push(
        `Invalid sortBy. Allowed values: ${allowedSortFields.join(", ")}`,
      );
    }

    const allowedSortDirections = getAllowedValues(SORT_DIRECTIONS);

    if (!allowedSortDirections.includes(sortOrder)) {
      errors.push(
        `Invalid sortOrder. Allowed values: ${allowedSortDirections.join(", ")}`,
      );
    }

    const parsedDeadAfterDays = parsePositiveInteger(
      deadAfterDays,
      PERFORMANCE_DEFAULTS.DEAD_AFTER_DAYS,
    );

    if (parsedDeadAfterDays === null) {
      errors.push("deadAfterDays must be a positive integer");
    }

    if (
      parsedDeadAfterDays !== null &&
      (parsedDeadAfterDays < STOCK_MOVEMENT_DAYS.MIN_DEAD_AFTER_DAYS ||
        parsedDeadAfterDays > STOCK_MOVEMENT_DAYS.MAX_DEAD_AFTER_DAYS)
    ) {
      errors.push(
        `deadAfterDays must be between ${STOCK_MOVEMENT_DAYS.MIN_DEAD_AFTER_DAYS} and ${STOCK_MOVEMENT_DAYS.MAX_DEAD_AFTER_DAYS}`,
      );
    }

    const parsedHideZeroStock = parseBoolean(
      hideZeroStock,
      PERFORMANCE_DEFAULTS.HIDE_ZERO_STOCK,
    );

    if (parsedHideZeroStock === null) {
      errors.push("hideZeroStock must be true or false");
    }

    const parsedInStockOnly = parseBoolean(
      inStockOnly,
      PERFORMANCE_DEFAULTS.IN_STOCK_ONLY,
    );

    if (parsedInStockOnly === null) {
      errors.push("inStockOnly must be true or false");
    }

    const parsedIncludeNegativeStock = parseBoolean(
      includeNegativeStock,
      PERFORMANCE_DEFAULTS.INCLUDE_NEGATIVE_STOCK,
    );

    if (parsedIncludeNegativeStock === null) {
      errors.push("includeNegativeStock must be true or false");
    }

    if (categoryId && !mongoose.Types.ObjectId.isValid(categoryId)) {
      errors.push("Invalid categoryId");
    }

    const parsedStartDate = startDate ? parseDate(startDate, false) : null;

    const parsedEndDate = endDate ? parseDate(endDate, true) : null;

    if (startDate && !parsedStartDate) {
      errors.push("Invalid startDate");
    }

    if (endDate && !parsedEndDate) {
      errors.push("Invalid endDate");
    }

    if (parsedStartDate && parsedEndDate && parsedStartDate > parsedEndDate) {
      errors.push("startDate cannot be greater than endDate");
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid product performance filters",
        errors,
      });
    }

    req.productPerformanceFilters = {
      view,

      page: parsedPage,
      limit: parsedLimit,

      sortBy,
      sortOrder,

      deadAfterDays: parsedDeadAfterDays,

      hideZeroStock: parsedHideZeroStock,
      inStockOnly: parsedInStockOnly,
      includeNegativeStock: parsedIncludeNegativeStock,

      search: sanitizeSearch(search),

      categoryId: categoryId ? new mongoose.Types.ObjectId(categoryId) : null,

      startDate: parsedStartDate,
      endDate: parsedEndDate,
    };

    next();
  } catch (error) {
    console.error("Product Performance Query Validation Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to validate report filters",
    });
  }
};

const validateProductPerformanceProductId = (req, res, next) => {
  try {
    const { productId } = req.params;

    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid productId",
      });
    }

    req.validatedProductId = new mongoose.Types.ObjectId(productId);

    next();
  } catch (error) {
    console.error("Product Performance Product ID Validation Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to validate product",
    });
  }
};

module.exports = {
  validateProductPerformanceQuery,
  validateProductPerformanceProductId,
};
