import React, { useMemo } from 'react';
import { FaEdit } from 'react-icons/fa';
import { t } from '../../../i18n/i18n';
import { TravelFormModal } from '../master/TravelMasterUI';
import { normalizeCategoryIds, vendorFields } from './travelVendorConfig';

const TravelVendorFormModal = ({ categories = [], editingVendor = null, values = {}, onChange, ...props }) => {
  const selectedCategoryIds = useMemo(
    () => normalizeCategoryIds(values.travelServiceCategories),
    [values.travelServiceCategories]
  );

  const toggleCategory = (categoryId) => {
    const id = String(categoryId);
    onChange(
      'travelServiceCategories',
      selectedCategoryIds.includes(id)
        ? selectedCategoryIds.filter((value) => value !== id)
        : [...selectedCategoryIds, id]
    );
  };

  return (
    <TravelFormModal
      {...props}
      titleKey="travel.vendors.formTitle"
      modeKey={editingVendor ? 'travel.common.edit' : 'travel.common.addWithDetails'}
      fields={vendorFields}
      values={values}
      onChange={onChange}
      submitIcon={FaEdit}
    >
      <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
        <p className="text-xs font-extrabold text-slate-600">
          {t('travel.fields.travelServiceCategories')}
        </p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {categories.filter((category) => category.isActive !== false).map((category) => (
            <label key={category._id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700">
              <input
                type="checkbox"
                checked={selectedCategoryIds.includes(String(category._id))}
                onChange={() => toggleCategory(category._id)}
                className="h-4 w-4 rounded border-slate-300 text-cyan-600"
              />
              <span className="truncate">{category.name}</span>
            </label>
          ))}
        </div>
        {categories.length === 0 && (
          <div className="mt-2 rounded-lg border border-dashed border-slate-200 bg-white px-3 py-4 text-center text-sm font-semibold text-slate-500">
            {t('travel.services.emptyCategories')}
          </div>
        )}
      </div>
    </TravelFormModal>
  );
};

export default TravelVendorFormModal;
