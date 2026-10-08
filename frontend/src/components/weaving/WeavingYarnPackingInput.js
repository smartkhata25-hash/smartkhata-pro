import React from 'react';
import { FaPlus, FaTrash } from 'react-icons/fa';

import { requestWeavingConfirmation } from './WeavingFeedbackModal';
import {
  coneRowsToLegacy,
  fullPackageConversion,
  hydrateConeRows,
  parsePackageShorthand,
} from '../../utils/weaving/yarnPackingEntry';

const control =
  'mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition hover:border-teal-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-100';

const displayName = (value) =>
  String(value || 'Package').replace(/\b\w/g, (letter) => letter.toUpperCase());

const plural = (value) => (value.endsWith('s') ? value : `${value}s`);

export default function WeavingYarnPackingInput({ row, profiles = [], onChange, onFeedback }) {
  const rows = hydrateConeRows(row);
  const packageLabel = displayName(row.packageType);
  const quantityValue = row.packageQtyInput ?? String(row.packageQty ?? '');

  const patchRows = (nextRows, extra = {}) => {
    const mapped = coneRowsToLegacy(nextRows);
    onChange({
      ...extra,
      coneRows: nextRows,
      ...(mapped.valid
        ? {
            smallCones: mapped.smallCones,
            largeCones: mapped.largeCones,
            totalCones: mapped.totalCones,
          }
        : {}),
    });
  };

  const convertIfNeeded = async (rowIndex, nextRows = rows, packageQty = Number(row.packageQty || 0)) => {
    const coneRow = nextRows[rowIndex];
    if (!coneRow?.type || !Number(coneRow.qty || 0)) return true;
    const conesPerPackage = Number(
      coneRow.type === 'small' ? row.smallConesPerPackage : row.largeConesPerPackage
    );
    if (!(conesPerPackage > 0)) return true;
    const conversion = fullPackageConversion({
      packageQty,
      coneQty: Number(coneRow.qty),
      conesPerPackage,
    });
    if (!conversion.needsConversion) return true;

    const typeLabel = coneRow.type === 'small' ? 'Small' : 'Large';
    const confirmed = await requestWeavingConfirmation({
      message: `${conesPerPackage} ${typeLabel} Cones make 1 full ${packageLabel}.\nConvert to ${conversion.packageQty} ${plural(packageLabel)}?`,
      confirmLabel: 'Convert',
    });
    if (!confirmed) return false;

    const convertedRows = nextRows.map((item, index) =>
      index === rowIndex ? { ...item, qty: conversion.coneQty ? String(conversion.coneQty) : '' } : item
    );
    patchRows(convertedRows, {
      packageQty: String(conversion.packageQty),
      packageQtyInput: String(conversion.packageQty),
    });
    return true;
  };

  const changeQuantity = (raw) => {
    const parsed = parsePackageShorthand(raw);
    if (!parsed.valid) return;
    const nextRows = parsed.hasConeSuffix
      ? rows.map((item, index) => (index === 0 ? { ...item, qty: String(parsed.cones) } : item))
      : rows;
    patchRows(nextRows, {
      packageQty: String(parsed.packages),
      packageQtyInput: raw,
    });
  };

  const commitQuantity = async () => {
    const parsed = parsePackageShorthand(quantityValue);
    if (!parsed.valid) return;
    const nextRows = parsed.hasConeSuffix
      ? rows.map((item, index) => (index === 0 ? { ...item, qty: String(parsed.cones) } : item))
      : rows;
    patchRows(nextRows, {
      packageQty: String(parsed.packages),
      packageQtyInput: parsed.packages ? String(parsed.packages) : '',
    });
    if (parsed.hasConeSuffix && nextRows[0]?.type) {
      await convertIfNeeded(0, nextRows, parsed.packages);
    }
  };

  const addRow = () => {
    const first = rows[0];
    if (!(Number(first?.qty) > 0) || !first?.type) {
      onFeedback?.(
        Number(first?.qty) > 0
          ? `Please select Small or Large for ${first.qty} cones before adding another cone type.`
          : 'Enter the first Cone Qty and Type before adding another cone type.'
      );
      return;
    }
    if (rows.length < 2) patchRows([...rows, { qty: '', type: '' }]);
  };

  const selectedTypes = rows.map((item) => item.type).filter(Boolean);

  return (
    <div className="sm:col-span-2 xl:col-span-4">
      <div className="grid items-end gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-2.5 sm:grid-cols-2 lg:grid-cols-[1fr_0.8fr_0.8fr_1fr_auto]">
        <label className="min-w-0 text-sm font-medium text-slate-700">
          <span className="block min-h-[18px] text-xs font-semibold leading-[18px] text-slate-600">Package Type</span>
          <select
            aria-label="Package Type"
            className={control}
            value={row.packageType || 'bag'}
            onChange={(event) => {
              const profile = profiles.find((item) => item.packageType === event.target.value) || {};
              onChange({
                packageType: event.target.value,
                packageWeight: profile.packageWeight ?? row.packageWeight,
                smallConesPerPackage:
                  profile.smallConesPerPackage ?? row.smallConesPerPackage,
                largeConesPerPackage:
                  profile.largeConesPerPackage ?? row.largeConesPerPackage,
              });
            }}
          >
            {profiles.map((profile) => (
              <option key={profile.packageType} value={profile.packageType}>
                {displayName(profile.packageType)}
              </option>
            ))}
          </select>
        </label>

        <label className="min-w-0 text-sm font-medium text-slate-700">
          <span className="block min-h-[18px] text-xs font-semibold leading-[18px] text-slate-600">Quantity</span>
          <input
            type="text"
            inputMode="decimal"
            aria-label="Package Quantity"
            className={control}
            placeholder="e.g. 5 or 5.10"
            value={quantityValue}
            onChange={(event) => changeQuantity(event.target.value)}
            onBlur={commitQuantity}
          />
        </label>

        {rows.map((coneRow, index) => (
          <React.Fragment key={index}>
            {index > 0 && <div className="hidden lg:block lg:col-span-2" />}
            <label className="min-w-0 text-sm font-medium text-slate-700">
              <span className="block min-h-[18px] text-xs font-semibold leading-[18px] text-slate-600">Cone Qty</span>
              <input
                type="text"
                inputMode="numeric"
                aria-label={`Cone Qty ${index + 1}`}
                className={control}
                value={coneRow.qty}
                onChange={(event) => {
                  if (!/^\d*$/.test(event.target.value)) return;
                  patchRows(rows.map((item, rowIndex) =>
                    rowIndex === index ? { ...item, qty: event.target.value } : item
                  ));
                }}
                onBlur={() => convertIfNeeded(index)}
              />
            </label>

            <label className="min-w-0 text-sm font-medium text-slate-700">
              <span className="block min-h-[18px] text-xs font-semibold leading-[18px] text-slate-600">Cone Type</span>
              <select
                aria-label={`Cone Type ${index + 1}`}
                className={control}
                value={coneRow.type}
                onChange={async (event) => {
                  const nextRows = rows.map((item, rowIndex) =>
                    rowIndex === index ? { ...item, type: event.target.value } : item
                  );
                  patchRows(nextRows);
                  await convertIfNeeded(index, nextRows);
                }}
              >
                <option value="">Select Type</option>
                <option value="small" disabled={coneRow.type !== 'small' && selectedTypes.includes('small')}>Small</option>
                <option value="large" disabled={coneRow.type !== 'large' && selectedTypes.includes('large')}>Large</option>
              </select>
            </label>

            <div className="flex h-9 items-center justify-center">
              {index === 0 && rows.length < 2 ? (
                <button
                  type="button"
                  title="Add another cone type"
                  aria-label="Add another cone type"
                  onClick={addRow}
                  className="mt-1 flex h-9 w-9 items-center justify-center rounded-md border border-teal-200 bg-white text-teal-700 transition hover:bg-teal-50"
                >
                  <FaPlus />
                </button>
              ) : index > 0 ? (
                <button
                  type="button"
                  title={`Remove ${coneRow.type ? displayName(coneRow.type) : 'additional'} cone row`}
                  aria-label={`Remove ${coneRow.type ? displayName(coneRow.type) : 'additional'} cone row`}
                  onClick={() => patchRows(rows.filter((_, rowIndex) => rowIndex !== index))}
                  className="mt-1 flex h-9 w-9 items-center justify-center rounded-md border border-rose-100 bg-white text-rose-600 transition hover:bg-rose-50"
                >
                  <FaTrash />
                </button>
              ) : null}
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
