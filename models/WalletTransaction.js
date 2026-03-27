const BaseModel = require('./BaseModel');
const WalletTransactionSchema = require('../schemas/WalletTransaction');

class WalletTransaction extends BaseModel {
  constructor() {
    super(WalletTransactionSchema);
  }

  // Create a new wallet transaction
  async createTransaction(transactionData) {
    try {
      const transaction = new this.model(transactionData);
      await transaction.save();
      return transaction;
    } catch (error) {
      throw new Error(`Failed to create wallet transaction: ${error.message}`);
    }
  }

  // Update transaction status
  async updateTransactionStatus(transactionId, status, details = {}) {
    try {
      const updateData = {
        status,
        updated_at: new Date()
      };

      if (status === 'completed') {
        updateData.completed_at = new Date();
        updateData.transaction_reference = details.transaction_reference;
        updateData.external_transaction_id = details.external_transaction_id;
      } else if (status === 'failed') {
        updateData.failed_at = new Date();
        updateData.failure_reason = details.failure_reason;
        updateData.retry_count = (details.retry_count || 0) + 1;
      }

      return await this.updateById(transactionId, updateData);
    } catch (error) {
      throw new Error(`Failed to update transaction status: ${error.message}`);
    }
  }

  // Get transactions by user
  async getTransactionsByUser(userId, options = {}) {
    try {
      const { status, limit = 50, offset = 0 } = options;
      const query = { recipient_user_id: userId };
      
      if (status) {
        query.status = status;
      }

      return await this.find(query, {
        sort: { created_at: -1 },
        limit: parseInt(limit),
        skip: parseInt(offset)
      });
    } catch (error) {
      throw new Error(`Failed to get user transactions: ${error.message}`);
    }
  }

  // Get pending transactions
  async getPendingTransactions() {
    try {
      return await this.find({ status: 'pending' }, {
        sort: { created_at: 1 }
      });
    } catch (error) {
      throw new Error(`Failed to get pending transactions: ${error.message}`);
    }
  }

  // Get failed transactions that can be retried
  async getFailedTransactionsForRetry() {
    try {
      return await this.find({
        status: 'failed',
        retry_count: { $lt: 3 }, // Max 3 retries
        created_at: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
      }, {
        sort: { created_at: 1 }
      });
    } catch (error) {
      throw new Error(`Failed to get retry transactions: ${error.message}`);
    }
  }

  // Get transaction statistics
  async getTransactionStats(options = {}) {
    try {
      const { start_date, end_date } = options;
      const matchQuery = {};

      if (start_date || end_date) {
        matchQuery.created_at = {};
        if (start_date) matchQuery.created_at.$gte = new Date(start_date);
        if (end_date) matchQuery.created_at.$lte = new Date(end_date);
      }

      const stats = await this.model.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: null,
            total_transactions: { $sum: 1 },
            total_amount: { $sum: '$amount' },
            total_fees: { $sum: '$fees' },
            completed_transactions: { 
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } 
            },
            pending_transactions: { 
              $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } 
            },
            failed_transactions: { 
              $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } 
            },
            total_completed_amount: {
              $sum: { 
                $cond: [{ $eq: ['$status', 'completed'] }, '$amount', 0] 
              }
            },
            average_transaction_amount: { $avg: '$amount' }
          }
        }
      ]);

      return stats[0] || {
        total_transactions: 0,
        total_amount: 0,
        total_fees: 0,
        completed_transactions: 0,
        pending_transactions: 0,
        failed_transactions: 0,
        total_completed_amount: 0,
        average_transaction_amount: 0
      };
    } catch (error) {
      throw new Error(`Failed to get transaction stats: ${error.message}`);
    }
  }

  // Get transactions by status
  async getTransactionsByStatus(status, options = {}) {
    try {
      const { limit = 50, offset = 0 } = options;
      
      return await this.find({ status }, {
        sort: { created_at: -1 },
        limit: parseInt(limit),
        skip: parseInt(offset)
      });
    } catch (error) {
      throw new Error(`Failed to get transactions by status: ${error.message}`);
    }
  }

  // Get transactions requiring attention (failed or pending too long)
  async getTransactionsRequiringAttention() {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      return await this.find({
        $or: [
          { status: 'failed' },
          { 
            status: 'pending', 
            created_at: { $lt: oneHourAgo }
          }
        ]
      }, {
        sort: { created_at: -1 }
      });
    } catch (error) {
      throw new Error(`Failed to get transactions requiring attention: ${error.message}`);
    }
  }
}

module.exports = WalletTransaction;
