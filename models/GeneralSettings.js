const BaseModel = require('./BaseModel');
const GeneralSettingsSchema = require('../schemas/GeneralSettings');

class GeneralSettings extends BaseModel {
  constructor() {
    super(GeneralSettingsSchema);
  }

  // Get current active settings
  async getCurrentSettings() {
    try {
      return await GeneralSettingsSchema.getCurrentSettings();
    } catch (error) {
      console.error('Error in getCurrentSettings:', error);
      throw error;
    }
  }

  // Update settings
  async updateSettings(updateData) {
    try {
      return await GeneralSettingsSchema.updateSettings(updateData);
    } catch (error) {
      console.error('Error in updateSettings:', error);
      throw error;
    }
  }

  // Update admin wallet configuration
  async updateAdminWallet(walletData) {
    try {
      const updateData = {
        'admin_wallet.wallet_number': walletData.wallet_number?.trim(),
        'admin_wallet.wallet_provider': walletData.wallet_provider,
        'admin_wallet.wallet_verified': walletData.wallet_verified || false,
        'admin_wallet.api_key': walletData.api_key?.trim(),
        'admin_wallet.api_secret': walletData.api_secret?.trim(),
        'admin_wallet.webhook_url': walletData.webhook_url?.trim(),
        'admin_wallet.min_transfer_amount': walletData.min_transfer_amount || 10,
        'admin_wallet.max_transfer_amount': walletData.max_transfer_amount || 10000,
        'admin_wallet.transfer_enabled': walletData.transfer_enabled || false
      };
      if (walletData.rsa_private_key !== undefined) updateData['admin_wallet.rsa_private_key'] = walletData.rsa_private_key || null;
      if (walletData.rsa_public_key !== undefined) updateData['admin_wallet.rsa_public_key'] = walletData.rsa_public_key || null;
      if (walletData.sale_product_code !== undefined) updateData['admin_wallet.sale_product_code'] = walletData.sale_product_code?.trim() || null;
      if (walletData.base_url !== undefined) updateData['admin_wallet.base_url'] = walletData.base_url?.trim() || null;

      return await GeneralSettingsSchema.updateSettings(updateData);
    } catch (error) {
      console.error('Error updating admin wallet:', error);
      throw error;
    }
  }

  // Get admin wallet configuration
  async getAdminWalletConfig() {
    try {
      const settings = await this.getCurrentSettings();
      return settings.admin_wallet || {
        wallet_number: null,
        wallet_provider: 'mobile_money',
        wallet_verified: false,
        wallet_balance: 0,
        api_key: null,
        api_secret: null,
        rsa_private_key: null,
        rsa_public_key: null,
        webhook_url: null,
        min_transfer_amount: 10,
        max_transfer_amount: 10000,
        transfer_enabled: false
      };
    } catch (error) {
      console.error('Error getting admin wallet config:', error);
      throw error;
    }
  }

  // Verify admin wallet
  async verifyAdminWallet(verified = true) {
    try {
      const updateData = {
        'admin_wallet.wallet_verified': verified
      };

      return await GeneralSettingsSchema.updateSettings(updateData);
    } catch (error) {
      console.error('Error verifying admin wallet:', error);
      throw error;
    }
  }

  // Update admin wallet balance
  async updateAdminWalletBalance(balance) {
    try {
      const updateData = {
        'admin_wallet.wallet_balance': balance
      };

      return await GeneralSettingsSchema.updateSettings(updateData);
    } catch (error) {
      console.error('Error updating admin wallet balance:', error);
      throw error;
    }
  }

  // Check if admin wallet is configured and ready
  async isAdminWalletReady() {
    try {
      const walletConfig = await this.getAdminWalletConfig();
      return walletConfig.wallet_number &&
             walletConfig.rsa_private_key &&
             walletConfig.wallet_verified &&
             walletConfig.transfer_enabled;
    } catch (error) {
      console.error('Error checking admin wallet readiness:', error);
      return false;
    }
  }
}

module.exports = GeneralSettings;