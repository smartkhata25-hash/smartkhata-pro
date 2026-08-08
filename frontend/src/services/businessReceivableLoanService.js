import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;

const getAuthConfig = () => {
  const token = localStorage.getItem('token');

  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
};

const getErrorMessage = (error, fallbackMessage) => {
  return (
    error.response?.data?.message || error.response?.data?.error || error.message || fallbackMessage
  );
};

const buildLoanQuery = (filters = {}) => {
  const params = new URLSearchParams();

  if (filters.search?.trim()) {
    params.append('search', filters.search.trim());
  }

  if (filters.borrowerType) {
    params.append('borrowerType', filters.borrowerType);
  }

  if (filters.status) {
    params.append('status', filters.status);
  }

  if (filters.includeClosed) {
    params.append('includeClosed', 'true');
  }

  if (filters.page) {
    params.append('page', String(filters.page));
  }

  if (filters.limit) {
    params.append('limit', String(filters.limit));
  }

  return params.toString();
};

const normalizeLoanPayload = (loan = {}) => {
  return {
    title: String(loan.title || '').trim(),
    borrowerName: String(loan.borrowerName || '').trim(),
    borrowerType: loan.borrowerType || 'person',
    originalAmount: Number(loan.originalAmount || 0),
    startDate: loan.startDate || null,
    dueDate: loan.dueDate || null,
    notes: String(loan.notes || '').trim(),
    paymentMethod: loan.paymentMethod || 'cash',
    accountId: loan.accountId || '',
  };
};

const normalizeLoanUpdatePayload = (loan = {}) => {
  return {
    title: String(loan.title || '').trim(),
    borrowerName: String(loan.borrowerName || '').trim(),
    borrowerType: loan.borrowerType || 'person',
    startDate: loan.startDate || null,
    dueDate: loan.dueDate || null,
    notes: String(loan.notes || '').trim(),
  };
};

const normalizeRepaymentPayload = (payment = {}) => {
  return {
    amount: Number(payment.amount || 0),
    paymentDate: payment.paymentDate || null,
    paymentMethod: payment.paymentMethod || 'cash',
    accountId: payment.accountId || '',
    referenceNo: String(payment.referenceNo || '').trim(),
    note: String(payment.note || '').trim(),
  };
};

export const fetchBusinessReceivableLoans = async (filters = {}) => {
  try {
    const queryString = buildLoanQuery(filters);

    const url = queryString
      ? `${BASE_URL}/api/business-receivable-loans?${queryString}`
      : `${BASE_URL}/api/business-receivable-loans`;

    const response = await axios.get(url, getAuthConfig());

    return response.data;
  } catch (error) {
    console.error('Business Receivable Loans Load Error:', error);

    throw new Error(getErrorMessage(error, 'Failed to load receivable loans'));
  }
};

export const fetchBusinessReceivableLoanById = async (loanId) => {
  try {
    if (!loanId) {
      throw new Error('Loan ID is required');
    }

    const response = await axios.get(
      `${BASE_URL}/api/business-receivable-loans/${loanId}`,
      getAuthConfig()
    );

    return response.data;
  } catch (error) {
    console.error('Business Receivable Loan Detail Error:', error);

    throw new Error(getErrorMessage(error, 'Failed to load receivable loan'));
  }
};

export const createBusinessReceivableLoan = async (loanData) => {
  try {
    const payload = normalizeLoanPayload(loanData);

    const response = await axios.post(
      `${BASE_URL}/api/business-receivable-loans`,
      payload,
      getAuthConfig()
    );

    return response.data;
  } catch (error) {
    console.error('Create Business Receivable Loan Error:', error);

    throw new Error(getErrorMessage(error, 'Failed to create receivable loan'));
  }
};

export const updateBusinessReceivableLoan = async (loanId, loanData) => {
  try {
    if (!loanId) {
      throw new Error('Loan ID is required');
    }

    const payload = normalizeLoanUpdatePayload(loanData);

    const response = await axios.put(
      `${BASE_URL}/api/business-receivable-loans/${loanId}`,
      payload,
      getAuthConfig()
    );

    return response.data;
  } catch (error) {
    console.error('Update Business Receivable Loan Error:', error);

    throw new Error(getErrorMessage(error, 'Failed to update receivable loan'));
  }
};

export const deleteBusinessReceivableLoan = async (loanId) => {
  try {
    if (!loanId) {
      throw new Error('Loan ID is required');
    }

    const response = await axios.delete(
      `${BASE_URL}/api/business-receivable-loans/${loanId}`,
      getAuthConfig()
    );

    return response.data;
  } catch (error) {
    console.error('Delete Business Receivable Loan Error:', error);

    throw new Error(getErrorMessage(error, 'Failed to delete receivable loan'));
  }
};

export const receiveBusinessReceivableLoanPayment = async (loanId, paymentData) => {
  try {
    if (!loanId) {
      throw new Error('Loan ID is required');
    }

    const payload = normalizeRepaymentPayload(paymentData);

    const response = await axios.post(
      `${BASE_URL}/api/business-receivable-loans/${loanId}/payments`,
      payload,
      getAuthConfig()
    );

    return response.data;
  } catch (error) {
    console.error('Receive Receivable Loan Payment Error:', error);

    throw new Error(getErrorMessage(error, 'Failed to receive loan repayment'));
  }
};

export const fetchBusinessReceivableLoanPaymentHistory = async (loanId) => {
  try {
    if (!loanId) {
      throw new Error('Loan ID is required');
    }

    const response = await axios.get(
      `${BASE_URL}/api/business-receivable-loans/${loanId}/payments`,
      getAuthConfig()
    );

    return response.data;
  } catch (error) {
    console.error('Receivable Loan Payment History Error:', error);

    throw new Error(getErrorMessage(error, 'Failed to load loan repayment history'));
  }
};

export const reverseBusinessReceivableLoanPayment = async (loanId, paymentId) => {
  try {
    if (!loanId) {
      throw new Error('Loan ID is required');
    }

    if (!paymentId) {
      throw new Error('Payment ID is required');
    }

    const response = await axios.patch(
      `${BASE_URL}/api/business-receivable-loans/${loanId}/payments/${paymentId}/reverse`,
      {},
      getAuthConfig()
    );

    return response.data;
  } catch (error) {
    console.error('Reverse Receivable Loan Payment Error:', error);

    throw new Error(getErrorMessage(error, 'Failed to reverse loan repayment'));
  }
};

export const getEmptyBusinessReceivableLoan = () => {
  return {
    title: '',
    borrowerName: '',
    borrowerType: 'person',
    originalAmount: 0,
    startDate: '',
    dueDate: '',
    notes: '',
    paymentMethod: 'cash',
    accountId: '',
  };
};

export const getEmptyBusinessReceivableLoanPayment = () => {
  return {
    amount: '',
    paymentDate: '',
    paymentMethod: 'cash',
    accountId: '',
    referenceNo: '',
    note: '',
  };
};

export const calculateReceivedLoanAmount = (loan = {}) => {
  const originalAmount = Number(loan.originalAmount || 0);
  const remainingAmount = Number(loan.remainingAmount || 0);

  return Math.max(originalAmount - remainingAmount, 0);
};

export const calculateReceivableLoanProgress = (loan = {}) => {
  const originalAmount = Number(loan.originalAmount || 0);
  const remainingAmount = Number(loan.remainingAmount || 0);

  if (originalAmount <= 0) {
    return 0;
  }

  const receivedAmount = Math.max(originalAmount - remainingAmount, 0);

  return Math.min(Math.max((receivedAmount / originalAmount) * 100, 0), 100);
};

export const formatReceivableLoanAmount = (value) => {
  return Number(value || 0).toLocaleString('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};

export const BUSINESS_RECEIVABLE_LOAN_STATUS = {
  ACTIVE: 'active',
  CLOSED: 'closed',
};

export const BUSINESS_RECEIVABLE_BORROWER_TYPES = {
  PERSON: 'person',
  EMPLOYEE: 'employee',
  CUSTOMER: 'customer',
  SUPPLIER: 'supplier',
  OTHER: 'other',
};

export const BUSINESS_RECEIVABLE_PAYMENT_METHODS = {
  CASH: 'cash',
  BANK: 'bank',
  ONLINE: 'online',
  CHEQUE: 'cheque',
};

const businessReceivableLoanService = {
  fetchBusinessReceivableLoans,
  fetchBusinessReceivableLoanById,
  createBusinessReceivableLoan,
  updateBusinessReceivableLoan,
  deleteBusinessReceivableLoan,

  receiveBusinessReceivableLoanPayment,
  fetchBusinessReceivableLoanPaymentHistory,
  reverseBusinessReceivableLoanPayment,

  getEmptyBusinessReceivableLoan,
  getEmptyBusinessReceivableLoanPayment,

  calculateReceivedLoanAmount,
  calculateReceivableLoanProgress,
  formatReceivableLoanAmount,

  BUSINESS_RECEIVABLE_LOAN_STATUS,
  BUSINESS_RECEIVABLE_BORROWER_TYPES,
  BUSINESS_RECEIVABLE_PAYMENT_METHODS,
};

export default businessReceivableLoanService;
