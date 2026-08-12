import React from 'react';
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
    return t('backup.noBackupYet');
  }

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return t('backup.noBackupYet');
  }

  return parsedDate.toLocaleString();
};

const BackupInfoCard = ({ backupInfo }) => {
  const exists = Boolean(backupInfo?.exists);
  const verified = backupInfo?.verified === true;

  const lastBackup = backupInfo?.lastBackup;
  const size = backupInfo?.size;

  const type = backupInfo?.type || 'local';

  const location =
    backupInfo?.location ||
    (type === 'cloud' ? t('backup.cloudStorage') : t('backup.localTemporaryStorage'));

  const getStatus = () => {
    if (!exists) {
      return {
        text: t('backup.noBackup'),
        className: 'bg-red-100 text-red-700',
      };
    }

    if (verified) {
      return {
        text: t('backup.verifiedHealthy'),
        className: 'bg-green-100 text-green-700',
      };
    }

    return {
      text: t('backup.available'),
      className: 'bg-yellow-100 text-yellow-700',
    };
  };

  const status = getStatus();

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-base md:text-lg font-semibold text-gray-800">
          {t('backup.information')}
        </h3>

        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${status.className}`}
        >
          {status.text}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">{t('backup.lastBackup')}</p>

          <p className="font-medium text-gray-800 break-words">{formatDate(lastBackup)}</p>
        </div>

        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">{t('backup.backupSize')}</p>

          <p className="font-medium text-gray-800">{formatSize(size)}</p>
        </div>

        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">{t('backup.backupType')}</p>

          <p className="font-medium text-gray-800">
            {type === 'cloud' ? `☁️ ${t('backup.cloud')}` : `💻 ${t('backup.local')}`}
          </p>
        </div>

        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">{t('backup.location')}</p>

          <p className="font-medium text-gray-800 text-xs break-all">{location}</p>
        </div>
      </div>
    </div>
  );
};

export default BackupInfoCard;
