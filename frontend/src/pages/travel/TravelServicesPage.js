import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FaSyncAlt } from 'react-icons/fa';

import {
  createTravelService,
  createTravelServiceCategory,
  deleteTravelService,
  deleteTravelServiceCategory,
  fetchTravelServiceCategories,
  fetchTravelServices,
  updateTravelService,
  updateTravelServiceCategory,
  updateTravelServiceCategoryStatus,
  updateTravelServiceStatus,
} from '../../services/travelMasterService';

import { getCachedTravelRecords, TRAVEL_CACHE_DOMAINS } from '../../utils/travelMasterCache';

import { hasPermission } from '../../utils/permissionHelper';
import { t } from '../../i18n/i18n';
import usePageMemory from '../../hooks/usePageMemory';

import {
  TravelActionButton,
  TravelFilterSelect,
  TravelMasterPageFrame,
  TravelMasterToolbar,
  TravelSearchInput,
  TravelSegmentedControl,
  buildTravelConfirmMessage,
  getAddAction,
  getQuickAddAction,
  normalizeSearch,
} from '../../components/travel/master/TravelMasterUI';

import {
  createEmptyQuickServiceForm,
  emptyCategoryForm,
  emptyQuickCategoryForm,
  emptyServiceForm,
  getCategoryId,
} from '../../components/travel/services/travelServiceConfig';

import {
  TravelServiceCategoryList,
  TravelServiceList,
} from '../../components/travel/services/TravelServiceLists';

import TravelServiceModals from '../../components/travel/services/TravelServiceModals';

const PAGE_MEMORY_DEFAULTS = {
  activeTab: 'services',
  search: '',
  status: 'active',
  categoryId: '',
  selectedId: '',
};

const STATUS_OPTIONS = [
  {
    value: 'active',
    labelKey: 'travel.common.active',
  },
  {
    value: 'inactive',
    labelKey: 'travel.common.inactive',
  },
  {
    value: 'all',
    labelKey: 'travel.common.all',
  },
];

const upsertRecord = (records, record) => {
  const safeRecords = Array.isArray(records) ? records : [];

  if (!record?._id) {
    return safeRecords;
  }

  const index = safeRecords.findIndex((item) => String(item?._id) === String(record._id));

  if (index === -1) {
    return [record, ...safeRecords];
  }

  const nextRecords = [...safeRecords];

  nextRecords[index] = {
    ...nextRecords[index],
    ...record,
  };

  return nextRecords;
};

const TravelServicesPage = () => {
  const [categories, setCategories] = useState(() =>
    getCachedTravelRecords(TRAVEL_CACHE_DOMAINS.SERVICE_CATEGORIES)
  );

  const [services, setServices] = useState(() =>
    getCachedTravelRecords(TRAVEL_CACHE_DOMAINS.SERVICES)
  );

  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState('');

  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [quickCategoryOpen, setQuickCategoryOpen] = useState(false);
  const [quickServiceOpen, setQuickServiceOpen] = useState(false);

  const [editingCategory, setEditingCategory] = useState(null);
  const [editingService, setEditingService] = useState(null);

  const [categoryValues, setCategoryValues] = useState({
    ...emptyCategoryForm,
  });

  const [serviceValues, setServiceValues] = useState({
    ...emptyServiceForm,
  });

  const [quickCategoryValues, setQuickCategoryValues] = useState({
    ...emptyQuickCategoryForm,
  });

  const [quickServiceValues, setQuickServiceValues] = useState(() => createEmptyQuickServiceForm());

  const [categoryCreateTarget, setCategoryCreateTarget] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState('');

  const canView = hasPermission('travel.services.view');
  const canManage = hasPermission('travel.services.manage');

  const { state: pageMemory, updateField } = usePageMemory(
    'travel_services_page_state',
    PAGE_MEMORY_DEFAULTS,
    {
      expiryHours: 24,
      delay: 350,
    }
  );

  const setActiveTab = useCallback((value) => updateField('activeTab', value), [updateField]);

  const setSearch = useCallback((value) => updateField('search', value), [updateField]);

  const setStatus = useCallback((value) => updateField('status', value), [updateField]);

  const setCategoryFilter = useCallback((value) => updateField('categoryId', value), [updateField]);

  const setSelectedId = useCallback(
    (value) => updateField('selectedId', value || ''),
    [updateField]
  );

  const loadData = useCallback(
    async (options = {}) => {
      if (!canView) {
        return;
      }

      try {
        setLoading(true);
        setPageError('');

        const [categoryData, serviceData] = await Promise.all([
          fetchTravelServiceCategories({}, options),
          fetchTravelServices({}, options),
        ]);

        setCategories(Array.isArray(categoryData) ? categoryData : []);

        setServices(Array.isArray(serviceData) ? serviceData : []);
      } catch (error) {
        console.error('Travel services load failed:', error);

        setPageError(t('travel.alerts.servicesLoadFailed'));
      } finally {
        setLoading(false);
      }
    },
    [canView]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  const activeCategories = useMemo(
    () =>
      categories.filter((category) => category?.isDeleted !== true && category?.isActive !== false),
    [categories]
  );

  const getCategoryName = useCallback(
    (categoryId) => {
      const cleanId = typeof categoryId === 'object' ? categoryId?._id : categoryId;

      const category = categories.find((item) => String(item?._id) === String(cleanId));

      return category?.name || '-';
    },
    [categories]
  );

  const visibleCategories = useMemo(() => {
    const search = normalizeSearch(pageMemory.search);

    return categories
      .filter((category) => category?.isDeleted !== true)
      .filter((category) => {
        if (pageMemory.status === 'active') {
          return category?.isActive !== false;
        }

        if (pageMemory.status === 'inactive') {
          return category?.isActive === false;
        }

        return true;
      })
      .filter((category) => {
        if (!search) {
          return true;
        }

        return [category?.name, category?.code, category?.description]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search));
      });
  }, [categories, pageMemory.search, pageMemory.status]);

  const visibleServices = useMemo(() => {
    const search = normalizeSearch(pageMemory.search);

    return services
      .filter((service) => service?.isDeleted !== true)
      .filter((service) => {
        if (pageMemory.status === 'active') {
          return service?.isActive !== false;
        }

        if (pageMemory.status === 'inactive') {
          return service?.isActive === false;
        }

        return true;
      })
      .filter((service) => {
        if (!pageMemory.categoryId) {
          return true;
        }

        return String(getCategoryId(service)) === String(pageMemory.categoryId);
      })
      .filter((service) => {
        if (!search) {
          return true;
        }

        return [
          service?.name,
          service?.code,
          service?.description,
          getCategoryName(service?.categoryId),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search));
      });
  }, [getCategoryName, pageMemory.categoryId, pageMemory.search, pageMemory.status, services]);

  const categoryOptions = useMemo(
    () =>
      activeCategories.map((category) => ({
        value: category._id,
        label: category.name,
      })),
    [activeCategories]
  );

  const statusOptions = useMemo(
    () =>
      STATUS_OPTIONS.map((option) => ({
        value: option.value,
        label: t(option.labelKey),
      })),
    []
  );

  const openCategoryDetails = (category = null, draftName = '', target = '') => {
    if (!canManage) {
      alert(t('travel.alerts.permissionDenied'));
      return;
    }

    setEditingCategory(category);

    setCategoryValues(
      category
        ? {
            ...emptyCategoryForm,
            ...category,
          }
        : {
            ...emptyCategoryForm,
            name: draftName,
          }
    );

    setCategoryCreateTarget(target);
    setFormError('');
    setCategoryModalOpen(true);
  };

  const openServiceDetails = (service = null, draftName = '') => {
    if (!canManage) {
      alert(t('travel.alerts.permissionDenied'));
      return;
    }

    setEditingService(service);

    setServiceValues(
      service
        ? {
            ...emptyServiceForm,
            ...service,
            categoryId: getCategoryId(service) || '',
          }
        : {
            ...emptyServiceForm,
            name: draftName,
            categoryId: activeCategories[0]?._id || '',
          }
    );

    setFormError('');
    setServiceModalOpen(true);
  };

  const openQuickCategory = (draftName = '', target = '') => {
    if (!canManage) {
      alert(t('travel.alerts.permissionDenied'));
      return;
    }

    setQuickCategoryValues({
      ...emptyQuickCategoryForm,
      name: draftName,
    });

    setCategoryCreateTarget(target);
    setFormError('');
    setQuickCategoryOpen(true);
  };

  const openQuickService = (draftName = '') => {
    if (!canManage) {
      alert(t('travel.alerts.permissionDenied'));
      return;
    }

    setQuickServiceValues({
      ...createEmptyQuickServiceForm(activeCategories[0]?._id || ''),
      name: draftName,
    });

    setFormError('');
    setQuickServiceOpen(true);
  };

  const assignCreatedCategory = (category) => {
    if (!category?._id) {
      return;
    }

    if (categoryCreateTarget === 'serviceDetails') {
      setServiceValues((current) => ({
        ...current,
        categoryId: category._id,
      }));
    }

    if (categoryCreateTarget === 'quickService') {
      setQuickServiceValues((current) => ({
        ...current,
        categoryId: category._id,
      }));
    }
  };

  const handleCategorySubmit = async (event) => {
    event.preventDefault();

    try {
      setSubmitting(true);
      setFormError('');

      const saved = editingCategory
        ? await updateTravelServiceCategory(editingCategory._id, categoryValues)
        : await createTravelServiceCategory(categoryValues);

      setCategories((current) => upsertRecord(current, saved));

      setSelectedId(saved._id);
      assignCreatedCategory(saved);

      setCategoryModalOpen(false);
      setEditingCategory(null);
      setCategoryCreateTarget('');
    } catch (error) {
      console.error('Travel category save failed:', error);

      setFormError(error?.response?.data?.message || t('travel.alerts.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickCategorySubmit = async (event) => {
    event.preventDefault();

    try {
      setSubmitting(true);
      setFormError('');

      const saved = await createTravelServiceCategory(quickCategoryValues);

      setCategories((current) => upsertRecord(current, saved));

      setSelectedId(saved._id);
      assignCreatedCategory(saved);

      setQuickCategoryOpen(false);

      setQuickCategoryValues({
        ...emptyQuickCategoryForm,
      });

      setCategoryCreateTarget('');
    } catch (error) {
      console.error('Travel category quick add failed:', error);

      setFormError(error?.response?.data?.message || t('travel.alerts.quickAddFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleServiceSubmit = async (event) => {
    event.preventDefault();

    if (!serviceValues.categoryId) {
      setFormError(t('travel.alerts.categoryRequired'));
      return;
    }

    try {
      setSubmitting(true);
      setFormError('');

      const saved = editingService
        ? await updateTravelService(editingService._id, serviceValues)
        : await createTravelService(serviceValues);

      setServices((current) => upsertRecord(current, saved));

      setSelectedId(saved._id);

      setServiceModalOpen(false);
      setEditingService(null);
    } catch (error) {
      console.error('Travel service save failed:', error);

      setFormError(error?.response?.data?.message || t('travel.alerts.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickServiceSubmit = async (event) => {
    event.preventDefault();

    if (!quickServiceValues.categoryId) {
      setFormError(t('travel.alerts.categoryRequired'));
      return;
    }

    try {
      setSubmitting(true);
      setFormError('');

      const saved = await createTravelService(quickServiceValues);

      setServices((current) => upsertRecord(current, saved));

      setSelectedId(saved._id);

      setQuickServiceOpen(false);

      setQuickServiceValues(createEmptyQuickServiceForm());
    } catch (error) {
      console.error('Travel service quick add failed:', error);

      setFormError(error?.response?.data?.message || t('travel.alerts.quickAddFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleCategoryStatus = async (category) => {
    if (!window.confirm(t('travel.confirm.toggleStatus'))) {
      return;
    }

    try {
      const saved = await updateTravelServiceCategoryStatus(
        category._id,
        category.isActive === false
      );

      setCategories((current) => upsertRecord(current, saved));
    } catch (error) {
      console.error('Category status update failed:', error);

      alert(error?.response?.data?.message || t('travel.alerts.statusUpdateFailed'));
    }
  };

  const toggleServiceStatus = async (service) => {
    if (!window.confirm(t('travel.confirm.toggleStatus'))) {
      return;
    }

    try {
      const saved = await updateTravelServiceStatus(service._id, service.isActive === false);

      setServices((current) => upsertRecord(current, saved));
    } catch (error) {
      console.error('Service status update failed:', error);

      alert(error?.response?.data?.message || t('travel.alerts.statusUpdateFailed'));
    }
  };

  const handleDeleteCategory = async (category) => {
    if (!canManage) {
      alert(t('travel.alerts.permissionDenied'));
      return;
    }

    const confirmed = window.confirm(
      buildTravelConfirmMessage('travel.services.deleteCategoryConfirm', category.name)
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingId(category._id);

      await deleteTravelServiceCategory(category._id, {
        reason: 'Travel service category archived by user',
      });

      setCategories((current) =>
        current.filter((item) => String(item._id) !== String(category._id))
      );

      if (String(pageMemory.selectedId) === String(category._id)) {
        setSelectedId('');
      }

      if (String(pageMemory.categoryId) === String(category._id)) {
        setCategoryFilter('');
      }
    } catch (error) {
      console.error('Travel category delete failed:', error);

      alert(error?.response?.data?.message || t('travel.services.deleteCategoryFailed'));
    } finally {
      setDeletingId('');
    }
  };

  const handleDeleteService = async (service) => {
    if (!canManage) {
      alert(t('travel.alerts.permissionDenied'));
      return;
    }

    const confirmed = window.confirm(
      buildTravelConfirmMessage('travel.services.deleteServiceConfirm', service.name)
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingId(service._id);

      await deleteTravelService(service._id, {
        reason: 'Travel service archived by user',
      });

      setServices((current) => current.filter((item) => String(item._id) !== String(service._id)));

      if (String(pageMemory.selectedId) === String(service._id)) {
        setSelectedId('');
      }
    } catch (error) {
      console.error('Travel service delete failed:', error);

      alert(error?.response?.data?.message || t('travel.services.deleteServiceFailed'));
    } finally {
      setDeletingId('');
    }
  };

  const clearFilters = () => {
    setSearch('');
    setCategoryFilter('');
    setStatus('active');
  };

  return (
    <TravelMasterPageFrame
      titleKey="travel.services.title"
      actions={
        canManage ? (
          <>
            {pageMemory.activeTab === 'services'
              ? getQuickAddAction(() => openQuickService(pageMemory.search))
              : getQuickAddAction(() => openQuickCategory(pageMemory.search))}

            {pageMemory.activeTab === 'services'
              ? getAddAction(
                  () => openServiceDetails(null, pageMemory.search),
                  'travel.services.addService'
                )
              : getAddAction(
                  () => openCategoryDetails(null, pageMemory.search),
                  'travel.services.addCategory'
                )}
          </>
        ) : null
      }
      filters={
        <TravelMasterToolbar className="lg:grid lg:grid-cols-[auto_minmax(260px,1fr)_minmax(170px,auto)_minmax(130px,auto)_auto_auto]">
          <TravelSegmentedControl
            value={pageMemory.activeTab}
            onChange={setActiveTab}
            options={[
              {
                value: 'services',
                labelKey: 'travel.services.servicesTab',
              },
              {
                value: 'categories',
                labelKey: 'travel.services.categoriesTab',
              },
            ]}
          />

          <TravelSearchInput
            value={pageMemory.search}
            onChange={setSearch}
            placeholderKey="travel.services.search"
          />

          {pageMemory.activeTab === 'services' ? (
            <TravelFilterSelect
              value={pageMemory.categoryId}
              onChange={setCategoryFilter}
              placeholderKey="travel.common.allCategories"
              options={categoryOptions}
            />
          ) : (
            <div className="hidden lg:block" />
          )}

          <TravelFilterSelect
            value={pageMemory.status}
            onChange={setStatus}
            options={statusOptions}
          />

          <TravelActionButton
            variant="warning"
            onClick={clearFilters}
            title={t('travel.common.clear')}
          >
            ×
          </TravelActionButton>

          <TravelActionButton
            icon={FaSyncAlt}
            variant="primary"
            onClick={() =>
              loadData({
                forceRefresh: true,
              })
            }
            disabled={loading}
            title={t('travel.common.refresh')}
          />
        </TravelMasterToolbar>
      }
    >
      {pageError && (
        <div className="mb-3 rounded-xl border border-rose-200 bg-gradient-to-r from-rose-50 to-red-50 px-3 py-2 text-sm font-semibold text-rose-700 shadow-sm">
          {pageError}
        </div>
      )}

      {pageMemory.activeTab === 'services' ? (
        <TravelServiceList
          services={visibleServices}
          selectedId={pageMemory.selectedId}
          canManage={canManage}
          getCategoryName={getCategoryName}
          onSelect={setSelectedId}
          onEdit={openServiceDetails}
          onToggleStatus={toggleServiceStatus}
          onDelete={handleDeleteService}
          deletingId={deletingId}
        />
      ) : (
        <TravelServiceCategoryList
          categories={visibleCategories}
          selectedId={pageMemory.selectedId}
          canManage={canManage}
          onSelect={setSelectedId}
          onEdit={openCategoryDetails}
          onToggleStatus={toggleCategoryStatus}
          onDelete={handleDeleteCategory}
          deletingId={deletingId}
        />
      )}

      <TravelServiceModals
        activeCategories={activeCategories}
        categoryModalOpen={categoryModalOpen}
        categoryValues={categoryValues}
        editingCategory={editingCategory}
        editingService={editingService}
        formError={formError}
        onCategoryChange={(name, value) =>
          setCategoryValues((current) => ({
            ...current,
            [name]: value,
          }))
        }
        onCategoryClose={() => {
          setCategoryModalOpen(false);
          setEditingCategory(null);
          setCategoryCreateTarget('');
          setFormError('');
        }}
        onCategorySubmit={handleCategorySubmit}
        onOpenCategoryDetails={openCategoryDetails}
        onOpenQuickCategory={openQuickCategory}
        onQuickCategoryChange={(name, value) =>
          setQuickCategoryValues((current) => ({
            ...current,
            [name]: value,
          }))
        }
        onQuickCategoryClose={() => {
          setQuickCategoryOpen(false);
          setCategoryCreateTarget('');
          setFormError('');
        }}
        onQuickCategorySubmit={handleQuickCategorySubmit}
        onQuickServiceChange={(name, value) =>
          setQuickServiceValues((current) => ({
            ...current,
            [name]: value,
          }))
        }
        onQuickServiceClose={() => {
          setQuickServiceOpen(false);
          setFormError('');
        }}
        onQuickServiceSubmit={handleQuickServiceSubmit}
        onServiceChange={(name, value) =>
          setServiceValues((current) => ({
            ...current,
            [name]: value,
          }))
        }
        onServiceClose={() => {
          setServiceModalOpen(false);
          setEditingService(null);
          setFormError('');
        }}
        onServiceSubmit={handleServiceSubmit}
        quickCategoryOpen={quickCategoryOpen}
        quickCategoryValues={quickCategoryValues}
        quickServiceOpen={quickServiceOpen}
        quickServiceValues={quickServiceValues}
        serviceModalOpen={serviceModalOpen}
        serviceValues={serviceValues}
        submitting={submitting}
      />
    </TravelMasterPageFrame>
  );
};

export default TravelServicesPage;
