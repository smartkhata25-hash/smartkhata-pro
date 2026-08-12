import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;
const API = `${BASE_URL}/api/backup`;

const getToken = () => localStorage.getItem('token');

const getAuthHeaders = () => ({
  Authorization: `Bearer ${getToken()}`,
});

const getApiErrorMessage = (error, fallback) => {
  return error?.response?.data?.message || error?.message || fallback;
};

export const createBackup = async () => {
  try {
    const res = await axios.post(
      `${API}/create`,
      {},
      {
        headers: getAuthHeaders(),
      }
    );

    return res.data;
  } catch (error) {
    console.error('Create Backup Error:', error);

    throw new Error(getApiErrorMessage(error, 'Failed to create backup'));
  }
};

export const restoreBackup = async (fileName) => {
  try {
    if (!fileName) {
      throw new Error('Please select a backup to restore');
    }

    const res = await axios.post(
      `${API}/restore`,
      { fileName },
      {
        headers: getAuthHeaders(),
      }
    );

    return res.data;
  } catch (error) {
    console.error('Restore Backup Error:', error);

    const apiData = error?.response?.data;

    const restoreError = new Error(getApiErrorMessage(error, 'Failed to restore backup'));

    if (apiData) {
      restoreError.rollbackAttempted = Boolean(apiData.rollbackAttempted);

      restoreError.rollbackSucceeded = Boolean(apiData.rollbackSucceeded);

      restoreError.critical = Boolean(apiData.critical);
    }

    throw restoreError;
  }
};

export const getBackupStatus = async () => {
  try {
    const res = await axios.get(`${API}/status`, {
      headers: getAuthHeaders(),
    });

    return res.data?.data || null;
  } catch (error) {
    console.error('Backup Status Error:', error);

    throw new Error(getApiErrorMessage(error, 'Failed to load backup status'));
  }
};

export const downloadBackup = async (fileName = null) => {
  try {
    const response = await axios.get(`${API}/download`, {
      headers: getAuthHeaders(),
      responseType: 'blob',
      params: fileName ? { fileName } : undefined,
    });

    const contentType = response.headers['content-type'] || 'application/zip';

    const blob = new Blob([response.data], {
      type: contentType,
    });

    const url = window.URL.createObjectURL(blob);

    const link = document.createElement('a');

    const disposition = response.headers['content-disposition'];

    let downloadFileName = fileName || 'smartkhata-backup.zip';

    if (disposition) {
      const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);

      const normalMatch = disposition.match(/filename="?([^"]+)"?/i);

      if (utf8Match?.[1]) {
        downloadFileName = decodeURIComponent(utf8Match[1]);
      } else if (normalMatch?.[1]) {
        downloadFileName = normalMatch[1].replace(/"/g, '').trim();
      }
    }

    link.href = url;
    link.download = downloadFileName;

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.URL.revokeObjectURL(url);

    return {
      success: true,
      fileName: downloadFileName,
    };
  } catch (error) {
    console.error('Download Backup Error:', error);

    let message = 'Failed to download backup';

    if (error?.response?.data instanceof Blob) {
      try {
        const text = await error.response.data.text();

        const parsed = JSON.parse(text);

        message = parsed?.message || message;
      } catch (_) {}
    } else {
      message = getApiErrorMessage(error, message);
    }

    throw new Error(message);
  }
};

export const restoreLocalBackup = async (file) => {
  try {
    if (!file) {
      throw new Error('Please select a backup ZIP file');
    }

    const formData = new FormData();

    formData.append('backup', file);

    const res = await axios.post(`${API}/local/restore`, formData, {
      headers: getAuthHeaders(),
    });

    return res.data;
  } catch (error) {
    console.error('Local Restore Error:', error);

    const apiData = error?.response?.data;

    const restoreError = new Error(getApiErrorMessage(error, 'Failed to restore local backup'));

    if (apiData) {
      restoreError.rollbackAttempted = Boolean(apiData.rollbackAttempted);

      restoreError.rollbackSucceeded = Boolean(apiData.rollbackSucceeded);

      restoreError.critical = Boolean(apiData.critical);
    }

    throw restoreError;
  }
};

export const getCloudBackupList = async () => {
  try {
    const res = await axios.get(`${API}/cloud-list`, {
      headers: getAuthHeaders(),
    });

    return Array.isArray(res.data?.files) ? res.data.files : [];
  } catch (error) {
    console.error('Cloud List Error:', error);

    throw new Error(getApiErrorMessage(error, 'Failed to fetch cloud backups'));
  }
};

export const getBackupProgress = async () => {
  try {
    const res = await axios.get(`${API}/progress`, {
      headers: getAuthHeaders(),
    });

    return res.data;
  } catch (error) {
    console.error('Backup Progress Error:', error);

    throw new Error(getApiErrorMessage(error, 'Failed to load backup progress'));
  }
};
