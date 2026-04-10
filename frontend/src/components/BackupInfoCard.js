import React from 'react';
import { t } from '../i18n/i18n';

const formatSize = (bytes) => {
  if (!bytes) return '0 KB';

  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));

  return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
};

const formatDate = (date) => {
  if (!date) return t('backup.noBackupYet');

  const d = new Date(date);

  return d.toLocaleString();
};

const BackupInfoCard = ({ backupInfo }) => {
  const exists = backupInfo?.exists;
  const lastBackup = backupInfo?.lastBackup;
  const size = backupInfo?.size;

  // ✅ NEW (safe defaults)
  const type = backupInfo?.type || 'cloud';
  const location = backupInfo?.location || 'Documents/SmartKhata/Backups';

  return (
    <div className="bg-white rounded-lg shadow p-5 border">
      {/* Card Header */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-800">{t('backup.information')}</h3>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-sm">
        {/* Last Backup */}
        <div className="bg-gray-50 rounded p-3">
          <p className="text-gray-500">{t('backup.lastBackup')}</p>
          <p className="font-medium text-gray-800">{formatDate(lastBackup)}</p>
        </div>

        {/* Backup Size */}
        <div className="bg-gray-50 rounded p-3">
          <p className="text-gray-500">Backup Size</p>
          <p className="font-medium text-gray-800">{formatSize(size)}</p>
        </div>

        {/* Backup Type */}
        <div className="bg-gray-50 rounded p-3">
          <p className="text-gray-500">Backup Type</p>
          <p className="font-medium text-gray-800">{type === 'local' ? '💻 Local' : '☁️ Cloud'}</p>
        </div>

        {/* Backup Location */}
        <div className="bg-gray-50 rounded p-3">
          <p className="text-gray-500">Location</p>
          <p className="font-medium text-gray-800 text-xs break-all">{location}</p>
        </div>

        {/* Status */}
        <div className="bg-gray-50 rounded p-3">
          <p className="text-gray-500">{t('backup.status')}</p>

          {exists ? (
            <span className="inline-block px-2 py-1 text-xs rounded bg-green-100 text-green-700">
              {t('backup.healthy')}
            </span>
          ) : (
            <span className="inline-block px-2 py-1 text-xs rounded bg-red-100 text-red-700">
              {t('backup.noBackup')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default BackupInfoCard;
