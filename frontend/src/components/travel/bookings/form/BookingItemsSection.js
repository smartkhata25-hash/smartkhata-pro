import React from 'react';
import { FaPlaneDeparture, FaPlus, FaTrash } from 'react-icons/fa';

import { DEFAULT_TRAVEL_CURRENCY } from '../../../../config/travelConfig';
import { t } from '../../../../i18n/i18n';
import { TravelActionButton, TravelRelationPicker } from '../../master/TravelMasterUI';
import { createEmptyBookingItem } from '../travelBookingConfig';
import { mixedBookingItemTypes } from './bookingFormConfig';
import { Field, Input, Section, Select } from './BookingFormControls';
import BookingItemDetails from './BookingItemDetails';
import BookingMoneyFields from './BookingMoneyFields';
import BookingTravelerChips from './BookingTravelerChips';

const BookingItemsSection = ({
  formState,
  services,
  vendors,
  travelers,
  hotels,
  canManageServices,
  canManageHotels,
  canManageVendors,
  canManageTravelers,
  onUpdateItem,
  onUpdateItemField,
  onUpdateItemDetails,
  onUpdateUmrahComponent,
  onRemoveItem,
  onAddItem,
  onToggleItemTraveler,
  onOpenModal,
}) => (
  <Section titleKey="travel.booking.sections.services" icon={FaPlaneDeparture}>
    <div className="space-y-3">
      {(formState.bookingItems || []).map((item, index) => (
        <article key={index} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-slate-900">
                {t('travel.booking.fields.bookingItem')} {index + 1}
              </p>
              <p className="text-xs font-semibold text-slate-500">
                {t(`travel.booking.itemTypes.${item.itemType}`)}
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {formState.serviceType === 'mixed' && (
                <Select
                  value={item.itemType}
                  onChange={(event) => onUpdateItem(index, () => createEmptyBookingItem(event.target.value))}
                  className="w-44"
                >
                  {mixedBookingItemTypes.map((type) => (
                    <option key={type} value={type}>
                      {t(`travel.booking.itemTypes.${type}`)}
                    </option>
                  ))}
                </Select>
              )}
              <button
                type="button"
                onClick={() => onRemoveItem(index)}
                disabled={formState.bookingItems.length === 1}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-700 disabled:opacity-40 sm:h-9 sm:w-9 sm:text-sm"
                title={t('travel.booking.actions.removeItem')}
              >
                <FaTrash aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field labelKey="travel.booking.fields.itemTitle">
                <Input
                  value={item.title}
                  onChange={(event) => onUpdateItemField(index, 'title', event.target.value)}
                  placeholder={t('travel.booking.placeholders.itemTitle')}
                />
              </Field>
              <TravelRelationPicker
                labelKey="travel.fields.service"
                value={item.serviceId}
                onChange={(value, service) => {
                  onUpdateItem(index, (currentItem) => ({
                    ...currentItem,
                    serviceId: value,
                    title: currentItem.title || service?.name || '',
                    sellingPrice:
                      currentItem.sellingPrice || service?.defaultSellingPrice || '',
                    sellingCurrency:
                      currentItem.sellingCurrency ||
                      service?.defaultSellingCurrency ||
                      DEFAULT_TRAVEL_CURRENCY,
                    costPrice: currentItem.costPrice || service?.defaultCost || '',
                    costCurrency:
                      currentItem.costCurrency ||
                      service?.defaultCostCurrency ||
                      DEFAULT_TRAVEL_CURRENCY,
                  }));
                }}
                records={services.filter((service) => service.isActive !== false)}
                getLabel={(service) => service.name}
                getMeta={(service) => service.code || service.categoryId?.name}
                searchPlaceholderKey="travel.services.search"
                emptyKey="travel.services.emptyServices"
                onQuickAdd={
                  canManageServices ? (query) => onOpenModal('service', 'quick', { query, itemIndex: index }) : null
                }
                onAddDetails={
                  canManageServices ? (query) => onOpenModal('service', 'details', { query, itemIndex: index }) : null
                }
              />
            </div>

            {['air_ticket', 'visit_visa'].includes(item.itemType) && (
              <BookingTravelerChips
                item={item}
                index={index}
                travelers={travelers}
                canManageTravelers={canManageTravelers}
                onQuickAddTraveler={() => onOpenModal('traveler', 'quick')}
                onToggleItemTraveler={onToggleItemTraveler}
              />
            )}

            <TravelRelationPicker
              labelKey="travel.fields.vendor"
              value={item.vendorId}
              onChange={(value) => onUpdateItemField(index, 'vendorId', value)}
              records={vendors.filter((vendor) => vendor.isDeleted !== true)}
              getLabel={(vendor) => vendor.name}
              getMeta={(vendor) => t(`travel.vendorTypes.${vendor.travelVendorType || 'other'}`)}
              searchPlaceholderKey="travel.vendors.search"
              emptyKey="travel.vendors.empty"
              onQuickAdd={
                canManageVendors ? (query) => onOpenModal('vendor', 'quick', { query, itemIndex: index }) : null
              }
              onAddDetails={
                canManageVendors ? (query) => onOpenModal('vendor', 'details', { query, itemIndex: index }) : null
              }
            />

            <BookingItemDetails
              item={item}
              index={index}
              travelers={travelers}
              hotels={hotels}
              services={services}
              vendors={vendors}
              canManageHotels={canManageHotels}
              onOpenModal={onOpenModal}
              onUpdateItem={onUpdateItem}
              onUpdateItemField={onUpdateItemField}
              onUpdateItemDetails={onUpdateItemDetails}
              onUpdateUmrahComponent={onUpdateUmrahComponent}
            />
            <BookingMoneyFields item={item} index={index} onUpdateItemField={onUpdateItemField} />
          </div>
        </article>
      ))}

      {formState.serviceType === 'mixed' && (
        <TravelActionButton icon={FaPlus} variant="soft" onClick={() => onAddItem('service')}>
          {t('travel.booking.actions.addService')}
        </TravelActionButton>
      )}
    </div>
  </Section>
);

export default BookingItemsSection;
