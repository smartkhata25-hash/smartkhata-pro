import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  FaBan,
  FaCalendarCheck,
  FaCheck,
  FaChevronDown,
  FaLock,
  FaLockOpen,
  FaSave,
  FaSearch,
  FaSync,
  FaTimes,
} from 'react-icons/fa';

import { t } from '../../i18n/i18n';
import {
  getWeavingAttendanceMeta,
  getWeavingAttendanceSession,
  saveWeavingAttendanceSession,
} from '../../services/weavingAttendanceService';
import { getBusinessDateInputValue } from '../../utils/localDateTime';
import { hasPermission } from '../../utils/permissionHelper';
import { requestWeavingConfirmation, useWeavingFeedback } from '../../components/weaving/WeavingFeedbackModal';

const EMPTY_LOCK = {
  locked: false,
  canEdit: false,
  canManage: false,
  canOverride: false,
  reason: 'open',
};

const STATUS_CONFIG = {
  present: {
    labelKey: 'weaving.attendance.presentShort',
    titleKey: 'weaving.attendance.present',
    active:
      'border-emerald-500 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-sm',
    idle: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  },
  absent: {
    labelKey: 'weaving.attendance.absentShort',
    titleKey: 'weaving.attendance.absent',
    active: 'border-rose-500 bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-sm',
    idle: 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
  },
  leave: {
    labelKey: 'weaving.attendance.leaveShort',
    titleKey: 'weaving.attendance.leave',
    active:
      'border-amber-400 bg-gradient-to-br from-amber-400 to-amber-500 text-amber-950 shadow-sm',
    idle: 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100',
  },
};

const getUnitLabel = (unit = {}) =>
  unit.label || (unit.name ? `Unit ${unit.unitNo} - ${unit.name}` : `Unit ${unit.unitNo || ''}`);

const normalizeRows = (rows = []) =>
  rows.map((row) => ({
    ...row,
    status: row.status || '',
    otHours: row.otHours === 0 || row.otHours === '0' ? '' : row.otHours || '',
    replacementEmployeeId: row.replacementEmployeeId || '',
  }));

const getErrorMessage = (error, fallbackKey) =>
  error?.response?.data?.message || error?.message || t(fallbackKey);

const rowMatches = ({ row, departmentId, search }) => {
  if (departmentId && row.departmentId !== departmentId) {
    return false;
  }

  const query = search.trim().toLowerCase();

  if (!query) return true;

  return [row.employeeName, row.employeeNo, row.departmentName, row.designationName]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));
};

const buildSummary = (rows = []) =>
  rows.reduce(
    (summary, row) => {
      summary.total += 1;

      if (row.status === 'present') summary.present += 1;
      if (row.status === 'absent') summary.absent += 1;
      if (row.status === 'leave') summary.leave += 1;

      if (Number(row.otHours || 0) > 0) {
        summary.ot += 1;
      }

      if (row.isDoubleDuty || String(row.dutyType || '').includes('double')) {
        summary.double += 1;
      }

      return summary;
    },
    {
      total: 0,
      present: 0,
      absent: 0,
      leave: 0,
      ot: 0,
      double: 0,
    }
  );

const StatChip = ({ labelKey, value, tone = 'slate' }) => {
  const tones = {
    slate: 'border-slate-200 bg-white text-slate-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    red: 'border-rose-200 bg-rose-50 text-rose-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    cyan: 'border-cyan-200 bg-cyan-50 text-cyan-700',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  };

  return (
    <span
      className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-extrabold shadow-sm md:h-10 md:px-3 ${
        tones[tone] || tones.slate
      }`}
    >
      <span className="whitespace-nowrap">{t(labelKey)}</span>
      <span className="text-sm font-black">{value}</span>
    </span>
  );
};

const StatusButton = ({ status, selected, disabled, onClick }) => {
  const config = STATUS_CONFIG[status];

  return (
    <button
      type="button"
      title={t(config.titleKey)}
      aria-label={t(config.titleKey)}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cyan-500 disabled:cursor-not-allowed disabled:opacity-40 md:h-9 md:w-9 md:text-sm ${
        selected ? config.active : config.idle
      }`}
    >
      {t(config.labelKey)}
    </button>
  );
};

const DutyBadge = ({ row }) => {
  const dutyType = String(row.dutyType || '').toLowerCase();

  if (
    dutyType === 'double_replacement' ||
    dutyType === 'double-replacement' ||
    dutyType === 'double replacement'
  ) {
    return (
      <span className="inline-flex whitespace-nowrap rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] font-extrabold text-indigo-700 md:text-xs">
        Double + Replacement
      </span>
    );
  }

  if (dutyType === 'replacement') {
    return (
      <span className="inline-flex whitespace-nowrap rounded-md border border-cyan-200 bg-cyan-50 px-2 py-1 text-[10px] font-extrabold text-cyan-700 md:text-xs">
        Replacement
      </span>
    );
  }

  if (dutyType === 'double' || row.isDoubleDuty) {
    return (
      <span className="inline-flex whitespace-nowrap rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-extrabold text-violet-700 md:text-xs">
        Double
      </span>
    );
  }

  return <span className="text-slate-300">—</span>;
};

/*
 * Floating replacement selector.
 *
 * IMPORTANT:
 * The options panel is rendered into document.body through a portal.
 * Therefore:
 * - it is not clipped by the table
 * - it can overlap the next employee row
 * - it can extend below/outside the table
 * - table overflow does not control the dropdown
 */
const ReplacementSelect = ({ row, options, assignedIds, selectedShiftId, disabled, onChange }) => {
  const wrapperRef = useRef(null);
  const dropdownRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownStyle, setDropdownStyle] = useState(null);

  const selected = options.find((option) => option._id === row.replacementEmployeeId);

  const updateDropdownPosition = useCallback(() => {
    if (!wrapperRef.current || !open) return;

    const rect = wrapperRef.current.getBoundingClientRect();

    const viewportWidth = document.documentElement.clientWidth;

    const desktop = viewportWidth >= 768;

    const desiredWidth = desktop ? 350 : 280;

    const availableWidth = Math.max(220, viewportWidth - 16);

    const width = Math.min(desiredWidth, availableWidth);

    let left = rect.left;

    if (left + width > viewportWidth - 8) {
      left = viewportWidth - width - 8;
    }

    if (left < 8) {
      left = 8;
    }

    setDropdownStyle({
      position: 'fixed',
      top: rect.bottom + 5,
      left,
      width,
      zIndex: 99999,
    });
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return undefined;

    updateDropdownPosition();

    const handlePositionChange = () => {
      updateDropdownPosition();
    };

    window.addEventListener('resize', handlePositionChange);

    /*
     * Capture scroll from page AND nested scroll containers.
     * This keeps the floating menu attached to its input.
     */
    window.addEventListener('scroll', handlePositionChange, true);

    return () => {
      window.removeEventListener('resize', handlePositionChange);

      window.removeEventListener('scroll', handlePositionChange, true);
    };
  }, [open, updateDropdownPosition]);

  useEffect(() => {
    const handleOutside = (event) => {
      const clickedInput = wrapperRef.current?.contains(event.target);

      const clickedDropdown = dropdownRef.current?.contains(event.target);

      if (!clickedInput && !clickedDropdown) {
        setOpen(false);
        setSearch('');
      }
    };

    document.addEventListener('mousedown', handleOutside);

    return () => {
      document.removeEventListener('mousedown', handleOutside);
    };
  }, []);

  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();

    return options.filter((option) => {
      if (option._id === row.employeeId) {
        return false;
      }

      if (option.shiftId === selectedShiftId) {
        return false;
      }

      if (assignedIds.has(option._id) && option._id !== row.replacementEmployeeId) {
        return false;
      }

      if (!query) return true;

      return [
        option.name,
        option.employeeNo,
        option.shiftName,
        option.designationName,
        option.departmentName,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [options, row.employeeId, row.replacementEmployeeId, assignedIds, selectedShiftId, search]);

  if (row.generatedByReplacement) {
    return (
      <span className="block max-w-[130px] truncate text-[10px] font-bold text-slate-500 md:max-w-[210px] md:text-xs">
        {row.replacementForEmployeeName ? `For ${row.replacementForEmployeeName}` : '—'}
      </span>
    );
  }

  const selectedLabel = selected
    ? `${selected.name}${selected.employeeNo ? ` — ${selected.employeeNo}` : ''}`
    : '';

  const openDropdown = () => {
    if (disabled) return;

    setSearch('');
    setOpen(true);
  };

  const closeDropdown = () => {
    setOpen(false);
    setSearch('');
  };

  return (
    <>
      <div ref={wrapperRef} className="relative min-w-[125px] md:min-w-[210px]">
        <div
          className={`flex h-8 items-center rounded-lg border bg-white shadow-sm transition md:h-9 ${
            open
              ? 'border-cyan-500 ring-2 ring-cyan-100'
              : 'border-slate-200 hover:border-slate-300'
          } ${disabled ? 'cursor-not-allowed bg-slate-100 opacity-60' : ''}`}
        >
          <FaSearch aria-hidden="true" className="ml-2 h-3 w-3 flex-shrink-0 text-slate-400" />

          <input
            type="text"
            disabled={disabled}
            value={open ? search : selectedLabel}
            placeholder={selectedLabel || t('weaving.attendance.searchReplacement')}
            onFocus={openDropdown}
            onClick={openDropdown}
            onChange={(event) => {
              if (disabled) return;

              setSearch(event.target.value);
              setOpen(true);
            }}
            className="h-full min-w-0 flex-1 border-0 bg-transparent px-1.5 text-[10px] font-bold text-slate-700 outline-none placeholder:text-slate-400 md:text-xs"
          />

          {selected && !disabled ? (
            <button
              type="button"
              title={t('weaving.attendance.noReplacement')}
              onClick={(event) => {
                event.stopPropagation();
                onChange('');
                closeDropdown();
              }}
              className="mr-1 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
            >
              <FaTimes aria-hidden="true" className="h-2.5 w-2.5" />
            </button>
          ) : (
            <button
              type="button"
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation();

                if (disabled) return;

                if (open) {
                  closeDropdown();
                } else {
                  openDropdown();
                }
              }}
              className="mr-1 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-50"
            >
              <FaChevronDown
                aria-hidden="true"
                className={`h-2.5 w-2.5 transition-transform ${open ? 'rotate-180' : ''}`}
              />
            </button>
          )}
        </div>
      </div>

      {open &&
        !disabled &&
        dropdownStyle &&
        createPortal(
          <div
            ref={dropdownRef}
            style={dropdownStyle}
            className="rounded-xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="max-h-[260px] overflow-y-auto rounded-xl bg-white p-1.5">
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  closeDropdown();
                }}
                className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-xs font-bold text-slate-500 transition hover:bg-slate-50"
              >
                {t('weaving.attendance.noReplacement')}
              </button>

              {filteredOptions.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs font-semibold text-slate-400">
                  {t('weaving.attendance.noReplacementFound')}
                </div>
              ) : (
                filteredOptions.map((option) => (
                  <button
                    type="button"
                    key={option._id}
                    onClick={() => {
                      onChange(option._id);
                      closeDropdown();
                    }}
                    className={`block w-full rounded-lg px-2.5 py-2 text-left transition hover:bg-cyan-50 ${
                      option._id === row.replacementEmployeeId ? 'bg-cyan-50' : ''
                    }`}
                  >
                    <span className="block truncate text-xs font-extrabold text-slate-900 md:text-sm">
                      {option.name}
                      {option.employeeNo ? ` — ${option.employeeNo}` : ''}
                    </span>

                    <span className="mt-0.5 block truncate text-[10px] font-semibold text-slate-500 md:text-[11px]">
                      {[option.shiftName, option.designationName, option.departmentName]
                        .filter(Boolean)
                        .join(' • ')}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

const WeavingAttendancePage = () => {
  const [date, setDate] = useState(getBusinessDateInputValue());

  const [unitId, setUnitId] = useState('');
  const [shiftId, setShiftId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [search, setSearch] = useState('');

  const [meta, setMeta] = useState({
    units: [],
    departments: [],
    shifts: [],
  });

  const [rows, setRows] = useState([]);

  const [replacementOptions, setReplacementOptions] = useState([]);

  const [lock, setLock] = useState(EMPTY_LOCK);

  const [loadingMeta, setLoadingMeta] = useState(true);

  const [loadingRows, setLoadingRows] = useState(false);

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState('');
  useWeavingFeedback(error, setError, { type: 'error' });

  const localCanManage =
    hasPermission('weaving.attendance.manage') || hasPermission('weaving.attendance.override');

  const canEdit = lock.canEdit && localCanManage && !saving && !loadingRows;

  const hasSelection = Boolean(date && unitId && shiftId);

  useEffect(() => {
    let cancelled = false;

    const loadMeta = async () => {
      try {
        setLoadingMeta(true);
        setError('');

        const result = await getWeavingAttendanceMeta();

        if (cancelled) return;

        setMeta({
          units: Array.isArray(result?.units) ? result.units : [],
          departments: Array.isArray(result?.departments) ? result.departments : [],
          shifts: Array.isArray(result?.shifts) ? result.shifts : [],
        });

        if (result?.date) {
          setDate(result.date);
        }

        if (Array.isArray(result?.units) && result.units.length === 1) {
          setUnitId((current) => current || result.units[0]._id);
        }

        if (Array.isArray(result?.shifts) && result.shifts.length === 1) {
          setShiftId((current) => current || result.shifts[0]._id);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(getErrorMessage(loadError, 'weaving.attendance.messages.metaFailed'));
        }
      } finally {
        if (!cancelled) {
          setLoadingMeta(false);
        }
      }
    };

    loadMeta();

    return () => {
      cancelled = true;
    };
  }, []);

  const loadSession = useCallback(async () => {
    if (!date || !unitId || !shiftId) {
      setRows([]);
      setReplacementOptions([]);
      setLock(EMPTY_LOCK);
      return;
    }

    setLoadingRows(true);
    setError('');

    try {
      const result = await getWeavingAttendanceSession({
        date,
        unitId,
        shiftId,
      });

      setRows(normalizeRows(result?.rows || []));

      setReplacementOptions(
        Array.isArray(result?.replacementOptions) ? result.replacementOptions : []
      );

      setLock(result?.lock || EMPTY_LOCK);
    } catch (loadError) {
      setRows([]);
      setReplacementOptions([]);
      setLock(EMPTY_LOCK);

      setError(getErrorMessage(loadError, 'weaving.attendance.messages.loadFailed'));
    } finally {
      setLoadingRows(false);
    }
  }, [date, unitId, shiftId]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const selectedShift = useMemo(
    () => meta.shifts.find((shift) => shift._id === shiftId) || null,
    [meta.shifts, shiftId]
  );

  const visibleRows = useMemo(
    () =>
      rows.filter((row) =>
        rowMatches({
          row,
          departmentId,
          search,
        })
      ),
    [rows, departmentId, search]
  );

  const summary = useMemo(() => buildSummary(visibleRows), [visibleRows]);

  const assignedReplacementIds = useMemo(
    () => new Set(rows.map((row) => row.replacementEmployeeId).filter(Boolean)),
    [rows]
  );

  const updateRow = (employeeId, updater) => {
    setRows((current) =>
      current.map((row) => {
        if (row.employeeId !== employeeId || row.generatedByReplacement) {
          return row;
        }

        return updater(row);
      })
    );

  };

  const setRowStatus = (row, status) => {
    updateRow(row.employeeId, (current) => ({
      ...current,
      status,
      otHours: status === 'present' ? current.otHours : '',
      replacementEmployeeId: status === 'absent' ? current.replacementEmployeeId : '',
    }));
  };

  const setRowOt = (row, value) => {
    if (value && !/^\d{0,2}(\.\d{0,2})?$/.test(value)) {
      return;
    }

    if (Number(value) > 24) return;

    updateRow(row.employeeId, (current) => ({
      ...current,
      status: value ? 'present' : current.status,
      otHours: value,
      replacementEmployeeId: '',
    }));
  };

  const setRowReplacement = (row, replacementEmployeeId) => {
    updateRow(row.employeeId, (current) => ({
      ...current,
      replacementEmployeeId,
      status: replacementEmployeeId ? 'absent' : current.status,
      otHours: replacementEmployeeId ? '' : current.otHours,
    }));
  };

  const isVisible = useCallback(
    (row) =>
      rowMatches({
        row,
        departmentId,
        search,
      }),
    [departmentId, search]
  );

  const markBlankVisiblePresent = () => {
    setRows((current) =>
      current.map((row) => {
        if (!isVisible(row) || row.generatedByReplacement || row.status) {
          return row;
        }

        return {
          ...row,
          status: 'present',
        };
      })
    );

  };

  const overwriteVisible = async (status) => {
    const messageKey =
      status === 'absent'
        ? 'weaving.attendance.messages.confirmAllAbsent'
        : 'weaving.attendance.messages.confirmAllLeave';

    if (!await requestWeavingConfirmation({ message: t(messageKey) })) {
      return;
    }

    const visibleOriginalIds = new Set(
      rows
        .filter((row) => isVisible(row) && !row.generatedByReplacement)
        .map((row) => row.employeeId)
    );

    setRows((current) =>
      current
        .filter(
          (row) =>
            !(row.generatedByReplacement && visibleOriginalIds.has(row.replacementForEmployeeId))
        )
        .map((row) => {
          if (!isVisible(row) || row.generatedByReplacement) {
            return row;
          }

          return {
            ...row,
            status,
            otHours: '',
            replacementEmployeeId: '',
          };
        })
    );

  };

  const buildPayloadRows = () =>
    rows.map((row) => ({
      employeeId: row.employeeId,
      status: row.status,
      otHours: row.otHours || 0,
      replacementEmployeeId: row.replacementEmployeeId || '',
      generatedByReplacement: row.generatedByReplacement,
      replacementForEmployeeId: row.replacementForEmployeeId || '',
    }));

  const saveAttendance = async () => {
    if (!hasSelection) {
      setError(t('weaving.attendance.messages.selectRequired'));
      return;
    }

    if (!localCanManage) {
      setError(t('weaving.attendance.messages.noManagePermission'));
      return;
    }

    if (!lock.canEdit) {
      setError(t('weaving.attendance.messages.locked'));
      return;
    }

    try {
      setSaving(true);
      setError('');

      const result = await saveWeavingAttendanceSession({
        date,
        unitId,
        shiftId,
        rows: buildPayloadRows(),
      });

      setRows(normalizeRows(result?.rows || []));

      setReplacementOptions(
        Array.isArray(result?.replacementOptions) ? result.replacementOptions : []
      );

      setLock(result?.lock || EMPTY_LOCK);

    } catch (saveError) {
      setError(getErrorMessage(saveError, 'weaving.attendance.messages.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const filterClass =
    'h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 md:h-10 md:text-sm';

  return (
    <div className="min-h-full min-w-0 space-y-3 overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-cyan-50/60 p-2.5 sm:p-3 md:p-4 lg:p-5">
      <header className="overflow-visible rounded-xl border border-cyan-100 bg-white shadow-sm">
        <div className="h-1 w-full bg-gradient-to-r from-slate-800 via-cyan-500 to-emerald-500" />

        <div className="space-y-3 px-3 py-3 md:px-4 md:py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-800 via-slate-700 to-cyan-700 text-base text-white shadow-sm ring-1 ring-cyan-200 md:h-11 md:w-11 md:text-lg">
                <FaCalendarCheck />
              </span>

              <div className="min-w-0">
                <h1 className="truncate text-xl font-black leading-none text-slate-950 md:text-2xl">
                  {t('weaving.attendance.title')}
                </h1>

                <p className="mt-1 truncate text-xs font-semibold text-slate-500 md:text-sm">
                  {t('weaving.attendance.subtitle')}
                </p>
              </div>
            </div>

            <div className="flex max-w-full flex-wrap items-center gap-1.5">
              <StatChip labelKey="weaving.attendance.totalShort" value={summary.total} />

              <StatChip
                labelKey="weaving.attendance.presentShort"
                value={summary.present}
                tone="green"
              />

              <StatChip
                labelKey="weaving.attendance.absentShort"
                value={summary.absent}
                tone="red"
              />

              <StatChip
                labelKey="weaving.attendance.leaveShort"
                value={summary.leave}
                tone="amber"
              />

              <StatChip labelKey="weaving.attendance.otShort" value={summary.ot} tone="cyan" />

              <StatChip
                labelKey="weaving.attendance.doubleShort"
                value={summary.double}
                tone="indigo"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-[145px_165px_165px_185px_minmax(220px,1fr)]">
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className={filterClass}
            />

            <select
              value={unitId}
              onChange={(event) => setUnitId(event.target.value)}
              className={filterClass}
              disabled={loadingMeta}
            >
              <option value="">{t('weaving.attendance.selectUnit')}</option>

              {meta.units.map((unit) => (
                <option key={unit._id} value={unit._id}>
                  {getUnitLabel(unit)}
                </option>
              ))}
            </select>

            <select
              value={shiftId}
              onChange={(event) => setShiftId(event.target.value)}
              className={filterClass}
              disabled={loadingMeta}
            >
              <option value="">{t('weaving.attendance.selectShift')}</option>

              {meta.shifts.map((shift) => (
                <option key={shift._id} value={shift._id}>
                  {shift.name}
                </option>
              ))}
            </select>

            <select
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
              className={filterClass}
              disabled={loadingMeta}
            >
              <option value="">{t('weaving.attendance.allDepartments')}</option>

              {meta.departments.map((department) => (
                <option key={department._id} value={department._id}>
                  {department.name}
                </option>
              ))}
            </select>

            <div className="col-span-2 flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 shadow-sm transition focus-within:border-cyan-500 focus-within:ring-2 focus-within:ring-cyan-100 md:col-span-1 md:h-10">
              <FaSearch className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />

              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('weaving.attendance.search')}
                className="min-w-0 flex-1 border-0 bg-transparent text-xs font-bold text-slate-700 outline-none placeholder:text-slate-400 md:text-sm"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={markBlankVisiblePresent}
                disabled={!canEdit || visibleRows.length === 0}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-black text-emerald-700 shadow-sm transition hover:bg-emerald-100 disabled:opacity-40 md:text-sm"
              >
                <FaCheck />
                {t('weaving.attendance.allPresent')}
              </button>

              <button
                type="button"
                onClick={() => overwriteVisible('absent')}
                disabled={!canEdit || visibleRows.length === 0}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-black text-rose-700 shadow-sm transition hover:bg-rose-100 disabled:opacity-40 md:text-sm"
              >
                <FaTimes />
                {t('weaving.attendance.allAbsent')}
              </button>

              <button
                type="button"
                onClick={() => overwriteVisible('leave')}
                disabled={!canEdit || visibleRows.length === 0}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-black text-amber-800 shadow-sm transition hover:bg-amber-100 disabled:opacity-40 md:text-sm"
              >
                <FaBan />
                {t('weaving.attendance.allLeave')}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-black shadow-sm md:text-sm ${
                  lock.locked
                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}
              >
                {lock.locked ? <FaLock /> : <FaLockOpen />}

                {lock.locked ? t('weaving.attendance.locked') : t('weaving.attendance.open')}
              </span>

              <button
                type="button"
                onClick={loadSession}
                disabled={!hasSelection || loadingRows || saving}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-40"
              >
                <FaSync className={loadingRows ? 'animate-spin' : ''} />
              </button>

              <button
                type="button"
                onClick={saveAttendance}
                disabled={!canEdit || !hasSelection || rows.length === 0}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-gradient-to-r from-slate-900 to-cyan-800 px-3.5 text-xs font-black text-white shadow-md transition hover:from-slate-800 hover:to-cyan-700 disabled:opacity-40 md:text-sm"
              >
                <FaSave />

                {saving ? t('common.saving') : t('weaving.attendance.save')}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/*
        TABLE:
        Horizontal scrolling belongs to this table area only.
        There is deliberately NO vertical max-height / overflow-y-auto
        wrapper, so the scrollbar is not attached to the table header.
      */}
      <section className="relative rounded-xl border border-slate-200 bg-white shadow-md">
        <div className="w-full overflow-x-auto overflow-y-hidden">
          <table className="w-full min-w-[760px] border-collapse text-[10px] sm:text-[11px] md:min-w-[1000px] md:text-sm">
            <thead className="bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-900 text-white">
              <tr>
                <th className="w-10 border-r border-white/10 px-2 py-3 text-center text-xs font-black md:text-sm">
                  #
                </th>

                <th className="min-w-[155px] border-r border-white/10 px-3 py-3 text-left text-xs font-black md:min-w-[215px] md:text-sm">
                  {t('weaving.attendance.employee')}
                </th>

                <th className="hidden min-w-[140px] border-r border-white/10 px-3 py-3 text-left text-sm font-black md:table-cell">
                  {t('weaving.attendance.department')}
                </th>

                <th className="w-20 border-r border-white/10 px-2 py-3 text-center text-xs font-black md:w-28 md:text-sm">
                  <span className="md:hidden">OT</span>

                  <span className="hidden md:inline">Overtime</span>
                </th>

                <th className="w-20 border-r border-white/10 px-2 py-3 text-center text-xs font-black md:w-32 md:text-sm">
                  {t('weaving.attendance.duty')}
                </th>

                <th className="min-w-[150px] border-r border-white/10 px-2 py-3 text-left text-xs font-black md:min-w-[235px] md:px-3 md:text-sm">
                  {t('weaving.attendance.replacement')}
                </th>

                <th className="min-w-[120px] px-2 py-3 text-center text-xs font-black md:min-w-[150px] md:text-sm">
                  {t('weaving.attendance.attendance')}
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {!hasSelection && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-sm font-bold text-slate-500"
                  >
                    {t('weaving.attendance.messages.selectRequired')}
                  </td>
                </tr>
              )}

              {hasSelection && loadingRows && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-sm font-bold text-slate-500"
                  >
                    {t('common.loading')}
                  </td>
                </tr>
              )}

              {hasSelection && !loadingRows && visibleRows.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-sm font-bold text-slate-500"
                  >
                    {t('weaving.attendance.messages.empty')}
                  </td>
                </tr>
              )}

              {hasSelection &&
                !loadingRows &&
                visibleRows.map((row, index) => {
                  const rowLocked = !canEdit;

                  const otDisabled =
                    rowLocked ||
                    row.generatedByReplacement ||
                    row.status === 'absent' ||
                    row.status === 'leave';

                  return (
                    <tr
                      key={`${row.employeeId}-${row.attendanceId || 'draft'}`}
                      className="bg-white transition-colors even:bg-slate-50/50 hover:bg-cyan-50/60"
                    >
                      <td className="border-r border-slate-100 px-2 py-2.5 text-center align-middle text-xs font-black text-slate-500 md:text-sm">
                        {index + 1}
                      </td>

                      <td className="border-r border-slate-100 px-2.5 py-2.5 align-middle md:px-3">
                        <div className="max-w-[155px] md:max-w-none">
                          <div className="truncate text-xs font-black leading-tight text-slate-950 md:text-base">
                            {row.employeeName || '—'}
                          </div>

                          <div className="mt-0.5 truncate text-[9px] font-bold text-slate-500 sm:text-[10px] md:text-xs">
                            {[row.employeeNo, row.departmentName].filter(Boolean).join(' • ')}
                          </div>
                        </div>
                      </td>

                      <td className="hidden border-r border-slate-100 px-3 py-2.5 align-middle text-sm font-bold text-slate-700 md:table-cell">
                        {row.departmentName || '—'}
                      </td>

                      <td className="border-r border-slate-100 px-1.5 py-2.5 text-center align-middle">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={row.otHours}
                          onChange={(event) => setRowOt(row, event.target.value)}
                          disabled={otDisabled}
                          placeholder="0"
                          title="Overtime Hours"
                          className="h-8 w-12 rounded-lg border border-slate-200 bg-white px-1 text-center text-xs font-black text-slate-900 shadow-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-100 disabled:text-slate-400 md:h-9 md:w-16 md:text-sm"
                        />
                      </td>

                      <td className="border-r border-slate-100 px-1.5 py-2.5 text-center align-middle">
                        <DutyBadge row={row} />
                      </td>

                      <td className="border-r border-slate-100 px-1.5 py-2.5 align-middle md:px-3">
                        <ReplacementSelect
                          row={row}
                          options={replacementOptions}
                          assignedIds={assignedReplacementIds}
                          selectedShiftId={selectedShift?._id || shiftId}
                          disabled={rowLocked}
                          onChange={(value) => setRowReplacement(row, value)}
                        />
                      </td>

                      <td className="px-2 py-2.5 text-center align-middle">
                        <div className="inline-flex items-center gap-1 md:gap-1.5">
                          {['present', 'absent', 'leave'].map((status) => (
                            <StatusButton
                              key={status}
                              status={status}
                              selected={row.status === status}
                              disabled={rowLocked || row.generatedByReplacement}
                              onClick={() => setRowStatus(row, status)}
                            />
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default WeavingAttendancePage;
