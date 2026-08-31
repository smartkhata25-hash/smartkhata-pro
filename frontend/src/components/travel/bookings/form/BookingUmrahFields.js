import React from 'react';
import { FaPlus, FaTrash } from 'react-icons/fa';

import { t } from '../../../../i18n/i18n';
import {
  createEmptyUmrahComponent,
  travelBookingCurrencyOptions,
  umrahPackageModeOptions,
} from '../travelBookingConfig';
import { TravelActionButton } from '../../master/TravelMasterUI';
import { componentTypeOptions } from './bookingFormConfig';
import { Field, Input, Select } from './BookingFormControls';

const BookingUmrahFields = ({
  item,
  index,
  services,
  vendors,
  onUpdateItem,
  onUpdateItemDetails,
  onUpdateUmrahComponent,
}) => (
  <div className="space-y-3">
    <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
      <Field labelKey="travel.booking.fields.packageMode">
        <Select
          value={item.umrahDetails.packageMode}
          onChange={(event) => onUpdateItemDetails(index, 'umrahDetails', 'packageMode', event.target.value)}
        >
          {umrahPackageModeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey)}
            </option>
          ))}
        </Select>
      </Field>
      <Field labelKey="travel.booking.fields.packageName">
        <Input
          value={item.umrahDetails.packageName}
          onChange={(event) => onUpdateItemDetails(index, 'umrahDetails', 'packageName', event.target.value)}
        />
      </Field>
      <Field labelKey="travel.booking.fields.departureDate">
        <Input
          type="date"
          value={item.umrahDetails.departureDate}
          onChange={(event) => onUpdateItemDetails(index, 'umrahDetails', 'departureDate', event.target.value)}
        />
      </Field>
      <Field labelKey="travel.booking.fields.returnDate">
        <Input
          type="date"
          value={item.umrahDetails.returnDate}
          onChange={(event) => onUpdateItemDetails(index, 'umrahDetails', 'returnDate', event.target.value)}
        />
      </Field>
    </div>

    {item.umrahDetails.packageMode === 'custom_component_package' && (
      <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-extrabold text-slate-600">
            {t('travel.booking.sections.umrahComponents')}
          </p>
          <TravelActionButton
            icon={FaPlus}
            variant="soft"
            onClick={() =>
              onUpdateItem(index, (currentItem) => ({
                ...currentItem,
                umrahDetails: {
                  ...(currentItem.umrahDetails || {}),
                  components: [
                    ...(currentItem.umrahDetails?.components || []),
                    createEmptyUmrahComponent(),
                  ],
                },
              }))
            }
          >
            {t('travel.booking.actions.addComponent')}
          </TravelActionButton>
        </div>

        <div className="space-y-3">
          {(item.umrahDetails.components || []).map((component, componentIndex) => (
            <div key={componentIndex} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="mb-2 flex justify-between gap-2">
                <p className="text-sm font-extrabold text-slate-800">
                  {t('travel.booking.fields.component')} {componentIndex + 1}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateItem(index, (currentItem) => ({
                      ...currentItem,
                      umrahDetails: {
                        ...(currentItem.umrahDetails || {}),
                        components: (currentItem.umrahDetails?.components || []).filter(
                          (_, indexValue) => indexValue !== componentIndex
                        ),
                      },
                    }))
                  }
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700"
                  title={t('travel.booking.actions.removeComponent')}
                >
                  <FaTrash aria-hidden="true" />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <Field labelKey="travel.booking.fields.componentType">
                  <Select
                    value={component.componentType}
                    onChange={(event) =>
                      onUpdateUmrahComponent(index, componentIndex, 'componentType', event.target.value)
                    }
                  >
                    {componentTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field labelKey="travel.booking.fields.label">
                  <Input
                    value={component.label}
                    onChange={(event) =>
                      onUpdateUmrahComponent(index, componentIndex, 'label', event.target.value)
                    }
                  />
                </Field>
                <Field labelKey="travel.fields.vendor">
                  <Select
                    value={component.vendorId}
                    onChange={(event) =>
                      onUpdateUmrahComponent(index, componentIndex, 'vendorId', event.target.value)
                    }
                  >
                    <option value="">{t('travel.common.noneSelected')}</option>
                    {vendors.map((vendor) => (
                      <option key={vendor._id} value={vendor._id}>
                        {vendor.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field labelKey="travel.fields.service">
                  <Select
                    value={component.serviceId}
                    onChange={(event) =>
                      onUpdateUmrahComponent(index, componentIndex, 'serviceId', event.target.value)
                    }
                  >
                    <option value="">{t('travel.common.noneSelected')}</option>
                    {services.map((service) => (
                      <option key={service._id} value={service._id}>
                        {service.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field labelKey="travel.booking.fields.sellingPrice">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={component.sellingPrice}
                    onChange={(event) =>
                      onUpdateUmrahComponent(index, componentIndex, 'sellingPrice', event.target.value)
                    }
                  />
                </Field>
                <Field labelKey="travel.booking.fields.sellingCurrency">
                  <Select
                    value={component.sellingCurrency}
                    onChange={(event) =>
                      onUpdateUmrahComponent(index, componentIndex, 'sellingCurrency', event.target.value)
                    }
                  >
                    {travelBookingCurrencyOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field labelKey="travel.booking.fields.costPrice">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={component.costPrice}
                    onChange={(event) =>
                      onUpdateUmrahComponent(index, componentIndex, 'costPrice', event.target.value)
                    }
                  />
                </Field>
                <Field labelKey="travel.booking.fields.costCurrency">
                  <Select
                    value={component.costCurrency}
                    onChange={(event) =>
                      onUpdateUmrahComponent(index, componentIndex, 'costCurrency', event.target.value)
                    }
                  >
                    {travelBookingCurrencyOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
);

export default BookingUmrahFields;
