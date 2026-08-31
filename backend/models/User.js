const mongoose = require("mongoose");
const {
  DEFAULT_ENABLED_MODULES,
  DEFAULT_MODULE,
  MODULE_KEYS,
} = require("../utils/moduleConfig");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },

    password: {
      type: String,
      required: true,
    },

    role: {
      type: String,
      enum: ["admin", "staff"],
      default: "staff",
    },

    accountRole: {
      type: String,
      enum: ["owner", "staff"],
      default: "owner",
    },

    businessOwnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    permissions: {
      type: [String],
      default: [],
    },

    staffStatus: {
      type: String,
      enum: ["active", "blocked"],
      default: "active",
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },

    mustChangePassword: {
      type: Boolean,
      default: false,
    },

    createdByOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    fullName: {
      type: String,
      default: "",
    },

    cnic: {
      type: String,
      default: "",
    },

    mobile: {
      type: String,
      default: "",
    },

    address: {
      type: String,
      default: "",
    },

    businessName: {
      type: String,
      default: "",
    },

    businessType: {
      type: String,
      default: "",
    },

    enabledModules: {
      trading: {
        type: Boolean,
        default: DEFAULT_ENABLED_MODULES.trading,
      },
      travel: {
        type: Boolean,
        default: DEFAULT_ENABLED_MODULES.travel,
      },
    },

    defaultModule: {
      type: String,
      enum: Object.values(MODULE_KEYS),
      default: DEFAULT_MODULE,
    },

    currency: {
      type: String,
      default: "",
    },

    taxNumber: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

userSchema.index({
  businessOwnerId: 1,
  accountRole: 1,
  staffStatus: 1,
});

userSchema.index({
  businessOwnerId: 1,
  email: 1,
});

module.exports = mongoose.model("User", userSchema);
