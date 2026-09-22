import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;
const API_URL = `${BASE_URL}/api/weaving/attendance`;

const getToken = () => localStorage.getItem('token');

const getConfig = (params = {}) => ({
  headers: {
    Authorization: `Bearer ${getToken()}`,
    'Content-Type': 'application/json',
  },
  params,
});

const unwrap = (response) => response.data?.data ?? response.data;

/**
 * Return today's local business date in YYYY-MM-DD format.
 * This avoids sending an empty/undefined date to the attendance summary API.
 */
const getTodayDateKey = () => {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

/**
 * Attendance master data:
 * Units, departments, shifts, etc.
 */
export const getWeavingAttendanceMeta = async () => {
  const response = await axios.get(`${API_URL}/meta`, getConfig());

  return unwrap(response);
};

/**
 * Load attendance for one Date + Unit + Shift.
 */
export const getWeavingAttendanceSession = async ({ date, unitId, shiftId }) => {
  if (!date) {
    throw new Error('Attendance date is required');
  }

  if (!unitId) {
    throw new Error('Attendance unit is required');
  }

  if (!shiftId) {
    throw new Error('Attendance shift is required');
  }

  const response = await axios.get(
    `${API_URL}/session`,
    getConfig({
      date,
      unitId,
      shiftId,
    })
  );

  return unwrap(response);
};

/**
 * Save attendance for one Date + Unit + Shift.
 */
export const saveWeavingAttendanceSession = async ({ date, unitId, shiftId, rows }) => {
  if (!date) {
    throw new Error('Attendance date is required');
  }

  if (!unitId) {
    throw new Error('Attendance unit is required');
  }

  if (!shiftId) {
    throw new Error('Attendance shift is required');
  }

  const response = await axios.post(
    `${API_URL}/session`,
    {
      date,
      unitId,
      shiftId,
      rows: Array.isArray(rows) ? rows : [],
    },
    getConfig()
  );

  return unwrap(response);
};

/**
 * Load dashboard attendance summary.
 *
 * IMPORTANT:
 * Backend requires a date.
 * If caller does not provide one (for example Weaving Dashboard),
 * automatically use today's local date.
 */
export const getWeavingAttendanceSummary = async ({ date } = {}) => {
  const attendanceDate = date || getTodayDateKey();

  const response = await axios.get(
    `${API_URL}/summary`,
    getConfig({
      date: attendanceDate,
    })
  );

  return unwrap(response);
};

const weavingAttendanceService = {
  getWeavingAttendanceMeta,
  getWeavingAttendanceSession,
  getWeavingAttendanceSummary,
  saveWeavingAttendanceSession,
};

export default weavingAttendanceService;
