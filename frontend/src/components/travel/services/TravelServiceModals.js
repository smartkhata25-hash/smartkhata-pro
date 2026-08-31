import React from 'react';
import { FaListAlt } from 'react-icons/fa';

import {
  TravelFormModal,
  TravelRelationPicker,
} from '../master/TravelMasterUI';
import {
  categoryFields,
  quickCategoryFields,
  quickServiceFields,
  serviceFields,
} from './travelServiceConfig';

const TravelServiceModals = ({
  activeCategories,
  categoryModalOpen,
  categoryValues,
  editingCategory,
  editingService,
  formError,
  onCategoryChange,
  onCategoryClose,
  onCategorySubmit,
  onOpenCategoryDetails,
  onOpenQuickCategory,
  onQuickCategoryChange,
  onQuickCategoryClose,
  onQuickCategorySubmit,
  onQuickServiceChange,
  onQuickServiceClose,
  onQuickServiceSubmit,
  onServiceChange,
  onServiceClose,
  onServiceSubmit,
  quickCategoryOpen,
  quickCategoryValues,
  quickServiceOpen,
  quickServiceValues,
  serviceModalOpen,
  serviceValues,
  submitting,
}) => (
  <>
    <TravelFormModal
      open={serviceModalOpen}
      titleKey="travel.services.serviceFormTitle"
      modeKey={editingService ? 'travel.common.edit' : 'travel.common.addWithDetails'}
      fields={serviceFields}
      values={serviceValues}
      onChange={onServiceChange}
      onClose={onServiceClose}
      onSubmit={onServiceSubmit}
      submitting={submitting}
      error={formError}
    >
      <TravelRelationPicker
        labelKey="travel.fields.category"
        value={serviceValues.categoryId}
        onChange={(value) => onServiceChange('categoryId', value)}
        records={activeCategories}
        getLabel={(category) => category.name}
        getMeta={(category) => category.code || category.description}
        searchPlaceholderKey="travel.services.categorySearch"
        emptyKey="travel.services.emptyCategories"
        onQuickAdd={(query) => onOpenQuickCategory(query, 'serviceDetails')}
        onAddDetails={(query) => onOpenCategoryDetails(null, query, 'serviceDetails')}
      />
    </TravelFormModal>

    <TravelFormModal
      open={categoryModalOpen}
      titleKey="travel.services.categoryFormTitle"
      modeKey={editingCategory ? 'travel.common.edit' : 'travel.common.addWithDetails'}
      fields={categoryFields}
      values={categoryValues}
      onChange={onCategoryChange}
      onClose={onCategoryClose}
      onSubmit={onCategorySubmit}
      submitting={submitting}
      error={formError}
    />

    <TravelFormModal
      open={quickServiceOpen}
      titleKey="travel.services.quickServiceTitle"
      modeKey="travel.common.quickAdd"
      fields={quickServiceFields}
      values={quickServiceValues}
      onChange={onQuickServiceChange}
      onClose={onQuickServiceClose}
      onSubmit={onQuickServiceSubmit}
      submitting={submitting}
      error={formError}
      submitIcon={FaListAlt}
    >
      <TravelRelationPicker
        labelKey="travel.fields.category"
        value={quickServiceValues.categoryId}
        onChange={(value) => onQuickServiceChange('categoryId', value)}
        records={activeCategories}
        getLabel={(category) => category.name}
        getMeta={(category) => category.code || category.description}
        searchPlaceholderKey="travel.services.categorySearch"
        emptyKey="travel.services.emptyCategories"
        onQuickAdd={(query) => onOpenQuickCategory(query, 'quickService')}
        onAddDetails={(query) => onOpenCategoryDetails(null, query, 'quickService')}
      />
    </TravelFormModal>

    <TravelFormModal
      open={quickCategoryOpen}
      titleKey="travel.services.quickCategoryTitle"
      modeKey="travel.common.quickAdd"
      fields={quickCategoryFields}
      values={quickCategoryValues}
      onChange={onQuickCategoryChange}
      onClose={onQuickCategoryClose}
      onSubmit={onQuickCategorySubmit}
      submitting={submitting}
      error={formError}
    />
  </>
);

export default TravelServiceModals;
