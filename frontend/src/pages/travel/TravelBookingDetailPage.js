import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import {
  FaArrowLeft,
  FaBed,
  FaCalendarAlt,
  FaCalendarCheck,
  FaCheckCircle,
  FaClipboardList,
  FaCoins,
  FaEdit,
  FaEye,
  FaFilePdf,
  FaFileInvoiceDollar,
  FaHistory,
  FaHotel,
  FaIdCard,
  FaMapMarkerAlt,
  FaMoneyBillWave,
  FaPaperclip,
  FaPassport,
  FaPlane,
  FaPlaneDeparture,
  FaPrint,
  FaReceipt,
  FaRoute,
  FaShareAlt,
  FaStickyNote,
  FaSuitcaseRolling,
  FaTimesCircle,
  FaTrash,
  FaUndo,
  FaUser,
  FaUsers,
  FaWallet,
} from 'react-icons/fa';

import {
  cancelTravelBooking,
  deleteTravelBooking,
  fetchTravelBookingById,
  getTravelBookingPdfUrl,
  getTravelBookingPreviewUrl,
  getTravelBookingPrintUrl,
  updateTravelBookingStatus,
} from '../../services/travelMasterService';
import {
  fetchTravelBookingReminders,
  fetchTravelReminderWhatsAppMessage,
  sendTravelReminderEmail,
} from '../../services/travelReminderService';

import { getCurrentLanguage, t } from '../../i18n/i18n';
import { hasPermission } from '../../utils/permissionHelper';
import { sharePdfDocument } from '../../utils/documentShare';
import { generateWhatsAppLink } from '../../utils/whatsapp';

import {
  TravelActionButton,
  TravelMasterPageFrame,
  buildTravelConfirmMessage,
} from '../../components/travel/master/TravelMasterUI';
import {
  TravelReminderStatusPanel,
} from '../../components/travel/reminders/TravelReminderCenter';

import {
  formatBookingMoney,
  formatDate,
  formatDateTime,
  getCustomerName,
  getHotelName,
  getRecordId,
  getTravelerName,
  getVendorName,
} from '../../components/travel/bookings/travelBookingConfig';

import BookingStatusBadge from '../../components/travel/bookings/BookingStatusBadge';

const openDocumentUrl = (url) => {
  const opened = window.open(url, '_blank', 'noopener,noreferrer');

  if (!opened) {
    alert(t('alerts.printWindowBlocked'));
  }
};

const tabConfig = [
  {
    key: 'overview',
    labelKey: 'travel.booking.tabs.overview',
    icon: FaClipboardList,
  },
  {
    key: 'travelers',
    labelKey: 'travel.booking.tabs.travelers',
    icon: FaUsers,
  },
  {
    key: 'services',
    labelKey: 'travel.booking.tabs.services',
    icon: FaRoute,
  },
  {
    key: 'pricing',
    labelKey: 'travel.booking.tabs.pricing',
    icon: FaFileInvoiceDollar,
  },
  {
    key: 'vendors',
    labelKey: 'travel.booking.tabs.vendors',
    icon: FaUser,
  },
  {
    key: 'notes',
    labelKey: 'travel.booking.tabs.notes',
    icon: FaStickyNote,
  },
  {
    key: 'attachments',
    labelKey: 'travel.booking.tabs.attachments',
    icon: FaPaperclip,
  },
  {
    key: 'history',
    labelKey: 'travel.booking.tabs.history',
    icon: FaHistory,
  },
];

const sectionClass = 'overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm';

const numberValue = (value) => {
  const amount = Number(value || 0);

  return Number.isFinite(amount) ? amount : 0;
};

const hasPricingValue = (value) => value !== undefined && value !== null && value !== '';

const getObjectName = (record, fallback = '-') => {
  if (!record || typeof record !== 'object') {
    return fallback;
  }

  return record.name || record.fullName || record.code || fallback;
};

const getTravelerLabel = (booking, traveler) => {
  if (traveler && typeof traveler === 'object') {
    return getTravelerName(traveler);
  }

  const match = (booking.travelers || []).find(
    (entry) => String(getRecordId(entry)) === String(traveler)
  );

  return getTravelerName(match);
};

const getItemTravelers = (booking, item) =>
  (item.travelerIds || [])
    .map((traveler) => getTravelerLabel(booking, traveler))
    .filter(Boolean)
    .join(', ') || '-';

const renderRoute = (from, to) => [from, to].filter(Boolean).join(' → ') || '-';

const formatPlainMoney = (amount, currency = 'PKR') =>
  `${currency || 'PKR'} ${numberValue(amount).toLocaleString('en-GB', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;

const getPaxLabel = (paxType) => {
  if (paxType === 'child') {
    return 'Child';
  }

  if (paxType === 'infant') {
    return 'Infant';
  }

  return 'Adult';
};

const getRoomOccupancy = (room) => {
  const occupancyMap = {
    single: 1,
    double: 2,
    twin: 2,
    triple: 3,
    quad: 4,
    quint: 5,
    '5_sharing': 5,
    '6_sharing': 6,
    '7_sharing': 7,
    '8_sharing': 8,
  };

  return numberValue(room?.occupancy) || occupancyMap[room?.roomType] || 0;
};

const calculatePaxSourceTotals = (rows = []) =>
  rows.reduce(
    (totals, row) => {
      const count = numberValue(row?.count);

      totals.cost += count * numberValue(row?.costPrice);

      totals.selling += count * numberValue(row?.sellingPrice);

      return totals;
    },
    {
      cost: 0,
      selling: 0,
    }
  );

const calculateQuantitySourceTotals = (pricing) => {
  const quantity = numberValue(pricing?.quantity);

  return {
    cost: quantity * numberValue(pricing?.costPrice),

    selling: quantity * numberValue(pricing?.sellingPrice),
  };
};

const calculateHotelSourceTotals = ({ roomPricing = [], nights = 0, chargePerRoom = false }) => {
  const nightCount = numberValue(nights);

  return roomPricing.reduce(
    (totals, room) => {
      const multiplier = chargePerRoom ? numberValue(room?.quantity) : getRoomOccupancy(room);

      totals.cost += multiplier * numberValue(room?.costPrice) * nightCount;

      totals.selling += multiplier * numberValue(room?.sellingPrice) * nightCount;

      return totals;
    },
    {
      cost: 0,
      selling: 0,
    }
  );
};

const calculateComponentSourceTotals = (component) => {
  const type = String(component?.componentType || '').toLowerCase();

  if (
    ['air_ticket', 'visit_visa'].includes(type) &&
    Array.isArray(component?.paxPricing) &&
    component.paxPricing.length > 0
  ) {
    return calculatePaxSourceTotals(component.paxPricing);
  }

  if (type === 'hotel' && component?.hotelPricing) {
    if (component.hotelPricing.usesNightlyBreakdown === true) {
      const normalSubtotal = hasPricingValue(component.hotelPricing.normalSubtotal)
        ? numberValue(component.hotelPricing.normalSubtotal)
        : numberValue(component.hotelPricing.normalNights) *
          numberValue(component.hotelPricing.normalRate);
      const weekendSubtotal = hasPricingValue(component.hotelPricing.weekendSubtotal)
        ? numberValue(component.hotelPricing.weekendSubtotal)
        : numberValue(component.hotelPricing.weekendNights) *
          numberValue(component.hotelPricing.weekendRate || component.hotelPricing.normalRate);

      return {
        cost: hasPricingValue(component.hotelPricing.costSubtotal)
          ? numberValue(component.hotelPricing.costSubtotal)
          : normalSubtotal + weekendSubtotal,
        selling: hasPricingValue(component.hotelPricing.sellingSubtotal)
          ? numberValue(component.hotelPricing.sellingSubtotal)
          : normalSubtotal + weekendSubtotal,
      };
    }

    if (
      !Array.isArray(component.hotelPricing.roomPricing) ||
      component.hotelPricing.roomPricing.length === 0
    ) {
      return {
        cost: numberValue(component?.costPrice),
        selling: numberValue(component?.sellingPrice),
      };
    }

    return calculateHotelSourceTotals({
      roomPricing: component.hotelPricing.roomPricing,

      nights: component.hotelPricing.nights,

      chargePerRoom: component.hotelPricing.chargePerRoom === true,
    });
  }

  if (
    ['transport', 'appointment', 'token', 'insurance', 'service', 'other'].includes(type) &&
    component?.quantityPricing
  ) {
    return calculateQuantitySourceTotals(component.quantityPricing);
  }

  return {
    cost: numberValue(component?.costPrice),
    selling: numberValue(component?.sellingPrice),
  };
};

const InfoCard = ({ icon: Icon, label, value, tone = 'slate' }) => {
  const tones = {
    slate: 'border-slate-200 bg-gradient-to-br from-white to-slate-50 text-slate-600',

    cyan: 'border-cyan-100 bg-gradient-to-br from-cyan-50 to-white text-cyan-700',

    blue: 'border-blue-100 bg-gradient-to-br from-blue-50 to-white text-blue-700',

    violet: 'border-violet-100 bg-gradient-to-br from-violet-50 to-white text-violet-700',

    emerald: 'border-emerald-100 bg-gradient-to-br from-emerald-50 to-white text-emerald-700',

    amber: 'border-amber-100 bg-gradient-to-br from-amber-50 to-white text-amber-700',

    rose: 'border-rose-100 bg-gradient-to-br from-rose-50 to-white text-rose-700',
  };

  const toneClass = tones[tone] || tones.slate;

  return (
    <div className={`min-w-0 rounded-xl border p-3 ${toneClass}`}>
      <div className="flex items-center gap-2">
        {Icon && (
          <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-black/5">
            <Icon aria-hidden="true" />
          </span>
        )}

        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-wide opacity-70">{label}</p>

          <div className="mt-1 truncate text-sm font-black text-slate-900">
            {value === undefined || value === null || value === '' ? '-' : value}
          </div>
        </div>
      </div>
    </div>
  );
};

const FinancialCard = ({ icon: Icon, label, value, tone = 'slate' }) => {
  const tones = {
    slate: 'border-slate-200 from-white to-slate-50 text-slate-700',

    cyan: 'border-cyan-100 from-cyan-50 to-white text-cyan-700',

    blue: 'border-blue-100 from-blue-50 to-white text-blue-700',

    emerald: 'border-emerald-100 from-emerald-50 to-white text-emerald-700',

    amber: 'border-amber-100 from-amber-50 to-white text-amber-700',

    orange: 'border-orange-100 from-orange-50 to-white text-orange-700',

    rose: 'border-rose-100 from-rose-50 to-white text-rose-700',

    violet: 'border-violet-100 from-violet-50 to-white text-violet-700',
  };

  return (
    <div
      className={`rounded-xl border bg-gradient-to-br p-3 shadow-sm ${tones[tone] || tones.slate}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-wide opacity-70">{label}</p>

        {Icon && <Icon aria-hidden="true" className="text-sm opacity-80" />}
      </div>

      <p className="mt-2 truncate text-base font-black">{value}</p>
    </div>
  );
};

const EmptyState = ({ text }) => (
  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-8 text-center text-sm font-bold text-slate-500">
    {text}
  </div>
);

const DetailGroup = ({ title, icon: Icon, children, tone = 'cyan' }) => {
  const tones = {
    cyan: 'from-cyan-50 via-white to-sky-50 border-cyan-100 text-cyan-700',
    violet: 'from-violet-50 via-white to-indigo-50 border-violet-100 text-violet-700',
    emerald: 'from-emerald-50 via-white to-teal-50 border-emerald-100 text-emerald-700',
    amber: 'from-amber-50 via-white to-orange-50 border-amber-100 text-amber-700',
  };

  return (
    <section className={sectionClass}>
      <div
        className={`flex items-center gap-2 border-b bg-gradient-to-r px-4 py-3 ${
          tones[tone] || tones.cyan
        }`}
      >
        {Icon && (
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-black/5">
            <Icon aria-hidden="true" />
          </span>
        )}

        <h2 className="text-sm font-black text-slate-900">{title}</h2>
      </div>

      <div className="p-4">{children}</div>
    </section>
  );
};

const PaxPricingTable = ({ rows, currency }) => {
  const activeRows = (rows || []).filter((row) => numberValue(row?.count) > 0);

  if (!activeRows.length) {
    return null;
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[620px] space-y-2">
        {activeRows.map((row) => {
          const count = numberValue(row.count);

          const totalCost = count * numberValue(row.costPrice);

          const totalSale = count * numberValue(row.sellingPrice);

          return (
            <div
              key={row._id || row.paxType}
              className="grid grid-cols-[100px_70px_minmax(120px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)] items-center gap-2 rounded-xl border border-slate-200 bg-white p-2"
            >
              <span className="rounded-lg bg-cyan-50 px-2 py-2 text-center text-xs font-black text-cyan-700">
                {getPaxLabel(row.paxType)}
              </span>

              <span className="text-center text-sm font-black text-slate-800">{count}</span>

              <span className="text-sm font-bold text-slate-600">
                {formatPlainMoney(row.costPrice, currency)}
              </span>

              <span className="text-sm font-bold text-slate-600">
                {formatPlainMoney(row.sellingPrice, currency)}
              </span>

              <span className="text-sm font-black text-slate-800">
                {formatPlainMoney(totalCost, currency)}
              </span>

              <span className="text-sm font-black text-cyan-700">
                {formatPlainMoney(totalSale, currency)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const HotelPricingDetails = ({ pricing, currency }) => {
  const roomRows = pricing?.roomPricing || [];
  const usesNightlyBreakdown = pricing?.usesNightlyBreakdown === true;

  if (!roomRows.length && !usesNightlyBreakdown) {
    return null;
  }

  const chargePerRoom = pricing?.chargePerRoom === true;

  const nights = numberValue(pricing?.nights);

  if (usesNightlyBreakdown) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InfoCard icon={FaBed} label="Total Nights" value={nights} tone="violet" />
          <InfoCard
            icon={FaCalendarAlt}
            label="Normal Nights"
            value={numberValue(pricing.normalNights)}
            tone="cyan"
          />
          <InfoCard
            icon={FaCalendarAlt}
            label="Weekend Nights"
            value={numberValue(pricing.weekendNights)}
            tone="amber"
          />
          <InfoCard
            icon={FaReceipt}
            label="Hotel Subtotal"
            value={formatPlainMoney(pricing.sellingSubtotal, currency)}
            tone="emerald"
          />
          <InfoCard
            icon={FaCalendarAlt}
            label="Check-in"
            value={formatDate(pricing.checkIn)}
            tone="cyan"
          />
          <InfoCard
            icon={FaCalendarAlt}
            label="Check-out"
            value={formatDate(pricing.checkOut)}
            tone="cyan"
          />
          <InfoCard
            icon={FaMoneyBillWave}
            label="Normal Rate"
            value={formatPlainMoney(pricing.normalRate, currency)}
          />
          <InfoCard
            icon={FaMoneyBillWave}
            label="Weekend Rate"
            value={formatPlainMoney(pricing.weekendRate, currency)}
            tone="amber"
          />
          <InfoCard
            icon={FaReceipt}
            label="Normal Subtotal"
            value={formatPlainMoney(pricing.normalSubtotal, currency)}
          />
          <InfoCard
            icon={FaReceipt}
            label="Weekend Subtotal"
            value={formatPlainMoney(pricing.weekendSubtotal, currency)}
            tone="amber"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-violet-50 px-3 py-1.5 text-xs font-black text-violet-700">
          {nights} Night(s)
        </span>

        <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700">
          {chargePerRoom ? 'Charge Per Room' : 'Charge Per Head'}
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[760px] space-y-2">
          {roomRows.map((room, index) => {
            const multiplier = chargePerRoom ? numberValue(room.quantity) : getRoomOccupancy(room);

            const totalCost = multiplier * numberValue(room.costPrice) * nights;

            const totalSale = multiplier * numberValue(room.sellingPrice) * nights;

            const roomName =
              room.roomType === 'custom' ? room.customRoomType || 'Custom' : room.roomType || '-';

            return (
              <div
                key={room._id || index}
                className="grid grid-cols-[130px_90px_90px_minmax(120px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)] items-center gap-2 rounded-xl border border-slate-200 bg-white p-2"
              >
                <span className="capitalize text-sm font-black text-slate-800">
                  {roomName.replaceAll('_', ' ')}
                </span>

                <span className="text-center text-sm font-bold text-slate-600">
                  {getRoomOccupancy(room) || '-'} Person
                </span>

                <span className="text-center text-sm font-bold text-slate-600">
                  {numberValue(room.quantity) || '-'} Room
                </span>

                <span className="text-sm font-bold text-slate-600">
                  {formatPlainMoney(room.costPrice, currency)}
                </span>

                <span className="text-sm font-bold text-slate-600">
                  {formatPlainMoney(room.sellingPrice, currency)}
                </span>

                <span className="text-sm font-black text-slate-800">
                  {formatPlainMoney(totalCost, currency)}
                </span>

                <span className="text-sm font-black text-violet-700">
                  {formatPlainMoney(totalSale, currency)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const QuantityPricingDetails = ({ pricing, currency }) => {
  if (!pricing) {
    return null;
  }

  const totals = calculateQuantitySourceTotals(pricing);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <InfoCard
        icon={FaClipboardList}
        label={pricing.unitLabel || 'Quantity'}
        value={numberValue(pricing.quantity)}
        tone="cyan"
      />

      <InfoCard
        icon={FaCoins}
        label="Unit Cost"
        value={formatPlainMoney(pricing.costPrice, currency)}
      />

      <InfoCard
        icon={FaCoins}
        label="Unit Sale"
        value={formatPlainMoney(pricing.sellingPrice, currency)}
        tone="blue"
      />

      <InfoCard
        icon={FaWallet}
        label="Total Cost"
        value={formatPlainMoney(totals.cost, currency)}
        tone="amber"
      />

      <InfoCard
        icon={FaFileInvoiceDollar}
        label="Total Sale"
        value={formatPlainMoney(totals.selling, currency)}
        tone="emerald"
      />
    </div>
  );
};

const renderAirTicketDetails = (booking, item) => {
  const details = item.ticketDetails || {};

  const passengerTickets = details.passengerTickets || [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard
          icon={FaPlane}
          label={t('travel.booking.fields.journeyType')}
          value={t(`travel.booking.journeyTypes.${details.journeyType || 'one_way'}`)}
          tone="cyan"
        />

        <InfoCard
          icon={FaPlaneDeparture}
          label={t('travel.booking.fields.airline')}
          value={details.airline}
          tone="blue"
        />

        <InfoCard
          icon={FaRoute}
          label={t('travel.booking.fields.route')}
          value={renderRoute(details.origin, details.destination)}
          tone="violet"
        />

        <InfoCard
          icon={FaCalendarAlt}
          label={t('travel.booking.fields.departureDateTime')}
          value={formatDateTime(details.departureDateTime)}
          tone="emerald"
        />

        {details.returnOrigin || details.returnDestination || details.returnDateTime ? (
          <>
            <InfoCard
              icon={FaRoute}
              label={t('travel.booking.fields.returnRoute')}
              value={renderRoute(details.returnOrigin, details.returnDestination)}
              tone="violet"
            />

            <InfoCard
              icon={FaCalendarAlt}
              label={t('travel.booking.fields.returnDateTime')}
              value={formatDateTime(details.returnDateTime)}
              tone="emerald"
            />
          </>
        ) : null}

        <InfoCard
          icon={FaSuitcaseRolling}
          label={t('travel.booking.fields.travelClass')}
          value={details.travelClass}
        />

        <InfoCard
          icon={FaSuitcaseRolling}
          label={t('travel.booking.fields.baggage')}
          value={details.baggage}
        />
      </div>

      {passengerTickets.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
            Passenger Ticket Details
          </p>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {passengerTickets.map((passenger, index) => {
              const travelerName =
                passenger.passengerName || getTravelerLabel(booking, passenger.travelerId);

              return (
                <article
                  key={passenger._id || `${travelerName}-${index}`}
                  className="rounded-xl border border-cyan-100 bg-gradient-to-br from-cyan-50/60 via-white to-sky-50/40 p-3"
                >
                  <div className="mb-3 flex items-center gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-sm">
                      <FaUser />
                    </span>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-900">
                        {travelerName || '-'}
                      </p>

                      <p className="text-xs font-bold capitalize text-cyan-700">
                        {getPaxLabel(passenger.paxType)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <InfoCard icon={FaIdCard} label="PNR" value={passenger.pnr} />

                    <InfoCard
                      icon={FaReceipt}
                      label="Ticket Number"
                      value={passenger.ticketNumber}
                    />

                    {details.sameFlightForAll === false && (
                      <>
                        <InfoCard icon={FaPlane} label="Airline" value={passenger.airline} />

                        <InfoCard
                          icon={FaRoute}
                          label="Route"
                          value={renderRoute(passenger.origin, passenger.destination)}
                        />
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : (
        (details.pnr || details.ticketNumber) && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <InfoCard icon={FaIdCard} label={t('travel.booking.fields.pnr')} value={details.pnr} />

            <InfoCard
              icon={FaReceipt}
              label={t('travel.booking.fields.ticketNumber')}
              value={details.ticketNumber}
            />
          </div>
        )
      )}
    </div>
  );
};

const renderVisaDetails = (booking, item) => {
  const details = item.visaDetails || {};

  const travelerVisas = details.travelerVisas || [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <InfoCard
          icon={FaMapMarkerAlt}
          label={t('travel.booking.fields.country')}
          value={details.country}
          tone="cyan"
        />

        <InfoCard
          icon={FaPassport}
          label={t('travel.booking.fields.visaType')}
          value={details.visaType}
          tone="violet"
        />

        <InfoCard
          icon={FaCalendarAlt}
          label={t('travel.booking.fields.duration')}
          value={details.duration}
          tone="emerald"
        />
      </div>

      {travelerVisas.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {travelerVisas.map((visaTraveler, index) => {
            const travelerName =
              visaTraveler.passengerName || getTravelerLabel(booking, visaTraveler.travelerId);

            return (
              <article
                key={visaTraveler._id || `${travelerName}-${index}`}
                className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50/50 via-white to-indigo-50/40 p-3"
              >
                <div className="mb-3 flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white">
                    <FaPassport />
                  </span>

                  <div>
                    <p className="text-sm font-black text-slate-900">{travelerName || '-'}</p>

                    <p className="text-xs font-bold text-violet-700">
                      {getPaxLabel(visaTraveler.paxType)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <InfoCard
                    icon={FaPassport}
                    label="Passport Number"
                    value={visaTraveler.passportNumber}
                  />

                  <InfoCard icon={FaIdCard} label="Reference" value={visaTraveler.reference} />
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <InfoCard
            icon={FaPassport}
            label={t('travel.booking.fields.passportNumber')}
            value={details.passportNumber}
          />

          <InfoCard
            icon={FaIdCard}
            label={t('travel.booking.fields.reference')}
            value={details.reference}
          />
        </div>
      )}
    </div>
  );
};

const renderHotelDetails = (item) => {
  const details = item.hotelDetails || {};

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <InfoCard
          icon={FaHotel}
          label={t('travel.booking.fields.hotel')}
          value={getHotelName(details.hotelId)}
          tone="violet"
        />

        <InfoCard
          icon={FaCalendarAlt}
          label={t('travel.booking.fields.checkIn')}
          value={formatDate(details.checkIn)}
          tone="cyan"
        />

        <InfoCard
          icon={FaCalendarAlt}
          label={t('travel.booking.fields.checkOut')}
          value={formatDate(details.checkOut)}
          tone="cyan"
        />

        <InfoCard
          icon={FaBed}
          label="Total Nights"
          value={details.nights ? `${details.nights} Night(s)` : '-'}
          tone="amber"
        />

        <InfoCard
          icon={FaReceipt}
          label={t('travel.booking.fields.confirmationNumber')}
          value={details.confirmationNumber}
        />
      </div>

      <HotelPricingDetails
        pricing={details}
        currency={item.costCurrency || item.sellingCurrency || 'PKR'}
      />
    </div>
  );
};

const renderUmrahComponent = (component, index) => {
  const type = component.componentType || 'other';

  const totals = calculateComponentSourceTotals(component);

  const currency = component.costCurrency || component.sellingCurrency || 'PKR';

  return (
    <article
      key={component._id || `${type}-${component.label}-${index}`}
      className="overflow-hidden rounded-xl border border-violet-100 bg-white shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-violet-100 bg-gradient-to-r from-violet-50 via-white to-indigo-50 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-xs font-black text-white">
            {index + 1}
          </span>

          <div>
            <p className="text-xs font-black capitalize text-violet-700">
              {t(`travel.booking.componentTypes.${type}`)}
            </p>

            <p className="text-sm font-black text-slate-900">
              {component.label || t(`travel.booking.itemTypes.${type}`)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700">
            Cost: {formatPlainMoney(totals.cost, component.costCurrency || currency)}
          </span>

          <span className="rounded-lg bg-cyan-50 px-2.5 py-1 text-xs font-black text-cyan-700">
            Sale: {formatPlainMoney(totals.selling, component.sellingCurrency || currency)}
          </span>
        </div>
      </div>

      <div className="space-y-4 p-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InfoCard icon={FaUser} label="Vendor" value={getVendorName(component.vendorId)} />

          {type === 'hotel' && (
            <InfoCard
              icon={FaHotel}
              label="Hotel"
              value={getHotelName(component.hotelId)}
              tone="violet"
            />
          )}

          {['service', 'other'].includes(type) && (
            <InfoCard
              icon={FaClipboardList}
              label="Service"
              value={getObjectName(component.serviceId)}
              tone="cyan"
            />
          )}

          <InfoCard
            icon={FaWallet}
            label="Vendor Paid"
            value={formatPlainMoney(component.vendorPaidAmount, component.costCurrency || currency)}
            tone="amber"
          />

          {component.notes && (
            <InfoCard icon={FaStickyNote} label="Notes" value={component.notes} />
          )}
        </div>

        {['air_ticket', 'visit_visa'].includes(type) && (
          <PaxPricingTable rows={component.paxPricing} currency={currency} />
        )}

        {type === 'hotel' && (
          <HotelPricingDetails pricing={component.hotelPricing} currency={currency} />
        )}

        {['transport', 'appointment', 'token', 'insurance', 'service', 'other'].includes(type) && (
          <QuantityPricingDetails pricing={component.quantityPricing} currency={currency} />
        )}
      </div>
    </article>
  );
};

const renderItemSpecificDetails = (booking, item) => {
  if (item.itemType === 'air_ticket') {
    return renderAirTicketDetails(booking, item);
  }

  if (item.itemType === 'visit_visa') {
    return renderVisaDetails(booking, item);
  }

  if (item.itemType === 'hotel') {
    return renderHotelDetails(item);
  }

  if (item.itemType === 'umrah_package') {
    const details = item.umrahDetails || {};
    const pricingSummary = details.pricingSummary || {};
    const plannerInfo = details.plannerInfo || {};
    const baseCurrency = pricingSummary.totals?.baseCurrency || 'PKR';

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <InfoCard
            icon={FaClipboardList}
            label={t('travel.booking.fields.packageMode')}
            value={t(
              `travel.booking.packageModes.${details.packageMode || 'complete_vendor_package'}`
            )}
            tone="violet"
          />

          <InfoCard
            icon={FaSuitcaseRolling}
            label={t('travel.booking.fields.packageName')}
            value={details.packageName}
            tone="cyan"
          />

          <InfoCard
            icon={FaPlaneDeparture}
            label={t('travel.booking.fields.departureDate')}
            value={formatDate(details.departureDate)}
            tone="emerald"
          />

          <InfoCard
            icon={FaCalendarAlt}
            label={t('travel.booking.fields.returnDate')}
            value={formatDate(details.returnDate)}
            tone="emerald"
          />

          <InfoCard
            icon={FaHotel}
            label={t('travel.booking.fields.makkahHotel')}
            value={getHotelName(details.makkahHotelId)}
            tone="violet"
          />

          <InfoCard
            icon={FaHotel}
            label={t('travel.booking.fields.madinahHotel')}
            value={getHotelName(details.madinahHotelId)}
            tone="violet"
          />

          <InfoCard
            icon={FaUsers}
            label="Pax"
            value={pricingSummary.pax || '-'}
            tone="cyan"
          />

          <InfoCard
            icon={FaPlane}
            label="Airline"
            value={pricingSummary.airlineName || item.ticketDetails?.airline || '-'}
            tone="emerald"
          />

          <InfoCard
            icon={FaReceipt}
            label="Package Total"
            value={
              pricingSummary.totals?.SAR
                ? formatPlainMoney(pricingSummary.totals.SAR, 'SAR')
                : formatBookingMoney(item.estimatedSellingBase, baseCurrency)
            }
            tone="amber"
          />

          <InfoCard
            icon={FaReceipt}
            label="Visa Total"
            value={formatPlainMoney(pricingSummary.visaSAR, 'SAR')}
            tone="violet"
          />

          <InfoCard
            icon={FaCalendarAlt}
            label="Duration"
            value={plannerInfo.durationDays ? `${plannerInfo.durationDays} Day(s)` : '-'}
            tone="cyan"
          />

          <InfoCard
            icon={FaBed}
            label="Hotel Nights"
            value={plannerInfo.hotelNights ?? '-'}
            tone="emerald"
          />
        </div>

        {details.packageMode === 'complete_vendor_package' &&
          Array.isArray(item.paxPricing) &&
          item.paxPricing.length > 0 && (
            <PaxPricingTable
              rows={item.paxPricing}
              currency={item.costCurrency || item.sellingCurrency || 'PKR'}
            />
          )}

        {details.packageMode === 'custom_component_package' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <FaRoute className="text-violet-600" />

              <p className="text-sm font-black text-slate-900">Umrah Package Components</p>
            </div>

            {(details.components || []).map(renderUmrahComponent)}

            {(details.components || []).length === 0 && (
              <EmptyState text={t('travel.booking.detail.noComponents')} />
            )}
          </div>
        )}
      </div>
    );
  }

  if (item.itemType === 'transport') {
    const details = item.transportDetails || {};

    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard
          icon={FaMapMarkerAlt}
          label={t('travel.booking.fields.pickup')}
          value={details.pickup}
          tone="cyan"
        />

        <InfoCard
          icon={FaMapMarkerAlt}
          label={t('travel.booking.fields.dropoff')}
          value={details.dropoff}
          tone="violet"
        />

        <InfoCard
          icon={FaCalendarAlt}
          label={t('travel.booking.fields.dateTime')}
          value={formatDateTime(details.dateTime)}
          tone="emerald"
        />

        <InfoCard
          icon={FaRoute}
          label={t('travel.booking.fields.vehicleType')}
          value={details.vehicleType}
        />
      </div>
    );
  }

  if (['appointment', 'token', 'insurance', 'service', 'other'].includes(item.itemType)) {
    return (
      <div className="space-y-3">
        <QuantityPricingDetails
          pricing={item.quantityPricing}
          currency={item.costCurrency || item.sellingCurrency || 'PKR'}
        />

        {item.description && (
          <InfoCard
            icon={FaStickyNote}
            label={t('travel.booking.fields.description')}
            value={item.description}
          />
        )}
      </div>
    );
  }

  return item.description ? (
    <InfoCard
      icon={FaStickyNote}
      label={t('travel.booking.fields.description')}
      value={item.description}
    />
  ) : null;
};

const TravelBookingDetailPage = () => {
  const { id } = useParams();

  const navigate = useNavigate();
  const outletContext = useOutletContext() || {};
  const openTravelReminderCenter = outletContext.openTravelReminderCenter;
  const fetchTravelReminderSummary = outletContext.fetchTravelReminderSummary;

  const [booking, setBooking] = useState(null);
  const [bookingReminders, setBookingReminders] = useState([]);

  const [loading, setLoading] = useState(false);

  const [actionLoading, setActionLoading] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [reminderActionLoading, setReminderActionLoading] = useState(false);

  const [pageError, setPageError] = useState('');

  const [activeTab, setActiveTab] = useState('overview');

  const canEdit = hasPermission('travel.bookings.edit');

  const canCancel = hasPermission('travel.bookings.cancel');

  const loadBooking = useCallback(async () => {
    try {
      setLoading(true);

      setPageError('');

      const [data, reminderState] = await Promise.all([
        fetchTravelBookingById(id),
        fetchTravelBookingReminders(id).catch(() => ({ reminders: [] })),
      ]);

      setBooking(data);
      setBookingReminders(Array.isArray(reminderState?.reminders) ? reminderState.reminders : []);
    } catch (error) {
      console.error('Travel booking detail load failed:', error);

      setPageError(t('travel.booking.detail.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadBooking();
  }, [loadBooking]);

  const refreshBookingReminders = async () => {
    const reminderState = await fetchTravelBookingReminders(id);

    setBookingReminders(Array.isArray(reminderState?.reminders) ? reminderState.reminders : []);
    await fetchTravelReminderSummary?.({ forceRefresh: true });
  };

  const vendors = useMemo(() => {
    const map = new Map();

    (booking?.bookingItems || []).forEach((item) => {
      if (item.vendorId && typeof item.vendorId === 'object') {
        map.set(String(item.vendorId._id), item.vendorId);
      }

      (item.umrahDetails?.components || []).forEach((component) => {
        if (component.vendorId && typeof component.vendorId === 'object') {
          map.set(String(component.vendorId._id), component.vendorId);
        }
      });
    });

    return [...map.values()];
  }, [booking]);

  const handleStatusChange = async (status) => {
    try {
      setActionLoading(true);

      setPageError('');

      const updated = await updateTravelBookingStatus(id, status);

      setBooking(updated);
    } catch (error) {
      console.error('Travel booking status change failed:', error);

      setPageError(error?.response?.data?.message || t('travel.booking.alerts.statusFailed'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm(t('travel.booking.confirm.cancel'))) {
      return;
    }

    try {
      setActionLoading(true);

      setPageError('');

      const updated = await cancelTravelBooking(id);

      setBooking(updated);
    } catch (error) {
      console.error('Travel booking cancel failed:', error);

      setPageError(error?.response?.data?.message || t('travel.booking.alerts.cancelFailed'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleArchive = async () => {
    if (!booking || !canEdit) {
      return;
    }

    const label = booking.invoiceNumber || booking.bookingNumber || t('travel.common.thisRecord');

    const confirmKey = booking.accountingPosted
      ? 'travel.booking.actions.voidConfirm'
      : 'travel.booking.actions.deleteConfirm';

    if (!window.confirm(buildTravelConfirmMessage(confirmKey, label))) {
      return;
    }

    try {
      setActionLoading(true);

      setPageError('');

      await deleteTravelBooking(id, {
        reason: booking.accountingPosted
          ? 'Travel invoice voided by user'
          : 'Travel booking archived by user',
      });

      navigate('/travel/bookings');
    } catch (error) {
      console.error('Travel booking archive failed:', error);

      setPageError(error?.response?.data?.message || t('travel.booking.alerts.deleteFailed'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleSharePdf = async () => {
    if (!booking?._id) {
      return;
    }

    try {
      setShareLoading(true);
      setPageError('');

      const invoiceNumber = booking.invoiceNumber || booking.bookingNumber || booking._id;
      const fileName = `TravelInvoice-${invoiceNumber}.pdf`;

      await sharePdfDocument({
        pdfUrl: getTravelBookingPdfUrl(booking._id),
        token: localStorage.getItem('token'),
        fileName,
        title: fileName,
        text: fileName,
      });
    } catch (error) {
      console.error('Travel booking PDF share failed:', error);

      setPageError(t('pdf.shareFailed'));
    } finally {
      setShareLoading(false);
    }
  };

  const handlePreviewInvoice = () => {
    if (!booking?._id) {
      return;
    }

    openDocumentUrl(getTravelBookingPreviewUrl(booking._id));
  };

  const handlePrintInvoice = () => {
    if (!booking?._id) {
      return;
    }

    openDocumentUrl(getTravelBookingPrintUrl(booking._id));
  };

  const handleDownloadPdf = () => {
    if (!booking?._id) {
      return;
    }

    openDocumentUrl(getTravelBookingPdfUrl(booking._id));
  };

  const handleReminderEmail = async (reminder) => {
    if (!reminder?._id) {
      return;
    }

    try {
      setReminderActionLoading(true);
      setPageError('');

      await sendTravelReminderEmail(reminder._id);
      await refreshBookingReminders();
    } catch (error) {
      console.error('Travel reminder email failed:', error);

      setPageError(error?.response?.data?.message || t('travel.reminders.emailFailed'));
    } finally {
      setReminderActionLoading(false);
    }
  };

  const handleReminderWhatsApp = async (reminder) => {
    if (!reminder?._id) {
      return;
    }

    try {
      setReminderActionLoading(true);
      setPageError('');

      const payload = await fetchTravelReminderWhatsAppMessage(reminder._id, getCurrentLanguage());
      const link = generateWhatsAppLink(payload?.phone, payload?.message);

      if (!link) {
        setPageError(t('travel.reminders.whatsappMissingPhone'));
        return;
      }

      const opened = window.open(link, '_blank');

      if (!opened) {
        setPageError(t('alerts.printWindowBlocked'));
      }
    } catch (error) {
      console.error('Travel reminder WhatsApp failed:', error);

      setPageError(error?.response?.data?.message || t('travel.reminders.whatsappFailed'));
    } finally {
      setReminderActionLoading(false);
    }
  };

  const baseCurrency = booking?.baseCurrency || 'PKR';

  const profit = numberValue(booking?.grossProfit ?? booking?.estimatedProfit);

  const renderOverview = () => (
    <div className="space-y-4">
      <DetailGroup title="Invoice Overview" icon={FaReceipt} tone="cyan">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InfoCard icon={FaReceipt} label="Booking No" value={booking.bookingNumber} tone="cyan" />

          <InfoCard
            icon={FaFileInvoiceDollar}
            label="Invoice No"
            value={booking.invoiceNumber}
            tone="blue"
          />

          <InfoCard
            icon={FaCalendarAlt}
            label="Invoice Date"
            value={formatDate(booking.invoiceDate)}
            tone="violet"
          />

          <InfoCard
            icon={FaCheckCircle}
            label="Status"
            value={<BookingStatusBadge status={booking.status} />}
            tone="emerald"
          />

          <InfoCard
            icon={FaUser}
            label="Customer"
            value={getCustomerName(booking.customerId)}
            tone="cyan"
          />

          <InfoCard
            icon={FaSuitcaseRolling}
            label="Service Type"
            value={t(`travel.booking.serviceTypes.${booking.serviceType || 'mixed'}`)}
            tone="violet"
          />

          <InfoCard
            icon={FaPlaneDeparture}
            label="Travel Start"
            value={formatDate(booking.travelStartDate)}
          />

          <InfoCard
            icon={FaCalendarCheck}
            label="Travel End"
            value={formatDate(booking.travelEndDate)}
          />
        </div>
      </DetailGroup>

      <DetailGroup title="Record Information" icon={FaHistory} tone="violet">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <InfoCard
            icon={FaCalendarAlt}
            label="Created"
            value={formatDateTime(booking.createdAt)}
          />

          <InfoCard
            icon={FaCalendarAlt}
            label="Last Updated"
            value={formatDateTime(booking.updatedAt)}
          />
        </div>
      </DetailGroup>
    </div>
  );

  const renderTravelers = () => {
    const travelerRows = booking.travelers || [];

    return (
      <DetailGroup title="Travelers" icon={FaUsers} tone="cyan">
        {travelerRows.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {travelerRows.map((traveler, index) => (
              <article
                key={getRecordId(traveler) || index}
                className="overflow-hidden rounded-xl border border-cyan-100 bg-gradient-to-br from-cyan-50/50 via-white to-sky-50/40 shadow-sm"
              >
                <div className="flex items-center gap-3 border-b border-cyan-100 p-3">
                  <span className="inline-flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-lg text-white shadow-sm">
                    <FaUser />
                  </span>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-900">
                      {getTravelerName(traveler)}
                    </p>

                    <p className="text-xs font-bold text-cyan-700">Traveler #{index + 1}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2">
                  <InfoCard icon={FaPassport} label="Passport" value={traveler.passportNumber} />

                  <InfoCard icon={FaUser} label="Mobile" value={traveler.mobile} />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState text={t('travel.booking.detail.noTravelers')} />
        )}
      </DetailGroup>
    );
  };

  const renderServices = () => (
    <div className="space-y-4">
      {(booking.bookingItems || []).map((item, index) => {
        const currency = item.costCurrency || item.sellingCurrency || baseCurrency;

        let itemTotals = {
          cost: numberValue(item.costPrice),
          selling: numberValue(item.sellingPrice),
        };

        if (
          ['air_ticket', 'visit_visa'].includes(item.itemType) &&
          Array.isArray(item.paxPricing) &&
          item.paxPricing.length > 0
        ) {
          itemTotals = calculatePaxSourceTotals(item.paxPricing);
        }

        if (
          item.itemType === 'umrah_package' &&
          item.umrahDetails?.packageMode === 'complete_vendor_package' &&
          Array.isArray(item.paxPricing) &&
          item.paxPricing.length > 0
        ) {
          itemTotals = calculatePaxSourceTotals(item.paxPricing);
        }

        if (
          item.itemType === 'hotel' &&
          Array.isArray(item.hotelDetails?.roomPricing) &&
          item.hotelDetails.roomPricing.length > 0
        ) {
          itemTotals = calculateHotelSourceTotals({
            roomPricing: item.hotelDetails.roomPricing,

            nights: item.hotelDetails.nights,

            chargePerRoom: item.hotelDetails.chargePerRoom === true,
          });
        }

        if (
          ['transport', 'appointment', 'token', 'insurance', 'service', 'other'].includes(
            item.itemType
          ) &&
          item.quantityPricing
        ) {
          itemTotals = calculateQuantitySourceTotals(item.quantityPricing);
        }

        if (
          item.itemType === 'umrah_package' &&
          item.umrahDetails?.packageMode === 'custom_component_package'
        ) {
          itemTotals = (item.umrahDetails?.components || []).reduce(
            (totals, component) => {
              const componentTotals = calculateComponentSourceTotals(component);

              totals.cost += componentTotals.cost;

              totals.selling += componentTotals.selling;

              return totals;
            },
            {
              cost: 0,
              selling: 0,
            }
          );
        }

        return (
          <section key={item._id || index} className={sectionClass}>
            <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-cyan-50/60 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-sm font-black text-white shadow-sm">
                    {index + 1}
                  </span>

                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-wide text-cyan-600">
                      {t(`travel.booking.itemTypes.${item.itemType}`)}
                    </p>

                    <h2 className="truncate text-base font-black text-slate-950">
                      {item.title ||
                        getObjectName(
                          item.serviceId,
                          t(`travel.booking.itemTypes.${item.itemType}`)
                        )}
                    </h2>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700">
                    Cost: {formatPlainMoney(itemTotals.cost, item.costCurrency || currency)}
                  </span>

                  <span className="rounded-lg border border-cyan-100 bg-cyan-50 px-3 py-1.5 text-xs font-black text-cyan-700">
                    Sale: {formatPlainMoney(itemTotals.selling, item.sellingCurrency || currency)}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-4 p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <InfoCard
                  icon={FaClipboardList}
                  label="Service"
                  value={getObjectName(item.serviceId)}
                  tone="cyan"
                />

                <InfoCard
                  icon={FaUser}
                  label="Vendor"
                  value={getVendorName(item.vendorId)}
                  tone="violet"
                />

                <InfoCard
                  icon={FaUsers}
                  label="Travelers"
                  value={getItemTravelers(booking, item)}
                  tone="emerald"
                />

                <InfoCard
                  icon={FaWallet}
                  label="Vendor Paid"
                  value={formatPlainMoney(item.vendorPaidAmount, item.costCurrency || currency)}
                  tone="amber"
                />
              </div>

              {['air_ticket', 'visit_visa'].includes(item.itemType) &&
                Array.isArray(item.paxPricing) &&
                item.paxPricing.length > 0 && (
                  <PaxPricingTable rows={item.paxPricing} currency={currency} />
                )}

              {renderItemSpecificDetails(booking, item)}
            </div>
          </section>
        );
      })}

      {(booking.bookingItems || []).length === 0 && <EmptyState text="No services found." />}
    </div>
  );

  const renderPricing = () => (
    <div className="space-y-4">
      <DetailGroup title="Invoice Financials" icon={FaFileInvoiceDollar} tone="emerald">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <FinancialCard
            icon={FaFileInvoiceDollar}
            label="Gross Sale"
            value={formatBookingMoney(booking.sellingTotal, baseCurrency)}
            tone="cyan"
          />

          <FinancialCard
            icon={FaCoins}
            label="Discount"
            value={formatBookingMoney(booking.discountAmount, baseCurrency)}
            tone="violet"
          />

          <FinancialCard
            icon={FaFileInvoiceDollar}
            label="Net Sale"
            value={formatBookingMoney(booking.netSale, baseCurrency)}
            tone="blue"
          />

          <FinancialCard
            icon={FaWallet}
            label="Received"
            value={formatBookingMoney(booking.receivedAmount, baseCurrency)}
            tone="emerald"
          />

          <FinancialCard
            icon={FaWallet}
            label="Customer Due"
            value={formatBookingMoney(booking.customerDue, baseCurrency)}
            tone="rose"
          />

          <FinancialCard
            icon={FaCoins}
            label="Estimated Cost"
            value={formatBookingMoney(booking.costTotal, baseCurrency)}
            tone="amber"
          />

          <FinancialCard
            icon={FaMoneyBillWave}
            label="Vendor Paid"
            value={formatBookingMoney(booking.vendorPaidTotal, baseCurrency)}
            tone="amber"
          />

          <FinancialCard
            icon={FaUser}
            label="Vendor Payable"
            value={formatBookingMoney(booking.vendorPayable, baseCurrency)}
            tone="orange"
          />

          <FinancialCard
            icon={FaFileInvoiceDollar}
            label="Profit"
            value={formatBookingMoney(profit, baseCurrency)}
            tone={profit >= 0 ? 'emerald' : 'rose'}
          />

          <FinancialCard
            icon={FaUndo}
            label="Refunded"
            value={formatBookingMoney(booking.refundedAmount, baseCurrency)}
            tone="rose"
          />
        </div>
      </DetailGroup>

      <DetailGroup
        title={t('travel.booking.fields.currencyBreakdown')}
        icon={FaCoins}
        tone="violet"
      >
        {(booking.currencyBreakdown || []).length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {(booking.currencyBreakdown || []).map((row) => (
              <article
                key={row.currency}
                className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50/50 via-white to-indigo-50/40 p-3"
              >
                <p className="text-sm font-black text-violet-700">{row.currency}</p>

                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-slate-500">Sale</span>

                    <span className="font-black text-cyan-700">
                      {formatBookingMoney(row.sellingTotal, row.currency)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-slate-500">Cost</span>

                    <span className="font-black text-slate-800">
                      {formatBookingMoney(row.costTotal, row.currency)}
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState text="No currency breakdown available." />
        )}
      </DetailGroup>
    </div>
  );

  const renderVendors = () => (
    <DetailGroup title="Vendors" icon={FaUser} tone="violet">
      {vendors.length ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {vendors.map((vendor) => (
            <article
              key={vendor._id}
              className="overflow-hidden rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50/50 via-white to-indigo-50/40 shadow-sm"
            >
              <div className="flex items-center gap-3 border-b border-violet-100 p-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white">
                  <FaUser />
                </span>

                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-900">
                    {getVendorName(vendor)}
                  </p>

                  <p className="text-xs font-bold text-violet-700">
                    {vendor.travelVendorType
                      ? t(`travel.vendorTypes.${vendor.travelVendorType}`)
                      : 'Vendor'}
                  </p>
                </div>
              </div>

              <div className="p-3">
                <InfoCard icon={FaUser} label="Phone" value={vendor.phone} />
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState text={t('travel.booking.detail.noVendors')} />
      )}
    </DetailGroup>
  );

  const renderNotes = () => (
    <DetailGroup title="Notes" icon={FaStickyNote} tone="amber">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-4">
          <p className="text-xs font-black uppercase tracking-wide text-amber-700">Notes</p>

          <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-700">
            {booking.notes || t('travel.booking.detail.noNotes')}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <p className="text-xs font-black uppercase tracking-wide text-slate-600">
            Internal Notes
          </p>

          <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-700">
            {booking.internalNotes || t('travel.booking.detail.noNotes')}
          </p>
        </div>
      </div>
    </DetailGroup>
  );

  const renderHistory = () => (
    <DetailGroup title="Status History" icon={FaHistory} tone="violet">
      {(booking.statusHistory || []).length ? (
        <div className="relative space-y-3">
          {(booking.statusHistory || []).map((row, index) => (
            <div
              key={`${row.status}-${row.changedAt}-${index}`}
              className="relative rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-3 pl-12"
            >
              <span className="absolute left-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                <FaHistory className="text-xs" />
              </span>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <BookingStatusBadge status={row.status} />

                <span className="text-xs font-bold text-slate-500">
                  {formatDateTime(row.changedAt)}
                </span>
              </div>

              {row.note && <p className="mt-2 text-sm font-semibold text-slate-700">{row.note}</p>}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState text={t('travel.booking.detail.noHistory')} />
      )}
    </DetailGroup>
  );

  const renderAttachments = () => (
    <DetailGroup title="Attachments" icon={FaPaperclip} tone="cyan">
      {(booking.attachments || []).length ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(booking.attachments || []).map((attachment, index) => (
            <a
              key={attachment.key || attachment.url || index}
              href={attachment.url}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center gap-3 rounded-xl border border-cyan-100 bg-gradient-to-br from-cyan-50/60 to-white p-3 transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-cyan-600 text-white">
                <FaPaperclip />
              </span>

              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-800 group-hover:text-cyan-700">
                  {attachment.originalName || attachment.key || 'Attachment'}
                </p>

                <p className="mt-0.5 text-xs font-bold text-slate-400">Open attachment</p>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <EmptyState text={t('travel.booking.empty.attachments')} />
      )}
    </DetailGroup>
  );

  const renderActiveTab = () => {
    if (!booking) {
      return null;
    }

    if (activeTab === 'travelers') {
      return renderTravelers();
    }

    if (activeTab === 'services') {
      return renderServices();
    }

    if (activeTab === 'pricing') {
      return renderPricing();
    }

    if (activeTab === 'vendors') {
      return renderVendors();
    }

    if (activeTab === 'notes') {
      return renderNotes();
    }

    if (activeTab === 'attachments') {
      return renderAttachments();
    }

    if (activeTab === 'history') {
      return renderHistory();
    }

    return renderOverview();
  };

  return (
    <TravelMasterPageFrame titleKey="" actions={null}>
      {pageError && (
        <div className="mb-3 rounded-xl border border-rose-200 bg-gradient-to-r from-rose-50 to-red-50 px-4 py-3 text-sm font-bold text-rose-700">
          {pageError}
        </div>
      )}

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-12 text-center text-sm font-bold text-slate-500">
          {t('travel.common.loading')}
        </div>
      )}

      {!loading && !booking && !pageError && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-12 text-center text-sm font-bold text-slate-500">
          {t('travel.booking.detail.notFound')}
        </div>
      )}

      {booking && (
        <div className="space-y-4">
          <section className="overflow-hidden rounded-2xl border border-cyan-100 bg-white shadow-sm">
            <div className="h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-emerald-500" />

            <div className="p-4">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="inline-flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-xl text-white shadow-lg shadow-cyan-100">
                    <FaFileInvoiceDollar />
                  </span>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="truncate text-xl font-black text-slate-950 sm:text-2xl">
                        {booking.invoiceNumber || booking.bookingNumber}
                      </h1>

                      <BookingStatusBadge status={booking.status} />
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-bold text-slate-500">
                      <span className="inline-flex items-center gap-1.5">
                        <FaUser className="text-cyan-600" />

                        {getCustomerName(booking.customerId)}
                      </span>

                      <span className="inline-flex items-center gap-1.5">
                        <FaSuitcaseRolling className="text-violet-600" />

                        {t(`travel.booking.serviceTypes.${booking.serviceType || 'mixed'}`)}
                      </span>

                      <span className="inline-flex items-center gap-1.5">
                        <FaCalendarAlt className="text-emerald-600" />

                        {formatDate(booking.invoiceDate)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    onClick={() => navigate('/travel/bookings')}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-xs text-slate-600 shadow-sm transition hover:bg-slate-50 sm:h-9 sm:w-9 sm:text-sm"
                    title={t('travel.booking.actions.backToList')}
                  >
                    <FaArrowLeft />
                  </button>

                  <button
                    type="button"
                    disabled={shareLoading}
                    onClick={handlePreviewInvoice}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-xs text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 sm:h-9 sm:w-9 sm:text-sm"
                    title={t('common.preview')}
                    aria-label={t('common.preview')}
                  >
                    <FaEye />
                  </button>

                  <button
                    type="button"
                    disabled={shareLoading}
                    onClick={handlePrintInvoice}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-xs text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 sm:h-9 sm:w-9 sm:text-sm"
                    title={t('common.print')}
                    aria-label={t('common.print')}
                  >
                    <FaPrint />
                  </button>

                  <button
                    type="button"
                    disabled={shareLoading}
                    onClick={handleDownloadPdf}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-amber-100 bg-amber-50 text-xs text-amber-700 shadow-sm transition hover:bg-amber-100 disabled:opacity-50 sm:h-9 sm:w-9 sm:text-sm"
                    title={t('pdf.download')}
                    aria-label={t('pdf.download')}
                  >
                    <FaFilePdf />
                  </button>

                  <button
                    type="button"
                    disabled={shareLoading}
                    onClick={handleSharePdf}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 text-xs text-emerald-700 shadow-sm transition hover:bg-emerald-100 disabled:opacity-50 sm:h-9 sm:w-9 sm:text-sm"
                    title={t('pdf.share')}
                    aria-label={t('pdf.share')}
                  >
                    <FaShareAlt />
                  </button>

                  {canEdit && booking.status !== 'cancelled' && (
                    <button
                      type="button"
                      onClick={() => navigate(`/travel/bookings/${id}/edit`)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-cyan-100 bg-cyan-50 text-xs text-cyan-700 shadow-sm transition hover:bg-cyan-100 sm:h-9 sm:w-9 sm:text-sm"
                      title={t('travel.booking.actions.edit')}
                    >
                      <FaEdit />
                    </button>
                  )}

                  {booking.accountingPosted && (
                    <button
                      type="button"
                      onClick={() => navigate(`/travel/refunds/new?invoiceId=${id}`)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 text-xs text-emerald-700 shadow-sm transition hover:bg-emerald-100 sm:h-9 sm:w-9 sm:text-sm"
                      title={t('travel.refund.actions.new')}
                    >
                      <FaUndo />
                    </button>
                  )}

                  {canEdit && booking.status !== 'cancelled' && (
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={handleArchive}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-rose-100 bg-rose-50 text-xs text-rose-600 shadow-sm transition hover:bg-rose-100 disabled:opacity-50 sm:h-9 sm:w-9 sm:text-sm"
                      title={t('travel.common.delete')}
                    >
                      <FaTrash />
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
                <FinancialCard
                  icon={FaFileInvoiceDollar}
                  label="Net Sale"
                  value={formatBookingMoney(booking.netSale, baseCurrency)}
                  tone="cyan"
                />

                <FinancialCard
                  icon={FaWallet}
                  label="Received"
                  value={formatBookingMoney(booking.receivedAmount, baseCurrency)}
                  tone="emerald"
                />

                <FinancialCard
                  icon={FaWallet}
                  label="Due"
                  value={formatBookingMoney(booking.customerDue, baseCurrency)}
                  tone="rose"
                />

                <FinancialCard
                  icon={FaCoins}
                  label="Cost"
                  value={formatBookingMoney(booking.costTotal, baseCurrency)}
                  tone="amber"
                />

                <FinancialCard
                  icon={FaMoneyBillWave}
                  label="Vendor Paid"
                  value={formatBookingMoney(booking.vendorPaidTotal, baseCurrency)}
                  tone="amber"
                />

                <FinancialCard
                  icon={FaUser}
                  label="Vendor Due"
                  value={formatBookingMoney(booking.vendorPayable, baseCurrency)}
                  tone="orange"
                />

                <FinancialCard
                  icon={FaCoins}
                  label="Profit"
                  value={formatBookingMoney(profit, baseCurrency)}
                  tone={profit >= 0 ? 'emerald' : 'rose'}
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {canEdit && booking.status === 'draft' && (
                  <TravelActionButton
                    icon={FaClipboardList}
                    variant="soft"
                    disabled={actionLoading}
                    onClick={() => handleStatusChange('quotation')}
                  >
                    {t('travel.booking.actions.saveQuotation')}
                  </TravelActionButton>
                )}

                {canEdit && ['draft', 'quotation'].includes(booking.status) && (
                  <TravelActionButton
                    icon={FaCheckCircle}
                    variant="success"
                    disabled={actionLoading}
                    onClick={() => handleStatusChange('confirmed')}
                  >
                    {t('travel.booking.actions.confirm')}
                  </TravelActionButton>
                )}

                {canEdit && booking.status === 'confirmed' && (
                  <TravelActionButton
                    icon={FaPlaneDeparture}
                    variant="soft"
                    disabled={actionLoading}
                    onClick={() => handleStatusChange('processing')}
                  >
                    {t('travel.booking.actions.markProcessing')}
                  </TravelActionButton>
                )}

                {canEdit && ['confirmed', 'processing'].includes(booking.status) && (
                  <TravelActionButton
                    icon={FaCalendarCheck}
                    variant="success"
                    disabled={actionLoading}
                    onClick={() => handleStatusChange('completed')}
                  >
                    {t('travel.booking.actions.markCompleted')}
                  </TravelActionButton>
                )}

                {canCancel && booking.status !== 'cancelled' && (
                  <TravelActionButton
                    icon={FaTimesCircle}
                    variant="danger"
                    disabled={actionLoading}
                    onClick={handleCancel}
                  >
                    {t('travel.booking.actions.cancelBooking')}
                  </TravelActionButton>
                )}
              </div>
            </div>
          </section>

          <TravelReminderStatusPanel
            bookingId={booking._id}
            reminders={bookingReminders}
            onOpenCenter={openTravelReminderCenter}
            onSendEmail={reminderActionLoading ? null : handleReminderEmail}
            onSendWhatsApp={reminderActionLoading ? null : handleReminderWhatsApp}
          />

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
            <div className="flex min-w-max gap-1">
              {tabConfig.map((tab) => {
                const Icon = tab.icon;

                const active = activeTab === tab.key;

                return (
                  <button
                    type="button"
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`inline-flex h-10 items-center gap-2 rounded-xl px-3 text-xs font-black transition ${
                      active
                        ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Icon aria-hidden="true" />

                    <span>{t(tab.labelKey)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {renderActiveTab()}
        </div>
      )}
    </TravelMasterPageFrame>
  );
};

export default TravelBookingDetailPage;
