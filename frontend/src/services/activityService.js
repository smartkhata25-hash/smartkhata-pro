// src/services/activityService.js

import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;
const API_URL = `${BASE_URL}/api/activities`;

const getToken = () => localStorage.getItem('token') || '';

const getConfig = (params = undefined) => ({
  headers: {
    Authorization: `Bearer ${getToken()}`,
    'Content-Type': 'application/json',
  },
  ...(params ? { params } : {}),
});

const getErrorMessage = (error, fallback = 'Something went wrong') => {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.msg ||
    error?.response?.data?.error ||
    error?.message ||
    fallback
  );
};

const throwServiceError = (error, fallbackMessage) => {
  const serviceError = new Error(getErrorMessage(error, fallbackMessage));

  serviceError.status = error?.response?.status || null;
  serviceError.data = error?.response?.data || null;
  serviceError.originalError = error;

  throw serviceError;
};

// Activity list
export const getActivities = async (params = {}) => {
  try {
    const response = await axios.get(API_URL, getConfig(params));

    return {
      activities: Array.isArray(response.data?.activities) ? response.data.activities : [],
      pagination: response.data?.pagination || {
        page: 1,
        limit: 50,
        total: 0,
        pages: 0,
      },
    };
  } catch (error) {
    throwServiceError(error, 'Failed to fetch activities');
  }
};

// Single activity
export const getActivityById = async (activityId) => {
  if (!activityId) {
    throw new Error('Activity ID is required');
  }

  try {
    const response = await axios.get(`${API_URL}/${activityId}`, getConfig());

    return response.data?.activity || null;
  } catch (error) {
    throwServiceError(error, 'Failed to fetch activity details');
  }
};

// Users for activity filters
export const getActivityUsers = async () => {
  try {
    const response = await axios.get(`${API_URL}/users`, getConfig());

    return Array.isArray(response.data?.users) ? response.data.users : [];
  } catch (error) {
    throwServiceError(error, 'Failed to fetch activity users');
  }
};

// Activity summary
export const getActivitySummary = async (params = {}) => {
  try {
    const response = await axios.get(`${API_URL}/summary`, getConfig(params));

    return {
      totalActivities: Number(response.data?.totalActivities || 0),
      byAction: Array.isArray(response.data?.byAction) ? response.data.byAction : [],
      byModule: Array.isArray(response.data?.byModule) ? response.data.byModule : [],
      recentUsers: Array.isArray(response.data?.recentUsers) ? response.data.recentUsers : [],
    };
  } catch (error) {
    throwServiceError(error, 'Failed to fetch activity summary');
  }
};

// Clean filter params before request
export const buildActivityParams = (filters = {}) => {
  const params = {};

  if (filters.staffId) {
    params.staffId = filters.staffId;
  }

  if (filters.action) {
    params.action = filters.action;
  }

  if (filters.module) {
    params.module = filters.module;
  }

  if (filters.moduleScope) {
    params.moduleScope = filters.moduleScope;
  }

  if (filters.search) {
    params.search = String(filters.search).trim();
  }
  if (filters.startDate) {
    params.startDate = filters.startDate;
  }

  if (filters.endDate) {
    params.endDate = filters.endDate;
  }

  if (filters.page) {
    params.page = Number(filters.page);
  }

  if (filters.limit) {
    params.limit = Number(filters.limit);
  }

  return params;
};

// Convenience method
export const fetchActivities = async (filters = {}) => {
  const params = buildActivityParams(filters);
  return getActivities(params);
};

const activityService = {
  getActivities,
  getActivityById,
  getActivityUsers,
  getActivitySummary,
  buildActivityParams,
  fetchActivities,
};

export default activityService;
