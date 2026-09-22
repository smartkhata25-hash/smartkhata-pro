import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { t } from '../../i18n/i18n';
import WeavingContractsPage from './WeavingContractsPage';
import WeavingMastersPage from './WeavingMastersPage';
import { hasPermission } from '../../utils/permissionHelper';

const MASTER_TABS = ['yarn', 'fabric', 'loom'];
const CONTRACT_TABS = ['sales', 'purchase'];

const WeavingFormsPage = () => {
  const [params, setParams] = useSearchParams();

  const tabs = [
    ...(hasPermission('weaving.masters.view') ? MASTER_TABS : []),
    ...(hasPermission('weaving.contracts.view') ? CONTRACT_TABS : []),
  ];

  const requestedTab = params.get('tab');
  const tab = tabs.includes(requestedTab) ? requestedTab : tabs[0];
  const listMode = params.get('view') === 'list';

  const selectTab = (nextTab, view = '') => {
    const next = new URLSearchParams();
    next.set('tab', nextTab);
    if (view) next.set('view', view);
    setParams(next);
  };

  useEffect(() => {
    if (requestedTab && tab && requestedTab !== tab) {
      setParams({ tab }, { replace: true });
    }
  }, [requestedTab, setParams, tab]);

  const labels = {
    yarn: 'weaving.operations.yarnMaster',
    fabric: 'weaving.operations.fabricQuality',
    loom: 'weaving.operations.loomMaster',
    sales: 'weaving.operations.salesContract',
    purchase: 'weaving.operations.purchaseContract',
  };

  if (!tab) return null;

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-teal-50/40">
      <div className="mx-auto max-w-[1600px]">
        {/* TOP TABS */}
        <div className="sticky top-0 z-20 border-x border-b border-slate-200 bg-white/95 px-1.5 py-1 shadow-sm backdrop-blur">
          <div className="flex overflow-x-auto rounded-md bg-slate-50 p-1">
            {tabs.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => selectTab(key, listMode ? 'list' : '')}
                className={`min-w-max flex-1 rounded-md px-4 py-2 text-sm font-semibold transition-all duration-150 ${
                  tab === key
                    ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-white hover:text-teal-700 hover:shadow-sm'
                }`}
              >
                {t(labels[key])}
              </button>
            ))}
          </div>
        </div>

        {/* PAGE CONTENT */}
        <div className="px-2 pb-3 pt-1 sm:px-3 sm:pb-4">
          {MASTER_TABS.includes(tab) ? (
            <WeavingMastersPage key={tab} embedded initialTab={tab} listMode={listMode} onNew={() => selectTab(tab)} />
          ) : (
            <WeavingContractsPage key={tab} embedded initialTab={tab} listMode={listMode} onNew={() => selectTab(tab)} />
          )}
        </div>
      </div>
    </div>
  );
};

export default WeavingFormsPage;
