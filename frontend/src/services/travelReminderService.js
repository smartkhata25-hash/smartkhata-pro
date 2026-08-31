import axios from 'axios';

import {
  clearTravelCacheDomain,
  getCachedTravelRecords,
  hasTravelCache,
  setCachedTravelRecords,
  TRAVEL_CACHE_DOMAINS,
} from '../utils/travelMasterCache';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;
const TRAVEL_REMINDER_API = `${BASE_URL}/api/travel/reminders`;
const TRAVEL_REMINDER_SUMMARY_CACHE_MAX_AGE_MS = 30 * 1000;

const getConfig = (params = {}) => ({
  headers: {
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  },
  params,
});

const normalizeParams = (params = {}) =>
  Object.entries(params || {}).reduce((result, [key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      result[key] = value;
    }

    return result;
  }, {});

export const clearTravelReminderCache = () =>
  clearTravelCacheDomain(TRAVEL_CACHE_DOMAINS.REMINDER_SUMMARY);

export const fetchTravelReminderSummary = async (options = {}) => {
  if (
    !options.forceRefresh &&
    hasTravelCache(TRAVEL_CACHE_DOMAINS.REMINDER_SUMMARY, {
      maxAgeMs: TRAVEL_REMINDER_SUMMARY_CACHE_MAX_AGE_MS,
    })
  ) {
    return getCachedTravelRecords(TRAVEL_CACHE_DOMAINS.REMINDER_SUMMARY)[0] || null;
  }

  const response = await axios.get(
    `${TRAVEL_REMINDER_API}/summary`,
    getConfig(options.forceRefresh ? { refresh: 'true' } : {})
  );

  setCachedTravelRecords(
    TRAVEL_CACHE_DOMAINS.REMINDER_SUMMARY,
    response.data ? [response.data] : []
  );

  return response.data;
};

export const fetchTravelReminders = async (params = {}) => {
  const response = await axios.get(`${TRAVEL_REMINDER_API}`, getConfig(normalizeParams(params)));

  return Array.isArray(response.data) ? response.data : [];
};

export const fetchTravelBookingReminders = async (bookingId) => {
  const response = await axios.get(`${TRAVEL_REMINDER_API}/booking/${bookingId}`, getConfig());

  return response.data || { settings: null, reminders: [] };
};

export const fetchTravelReminderSettings = async () => {
  const response = await axios.get(`${TRAVEL_REMINDER_API}/settings`, getConfig());

  return response.data || null;
};

export const updateTravelReminderSettings = async (data) => {
  const response = await axios.put(`${TRAVEL_REMINDER_API}/settings`, data, getConfig());
  clearTravelReminderCache();

  return response.data || null;
};

export const sendTravelReminderEmail = async (id) => {
  const response = await axios.post(`${TRAVEL_REMINDER_API}/${id}/send-email`, {}, getConfig());
  clearTravelReminderCache();

  return response.data || null;
};

export const markTravelReminderRead = async (id, read = true) => {
  const response = await axios.patch(`${TRAVEL_REMINDER_API}/${id}/read`, { read }, getConfig());
  clearTravelReminderCache();

  return response.data || null;
};

export const fetchTravelReminderWhatsAppMessage = async (id, lang = 'en') => {
  const response = await axios.get(
    `${TRAVEL_REMINDER_API}/${id}/whatsapp-message`,
    getConfig({ lang })
  );

  return response.data || null;
};
