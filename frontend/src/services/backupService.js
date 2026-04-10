import axios from 'axios';

/*
  Base API URL
*/
const BASE_URL = process.env.REACT_APP_API_BASE_URL;
const API = `${BASE_URL}/api/backup`;

/*
  Helper: Auth Header
*/
const getAuthHeader = () => {
  const token = localStorage.getItem('token');

  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
};

/* =====================================================
   CREATE BACKUP
===================================================== */

export const createBackup = async () => {
  try {
    const res = await axios.post(`${API}/create`, {}, getAuthHeader());

    return res.data;
  } catch (error) {
    console.error('Create Backup Error:', error);

    throw new Error(error?.response?.data?.message || 'Failed to create backup');
  }
};

/* =====================================================
   RESTORE BACKUP
===================================================== */

export const restoreBackup = async () => {
  try {
    const res = await axios.post(`${API}/restore`, {}, getAuthHeader());

    return res.data;
  } catch (error) {
    console.error('Restore Backup Error:', error);

    throw new Error(error?.response?.data?.message || 'Failed to restore backup');
  }
};

/* =====================================================
   GET BACKUP STATUS
===================================================== */

export const getBackupStatus = async () => {
  try {
    const res = await axios.get(`${API}/status`, getAuthHeader());

    return res.data?.data;
  } catch (error) {
    console.error('Backup Status Error:', error);

    throw new Error(error?.response?.data?.message || 'Failed to load backup status');
  }
};

/* =====================================================
   DOWNLOAD BACKUP
===================================================== */

export const downloadBackup = async () => {
  try {
    const response = await axios.get(`${API}/download`, {
      responseType: 'blob',
      ...getAuthHeader(),
    });

    const blob = new Blob([response.data]);

    const url = window.URL.createObjectURL(blob);

    const link = document.createElement('a');

    link.href = url;

    // backend generated filename
    const fileName =
      response.headers['content-disposition']?.split('filename=')[1] || 'smartkhata-backup.zip';

    link.setAttribute('download', fileName.replace(/"/g, ''));

    document.body.appendChild(link);

    link.click();

    link.remove();

    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Download Backup Error:', error);

    throw new Error(error?.response?.data?.message || 'Failed to download backup');
  }
};

/* =====================================================
   LOCAL BACKUP
===================================================== */

export const createLocalBackup = async () => {
  try {
    const res = await axios.post(`${API}/local/create`, {}, getAuthHeader());
    return res.data;
  } catch (error) {
    console.error('Local Backup Error:', error);

    throw new Error(error?.response?.data?.message || 'Failed to create local backup');
  }
};

/* =====================================================
   LOCAL RESTORE
===================================================== */

export const restoreLocalBackup = async (filePath) => {
  try {
    const res = await axios.post(`${API}/local/restore`, { filePath }, getAuthHeader());

    return res.data;
  } catch (error) {
    console.error('Local Restore Error:', error);

    throw new Error(error?.response?.data?.message || 'Failed to restore local backup');
  }
};

/* =====================================================
   BACKUP REMINDER
===================================================== */

export const getBackupReminder = async () => {
  try {
    const res = await axios.get(`${API}/reminder`, getAuthHeader());
    return res.data;
  } catch (error) {
    console.error('Reminder Error:', error);

    throw new Error('Failed to check reminder');
  }
};
