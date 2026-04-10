import React, { useEffect, useState } from 'react';
import {
  createBackup,
  restoreBackup,
  getBackupStatus,
  downloadBackup,
  createLocalBackup,
  restoreLocalBackup,
  getBackupReminder,
} from '../services/backupService';

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
  const handleRestoreBackup = async () => {
    if (mode === 'offline') {
      alert('Offline mode میں cloud restore available نہیں ہے');
      return;
    }
    const confirmRestore = window.confirm(t('backup.restoreConfirm'));

    if (!confirmRestore) return;

    try {
      setLoading(true);

      await restoreBackup();

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
      {loading && <div className="text-sm text-gray-600">{t('backup.processing')}</div>}

      {/* Backup Info */}
      {backupInfo && <BackupInfoCard backupInfo={backupInfo} />}
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
