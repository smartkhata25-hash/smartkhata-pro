import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FaEdit, FaMapMarkerAlt, FaSyncAlt, FaTrash } from 'react-icons/fa';

import {
  createTravelCity,
  deleteTravelCity,
  fetchTravelCities,
  updateTravelCity,
  updateTravelCityStatus,
} from '../../services/travelMasterService';
import { getCachedTravelRecords, TRAVEL_CACHE_DOMAINS } from '../../utils/travelMasterCache';
import { hasPermission } from '../../utils/permissionHelper';
import { t } from '../../i18n/i18n';
import {
  TravelActionButton,
  TravelErrorModal,
  TravelFilterSelect,
  TravelFormModal,
  TravelMasterList,
  TravelMasterPageFrame,
  TravelMasterToolbar,
  TravelSearchInput,
  getAddAction,
  normalizeSearch,
} from '../../components/travel/master/TravelMasterUI';

const emptyCity = { name: '', country: '', isActive: true };
const statusOptions = [
  { value: 'active', labelKey: 'travel.common.active' },
  { value: 'inactive', labelKey: 'travel.common.inactive' },
  { value: 'all', labelKey: 'travel.common.all' },
];

const TravelCitiesPage = () => {
  const [cities, setCities] = useState(() => getCachedTravelRecords(TRAVEL_CACHE_DOMAINS.CITIES));
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [values, setValues] = useState(emptyCity);
  const [submitting, setSubmitting] = useState(false);
  const canView = hasPermission('travel.hotels.view');
  const canManage = hasPermission('travel.hotels.manage');

  const loadCities = useCallback(async (options = {}) => {
    if (!canView) return;
    try {
      setLoading(true);
      setError('');
      const data = await fetchTravelCities({}, options);
      setCities(Array.isArray(data) ? data : []);
    } catch (loadError) {
      setError(loadError?.response?.data?.message || t('travel.cities.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => { void loadCities(); }, [loadCities]);

  const visibleCities = useMemo(() => {
    const query = normalizeSearch(search);
    return cities
      .filter((city) => city?.isDeleted !== true)
      .filter((city) => status === 'all' || (status === 'active' ? city.isActive !== false : city.isActive === false))
      .filter((city) => !query || [city.name, city.country].filter(Boolean).some((value) => String(value).toLowerCase().includes(query)));
  }, [cities, search, status]);

  const upsert = (record) => setCities((current) => {
    const index = current.findIndex((city) => String(city._id) === String(record._id));
    if (index < 0) return [record, ...current];
    const next = [...current];
    next[index] = { ...next[index], ...record };
    return next;
  });

  const openModal = (city = null) => {
    setEditing(city);
    setValues(city ? { ...emptyCity, ...city } : emptyCity);
    setFormError('');
    setModalOpen(true);
  };

  const submit = async (event) => {
    event.preventDefault();
    try {
      setSubmitting(true);
      setFormError('');
      const saved = editing
        ? await updateTravelCity(editing._id, values)
        : await createTravelCity(values);
      upsert(saved);
      setModalOpen(false);
      setEditing(null);
      setValues(emptyCity);
    } catch (submitError) {
      setFormError(submitError?.response?.data?.message || t('travel.cities.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (city) => {
    try {
      upsert(await updateTravelCityStatus(city._id, city.isActive === false));
    } catch (statusError) {
      setError(statusError?.response?.data?.message || t('travel.alerts.statusUpdateFailed'));
    }
  };

  const archive = async (city) => {
    if (!window.confirm(t('travel.cities.archiveConfirm'))) return;
    try {
      await deleteTravelCity(city._id, { reason: 'Travel city archived by user' });
      setCities((current) => current.filter((record) => String(record._id) !== String(city._id)));
    } catch (deleteError) {
      setError(deleteError?.response?.data?.message || t('travel.cities.archiveFailed'));
    }
  };

  const columns = [
    { key: 'name', labelKey: 'travel.fields.city', render: (city) => <span className="font-extrabold text-slate-900">{city.name}</span> },
    { key: 'country', labelKey: 'travel.fields.country', render: (city) => city.country || '-' },
    { key: 'status', labelKey: 'travel.fields.status', render: (city) => <button type="button" disabled={!canManage} onClick={() => toggleStatus(city)} className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${city.isActive === false ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700'}`}>{city.isActive === false ? t('travel.common.inactive') : t('travel.common.active')}</button> },
    { key: 'actions', labelKey: 'travel.common.actions', render: (city) => canManage ? <span className="flex gap-2"><TravelActionButton icon={FaEdit} variant="secondary" onClick={() => openModal(city)}>{t('travel.common.edit')}</TravelActionButton><TravelActionButton icon={FaTrash} variant="danger" onClick={() => archive(city)}>{t('travel.common.archive')}</TravelActionButton></span> : null },
  ];

  return (
    <TravelMasterPageFrame
      titleKey="travel.cities.title"
      subtitleKey="travel.cities.subtitle"
      actions={canManage ? getAddAction(() => openModal(), 'travel.cities.add') : null}
      filters={<TravelMasterToolbar><TravelSearchInput value={search} onChange={setSearch} placeholderKey="travel.cities.search" /><TravelFilterSelect value={status} onChange={setStatus} options={statusOptions} /><TravelActionButton icon={FaSyncAlt} onClick={() => loadCities({ forceRefresh: true })} disabled={loading}>{t('travel.common.refresh')}</TravelActionButton></TravelMasterToolbar>}
    >
      <TravelErrorModal open={Boolean(error)} message={error} onClose={() => setError('')} />
      <TravelMasterList
        columns={columns}
        records={visibleCities}
        emptyKey="travel.cities.empty"
        renderMobileCard={(city) => <div className="rounded-lg border border-slate-200 p-3"><div className="flex items-center gap-2"><FaMapMarkerAlt className="text-cyan-600" /><span className="font-extrabold">{city.name}</span></div><p className="mt-1 text-xs text-slate-500">{city.country || '-'}</p>{canManage && <div className="mt-3 flex flex-wrap gap-2"><TravelActionButton variant="soft" onClick={() => toggleStatus(city)}>{city.isActive === false ? t('travel.common.activate') : t('travel.common.deactivate')}</TravelActionButton><TravelActionButton icon={FaEdit} variant="secondary" onClick={() => openModal(city)}>{t('travel.common.edit')}</TravelActionButton><TravelActionButton icon={FaTrash} variant="danger" onClick={() => archive(city)}>{t('travel.common.archive')}</TravelActionButton></div>}</div>}
      />
      <TravelFormModal
        open={modalOpen}
        titleKey="travel.cities.formTitle"
        modeKey={editing ? 'travel.common.edit' : 'travel.common.addWithDetails'}
        fields={[
          { name: 'name', labelKey: 'travel.fields.city', placeholderKey: 'travel.placeholders.city', required: true },
          { name: 'country', labelKey: 'travel.fields.country', placeholderKey: 'travel.placeholders.country' },
          { name: 'isActive', labelKey: 'travel.fields.isActive', type: 'checkbox', fullWidth: true },
        ]}
        values={values}
        onChange={(name, value) => setValues((current) => ({ ...current, [name]: value }))}
        onClose={() => { setModalOpen(false); setEditing(null); setValues(emptyCity); setFormError(''); }}
        onSubmit={submit}
        submitting={submitting}
        error={formError}
        submitIcon={FaMapMarkerAlt}
      />
    </TravelMasterPageFrame>
  );
};

export default TravelCitiesPage;
