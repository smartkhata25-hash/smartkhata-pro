import React from 'react';

import WhatsAppTemplateEditor from '../components/whatsapp/WhatsAppTemplateEditor';
import { t } from '../i18n/i18n';
import { hasPermission } from '../utils/permissionHelper';

const WhatsAppSettingsPage = () => {
  const canManage = hasPermission('settings.print');

  return (
    <div className="min-h-full bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-950">
            {t('whatsappSettings.tradingTitle')}
          </h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            {t('whatsappSettings.tradingDescription')}
          </p>
        </div>

        <WhatsAppTemplateEditor
          moduleScope="trading"
          title={t('whatsappSettings.messageTemplate')}
          description={t('whatsappSettings.description')}
          canManage={canManage}
        />
      </div>
    </div>
  );
};

export default WhatsAppSettingsPage;
