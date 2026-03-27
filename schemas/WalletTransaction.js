const mongoose = require('mongoose');

const walletTransactionSchema = new mongoose.Schema({
  transaction_id: {
    type: String,
    unique: true,
    trim: true
  },
  sender_user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  recipient_user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  fees: {
    type: Number,
    default: 0,
    min: 0
  },
  net_amount: {
    type: Number,
    min: 0
  },
  currency: {
    type: String,
    required: true,
    default: 'AOA',
    enum: ['AOA', 'USD', 'EUR', 'GBP']
  },
  transaction_type: {
    type: String,
    required: true,
    enum: ['commission_transfer', 'manual_transfer', 'refund', 'bonus'],
    default: 'commission_transfer'
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  provider: {
    wallet_provider: {
      type: String,
      required: true,
      enum: ['paypay', 'mobile_money', 'bank_transfer', 'crypto', 'digital_wallet']
    },
    api_provider: {
      type: String,
      required: true
    }
  },
  recipient_wallet: {
    wallet_number: {
      type: String,
      required: true,
      trim: true
    },
    wallet_provider: {
      type: String,
      required: true,
      enum: ['paypay', 'mobile_money', 'bank_transfer', 'crypto', 'digital_wallet']
    }
  },
  external_transaction_id: {
    type: String,
    trim: true
  },
  transaction_reference: {
    type: String,
    trim: true
  },
  failure_reason: {
    type: String,
    trim: true
  },
  retry_count: {
    type: Number,
    default: 0,
    min: 0
  },
  completed_at: Date,
  failed_at: Date,
  cancelled_at: Date,
  metadata: {
    source_transaction_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sale'
    },
    commission_amount: Number,
    original_commission_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Commission'
    },
    notes: String,
    admin_notes: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
walletTransactionSchema.index({ transaction_id: 1 });
walletTransactionSchema.index({ sender_user_id: 1 });
walletTransactionSchema.index({ recipient_user_id: 1 });
walletTransactionSchema.index({ status: 1 });
walletTransactionSchema.index({ created_at: -1 });
walletTransactionSchema.index({ external_transaction_id: 1 });

// Pre-validate middleware to generate transaction ID and net_amount
walletTransactionSchema.pre('validate', function(next) {
  if (this.isNew && !this.transaction_id) {
    this.transaction_id = this.generateTransactionId();
  }
  if (this.net_amount == null) {
    this.net_amount = this.amount - (this.fees || 0);
  }
  next();
});

// Instance method to generate transaction ID
walletTransactionSchema.methods.generateTransactionId = function() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 5);
  return `WT${timestamp}${random}`.toUpperCase();
};

// Instance method to mark as completed
walletTransactionSchema.methods.markCompleted = function(externalTransactionId, transactionReference) {
  this.status = 'completed';
  this.completed_at = new Date();
  this.external_transaction_id = externalTransactionId;
  this.transaction_reference = transactionReference;
  return this.save();
};

// Instance method to mark as failed
walletTransactionSchema.methods.markFailed = function(reason) {
  this.status = 'failed';
  this.failed_at = new Date();
  this.failure_reason = reason;
  this.retry_count = (this.retry_count || 0) + 1;
  return this.save();
};

// Instance method to cancel transaction
walletTransactionSchema.methods.cancel = function(reason) {
  this.status = 'cancelled';
  this.cancelled_at = new Date();
  this.failure_reason = reason;
  return this.save();
};

// Static method to get transaction by external ID
walletTransactionSchema.statics.findByExternalId = function(externalId) {
  return this.findOne({ external_transaction_id: externalId });
};

// Static method to get transactions by date range
walletTransactionSchema.statics.findByDateRange = function(startDate, endDate, options = {}) {
  const query = {
    created_at: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    }
  };

  if (options.status) {
    query.status = options.status;
  }

  return this.find(query).sort({ created_at: -1 });
};

// Virtual for transaction duration
walletTransactionSchema.virtual('duration').get(function() {
  if (this.completed_at || this.failed_at || this.cancelled_at) {
    const endTime = this.completed_at || this.failed_at || this.cancelled_at;
    return endTime - this.created_at;
  }
  return Date.now() - this.created_at;
});

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
