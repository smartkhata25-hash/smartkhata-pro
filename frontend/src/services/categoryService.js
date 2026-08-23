import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;
const API_URL = `${BASE_URL}/api/categories`;

// ✅ Simple in-memory category cache
const CATEGORY_CACHE_TTL = 5 * 60 * 1000;

let categoryCache = null;
let categoryCacheTime = 0;
let categoryRequestPromise = null;

const getAuthHeader = () => {
  const token = localStorage.getItem('token');

  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
};

// ✅ Clear category cache
export const clearCategoryCache = () => {
  categoryCache = null;
  categoryCacheTime = 0;
  categoryRequestPromise = null;
};

// ➕ Add Category
export const createCategory = async (name) => {
  const res = await axios.post(API_URL, { name }, getAuthHeader());

  // Category data changed, old cache invalid
  clearCategoryCache();

  return res.data;
};

// 📃 Get All Categories
export const getCategories = async ({ forceRefresh = false } = {}) => {
  const now = Date.now();

  const cacheIsValid = categoryCache !== null && now - categoryCacheTime < CATEGORY_CACHE_TTL;

  // ✅ Valid cache available
  if (!forceRefresh && cacheIsValid) {
    return categoryCache;
  }

  // ✅ Same request already running — duplicate API call نہ کریں
  if (!forceRefresh && categoryRequestPromise) {
    return categoryRequestPromise;
  }

  const requestPromise = axios
    .get(API_URL, getAuthHeader())
    .then((res) => {
      const data = Array.isArray(res.data) ? res.data : [];

      categoryCache = data;
      categoryCacheTime = Date.now();

      return data;
    })
    .finally(() => {
      if (categoryRequestPromise === requestPromise) {
        categoryRequestPromise = null;
      }
    });

  categoryRequestPromise = requestPromise;

  return requestPromise;
};

// ❌ Delete Category
export const deleteCategory = async (id) => {
  const res = await axios.delete(`${API_URL}/${id}`, getAuthHeader());

  // Category data changed, old cache invalid
  clearCategoryCache();

  return res.data;
};

// ✏️ Rename / Update Category
export const updateCategory = async (id, name) => {
  const res = await axios.put(`${API_URL}/${id}`, { name }, getAuthHeader());

  // Category data changed, old cache invalid
  clearCategoryCache();

  return res.data;
};
