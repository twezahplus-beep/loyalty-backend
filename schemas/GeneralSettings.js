const mongoose = require('mongoose');

const generalSettingsSchema = new mongoose.Schema({
  app_name: {
    type: String,
    required: true,
    default: 'ÁGUA TWEZAH',
    maxlength: 100
  },
  support_email: {
    type: String,
    required: true,
    default: 'support@aguatwezah.com',
    maxlength: 255
  },
  currency: {
    type: String,
    required: true,
    default: 'AOA',
    enum: ['AOA', 'USD', 'EUR', 'GBP', 'BRL', 'ZAR']
  },
  app_description: {
    type: String,
    required: true,
    default: 'Premium Water Loyalty Program',
    maxlength: 500
  },
  timezone: {
    type: String,
    required: true,
    default: 'Africa/Luanda',
    maxlength: 100
  },
  language: {
    type: String,
    required: true,
    default: 'Portuguese',
    enum: ['Portuguese', 'English', 'Spanish', 'French']
  },
  admin_wallet: {
    wallet_number: {
      type: String,
      trim: true
    },
    wallet_provider: {
      type: String,
      enum: ['paypay', 'mobile_money', 'bank_transfer', 'crypto', 'digital_wallet'],
      default: 'paypay'
    },
    wallet_verified: {
      type: Boolean,
      default: false
    },
    wallet_balance: {
      type: Number,
      default: 0,
      min: 0
    },
    api_key: {
      type: String,
      trim: true
    },
    api_secret: {
      type: String,
      trim: true
    },
    rsa_private_key: {
      type: String,
      trim: true
    },
    rsa_public_key: {
      type: String,
      trim: true
    },
    sale_product_code: {
      type: String,
      trim: true
    },
    base_url: {
      type: String,
      trim: true
    },
    webhook_url: {
      type: String,
      trim: true
    },
    min_transfer_amount: {
      type: Number,
      default: 10,
      min: 0
    },
    max_transfer_amount: {
      type: Number,
      default: 10000,
      min: 0
    },
    transfer_enabled: {
      type: Boolean,
      default: false
    }
  },
  is_active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  collection: 'general_settings'
});

// Ensure only one settings document exists
generalSettingsSchema.index({ is_active: 1 }, { unique: true, partialFilterExpression: { is_active: true } });

// Static method to get current settings
generalSettingsSchema.statics.getCurrentSettings = async function() {
  try {
    let settings = await this.findOne({ is_active: true });
    
    if (!settings) {
      // Create default settings if none exist
      settings = new this({
        app_name: 'ÁGUA TWEZAH',
        support_email: 'support@aguatwezah.com',
        currency: 'AOA',
        app_description: 'Premium Water Loyalty Program',
        timezone: 'Africa/Luanda',
        language: 'Portuguese',
        is_active: true
      });
      await settings.save();
    }
    
    return settings;
  } catch (error) {
    console.error('Error getting current settings:', error);
    throw error;
  }
};

// Static method to update settings (supports dotted keys like admin_wallet.wallet_number)
generalSettingsSchema.statics.updateSettings = async function(updateData) {
  try {
    let settings = await this.findOne({ is_active: true });
    if (!settings) {
      settings = new this({
        app_name: 'ÁGUA TWEZAH',
        support_email: 'support@aguatwezah.com',
        currency: 'AOA',
        app_description: 'Premium Water Loyalty Program',
        timezone: 'Africa/Luanda',
        language: 'Portuguese',
        is_active: true
      });
      await settings.save();
    }
    const result = await this.findOneAndUpdate(
      { is_active: true },
      { $set: updateData },
      { new: true, runValidators: true }
    );
    return result;
  } catch (error) {
    console.error('Error updating settings:', error);
    throw error;
  }
};

module.exports = mongoose.model('GeneralSettings', generalSettingsSchema);