import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { t } from '../i18n/i18n';

const formatAmount = (value) => Number(value || 0).toLocaleString('en-PK', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatAxisAmount = (value) => Number(value || 0).toLocaleString('en-PK', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const TrialBalanceComparisonChart = ({ data, scope }) => {
  const chartHeight = Math.max(430, data.length * 48 + 80);
  const creditColor = scope === 'travel' ? '#0891b2' : scope === 'weaving' ? '#0d9488' : '#2563eb';

  return (
    <div className="h-full min-h-0 overflow-auto" aria-label="Trial Balance account comparison chart">
      <div className="min-w-[760px]" style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart layout="vertical" data={data} margin={{ top: 16, right: 36, left: 20, bottom: 18 }} barCategoryGap="24%">
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
            <XAxis type="number" tickFormatter={formatAxisAmount} tick={{ fontSize: 11, fill: '#475569' }} />
            <YAxis type="category" dataKey="accountName" width={220} interval={0} tick={{ fontSize: 11, fill: '#334155' }} />
            <Tooltip formatter={(value) => formatAmount(value)} cursor={{ fill: '#f1f5f9' }} />
            <Legend verticalAlign="top" height={36} />
            <Bar dataKey="debit" fill="#10b981" name={t('reports.debit')} radius={[0, 4, 4, 0]} />
            <Bar dataKey="credit" fill={creditColor} name={t('reports.credit')} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default TrialBalanceComparisonChart;
