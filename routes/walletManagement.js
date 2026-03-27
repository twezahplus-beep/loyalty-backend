const express = require('express');
const { body, validationResult } = require('express-validator');
const { User, GeneralSettings } = require('../models');
const { verifyToken, requireManager, requireAdmin } = require('../middleware/auth');
const walletTransferService = require('../services/walletTransferService');
const walletApiService = require('../services/walletApiService');

const router = express.Router();

// @route   PUT /api/wallet/user/:userId
// @desc    Update user wallet information
// @access  Private (Manager+)
router.put('/user/:userId', [
  verifyToken,
  requireManager,
  body('wallet_number').optional().isString().trim().withMessage('Wallet number must be a valid string'),
  body('wallet_provider').optional().isIn(['paypay']).withMessage('Invalid wallet provider - only PayPay is supported')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { userId } = req.params;
    const { wallet_number, wallet_provider } = req.body;

    const userModel = new User();

    // Check if user exists
    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Validate wallet number if provided
    if (wallet_number && wallet_provider) {
      const validation = await userModel.validateWalletNumber(wallet_number, wallet_provider);
      if (validation.normalizedNumber) {
        // Update the form data with normalized number
        wallet_number = validation.normalizedNumber;
      }
    }

    // Update wallet information
    const updatedUser = await userModel.updateWallet(userId, {
      wallet_number,
      wallet_provider,
      wallet_verified: false // Reset verification when wallet is updated
    });

    res.json({
      success: true,
      message: 'Wallet information updated successfully',
      data: {
        user_id: userId,
        wallet: updatedUser.wallet
      }
    });
  } catch (error) {
    console.error('Update wallet error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// @route   PUT /api/wallet/user/:userId/verify
// @desc    Verify user wallet
// @access  Private (Admin)
router.put('/user/:userId/verify', [
  verifyToken,
  requireAdmin,
  body('verified').isBoolean().withMessage('Verified must be a boolean value')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { userId } = req.params;
    const { verified } = req.body;

    const userModel = new User();

    // Check if user exists
    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (!user.wallet?.wallet_number) {
      return res.status(400).json({
        success: false,
        error: 'User has no wallet number to verify'
      });
    }

    // Update wallet verification status
    const updatedUser = await userModel.verifyWallet(userId, verified);

    res.json({
      success: true,
      message: `Wallet ${verified ? 'verified' : 'unverified'} successfully`,
      data: {
        user_id: userId,
        wallet: updatedUser.wallet
      }
    });
  } catch (error) {
    console.error('Verify wallet error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// @route   GET /api/wallet/admin/config
// @desc    Get admin wallet configuration
// @access  Private (Admin)
router.get('/admin/config', [verifyToken, requireAdmin], async (req, res) => {
  try {
    const generalSettingsModel = new GeneralSettings();
    const adminWalletConfig = await generalSettingsModel.getAdminWalletConfig();
    const safe = { ...adminWalletConfig };
    delete safe.rsa_private_key;

    res.json({
      success: true,
      data: {
        admin_wallet: safe,
        is_ready: await generalSettingsModel.isAdminWalletReady()
      }
    });
  } catch (error) {
    console.error('Get admin wallet config error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get admin wallet configuration'
    });
  }
});

// @route   GET /api/wallet-management/admin/test-connection
// @desc    Check PayPay connection only (no payment). Uses trade_query to verify config/signing; no funds moved.
// @access  Private (Admin)
router.get('/admin/test-connection', [verifyToken, requireAdmin], async (req, res) => {
  try {
    const generalSettingsModel = new GeneralSettings();
    const adminWalletConfig = await generalSettingsModel.getAdminWalletConfig();

    if (!adminWalletConfig?.wallet_number?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Save your PayPay member number first, then test the connection.',
        data: { mode: 'none', connected: false }
      });
    }

    walletApiService.initialize({
      wallet_number: adminWalletConfig.wallet_number,
      api_key: adminWalletConfig.api_key,
      api_secret: adminWalletConfig.api_secret,
      rsa_private_key: adminWalletConfig.rsa_private_key,
      rsa_public_key: adminWalletConfig.rsa_public_key,
      sale_product_code: adminWalletConfig.sale_product_code,
      base_url: adminWalletConfig.base_url
    });

    const isSimulation = walletApiService.simulationMode;

    let message;
    let connected = true;
    if (isSimulation) {
      message = 'Configuration saved. Running in simulation mode — add your RSA private key to connect to PayPay for real.';
    } else {
      const result = await walletApiService.testConnection();
      message = result.message;
      connected = result.connected !== undefined ? result.connected : result.success;
    }

    // Auto-verify wallet on successful connection
    if (connected) {
      await generalSettingsModel.verifyAdminWallet(true);
      console.log('✅ Admin wallet auto-verified after successful connection test');
    }

    res.json({
      success: true,
      data: {
        mode: isSimulation ? 'simulation' : 'live',
        connected,
        message,
        balance: null,
        currency: 'AOA',
        connectionCheckOnly: true,
        wallet_verified: connected
      }
    });
  } catch (error) {
    console.error('Test PayPay connection error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      data: { mode: 'unknown', connected: false }
    });
  }
});

// @route   PUT /api/wallet/admin/config
// @desc    Update admin wallet configuration
// @access  Private (Admin)
router.put('/admin/config', [
  verifyToken,
  requireAdmin,
  body('wallet_number').optional().isString().trim().withMessage('Wallet number must be a valid string'),
  body('wallet_provider').optional().isIn(['paypay']).withMessage('Invalid wallet provider - only PayPay is supported'),
  body('api_key').optional().isString().trim().withMessage('API key must be a valid string'),
  body('api_secret').optional().isString().trim().withMessage('API secret must be a valid string'),
  body('rsa_private_key').optional().isString().withMessage('RSA private key must be a string'),
  body('rsa_public_key').optional().isString().withMessage('RSA public key must be a string'),
  body('sale_product_code').optional().isString().trim().withMessage('Sale product code must be a string'),
  body('base_url').optional().isURL().withMessage('Gateway URL must be a valid URL'),
  body('webhook_url').optional().isURL().withMessage('Webhook URL must be a valid URL'),
  body('min_transfer_amount').optional().isFloat({ min: 0 }).withMessage('Minimum transfer amount must be a positive number'),
  body('max_transfer_amount').optional().isFloat({ min: 0 }).withMessage('Maximum transfer amount must be a positive number'),
  body('transfer_enabled').optional().isBoolean().withMessage('Transfer enabled must be a boolean value')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    let {
      wallet_number,
      wallet_provider,
      api_key,
      api_secret,
      rsa_private_key,
      rsa_public_key,
      sale_product_code,
      base_url,
      webhook_url,
      min_transfer_amount,
      max_transfer_amount,
      transfer_enabled
    } = req.body;

    const generalSettingsModel = new GeneralSettings();

    // Validate wallet number if provided
    if (wallet_number && wallet_provider) {
      const userModel = new User();
      const validation = await userModel.validateWalletNumber(wallet_number, wallet_provider);
      if (validation.normalizedNumber) {
        wallet_number = validation.normalizedNumber;
      }
    }

    // Update admin wallet configuration (RSA keys are for company↔PayPay only; influencers never enter them)
    const updatedSettings = await generalSettingsModel.updateAdminWallet({
      wallet_number,
      wallet_provider,
      api_key,
      api_secret,
      rsa_private_key,
      rsa_public_key,
      sale_product_code,
      base_url,
      webhook_url,
      min_transfer_amount,
      max_transfer_amount,
      transfer_enabled
    });

    res.json({
      success: true,
      message: 'Admin wallet configuration updated successfully',
      data: {
        admin_wallet: updatedSettings.admin_wallet,
        is_ready: await generalSettingsModel.isAdminWalletReady()
      }
    });
  } catch (error) {
    console.error('Update admin wallet config error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// @route   PUT /api/wallet/admin/verify
// @desc    Verify admin wallet
// @access  Private (Admin)
router.put('/admin/verify', [
  verifyToken,
  requireAdmin,
  body('verified').isBoolean().withMessage('Verified must be a boolean value')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { verified } = req.body;

    const generalSettingsModel = new GeneralSettings();

    // Update admin wallet verification status
    await generalSettingsModel.verifyAdminWallet(verified);

    const adminWalletConfig = await generalSettingsModel.getAdminWalletConfig();

    res.json({
      success: true,
      message: `Admin wallet ${verified ? 'verified' : 'unverified'} successfully`,
      data: {
        admin_wallet: adminWalletConfig,
        is_ready: await generalSettingsModel.isAdminWalletReady()
      }
    });
  } catch (error) {
    console.error('Verify admin wallet error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// @route   GET /api/wallet/transactions
// @desc    Get wallet transactions
// @access  Private (Manager+)
router.get('/transactions', [
  verifyToken,
  requireManager
], async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    
    const transactionStats = await walletTransferService.getTransactionStats();
    const transactionsRequiringAttention = await walletTransferService.getTransactionsRequiringAttention();

    res.json({
      success: true,
      data: {
        stats: transactionStats,
        transactions_requiring_attention: transactionsRequiringAttention,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get wallet transactions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get wallet transactions'
    });
  }
});

// @route   POST /api/wallet/retry-failed
// @desc    Retry failed wallet transactions
// @access  Private (Admin)
router.post('/retry-failed', [verifyToken, requireAdmin], async (req, res) => {
  try {
    const result = await walletTransferService.retryFailedTransactions();

    res.json({
      success: true,
      message: 'Failed transactions retry completed',
      data: result
    });
  } catch (error) {
    console.error('Retry failed transactions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retry transactions'
    });
  }
});

// @route   GET /api/wallet/users/verified
// @desc    Get users with verified wallets
// @access  Private (Manager+)
router.get('/users/verified', [verifyToken, requireManager], async (req, res) => {
  try {
    const userModel = new User();
    const usersWithWallets = await userModel.getUsersWithWallets();

    res.json({
      success: true,
      data: {
        users: usersWithWallets.map(user => ({
          id: user._id,
          username: user.username,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          phone: user.phone,
          role: user.role,
          wallet: user.wallet
        })),
        count: usersWithWallets.length
      }
    });
  } catch (error) {
    console.error('Get verified wallet users error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get users with verified wallets'
    });
  }
});

module.exports = router;
