const mongoose = require("mongoose");

const {
  DEFAULT_TRAVEL_CURRENCY,
  SUPPORTED_TRAVEL_CURRENCY_CODES,
} = require("../config/travelConfig");

const TRAVEL_BOOKING_STATUSES = Object.freeze([
  "draft",
  "quotation",
  "confirmed",
  "processing",
  "completed",
  "cancelled",
]);

const TRAVEL_BOOKING_SERVICE_TYPES = Object.freeze([
  "air_ticket",
  "visit_visa",
  "hotel",
  "umrah_package",
  "transport",
  "appointment",
  "token",
  "insurance",
  "mixed",
]);

const TRAVEL_BOOKING_ITEM_TYPES = Object.freeze([
  "air_ticket",
  "visit_visa",
  "hotel",
  "umrah_package",
  "transport",
  "appointment",
  "token",
  "insurance",
  "service",
  "other",
]);

const JOURNEY_TYPES = Object.freeze(["one_way", "round_trip", "multi_city"]);

const UMRAH_PACKAGE_MODES = Object.freeze([
  "complete_vendor_package",
  "custom_component_package",
]);

const PAX_TYPES = Object.freeze(["adult", "child", "infant"]);

const HOTEL_ROOM_TYPES = Object.freeze([
  "single",
  "double",
  "twin",
  "triple",
  "quad",
  "quint",
  "5_sharing",
  "6_sharing",
  "7_sharing",
  "8_sharing",
  "family",
  "sharing",
  "custom",
]);

const UMRAH_COMPONENT_TYPES = Object.freeze([
  "air_ticket",
  "visit_visa",
  "hotel",
  "transport",
  "appointment",
  "token",
  "insurance",
  "service",
  "other",
]);

const currencyField = {
  type: String,
  trim: true,
  uppercase: true,
  enum: SUPPORTED_TRAVEL_CURRENCY_CODES,
  default: DEFAULT_TRAVEL_CURRENCY,
};

const amountField = {
  type: Number,
  min: 0,
  default: 0,
};

const nonNegativeIntegerField = {
  type: Number,
  min: 0,
  default: 0,
};

const paxPricingRowSchema = new mongoose.Schema(
  {
    paxType: {
      type: String,
      enum: PAX_TYPES,
      required: true,
    },

    count: {
      type: Number,
      min: 0,
      default: 0,
    },

    costPrice: amountField,

    sellingPrice: amountField,
  },
  {
    _id: false,
  },
);

const quantityPricingSchema = new mongoose.Schema(
  {
    quantity: {
      type: Number,
      min: 0,
      default: 0,
    },

    unitLabel: {
      type: String,
      trim: true,
      default: "",
    },

    costPrice: amountField,

    sellingPrice: amountField,
  },
  {
    _id: false,
  },
);

const hotelRoomPricingRowSchema = new mongoose.Schema(
  {
    roomType: {
      type: String,
      trim: true,
      default: "",
    },

    customRoomType: {
      type: String,
      trim: true,
      default: "",
    },

    occupancy: {
      type: Number,
      min: 0,
      default: 0,
    },

    quantity: {
      type: Number,
      min: 0,
      default: 0,
    },

    costPrice: amountField,

    sellingPrice: amountField,
  },
  {
    _id: false,
  },
);

const ticketPassengerSchema = new mongoose.Schema(
  {
    travelerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Traveler",
      default: null,
    },

    paxType: {
      type: String,
      enum: PAX_TYPES,
      default: "adult",
    },

    passengerName: {
      type: String,
      trim: true,
      default: "",
    },

    airline: {
      type: String,
      trim: true,
      default: "",
    },

    airlineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TravelAirline",
      default: null,
    },

    origin: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },

    destination: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },

    originAirportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TravelAirport",
      default: null,
    },

    destinationAirportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TravelAirport",
      default: null,
    },

    departureDateTime: {
      type: Date,
      default: null,
    },

    returnOrigin: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },

    returnDestination: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },

    returnOriginAirportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TravelAirport",
      default: null,
    },

    returnDestinationAirportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TravelAirport",
      default: null,
    },

    returnDateTime: {
      type: Date,
      default: null,
    },

    pnr: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },

    ticketNumber: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },

    travelClass: {
      type: String,
      trim: true,
      default: "",
    },

    baggage: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    _id: true,
  },
);

const visaTravelerSchema = new mongoose.Schema(
  {
    travelerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Traveler",
      default: null,
    },

    paxType: {
      type: String,
      enum: PAX_TYPES,
      default: "adult",
    },

    passengerName: {
      type: String,
      trim: true,
      default: "",
    },

    passportNumber: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },

    reference: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    _id: true,
  },
);

const umrahHotelPricingSchema = new mongoose.Schema(
  {
    city: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },

    checkIn: {
      type: Date,
      default: null,
    },

    checkOut: {
      type: Date,
      default: null,
    },

    nights: {
      type: Number,
      min: 0,
      default: 0,
    },

    normalNights: nonNegativeIntegerField,

    weekendNights: nonNegativeIntegerField,

    normalRate: amountField,

    weekendRate: amountField,

    normalSubtotal: amountField,

    weekendSubtotal: amountField,

    costSubtotal: amountField,

    sellingSubtotal: amountField,

    markWeekend: {
      type: Boolean,
      default: false,
    },

    usesNightlyBreakdown: {
      type: Boolean,
      default: false,
    },

    chargePerRoom: {
      type: Boolean,
      default: false,
    },

    roomPricing: {
      type: [hotelRoomPricingRowSchema],
      default: [],
    },
  },
  {
    _id: false,
  },
);

const umrahComponentSchema = new mongoose.Schema(
  {
    componentType: {
      type: String,
      enum: UMRAH_COMPONENT_TYPES,
      default: "other",
    },

    label: {
      type: String,
      trim: true,
      default: "",
    },

    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      default: null,
    },

    vendorType: {
      type: String,
      enum: ["vendor", "party"],
      default: "vendor",
    },

    vendorPartyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Party",
      default: null,
    },

    hotelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TravelHotel",
      default: null,
    },

    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TravelService",
      default: null,
    },

    sellingPrice: amountField,

    sellingCurrency: currencyField,

    costPrice: amountField,

    costCurrency: currencyField,

    paxPricing: {
      type: [paxPricingRowSchema],
      default: [],
    },

    quantityPricing: {
      type: quantityPricingSchema,
      default: null,
    },

    hotelPricing: {
      type: umrahHotelPricingSchema,
      default: null,
    },

    estimatedSellingBase: amountField,

    estimatedCostBase: amountField,

    vendorPaidAmount: amountField,

    estimatedVendorPaidBase: amountField,

    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    _id: true,
  },
);

const bookingItemSchema = new mongoose.Schema(
  {
    itemType: {
      type: String,
      enum: TRAVEL_BOOKING_ITEM_TYPES,
      required: true,
      index: true,
    },

    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TravelService",
      default: null,
    },

    travelerIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Traveler",
      },
    ],

    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      default: null,
    },

    vendorType: {
      type: String,
      enum: ["vendor", "party"],
      default: "vendor",
    },

    vendorPartyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Party",
      default: null,
    },

    title: {
      type: String,
      trim: true,
      default: "",
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    sellingPrice: amountField,

    sellingCurrency: currencyField,

    costPrice: amountField,

    costCurrency: currencyField,

    paxPricing: {
      type: [paxPricingRowSchema],
      default: [],
    },

    quantityPricing: {
      type: quantityPricingSchema,
      default: null,
    },

    estimatedSellingBase: amountField,

    estimatedCostBase: amountField,

    vendorPaidAmount: amountField,

    estimatedVendorPaidBase: amountField,

    ticketDetails: {
      journeyType: {
        type: String,
        enum: JOURNEY_TYPES,
        default: "one_way",
      },

      sameFlightForAll: {
        type: Boolean,
        default: true,
      },

      airline: {
        type: String,
        trim: true,
        default: "",
      },

      airlineId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "TravelAirline",
        default: null,
      },

      origin: {
        type: String,
        trim: true,
        uppercase: true,
        default: "",
      },

      destination: {
        type: String,
        trim: true,
        uppercase: true,
        default: "",
      },

      originAirportId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "TravelAirport",
        default: null,
      },

      destinationAirportId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "TravelAirport",
        default: null,
      },

      departureDateTime: {
        type: Date,
        default: null,
      },

      returnOrigin: {
        type: String,
        trim: true,
        uppercase: true,
        default: "",
      },

      returnDestination: {
        type: String,
        trim: true,
        uppercase: true,
        default: "",
      },

      returnOriginAirportId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "TravelAirport",
        default: null,
      },

      returnDestinationAirportId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "TravelAirport",
        default: null,
      },

      returnDateTime: {
        type: Date,
        default: null,
      },

      pnr: {
        type: String,
        trim: true,
        uppercase: true,
        default: "",
      },

      ticketNumber: {
        type: String,
        trim: true,
        uppercase: true,
        default: "",
      },

      travelClass: {
        type: String,
        trim: true,
        default: "",
      },

      baggage: {
        type: String,
        trim: true,
        default: "",
      },

      taxes: amountField,

      passengerTickets: {
        type: [ticketPassengerSchema],
        default: [],
      },
    },

    visaDetails: {
      travelerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Traveler",
        default: null,
      },

      country: {
        type: String,
        trim: true,
        default: "",
      },

      visaType: {
        type: String,
        trim: true,
        default: "",
      },

      duration: {
        type: String,
        trim: true,
        default: "",
      },

      passportNumber: {
        type: String,
        trim: true,
        uppercase: true,
        default: "",
      },

      reference: {
        type: String,
        trim: true,
        default: "",
      },

      governmentFee: amountField,

      serviceFee: amountField,

      travelerVisas: {
        type: [visaTravelerSchema],
        default: [],
      },
    },

    hotelDetails: {
      hotelId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "TravelHotel",
        default: null,
      },

      checkIn: {
        type: Date,
        default: null,
      },

      checkOut: {
        type: Date,
        default: null,
      },

      nights: {
        type: Number,
        min: 0,
        default: 0,
      },

      chargePerRoom: {
        type: Boolean,
        default: false,
      },

      rooms: {
        type: Number,
        min: 0,
        default: 1,
      },

      roomType: {
        type: String,
        trim: true,
        default: "",
      },

      roomPricing: {
        type: [hotelRoomPricingRowSchema],
        default: [],
      },

      adults: {
        type: Number,
        min: 0,
        default: 1,
      },

      children: {
        type: Number,
        min: 0,
        default: 0,
      },

      confirmationNumber: {
        type: String,
        trim: true,
        default: "",
      },
    },

    umrahDetails: {
      packageMode: {
        type: String,
        enum: UMRAH_PACKAGE_MODES,
        default: "complete_vendor_package",
      },

      packageName: {
        type: String,
        trim: true,
        default: "",
      },

      departureDate: {
        type: Date,
        default: null,
      },

      returnDate: {
        type: Date,
        default: null,
      },

      makkahHotelId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "TravelHotel",
        default: null,
      },

      madinahHotelId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "TravelHotel",
        default: null,
      },

      syncPassengerCountsToComponents: {
        type: Boolean,
        default: true,
      },

      components: {
        type: [umrahComponentSchema],
        default: [],
      },

      plannerInfo: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
      },

      pricingSummary: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
      },
    },

    transportDetails: {
      pickup: {
        type: String,
        trim: true,
        default: "",
      },

      dropoff: {
        type: String,
        trim: true,
        default: "",
      },

      dateTime: {
        type: Date,
        default: null,
      },

      vehicleType: {
        type: String,
        trim: true,
        default: "",
      },
    },
  },
  {
    _id: true,
  },
);

const currencyBreakdownSchema = new mongoose.Schema(
  {
    currency: currencyField,

    sellingTotal: amountField,

    costTotal: amountField,
  },
  {
    _id: false,
  },
);

const attachmentSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      trim: true,
      default: "",
    },

    type: {
      type: String,
      trim: true,
      default: "",
    },

    size: {
      type: Number,
      min: 0,
      default: 0,
    },

    originalName: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    _id: false,
  },
);

const reminderSettingsSchema = new mongoose.Schema(
  {
    inheritBusinessDefaults: {
      type: Boolean,
      default: true,
    },

    enabled: {
      type: Boolean,
      default: true,
    },

    leadMinutes: {
      type: Number,
      min: 0,
      default: 24 * 60,
    },

    emailEnabled: {
      type: Boolean,
      default: false,
    },

    whatsappEnabled: {
      type: Boolean,
      default: true,
    },
  },
  {
    _id: false,
  },
);

const statusHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: TRAVEL_BOOKING_STATUSES,
      required: true,
    },

    changedAt: {
      type: Date,
      default: Date.now,
    },

    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    note: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    _id: false,
  },
);

const travelBookingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    bookingNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    status: {
      type: String,
      enum: TRAVEL_BOOKING_STATUSES,
      default: "draft",
      index: true,
    },

    serviceType: {
      type: String,
      enum: TRAVEL_BOOKING_SERVICE_TYPES,
      default: "mixed",
      index: true,
    },

    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
      index: true,
    },

    customerType: {
      type: String,
      enum: ["customer", "party"],
      default: "customer",
    },

    customerPartyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Party",
      default: null,
      index: true,
    },

    travelers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Traveler",
      },
    ],

    bookingItems: {
      type: [bookingItemSchema],
      default: [],
    },

    quotationDate: {
      type: Date,
      default: null,
    },

    confirmedAt: {
      type: Date,
      default: null,
    },

    travelStartDate: {
      type: Date,
      default: null,
      index: true,
    },

    travelEndDate: {
      type: Date,
      default: null,
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },

    internalNotes: {
      type: String,
      trim: true,
      default: "",
    },

    reminderSettings: {
      type: reminderSettingsSchema,
      default: () => ({}),
    },

    invoiceNumber: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },

    invoiceNumberLockedAt: {
      type: Date,
      default: null,
    },

    invoiceDate: {
      type: Date,
      default: null,
    },

    baseCurrency: {
      type: String,
      trim: true,
      uppercase: true,
      enum: SUPPORTED_TRAVEL_CURRENCY_CODES,
      default: DEFAULT_TRAVEL_CURRENCY,
    },

    currencyBreakdown: {
      type: [currencyBreakdownSchema],
      default: [],
    },

    sellingTotal: amountField,

    costTotal: amountField,

    discountAmount: amountField,

    netSale: amountField,

    receivedAmount: amountField,

    customerDue: amountField,

    vendorPaidTotal: amountField,

    vendorPayable: amountField,

    grossProfit: {
      type: Number,
      default: 0,
    },

    refundedAmount: amountField,

    customerRefundedAmount: amountField,

    vendorRecoveredAmount: amountField,

    refundCount: {
      type: Number,
      min: 0,
      default: 0,
    },

    estimatedProfit: {
      type: Number,
      default: 0,
    },

    paymentType: {
      type: String,
      enum: ["cash", "online", "cheque", "credit"],
      default: "credit",
    },

    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      default: null,
    },

    vendorPaymentType: {
      type: String,
      enum: ["cash", "online", "cheque", "credit"],
      default: "credit",
    },

    vendorPaymentAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      default: null,
    },

    vendorPaymentJournalEntryIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "JournalEntry",
      },
    ],

    accountingStatus: {
      type: String,
      enum: ["unposted", "posting", "posted"],
      default: "unposted",
      index: true,
    },

    accountingPosted: {
      type: Boolean,
      default: false,
      index: true,
    },

    accountingPostedAt: {
      type: Date,
      default: null,
    },

    accountingPostedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    journalEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JournalEntry",
      default: null,
    },

    paymentJournalEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JournalEntry",
      default: null,
    },

    vendorCostJournalEntryIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "JournalEntry",
      },
    ],

    attachments: {
      type: [attachmentSchema],
      default: [],
    },

    attachmentUrl: {
      type: String,
      default: "",
    },

    attachmentType: {
      type: String,
      default: "",
    },

    attachmentSize: {
      type: Number,
      min: 0,
      default: 0,
    },

    attachmentOriginalName: {
      type: String,
      trim: true,
      default: "",
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    assignedStaffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },

    deletedAt: {
      type: Date,
      default: null,
    },

    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    deleteReason: {
      type: String,
      trim: true,
      default: "",
    },

    isVoided: {
      type: Boolean,
      default: false,
      index: true,
    },

    voidedAt: {
      type: Date,
      default: null,
    },

    voidedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    voidReason: {
      type: String,
      trim: true,
      default: "",
    },

    reversalJournalEntryIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "JournalEntry",
      },
    ],

    statusHistory: {
      type: [statusHistorySchema],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

travelBookingSchema.index(
  {
    userId: 1,
    bookingNumber: 1,
  },
  {
    unique: true,
  },
);

travelBookingSchema.index({
  userId: 1,
  status: 1,
  updatedAt: -1,
});

travelBookingSchema.index({
  userId: 1,
  serviceType: 1,
  updatedAt: -1,
});

travelBookingSchema.index({
  userId: 1,
  customerId: 1,
  updatedAt: -1,
});

travelBookingSchema.index({
  userId: 1,
  customerPartyId: 1,
  updatedAt: -1,
});

travelBookingSchema.index({
  userId: 1,
  "bookingItems.vendorPartyId": 1,
  updatedAt: -1,
});

travelBookingSchema.index({
  userId: 1,
  "bookingItems.itemType": 1,
});

travelBookingSchema.index({
  userId: 1,
  travelStartDate: 1,
});

travelBookingSchema.index({
  userId: 1,
  isDeleted: 1,
  isActive: 1,
  updatedAt: -1,
});

module.exports = mongoose.model("TravelBooking", travelBookingSchema);

module.exports.TRAVEL_BOOKING_STATUSES = TRAVEL_BOOKING_STATUSES;

module.exports.TRAVEL_BOOKING_SERVICE_TYPES = TRAVEL_BOOKING_SERVICE_TYPES;

module.exports.TRAVEL_BOOKING_ITEM_TYPES = TRAVEL_BOOKING_ITEM_TYPES;

module.exports.JOURNEY_TYPES = JOURNEY_TYPES;

module.exports.UMRAH_PACKAGE_MODES = UMRAH_PACKAGE_MODES;

module.exports.PAX_TYPES = PAX_TYPES;

module.exports.HOTEL_ROOM_TYPES = HOTEL_ROOM_TYPES;

module.exports.UMRAH_COMPONENT_TYPES = UMRAH_COMPONENT_TYPES;
