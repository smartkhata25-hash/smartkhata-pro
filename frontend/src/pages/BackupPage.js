import React, { useEffect, useState } from 'react';
import {
  createBackup,
  restoreBackup,
  getBackupStatus,
  downloadBackup,
  createLocalBackup,
  restoreLocalBackup,
  getBackupReminder,
  getCloudBackupList,
} from '../services/backupService';
import { getBackupProgress } from '../services/backupService';

import BackupInfoCard from '../components/BackupInfoCard';
import { t } from '../i18n/i18n';
import BackupModal from '../components/BackupModal';
import Toast from '../components/Toast';

const BackupPage = () => {
  const [backupInfo, setBackupInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('online');
  const [showReminder, setShowReminder] = useState(false);
  const [toast, setToast] = useState({ message: '', type: '' });
  const [cloudBackups, setCloudBackups] = useState([]);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [progressStatus, setProgressStatus] = useState('idle');

  /* ==========================================
     Load Backup Status
  ========================================== */
  const fetchBackupStatus = async () => {
    try {
      const data = await getBackupStatus();
      setBackupInfo(data);
    } catch (err) {
      setToast({ message: t('alerts.backupStatusLoadFailed'), type: 'error' });
    }
  };

  useEffect(() => {
    fetchBackupStatus();
    checkReminder();
    loadCloudBackups();

    const savedMode = localStorage.getItem('mode');
    if (savedMode) setMode(savedMode);
  }, []);

  useEffect(() => {
    if (toast.message) {
      const timer = setTimeout(() => {
        setToast({ message: '', type: '' });
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [toast]);

  /* ==========================================
     Create Backup
  ========================================== */
  const handleCreateBackup = async () => {
    if (mode === 'offline') {
      alert('Offline mode میں cloud backup available نہیں ہے');
      return;
    }
    try {
      setLoading(true);

      await createBackup();

      setToast({ message: 'Backup created successfully', type: 'success' });

      fetchBackupStatus();
    } catch (err) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  /* ==========================================
     Download Backup
  ========================================== */
  const handleDownloadBackup = async () => {
    if (mode === 'offline') {
      alert('Offline mode میں download available نہیں ہے');
      return;
    }
    try {
      setLoading(true);

      await downloadBackup();

      setLoading(false);
    } catch (err) {
      setToast({ message: err.message, type: 'error' });
      setLoading(false);
    }
  };

  /* ==========================================
     Restore Backup
  ========================================== */
  const handleRestoreBackup = async (fileName = null) => {
    if (mode === 'offline') {
      alert('Offline mode میں cloud restore available نہیں ہے');
      return;
    }
    const confirmRestore = window.confirm(t('backup.restoreConfirm'));

    if (!confirmRestore) return;

    try {
      setLoading(true);

      setProgressStatus('running');
      setProgress(0);
      setProgressMsg('Starting restore...');

      await restoreBackup(fileName);

      setToast({ message: 'Backup restored successfully', type: 'success' });

      setLoading(false);
    } catch (err) {
      setToast({ message: err.message, type: 'error' });
      setLoading(false);
    }
  };

  /* ==========================================
   Local Backup
========================================== */
  const handleLocalBackup = async () => {
    try {
      setLoading(true);

      await createLocalBackup();

      setToast({ message: 'Backup saved in Documents/SmartKhata/Backups', type: 'success' });

      setLoading(false);
    } catch (err) {
      setToast({ message: err.message, type: 'error' });
      setLoading(false);
    }
  };

  /* ==========================================
   Restore from File
========================================== */
  const handleLocalRestore = async () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.zip';

    fileInput.onchange = async (e) => {
      const file = e.target.files[0];

      if (!file) return;

      const confirmRestore = window.confirm('Restore کرنا چاہتے ہیں؟');

      if (!confirmRestore) return;

      try {
        setLoading(true);

        await restoreLocalBackup(file);

        setToast({ message: 'Backup restored successfully', type: 'success' });

        setLoading(false);
      } catch (err) {
        setToast({ message: err.message, type: 'error' });
        setLoading(false);
      }
    };

    fileInput.click();
  };

  /* ==========================================
   Backup Reminder
========================================== */
  const checkReminder = async () => {
    try {
      const res = await getBackupReminder();

      if (res.remind) {
        setShowReminder(true);
      }
    } catch (err) {
      console.log(err);
    }
  };

  const loadCloudBackups = async () => {
    try {
      const files = await getCloudBackupList();
      setCloudBackups(files);
    } catch (err) {
      console.log(err);
    }
  };

  // PROGRESS POLLING

  useEffect(() => {
    let interval;

    if (progressStatus === 'running') {
      interval = setInterval(async () => {
        try {
          const res = await getBackupProgress();

          if (res?.data) {
            setProgress(res.data.progress || 0);
            setProgressMsg(res.data.message || '');
            setProgressStatus(res.data.status || 'idle');

            if (res.data.status === 'completed' || res.data.status === 'failed') {
              clearInterval(interval);
            }
          }
        } catch (err) {
          console.log(err);
        }
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [progressStatus]);
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg p-4 shadow">
        <h1 className="text-xl font-semibold">{t('backup.title')}</h1>
        <p className="text-sm opacity-90">{t('backup.description')}</p>
        <div className="text-xs mt-2">Mode: {mode === 'offline' ? 'Offline 📴' : 'Online 🌐'}</div>
      </div>

      {/* Buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleCreateBackup}
          disabled={loading || mode === 'offline'}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded shadow"
        >
          {t('backup.create')}
        </button>

        <button
          onClick={handleDownloadBackup}
          disabled={loading || mode === 'offline'}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded shadow"
        >
          {t('backup.download')}
        </button>

        <button
          onClick={handleRestoreBackup}
          disabled={loading || mode === 'offline'}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded shadow"
        >
          {t('backup.restore')}
        </button>
        <button
          onClick={handleLocalBackup}
          disabled={loading}
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded shadow"
        >
          Save to Computer
        </button>

        <button
          onClick={handleLocalRestore}
          disabled={loading}
          className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded shadow"
        >
          Restore from File
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="bg-white p-4 rounded shadow border">
          <p className="text-sm text-gray-600 mb-2">{progressMsg || t('backup.processing')}</p>

          <div className="w-full bg-gray-200 rounded h-3">
            <div className="bg-blue-600 h-3 rounded" style={{ width: `${progress}%` }}></div>
          </div>

          <p className="text-xs text-right mt-1">{progress}%</p>
          <p className="text-xs text-gray-500">{progressStatus}</p>
        </div>
      )}

      {/* Backup Info */}
      {backupInfo && <BackupInfoCard backupInfo={backupInfo} />}
      <div className="bg-white rounded-lg shadow p-5 border">
        <h3 className="text-lg font-semibold mb-3">Cloud Backups ☁️</h3>

        {cloudBackups.length === 0 ? (
          <p className="text-sm text-gray-500">No backups found</p>
        ) : (
          cloudBackups.map((file, index) => (
            <div key={index} className="flex justify-between items-center border-b py-2">
              <span className="text-sm">{file.name}</span>

              <button
                onClick={() => handleRestoreBackup(file.name)}
                className="bg-red-500 text-white px-3 py-1 rounded text-xs"
              >
                Restore
              </button>
            </div>
          ))
        )}
      </div>
      <BackupModal
        show={showReminder}
        title="Backup Reminder"
        message="آپ نے آج backup نہیں لیا، ابھی لے لیں؟"
        onConfirm={() => {
          setShowReminder(false);
          handleLocalBackup();
        }}
        onCancel={() => setShowReminder(false)}
      />
      <Toast message={toast.message} type={toast.type} />
    </div>
  );
};

export default BackupPage;
