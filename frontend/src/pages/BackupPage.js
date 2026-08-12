import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  createBackup,
  restoreBackup,
  getBackupStatus,
  downloadBackup,
  restoreLocalBackup,
  getCloudBackupList,
  getBackupProgress,
} from '../services/backupService';

import BackupInfoCard from '../components/BackupInfoCard';
import Toast from '../components/Toast';
import { t } from '../i18n/i18n';

const formatSize = (bytes) => {
  const value = Number(bytes || 0);

  if (!value || value <= 0) {
    return '0 KB';
  }

  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), sizes.length - 1);

  return `${(value / Math.pow(1024, index)).toFixed(2)} ${sizes[index]}`;
};

const formatDate = (date) => {
  if (!date) {
    return '-';
  }

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return '-';
  }

  return parsedDate.toLocaleString();
};

const BackupPage = () => {
  const [backupInfo, setBackupInfo] = useState(null);
  const [cloudBackups, setCloudBackups] = useState([]);

  const [loading, setLoading] = useState(false);
  const [loadingCloudList, setLoadingCloudList] = useState(false);

  const [mode, setMode] = useState('online');

  const [toast, setToast] = useState({
    message: '',
    type: '',
  });

  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [progressStatus, setProgressStatus] = useState('idle');
  const [progressOperation, setProgressOperation] = useState(null);

  const [activeFileName, setActiveFileName] = useState(null);

  const pollingRef = useRef(null);

  const isBusy = loading || progressStatus === 'running';

  const isOffline = mode === 'offline';

  const sortedCloudBackups = useMemo(() => {
    return [...cloudBackups].sort(
      (a, b) => new Date(b?.lastModified || 0).getTime() - new Date(a?.lastModified || 0).getTime()
    );
  }, [cloudBackups]);

  const showToast = useCallback((message, type = 'success') => {
    setToast({
      message,
      type,
    });
  }, []);

  const fetchBackupStatus = useCallback(async () => {
    try {
      const data = await getBackupStatus();

      setBackupInfo(data);
    } catch (error) {
      showToast(error.message || t('alerts.backupStatusLoadFailed'), 'error');
    }
  }, [showToast]);

  const loadCloudBackups = useCallback(async () => {
    try {
      setLoadingCloudList(true);

      const files = await getCloudBackupList();

      setCloudBackups(Array.isArray(files) ? files : []);
    } catch (error) {
      showToast(error.message || t('backup.cloudListLoadFailed'), 'error');
    } finally {
      setLoadingCloudList(false);
    }
  }, [showToast]);

  const refreshBackupData = useCallback(async () => {
    await Promise.allSettled([fetchBackupStatus(), loadCloudBackups()]);
  }, [fetchBackupStatus, loadCloudBackups]);

  useEffect(() => {
    const savedMode = localStorage.getItem('mode');

    if (savedMode) {
      setMode(savedMode);
    }

    refreshBackupData();

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);

        pollingRef.current = null;
      }
    };
  }, [refreshBackupData]);

  useEffect(() => {
    if (!toast.message) {
      return undefined;
    }

    const timer = setTimeout(() => {
      setToast({
        message: '',
        type: '',
      });
    }, 4000);

    return () => clearTimeout(timer);
  }, [toast.message]);

  useEffect(() => {
    if (progressStatus !== 'running') {
      return undefined;
    }

    let cancelled = false;

    const pollProgress = async () => {
      try {
        const response = await getBackupProgress();

        if (cancelled) {
          return;
        }

        const data = response?.data;

        if (!data) {
          return;
        }

        setProgress(Number(data.progress || 0));

        setProgressMsg(data.message || '');

        setProgressStatus(data.status || 'idle');

        setProgressOperation(data.operation || null);

        if (data.status === 'completed' || data.status === 'failed' || data.status === 'idle') {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);

            pollingRef.current = null;
          }

          setLoading(false);

          if (data.status === 'completed') {
            await refreshBackupData();
          }

          if (data.status === 'failed' && data.message) {
            showToast(data.message, 'error');
          }
        }
      } catch (error) {
        console.error('Backup Progress Error:', error);
      }
    };

    pollProgress();

    pollingRef.current = setInterval(pollProgress, 1000);

    return () => {
      cancelled = true;

      if (pollingRef.current) {
        clearInterval(pollingRef.current);

        pollingRef.current = null;
      }
    };
  }, [progressStatus, refreshBackupData, showToast]);

  const startOperationProgress = (operation, message) => {
    setLoading(true);
    setProgress(0);
    setProgressStatus('running');
    setProgressOperation(operation);
    setProgressMsg(message);
  };

  const handleCreateBackup = async () => {
    if (isBusy) {
      return;
    }

    if (isOffline) {
      showToast(t('backup.cloudUnavailableOffline'), 'error');

      return;
    }

    try {
      startOperationProgress('backup', t('backup.startingBackup'));

      const result = await createBackup();

      showToast(result?.message || t('backup.backupCreatedSuccessfully'), 'success');

      await refreshBackupData();
    } catch (error) {
      showToast(error.message || t('backup.backupCreateFailed'), 'error');

      setLoading(false);
      setProgressStatus('failed');
    }
  };

  const handleDownloadBackup = async (fileName = null) => {
    if (isBusy) {
      return;
    }

    if (isOffline) {
      showToast(t('backup.downloadUnavailableOffline'), 'error');

      return;
    }

    try {
      setLoading(true);
      setActiveFileName(fileName);

      await downloadBackup(fileName);

      showToast(t('backup.downloadStarted'), 'success');
    } catch (error) {
      showToast(error.message || t('backup.downloadFailed'), 'error');
    } finally {
      setLoading(false);
      setActiveFileName(null);
    }
  };

  const handleRestoreBackup = async (fileName) => {
    if (isBusy || !fileName) {
      return;
    }

    if (isOffline) {
      showToast(t('backup.cloudRestoreUnavailableOffline'), 'error');

      return;
    }

    const confirmed = window.confirm(`${t('backup.restoreConfirm')}\n\n${fileName}`);

    if (!confirmed) {
      return;
    }

    try {
      setActiveFileName(fileName);

      startOperationProgress('restore', t('backup.startingRestore'));

      const result = await restoreBackup(fileName);

      showToast(result?.message || t('backup.restoreCompletedSuccessfully'), 'success');

      await refreshBackupData();
    } catch (error) {
      let message = error.message || t('backup.restoreFailed');

      if (error.rollbackAttempted && error.rollbackSucceeded) {
        message = `${message} ${t('backup.rollbackSucceeded')}`;
      }

      if (error.critical) {
        message = `${message} ${t('backup.criticalRestoreWarning')}`;
      }

      showToast(message, 'error');

      setLoading(false);
      setProgressStatus('failed');
    } finally {
      setActiveFileName(null);
    }
  };

  const handleLocalRestore = () => {
    if (isBusy) {
      return;
    }

    const fileInput = document.createElement('input');

    fileInput.type = 'file';
    fileInput.accept = '.zip';

    fileInput.onchange = async (event) => {
      const file = event.target.files?.[0];

      if (!file) {
        return;
      }

      const confirmed = window.confirm(`${t('backup.localRestoreConfirm')}\n\n${file.name}`);

      if (!confirmed) {
        return;
      }

      try {
        setActiveFileName(file.name);

        startOperationProgress('restore', t('backup.startingRestore'));

        const result = await restoreLocalBackup(file);

        showToast(result?.message || t('backup.restoreCompletedSuccessfully'), 'success');

        await refreshBackupData();
      } catch (error) {
        let message = error.message || t('backup.localRestoreFailed');

        if (error.rollbackAttempted && error.rollbackSucceeded) {
          message = `${message} ${t('backup.rollbackSucceeded')}`;
        }

        if (error.critical) {
          message = `${message} ${t('backup.criticalRestoreWarning')}`;
        }

        showToast(message, 'error');

        setLoading(false);
        setProgressStatus('failed');
      } finally {
        setActiveFileName(null);
      }
    };

    fileInput.click();
  };

  const progressLabel =
    progressOperation === 'restore' ? t('backup.restoreInProgress') : t('backup.backupInProgress');

  return (
    <div className="w-full max-w-7xl mx-auto space-y-4 px-3 sm:px-4 md:px-6 py-4">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 md:p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">{t('backup.title')}</h1>

            <p className="mt-1 text-sm text-gray-500">{t('backup.description')}</p>
          </div>

          <div className="flex items-center self-start md:self-auto">
            <span
              className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium ${
                isOffline ? 'bg-gray-100 text-gray-700' : 'bg-green-100 text-green-700'
              }`}
            >
              {isOffline ? `📴 ${t('backup.offline')}` : `🌐 ${t('backup.online')}`}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
          <button
            type="button"
            onClick={handleCreateBackup}
            disabled={isBusy || isOffline}
            className="w-full min-h-[44px] bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg text-sm font-medium transition"
          >
            {t('backup.create')}
          </button>

          <button
            type="button"
            onClick={() => handleDownloadBackup()}
            disabled={isBusy || isOffline}
            className="w-full min-h-[44px] bg-green-600 hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg text-sm font-medium transition"
          >
            {t('backup.downloadLatest')}
          </button>

          <button
            type="button"
            onClick={handleLocalRestore}
            disabled={isBusy}
            className="w-full min-h-[44px] bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg text-sm font-medium transition"
          >
            {t('backup.restoreFromFile')}
          </button>
        </div>
      </div>

      {progressStatus === 'running' && (
        <div className="bg-white border border-blue-200 rounded-xl shadow-sm p-4">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800">{progressLabel}</p>

              <p className="text-xs text-gray-500 truncate">
                {progressMsg || t('backup.processing')}
              </p>
            </div>

            <span className="text-sm font-semibold text-blue-700">{progress}%</span>
          </div>

          <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(Math.max(progress, 0), 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {backupInfo && <BackupInfoCard backupInfo={backupInfo} />}

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 md:px-5 py-4 border-b border-gray-200 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base md:text-lg font-semibold text-gray-900">
              {t('backup.cloudBackups')}
            </h2>

            <p className="text-xs text-gray-500 mt-0.5">{t('backup.cloudBackupsDescription')}</p>
          </div>

          <button
            type="button"
            onClick={loadCloudBackups}
            disabled={loadingCloudList || isBusy || isOffline}
            className="shrink-0 px-3 py-2 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {loadingCloudList ? t('backup.loading') : t('backup.refresh')}
          </button>
        </div>

        {loadingCloudList && cloudBackups.length === 0 ? (
          <div className="p-5 text-sm text-gray-500">{t('backup.loadingCloudBackups')}</div>
        ) : sortedCloudBackups.length === 0 ? (
          <div className="p-5 text-sm text-gray-500">{t('backup.noCloudBackups')}</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {sortedCloudBackups.map((file, index) => {
              const isActive = activeFileName === file.name;

              return (
                <div key={file.name || `${index}-${file.lastModified}`} className="p-4 md:px-5">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800 break-all">{file.name}</p>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-gray-500">
                        <span>
                          {t('backup.backupSize')}: {formatSize(file.size)}
                        </span>

                        <span>
                          {t('backup.createdAt')}: {formatDate(file.lastModified)}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:flex gap-2 w-full md:w-auto">
                      <button
                        type="button"
                        onClick={() => handleDownloadBackup(file.name)}
                        disabled={isBusy || isOffline || isActive}
                        className="min-h-[40px] px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-xs font-medium transition"
                      >
                        {isActive ? t('backup.processing') : t('backup.download')}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRestoreBackup(file.name)}
                        disabled={isBusy || isOffline || isActive}
                        className="min-h-[40px] px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-xs font-medium transition"
                      >
                        {isActive ? t('backup.processing') : t('backup.restore')}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Toast message={toast.message} type={toast.type} />
    </div>
  );
};

export default BackupPage;
