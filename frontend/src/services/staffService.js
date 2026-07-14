// src/services/staffService.js

import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;
const API_URL = `${BASE_URL}/api/staff`;

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

// Staff list
export const getStaffList = async (params = {}) => {
  try {
    const response = await axios.get(API_URL, getConfig(params));

    return {
      staff: Array.isArray(response.data?.staff) ? response.data.staff : [],
      pagination: response.data?.pagination || {
        page: 1,
        limit: 50,
        total: 0,
        pages: 0,
      },
    };
  } catch (error) {
    throwServiceError(error, 'Failed to fetch staff list');
  }
};

// Single staff
export const getStaffById = async (staffId) => {
  if (!staffId) {
    throw new Error('Staff ID is required');
  }

  try {
    const response = await axios.get(`${API_URL}/${staffId}`, getConfig());

    return {
      staff: response.data?.staff || null,
      availablePermissions: Array.isArray(response.data?.availablePermissions)
        ? response.data.availablePermissions
        : [],
    };
  } catch (error) {
    throwServiceError(error, 'Failed to fetch staff details');
  }
};

// Create staff
export const createStaff = async (staffData) => {
  try {
    const response = await axios.post(API_URL, staffData, getConfig());

    return response.data;
  } catch (error) {
    throwServiceError(error, 'Failed to create staff');
  }
};

// Update staff information
export const updateStaff = async (staffId, staffData) => {
  if (!staffId) {
    throw new Error('Staff ID is required');
  }

  try {
    const response = await axios.put(`${API_URL}/${staffId}`, staffData, getConfig());

    return response.data;
  } catch (error) {
    throwServiceError(error, 'Failed to update staff');
  }
};

// Update staff permissions
export const updateStaffPermissions = async (staffId, permissions = []) => {
  if (!staffId) {
    throw new Error('Staff ID is required');
  }

  if (!Array.isArray(permissions)) {
    throw new Error('Permissions must be an array');
  }

  try {
    const response = await axios.put(
      `${API_URL}/${staffId}/permissions`,
      {
        permissions: [...new Set(permissions)],
      },
      getConfig()
    );

    return response.data;
  } catch (error) {
    throwServiceError(error, 'Failed to update staff permissions');
  }
};

// Block or activate staff
export const updateStaffStatus = async (staffId, status) => {
  if (!staffId) {
    throw new Error('Staff ID is required');
  }

  if (!['active', 'blocked'].includes(status)) {
    throw new Error('Invalid staff status');
  }

  try {
    const response = await axios.put(
      `${API_URL}/${staffId}/status`,
      {
        status,
      },
      getConfig()
    );

    return response.data;
  } catch (error) {
    throwServiceError(error, 'Failed to update staff status');
  }
};

// Reset staff password
export const resetStaffPassword = async (staffId, newPassword) => {
  if (!staffId) {
    throw new Error('Staff ID is required');
  }

  if (!newPassword || String(newPassword).length < 6) {
    throw new Error('Password must be at least 6 characters');
  }

  try {
    const response = await axios.put(
      `${API_URL}/${staffId}/reset-password`,
      {
        newPassword,
      },
      getConfig()
    );

    return response.data;
  } catch (error) {
    throwServiceError(error, 'Failed to reset staff password');
  }
};

// Delete staff
export const deleteStaff = async (staffId) => {
  if (!staffId) {
    throw new Error('Staff ID is required');
  }

  try {
    const response = await axios.delete(`${API_URL}/${staffId}`, getConfig());

    return response.data;
  } catch (error) {
    throwServiceError(error, 'Failed to delete staff');
  }
};

// Convenience helpers
export const blockStaff = async (staffId) => {
  return updateStaffStatus(staffId, 'blocked');
};

export const activateStaff = async (staffId) => {
  return updateStaffStatus(staffId, 'active');
};

const staffService = {
  getStaffList,
  getStaffById,
  createStaff,
  updateStaff,
  updateStaffPermissions,
  updateStaffStatus,
  resetStaffPassword,
  deleteStaff,
  blockStaff,
  activateStaff,
};

export default staffService;
