const WalletTransaction = require('../models/WalletTransaction');
const GeneralSettings = require('../models/GeneralSettings');
const User = require('../models/User');
const Notification = require('../models/Notification');
const walletApiService = require('./walletApiService');

class WalletTransferService {
  constructor() {
    this.walletTransactionModel = new WalletTransaction();
    this.generalSettingsModel = new GeneralSettings();
    this.userModel = new User();
    this.notificationModel = new Notification();
  }

  /**
   * Transfer commission to influencer's wallet
   * @param {Object} params - Transfer parameters
   * @param {string} params.customerId - Customer who made the purchase
   * @param {number} params.commissionAmount - Commission amount to transfer
   * @param {string} params.saleId - Sale transaction ID
   * @param {Object} params.metadata - Additional metadata
   */
  async transferCommissionToInfluencer(params) {
    try {
      console.log(`🔄 Starting commission transfer process...`);
      console.log(`   Customer ID: ${params.customerId}`);
      console.log(`   Commission Amount: ${params.commissionAmount} AOA`);
      console.log(`   Sale ID: ${params.saleId}`);

      // 1. Check if admin wallet is configured and ready
      const adminWalletReady = await this.generalSettingsModel.isAdminWalletReady();
      if (!adminWalletReady) {
        throw new Error('Admin wallet not configured or not ready for transfers');
      }

      // 2. Find the influencer for this customer
      const influencer = await this.userModel.findInfluencerByCustomer(params.customerId);
      if (!influencer) {
        console.log(`ℹ️ No verified influencer found for customer ${params.customerId}`);
        return {
          success: false,
          message: 'No verified influencer found for this customer',
          transfer_skipped: true
        };
      }

      console.log(`✅ Found influencer: ${influencer.username} (${influencer._id})`);
      console.log(`   Wallet: ${influencer.wallet.wallet_number} (${influencer.wallet.wallet_provider})`);

      // 3. Get admin wallet configuration
      const adminWalletConfig = await this.generalSettingsModel.getAdminWalletConfig();

      // 4. Validate transfer amount
      if (params.commissionAmount < adminWalletConfig.min_transfer_amount) {
        console.log(`⚠️ Commission amount ${params.commissionAmount} below minimum transfer amount ${adminWalletConfig.min_transfer_amount}`);
        return {
          success: false,
          message: `Commission amount below minimum transfer threshold (${adminWalletConfig.min_transfer_amount} AOA)`,
          transfer_skipped: true
        };
      }

      if (params.commissionAmount > adminWalletConfig.max_transfer_amount) {
        throw new Error(`Commission amount exceeds maximum transfer limit (${adminWalletConfig.max_transfer_amount} AOA)`);
      }

      // 5. Create wallet transaction record
      const transactionData = {
        sender_user_id: null, // Admin/system transfer
        recipient_user_id: influencer._id,
        amount: params.commissionAmount,
        fees: 0, // Will be calculated by the API provider
        currency: 'AOA',
        transaction_type: 'commission_transfer',
        status: 'pending',
        provider: {
          wallet_provider: adminWalletConfig.wallet_provider,
          api_provider: 'external_api' // Will be configured with actual provider
        },
        recipient_wallet: {
          wallet_number: influencer.wallet.wallet_number,
          wallet_provider: influencer.wallet.wallet_provider
        },
        metadata: {
          source_transaction_id: params.saleId,
          commission_amount: params.commissionAmount,
          notes: `Automatic commission transfer for sale ${params.saleId}`,
          ...params.metadata
        }
      };

      const walletTransaction = await this.walletTransactionModel.createTransaction(transactionData);
      console.log(`✅ Created wallet transaction: ${walletTransaction.transaction_id}`);

      // 6. Process the transfer
      const transferResult = await this.processTransfer(walletTransaction, adminWalletConfig);

      if (transferResult.success) {
        // 7. Update transaction status to completed
        await this.walletTransactionModel.updateTransactionStatus(
          walletTransaction._id,
          'completed',
          {
            transaction_reference: transferResult.transaction_reference,
            external_transaction_id: transferResult.external_transaction_id
          }
        );

        // 8. Update influencer's wallet balance
        await this.userModel.updateById(influencer._id, {
          'wallet.wallet_balance': (influencer.wallet.wallet_balance || 0) + params.commissionAmount
        });

        // 9. Create notification for influencer
        await this.createTransferNotification(influencer._id, {
          type: 'success',
          amount: params.commissionAmount,
          transaction_id: walletTransaction.transaction_id
        });

        console.log(`✅ Commission transfer completed successfully`);
        console.log(`   Transaction ID: ${transferResult.external_transaction_id}`);
        console.log(`   Reference: ${transferResult.transaction_reference}`);

        return {
          success: true,
          message: 'Commission transferred successfully',
          transaction_id: walletTransaction.transaction_id,
          external_transaction_id: transferResult.external_transaction_id,
          transaction_reference: transferResult.transaction_reference
        };
      } else {
        // Transfer failed
        await this.walletTransactionModel.updateTransactionStatus(
          walletTransaction._id,
          'failed',
          {
            failure_reason: transferResult.error_message,
            retry_count: 0
          }
        );

        // Create failure notification for admin
        await this.createAdminFailureNotification({
          influencer_id: influencer._id,
          amount: params.commissionAmount,
          error: transferResult.error_message,
          transaction_id: walletTransaction.transaction_id
        });

        throw new Error(`Transfer failed: ${transferResult.error_message}`);
      }

    } catch (error) {
      console.error(`❌ Commission transfer failed:`, error);
      
      // Create admin notification for failure
      await this.createAdminFailureNotification({
        influencer_id: params.customerId,
        amount: params.commissionAmount,
        error: error.message,
        transaction_id: null
      });

      throw error;
    }
  }

  /**
   * Process the actual wallet transfer using external API
   * @param {Object} walletTransaction - Wallet transaction record
   * @param {Object} adminWalletConfig - Admin wallet configuration
   */
  async processTransfer(walletTransaction, adminWalletConfig) {
    try {
      console.log(`🔄 Processing transfer via ${adminWalletConfig.wallet_provider}...`);

      // Initialize the API service with admin wallet configuration
      walletApiService.initialize({
        wallet_number: adminWalletConfig.wallet_number, // PayPay member/account number (e.g. 200003078207)
        api_key: adminWalletConfig.api_key,
        api_secret: adminWalletConfig.api_secret,
        rsa_private_key: adminWalletConfig.rsa_private_key,
        rsa_public_key: adminWalletConfig.rsa_public_key,
        sale_product_code: adminWalletConfig.sale_product_code,
        provider: adminWalletConfig.wallet_provider,
        base_url: adminWalletConfig.base_url
      });

      // Prepare transfer data
      const transferData = {
        from_wallet: adminWalletConfig.wallet_number,
        to_wallet: walletTransaction.recipient_wallet.wallet_number,
        amount: walletTransaction.amount,
        currency: walletTransaction.currency,
        transaction_id: walletTransaction.transaction_id,
        description: `Commission transfer - ${walletTransaction.transaction_id}`
      };

      // Execute the transfer
      const transferResult = await walletApiService.transferFunds(transferData);

      return transferResult;
    } catch (error) {
      console.error(`❌ Transfer processing failed:`, error);
      return {
        success: false,
        error_message: error.message
      };
    }
  }


  /**
   * Create notification for successful transfer
   * @param {string} userId - User ID to notify
   * @param {Object} transferData - Transfer details
   */
  async createTransferNotification(userId, transferData) {
    try {
      const notificationData = {
        title: 'Commission Received',
        message: `${transferData.amount} AOA has been transferred to your wallet. Transaction ID: ${transferData.transaction_id}`,
        type: 'success',
        category: 'billing',
        priority: 'normal',
        recipients: [{
          user: userId,
          delivery_status: 'delivered'
        }],
        created_by: userId,
        created_at: new Date()
      };

      await this.notificationModel.create(notificationData);
      console.log(`✅ Transfer notification sent to user ${userId}`);
    } catch (error) {
      console.error(`❌ Failed to create transfer notification:`, error);
    }
  }

  /**
   * Create notification for admin about transfer failure
   * @param {Object} failureData - Failure details
   */
  async createAdminFailureNotification(failureData) {
    try {
      // Find admin users
      const adminUsers = await this.userModel.findByRole('admin');
      
      if (adminUsers.length > 0) {
        const notificationData = {
          title: 'Wallet Transfer Failed',
          message: `Failed to transfer ${failureData.amount} AOA commission. Error: ${failureData.error}`,
          type: 'error',
          category: 'billing',
          priority: 'high',
          recipients: adminUsers.map(admin => ({
            user: admin._id,
            delivery_status: 'delivered'
          })),
          created_by: adminUsers[0]._id,
          created_at: new Date()
        };

        await this.notificationModel.create(notificationData);
        console.log(`✅ Admin failure notification sent`);
      }
    } catch (error) {
      console.error(`❌ Failed to create admin failure notification:`, error);
    }
  }

  /**
   * Retry failed transactions
   */
  async retryFailedTransactions() {
    try {
      console.log(`🔄 Checking for failed transactions to retry...`);
      
      const failedTransactions = await this.walletTransactionModel.getFailedTransactionsForRetry();
      
      if (failedTransactions.length === 0) {
        console.log(`ℹ️ No failed transactions found for retry`);
        return { retried: 0, successful: 0 };
      }

      console.log(`📋 Found ${failedTransactions.length} transactions to retry`);
      
      let successful = 0;
      let failed = 0;

      for (const transaction of failedTransactions) {
        try {
          const adminWalletConfig = await this.generalSettingsModel.getAdminWalletConfig();
          const result = await this.processTransfer(transaction, adminWalletConfig);

          if (result.success) {
            await this.walletTransactionModel.updateTransactionStatus(
              transaction._id,
              'completed',
              {
                transaction_reference: result.transaction_reference,
                external_transaction_id: result.external_transaction_id
              }
            );
            successful++;
            console.log(`✅ Retry successful for transaction ${transaction.transaction_id}`);
          } else {
            await this.walletTransactionModel.updateTransactionStatus(
              transaction._id,
              'failed',
              {
                failure_reason: result.error_message,
                retry_count: transaction.retry_count + 1
              }
            );
            failed++;
            console.log(`❌ Retry failed for transaction ${transaction.transaction_id}`);
          }
        } catch (error) {
          console.error(`❌ Retry error for transaction ${transaction.transaction_id}:`, error);
          failed++;
        }
      }

      console.log(`📊 Retry results: ${successful} successful, ${failed} failed`);
      return { retried: failedTransactions.length, successful, failed };
    } catch (error) {
      console.error(`❌ Failed to retry transactions:`, error);
      throw error;
    }
  }

  /**
   * Get transfer statistics
   * @param {Object} options - Query options
   */
  async getTransferStats(options = {}) {
    try {
      return await this.walletTransactionModel.getTransactionStats(options);
    } catch (error) {
      console.error(`❌ Failed to get transfer stats:`, error);
      throw error;
    }
  }

  /**
   * Get transactions requiring attention
   */
  async getTransactionsRequiringAttention() {
    try {
      return await this.walletTransactionModel.getTransactionsRequiringAttention();
    } catch (error) {
      console.error(`❌ Failed to get transactions requiring attention:`, error);
      throw error;
    }
  }
}

module.exports = new WalletTransferService();
