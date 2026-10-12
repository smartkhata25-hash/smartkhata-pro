import React, { useEffect, useMemo, useState } from 'react';
import { FaExchangeAlt, FaTimes } from 'react-icons/fa';

import { TravelActionButton } from '../../master/TravelMasterUI';
import { formatMoneyDisplay } from '../../../../utils/money';

const money = formatMoneyDisplay;

const TravelCurrencyRateModal = ({
  open,
  currency,
  side,
  currentInvoiceRate,
  currentDefaultRate,
  baseCurrency,
  sourceAmount = 0,
  required = false,
  canMakeDefault = false,
  saving = false,
  error = '',
  onClose,
  onApply,
}) => {
  const [rate, setRate] = useState('');
  const [makeDefault, setMakeDefault] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRate(String(currentInvoiceRate ?? ''));
    setMakeDefault(false);
  }, [currentInvoiceRate, open, side, currency]);

  const numericRate = Number(rate);
  const valid = Number.isFinite(numericRate) && (required ? numericRate > 0 : numericRate >= 0);
  const converted = useMemo(
    () => Number(sourceAmount || 0) * (valid ? numericRate : 0),
    [numericRate, sourceAmount, valid]
  );

  if (!open) return null;

  const sideLabel = side === 'cost' ? 'Cost' : 'Sale';

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-cyan-100 bg-white shadow-2xl">
        <div className="flex items-center justify-between bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-3 text-white">
          <div className="flex items-center gap-2">
            <FaExchangeAlt aria-hidden="true" />
            <h2 className="text-sm font-black">
              {required ? 'Conversion Rate Required' : `${sideLabel} Conversion Rate`}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 hover:bg-white/25 disabled:opacity-50"
            aria-label="Close"
          >
            <FaTimes />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {required && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-bold text-amber-900">
              {currency} {sideLabel} conversion rate is required. Please enter the required rate to continue.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
            <div>
              <p className="font-bold text-slate-400">Currency</p>
              <p className="mt-1 font-black text-slate-800">{currency} → {baseCurrency}</p>
            </div>
            <div>
              <p className="font-bold text-slate-400">Default {sideLabel} Rate</p>
              <p className="mt-1 font-black text-slate-800">{money(currentDefaultRate)}</p>
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-extrabold text-slate-600">
              Invoice {sideLabel} Rate
            </span>
            <input
              autoFocus
              type="number"
              min="0"
              step="0.0001"
              value={rate}
              disabled={saving}
              onChange={(event) => setRate(event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-black text-slate-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            />
          </label>

          <div className="rounded-xl border border-cyan-100 bg-cyan-50 px-3 py-2 text-xs font-bold text-cyan-800">
            1 {currency} = {valid ? money(numericRate) : '—'} {baseCurrency}
            {Number(sourceAmount || 0) > 0 && valid && (
              <div className="mt-1 text-cyan-700">
                {money(sourceAmount)} × {money(numericRate)} = {money(converted)} {baseCurrency}
              </div>
            )}
          </div>

          {canMakeDefault && (
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-violet-100 bg-violet-50 px-3 py-2.5 text-xs font-extrabold text-violet-800">
              <input
                type="checkbox"
                checked={makeDefault}
                disabled={saving}
                onChange={(event) => setMakeDefault(event.target.checked)}
                className="h-4 w-4 rounded border-violet-300 text-violet-600 focus:ring-violet-500"
              />
              Make this the default {sideLabel} Rate
            </label>
          )}

          {error && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3">
          <TravelActionButton variant="secondary" disabled={saving} onClick={onClose}>
            Cancel
          </TravelActionButton>
          <TravelActionButton
            variant="primary"
            disabled={saving || !valid}
            onClick={() => onApply(numericRate, makeDefault)}
          >
            {saving ? 'Applying…' : 'Apply Rate'}
          </TravelActionButton>
        </div>
      </div>
    </div>
  );
};

export default TravelCurrencyRateModal;
