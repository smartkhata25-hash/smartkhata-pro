const EMPLOYEE_ORIGINS = Object.freeze({
  SALARY: "employee_salary",
  SALARY_PAYMENT: "employee_salary_payment",
  ADVANCE: "employee_advance",
  ADVANCE_RECOVERY: "employee_advance_recovery",
  LOAN: "employee_loan",
  LOAN_RECOVERY: "employee_loan_recovery",
  ADJUSTMENT: "employee_adjustment",
});

const TRAVEL_EMPLOYEE_ORIGINS = Object.freeze({
  SALARY: "travel_employee_salary",
  SALARY_PAYMENT: "travel_employee_salary_payment",
  ADVANCE: "travel_employee_advance",
  ADVANCE_RECOVERY: "travel_employee_advance_recovery",
  LOAN: "travel_employee_loan",
  LOAN_RECOVERY: "travel_employee_loan_recovery",
  ADJUSTMENT: "travel_employee_adjustment",
});

const TRADING_EMPLOYEE_ORIGIN_VALUES = Object.freeze(
  Object.values(EMPLOYEE_ORIGINS),
);

const TRAVEL_EMPLOYEE_ORIGIN_VALUES = Object.freeze(
  Object.values(TRAVEL_EMPLOYEE_ORIGINS),
);

const ALL_EMPLOYEE_ORIGIN_VALUES = Object.freeze([
  ...TRADING_EMPLOYEE_ORIGIN_VALUES,
  ...TRAVEL_EMPLOYEE_ORIGIN_VALUES,
]);

const getEmployeeOriginsForScope = (moduleScope = "trading") =>
  moduleScope === "travel" ? TRAVEL_EMPLOYEE_ORIGINS : EMPLOYEE_ORIGINS;

const getEmployeeOriginValuesForScope = (moduleScope = "trading") =>
  moduleScope === "travel"
    ? TRAVEL_EMPLOYEE_ORIGIN_VALUES
    : TRADING_EMPLOYEE_ORIGIN_VALUES;

module.exports = {
  ALL_EMPLOYEE_ORIGIN_VALUES,
  EMPLOYEE_ORIGINS,
  TRADING_EMPLOYEE_ORIGIN_VALUES,
  TRAVEL_EMPLOYEE_ORIGINS,
  TRAVEL_EMPLOYEE_ORIGIN_VALUES,
  getEmployeeOriginsForScope,
  getEmployeeOriginValuesForScope,
};
