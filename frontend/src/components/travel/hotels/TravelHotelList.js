import React from 'react';
import { FaCheck, FaEdit, FaEyeSlash, FaTrash } from 'react-icons/fa';

import { getHotelStarRatingLabel } from '../../../config/travelConfig';
import { t } from '../../../i18n/i18n';

import {
  TravelCardLine,
  TravelMasterList,
  TravelStatusBadge,
  formatTravelMoney,
} from '../master/TravelMasterUI';

const formatLocation = (hotel) => [hotel?.city, hotel?.country].filter(Boolean).join(', ') || '-';

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

const HotelActionGroup = ({ hotel, canManage, deletingId, onEdit, onToggleStatus, onDelete }) => {
  if (!canManage) {
    return null;
  }

  const inactive = hotel?.isActive === false;

  const deleting = String(deletingId || '') === String(hotel?._id || '');

  return (
    <div className="flex max-w-full flex-nowrap items-center justify-end gap-[3px]">
      <IconActionButton
        icon={FaEdit}
        title={t('travel.common.edit')}
        variant="edit"
        onClick={(event) => {
          event.stopPropagation();
          onEdit(hotel);
        }}
      />

      <IconActionButton
        icon={inactive ? FaCheck : FaEyeSlash}
        title={inactive ? t('travel.common.activate') : t('travel.common.deactivate')}
        variant={inactive ? 'activate' : 'deactivate'}
        onClick={(event) => {
          event.stopPropagation();
          onToggleStatus(hotel);
        }}
      />

      <IconActionButton
        icon={FaTrash}
        title={deleting ? t('travel.common.deleting') : t('travel.common.delete')}
        variant="delete"
        disabled={deleting}
        onClick={(event) => {
          event.stopPropagation();
          onDelete?.(hotel);
        }}
      />
    </div>
  );
};

const TravelHotelList = ({
  hotels,
  selectedId,
  canManage,
  getVendorName,
  onSelect,
  onEdit,
  onToggleStatus,
  onDelete,
  deletingId,
}) => {
  const safeHotels = Array.isArray(hotels) ? hotels : [];

  const columns = [
    {
      key: 'name',
      labelKey: 'travel.fields.hotel',
      className: 'w-[26%]',
      render: (hotel) => (
        <div className="min-w-0">
          <p className="truncate font-extrabold text-slate-950">{hotel?.name || '-'}</p>

          <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">
            {formatLocation(hotel)}
          </p>
        </div>
      ),
    },

    {
      key: 'vendor',
      labelKey: 'travel.fields.vendor',
      className: 'w-[20%]',
      render: (hotel) => (
        <span className="font-semibold text-slate-700">{getVendorName(hotel?.vendorId)}</span>
      ),
    },

    {
      key: 'rate',
      labelKey: 'travel.fields.defaultRate',
      className: 'w-[18%]',
      render: (hotel) => (
        <span className="font-extrabold text-emerald-700">
          {formatTravelMoney(hotel?.defaultRate, hotel?.currency)}
        </span>
      ),
    },

    {
      key: 'starRating',
      labelKey: 'travel.fields.starRating',
      className: 'w-[14%]',
      render: (hotel) => (
        <span className="font-bold text-amber-700">
          {getHotelStarRatingLabel(hotel?.starRating)}
        </span>
      ),
    },

    {
      key: 'status',
      labelKey: 'travel.fields.status',
      className: 'w-[10%]',
      render: (hotel) => <TravelStatusBadge active={hotel?.isActive !== false} />,
    },

    {
      key: 'actions',
      labelKey: 'travel.fields.actions',
      className: 'w-[12%]',
      cellClassName: '!px-2 !py-2',
      render: (hotel) => (
        <HotelActionGroup
          hotel={hotel}
          canManage={canManage}
          deletingId={deletingId}
          onEdit={onEdit}
          onToggleStatus={onToggleStatus}
          onDelete={onDelete}
        />
      ),
    },
  ];

  const renderMobileCard = (hotel) => {
    const selected = String(selectedId || '') === String(hotel?._id || '');

    return (
      <article
        onClick={() => onSelect(hotel._id)}
        className={`rounded-xl border bg-white p-3 shadow-sm transition ${
          selected ? 'border-cyan-300 ring-1 ring-cyan-100' : 'border-slate-200'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-extrabold text-slate-950">{hotel?.name || '-'}</p>

            <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">
              {formatLocation(hotel)}
            </p>
          </div>

          <TravelStatusBadge active={hotel?.isActive !== false} />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-slate-50/80 p-3">
          <TravelCardLine labelKey="travel.fields.vendor" value={getVendorName(hotel?.vendorId)} />

          <TravelCardLine
            labelKey="travel.fields.defaultRate"
            value={formatTravelMoney(hotel?.defaultRate, hotel?.currency)}
          />

          <TravelCardLine
            labelKey="travel.fields.starRating"
            value={getHotelStarRatingLabel(hotel?.starRating)}
          />

          {hotel?.distanceText && (
            <TravelCardLine labelKey="travel.fields.distanceText" value={hotel.distanceText} />
          )}
        </div>

        {hotel?.contact && (
          <div className="mt-3 rounded-lg border border-slate-100 bg-white px-3 py-2">
            <p className="text-[11px] font-bold uppercase text-slate-400">
              {t('travel.fields.contact')}
            </p>

            <p className="mt-0.5 truncate text-sm font-bold text-slate-700">{hotel.contact}</p>
          </div>
        )}

        {canManage && (
          <div className="mt-3 flex items-center justify-end gap-1.5 border-t border-slate-100 pt-3">
            <HotelActionGroup
              hotel={hotel}
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
  };

  return (
    <TravelMasterList
      columns={columns}
      records={safeHotels}
      selectedId={selectedId}
      onRowClick={(hotel) => onSelect(hotel._id)}
      renderMobileCard={renderMobileCard}
      emptyKey="travel.hotels.empty"
    />
  );
};

export default TravelHotelList;
