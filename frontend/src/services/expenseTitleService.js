import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;
const API = `${BASE_URL}/api/expense-titles`;

// 🔐 Helper: get auth headers
const getAuthHeaders = () => {
  const token = localStorage.getItem('token');

  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
};

const getScopedParams = (options = {}) => {
  const moduleScope = options.moduleScope || options.scope;

  return moduleScope ? { moduleScope } : {};
};

export const getExpenseTitles = async (search = '', options = {}) => {
  try {
    const res = await axios.get(API, {
      ...getAuthHeaders(),
      params: {
        search: String(search || '').trim(),
        ...getScopedParams(options),
      },
    });

    return Array.isArray(res.data) ? res.data : [];
  } catch (error) {
    console.error('getExpenseTitles error:', error);
    throw error;
  }
};

// ➕ Create Title
export const createExpenseTitle = async (data, options = {}) => {
  try {
    const moduleScope = options.moduleScope || data?.moduleScope || options.scope;
    const res = await axios.post(
      API,
      {
        ...data,
        ...(moduleScope ? { moduleScope } : {}),
      },
      {
        ...getAuthHeaders(),
        params: getScopedParams({ moduleScope }),
      }
    );
    return res.data;
  } catch (error) {
    console.error('❌ createExpenseTitle error:', error);
    throw error;
  }
};

// ✏️ Update Title
export const updateExpenseTitle = async (id, data, options = {}) => {
  try {
    const moduleScope = options.moduleScope || data?.moduleScope || options.scope;
    const res = await axios.put(
      `${API}/${id}`,
      {
        ...data,
        ...(moduleScope ? { moduleScope } : {}),
      },
      {
        ...getAuthHeaders(),
        params: getScopedParams({ moduleScope }),
      }
    );
    return res.data;
  } catch (error) {
    console.error('❌ updateExpenseTitle error:', error);
    throw error;
  }
};

// ❌ Delete Title
export const deleteExpenseTitle = async (id, options = {}) => {
  try {
    const res = await axios.delete(`${API}/${id}`, {
      ...getAuthHeaders(),
      params: getScopedParams(options),
    });
    return res.data;
  } catch (error) {
    console.error('❌ deleteExpenseTitle error:', error);
    throw error;
  }
};
