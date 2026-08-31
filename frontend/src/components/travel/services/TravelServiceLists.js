import React from 'react';
import { FaCheck, FaEdit, FaEyeSlash, FaTrash } from 'react-icons/fa';

import { t } from '../../../i18n/i18n';

import {
  TravelCardLine,
  TravelMasterList,
  TravelStatusBadge,
  formatTravelMoney,
} from '../master/TravelMasterUI';

const IconActionButton = ({ icon: Icon, title, variant = 'edit', disabled = false, onClick }) => {
  const variants = {
    edit: 'from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700',
    activate: 'from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700',
    deactivate: 'from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600',
    delete: 'from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700',
  };

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 ${
        variants[variant] || variants.edit
      }`}
    >
      <Icon aria-hidden="true" className="text-[11px]" />
    </button>
  );
};

const ActionGroup = ({ record, canManage, deletingId, onEdit, onToggleStatus, onDelete }) => {
  if (!canManage) {
    return null;
  }

  const inactive = record?.isActive === false;

  const deleting = String(deletingId || '') === String(record?._id || '');

  return (
    <div className="flex max-w-full flex-nowrap items-center justify-end gap-[3px]">
      <IconActionButton
        icon={FaEdit}
        title={t('travel.common.edit')}
        variant="edit"
        onClick={(event) => {
          event.stopPropagation();
          onEdit(record);
        }}
      />

      <IconActionButton
        icon={inactive ? FaCheck : FaEyeSlash}
        title={inactive ? t('travel.common.activate') : t('travel.common.deactivate')}
        variant={inactive ? 'activate' : 'deactivate'}
        onClick={(event) => {
          event.stopPropagation();
          onToggleStatus(record);
        }}
      />

      <IconActionButton
        icon={FaTrash}
        title={deleting ? t('travel.common.deleting') : t('travel.common.delete')}
        variant="delete"
        disabled={deleting}
        onClick={(event) => {
          event.stopPropagation();
          onDelete?.(record);
        }}
      />
    </div>
  );
};

export const TravelServiceList = ({
  services,
  selectedId,
  canManage,
  getCategoryName,
  onSelect,
  onEdit,
  onToggleStatus,
  onDelete,
  deletingId,
}) => {
  const columns = [
    {
      key: 'name',
      labelKey: 'travel.fields.service',
      className: 'w-[24%]',
      render: (service) => (
        <div className="min-w-0">
          <p className="truncate font-extrabold text-slate-950">{service?.name || '-'}</p>

          {service?.code && (
            <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{service.code}</p>
          )}
        </div>
      ),
    },
    {
      key: 'category',
      labelKey: 'travel.fields.category',
      className: 'w-[20%]',
      render: (service) => (
        <span className="font-semibold text-slate-700">{getCategoryName(service?.categoryId)}</span>
      ),
    },
    {
      key: 'selling',
      labelKey: 'travel.fields.defaultSellingPrice',
      className: 'w-[17%]',
      render: (service) => (
        <span className="font-extrabold text-emerald-700">
          {formatTravelMoney(service?.defaultSellingPrice, service?.defaultSellingCurrency)}
        </span>
      ),
    },
    {
      key: 'cost',
      labelKey: 'travel.fields.defaultCost',
      className: 'w-[17%]',
      render: (service) => (
        <span className="font-extrabold text-amber-700">
          {formatTravelMoney(service?.defaultCost, service?.defaultCostCurrency)}
        </span>
      ),
    },
    {
      key: 'status',
      labelKey: 'travel.fields.status',
      className: 'w-[10%]',
      render: (service) => <TravelStatusBadge active={service?.isActive !== false} />,
    },
    {
      key: 'actions',
      labelKey: 'travel.fields.actions',
      className: 'w-[12%]',
      cellClassName: '!px-2 !py-2',
      render: (service) => (
        <ActionGroup
          record={service}
          canManage={canManage}
          deletingId={deletingId}
          onEdit={onEdit}
          onToggleStatus={onToggleStatus}
          onDelete={onDelete}
        />
      ),
    },
  ];

  const renderMobileCard = (service) => (
    <article
      className={`rounded-xl border bg-white p-3 shadow-sm transition ${
        String(selectedId) === String(service?._id)
          ? 'border-cyan-300 ring-1 ring-cyan-100'
          : 'border-slate-200'
      }`}
      onClick={() => onSelect(service._id)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-extrabold text-slate-950">{service?.name || '-'}</p>

          <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">
            {getCategoryName(service?.categoryId)}
          </p>
        </div>

        <TravelStatusBadge active={service?.isActive !== false} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-slate-50/80 p-3">
        <TravelCardLine
          labelKey="travel.fields.defaultSellingPrice"
          value={formatTravelMoney(service?.defaultSellingPrice, service?.defaultSellingCurrency)}
        />

        <TravelCardLine
          labelKey="travel.fields.defaultCost"
          value={formatTravelMoney(service?.defaultCost, service?.defaultCostCurrency)}
        />

        {service?.code && <TravelCardLine labelKey="travel.fields.code" value={service.code} />}

        {service?.description && (
          <TravelCardLine labelKey="travel.fields.description" value={service.description} />
        )}
      </div>

      {canManage && (
        <div className="mt-3 flex items-center justify-end gap-1.5 border-t border-slate-100 pt-3">
          <ActionGroup
            record={service}
            canManage={canManage}
            deletingId={deletingId}
            onEdit={onEdit}
            onToggleStatus={onToggleStatus}
            onDelete={onDelete}
          />
        </div>
      )}
    </article>
  );

  return (
    <TravelMasterList
      columns={columns}
      records={Array.isArray(services) ? services : []}
      selectedId={selectedId}
      onRowClick={(service) => onSelect(service._id)}
      renderMobileCard={renderMobileCard}
      emptyKey="travel.services.emptyServices"
    />
  );
};

export const TravelServiceCategoryList = ({
  categories,
  selectedId,
  canManage,
  onSelect,
  onEdit,
  onToggleStatus,
  onDelete,
  deletingId,
}) => {
  const columns = [
    {
      key: 'name',
      labelKey: 'travel.fields.category',
      className: 'w-[28%]',
      render: (category) => (
        <div className="min-w-0">
          <p className="truncate font-extrabold text-slate-950">{category?.name || '-'}</p>

          {category?.code && (
            <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{category.code}</p>
          )}
        </div>
      ),
    },
    {
      key: 'description',
      labelKey: 'travel.fields.description',
      className: 'w-[42%]',
      render: (category) => (
        <p className="line-clamp-2 text-sm font-semibold leading-5 text-slate-600">
          {category?.description || '-'}
        </p>
      ),
    },
    {
      key: 'status',
      labelKey: 'travel.fields.status',
      className: 'w-[12%]',
      render: (category) => <TravelStatusBadge active={category?.isActive !== false} />,
    },
    {
      key: 'actions',
      labelKey: 'travel.fields.actions',
      className: 'w-[18%]',
      cellClassName: '!px-2 !py-2',
      render: (category) => (
        <ActionGroup
          record={category}
          canManage={canManage}
          deletingId={deletingId}
          onEdit={onEdit}
          onToggleStatus={onToggleStatus}
          onDelete={onDelete}
        />
      ),
    },
  ];

  const renderMobileCard = (category) => (
    <article
      className={`rounded-xl border bg-white p-3 shadow-sm transition ${
        String(selectedId) === String(category?._id)
          ? 'border-cyan-300 ring-1 ring-cyan-100'
          : 'border-slate-200'
      }`}
      onClick={() => onSelect(category._id)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-extrabold text-slate-950">
            {category?.name || '-'}
          </p>

          {category?.code && (
            <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{category.code}</p>
          )}
        </div>

        <TravelStatusBadge active={category?.isActive !== false} />
      </div>

      {category?.description && (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold leading-5 text-slate-600">
          {category.description}
        </p>
      )}

      {canManage && (
        <div className="mt-3 flex items-center justify-end gap-1.5 border-t border-slate-100 pt-3">
          <ActionGroup
            record={category}
            canManage={canManage}
            deletingId={deletingId}
            onEdit={onEdit}
            onToggleStatus={onToggleStatus}
            onDelete={onDelete}
          />
        </div>
      )}
    </article>
  );

  return (
    <TravelMasterList
      columns={columns}
      records={Array.isArray(categories) ? categories : []}
      selectedId={selectedId}
      onRowClick={(category) => onSelect(category._id)}
      renderMobileCard={renderMobileCard}
      emptyKey="travel.services.emptyCategories"
    />
  );
};
