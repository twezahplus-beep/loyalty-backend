/**
 * PayPay Wallet API Service
 * This service handles integration with PayPay API for wallet transfers
 * Supports both simulation mode and real PayPay API integration
 * Per PayPay AO API doc: encrypt biz_content with partner private key (RSA),
 * sign sorted params with SHA1withRSA, POST JSON to gateway.
 */

const crypto = require('crypto');
const https = require('https');
const { URL } = require('url');

class PayPayWalletApiService {
  constructor() {
    this.partnerId = null;
    this.apiKey = null;
    this.apiSecret = null;
    this.baseUrl = 'https://gateway.paypayafrica.com/gateway/recv.do';
    this.simulationMode = true;
    this.rsaPrivateKey = null;
    this.rsaPublicKey = null;
    this.saleProductCode = null;
  }

  /**
   * Initialize the PayPay API service with credentials
   * @param {Object} config - PayPay API configuration
   */
  initialize(config) {
    this.partnerId = config.wallet_number; // PayPay merchant number
    this.apiKey = config.api_key;
    this.apiSecret = config.api_secret;
    this.rsaPrivateKey = config.rsa_private_key; // RSA private key for signing
    this.rsaPublicKey = config.rsa_public_key; // RSA public key for verification
    this.saleProductCode = config.sale_product_code || null;
    if (config.base_url) this.baseUrl = config.base_url;
    this.simulationMode = !this.partnerId || !this.rsaPrivateKey;
    
    console.log(`🔧 PayPay Wallet API Service initialized:`, {
      partnerId: this.partnerId,
      baseUrl: this.baseUrl,
      simulationMode: this.simulationMode,
      hasCredentials: !!(this.partnerId && this.apiKey && this.apiSecret),
      hasRsaKeys: !!(this.rsaPrivateKey && this.rsaPublicKey)
    });
  }

  /**
   * Transfer funds from admin wallet to user wallet using PayPay API
   * @param {Object} transferData - Transfer details
   * @returns {Promise<Object>} Transfer result
   */
  async transferFunds(transferData) {
    try {
      console.log(`🔄 Processing PayPay wallet transfer:`, {
        from: transferData.from_wallet,
        to: transferData.to_wallet,
        amount: transferData.amount,
        currency: transferData.currency || 'AOA'
      });

      if (this.simulationMode) {
        return await this.simulatePayPayTransfer(transferData);
      } else {
        return await this.executePayPayTransfer(transferData);
      }
    } catch (error) {
      console.error(`❌ PayPay transfer failed:`, error);
      return {
        success: false,
        error_message: error.message,
        external_transaction_id: null,
        transaction_reference: null,
        fees: 0
      };
    }
  }

  /**
   * Simulate PayPay wallet transfer (for testing/development)
   * @param {Object} transferData - Transfer details
   * @returns {Promise<Object>} Simulated transfer result
   */
  async simulatePayPayTransfer(transferData) {
    console.log(`🎭 Simulating PayPay wallet transfer...`);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Simulate 95% success rate
    const isSuccess = Math.random() > 0.05;
    
    if (isSuccess) {
      const externalTransactionId = `PAYPAY_SIM_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const transactionReference = `PAYPAY_REF_${transferData.transaction_id || Date.now()}`;
      
      console.log(`✅ Simulated PayPay transfer successful`);
      console.log(`   External ID: ${externalTransactionId}`);
      console.log(`   Reference: ${transactionReference}`);

      return {
        success: true,
        external_transaction_id: externalTransactionId,
        transaction_reference: transactionReference,
        fees: this.calculatePayPayFees(transferData.amount),
        processing_time_ms: 2000,
        paypay_trade_no: `101${Date.now()}${Math.random().toString().substr(2, 6)}`
      };
    } else {
      const errorMessages = [
        'Insufficient funds in PayPay account',
        'Invalid PayPay member ID',
        'PayPay API timeout',
        'PayPay API rate limit exceeded',
        'Invalid PayPay credentials',
        'PayPay account not verified'
      ];
      
      const errorMessage = errorMessages[Math.floor(Math.random() * errorMessages.length)];
      
      console.log(`❌ Simulated PayPay transfer failed: ${errorMessage}`);

      return {
        success: false,
        error_message: errorMessage,
        external_transaction_id: null,
        transaction_reference: null,
        fees: 0,
        paypay_error_code: `F${Math.floor(Math.random() * 1000)}`
      };
    }
  }

  /**
   * Execute real PayPay wallet transfer via API
   * @param {Object} transferData - Transfer details
   * @returns {Promise<Object>} Real transfer result
   */
  async executePayPayTransfer(transferData) {
    console.log(`🚀 Executing real PayPay wallet transfer via API...`);
    
    try {
      // PayPay API requires specific request format
      const requestPayload = this.buildPayPayRequest(transferData);
      
      console.log(`📡 Sending PayPay API request:`, {
        service: 'transfer_to_account',
        partner_id: this.partnerId,
        amount: transferData.amount,
        currency: transferData.currency || 'AOA'
      });

      const response = await this.makePayPayApiRequest(requestPayload);

      if (response.code === 'S0001') {
        return {
          success: true,
          external_transaction_id: response.biz_content.trade_no,
          transaction_reference: transferData.transaction_id,
          fees: this.calculatePayPayFees(transferData.amount),
          processing_time_ms: response.processing_time || 0,
          paypay_trade_no: response.biz_content.trade_no,
          paypay_status: response.biz_content.status
        };
      } else {
        return {
          success: false,
          error_message: response.msg || 'PayPay transfer failed',
          external_transaction_id: null,
          transaction_reference: null,
          fees: 0,
          paypay_error_code: response.code,
          paypay_sub_code: response.sub_code
        };
      }
    } catch (error) {
      console.error(`❌ PayPay API error:`, error);
      return {
        success: false,
        error_message: `PayPay API Error: ${error.message}`,
        external_transaction_id: null,
        transaction_reference: null,
        fees: 0
      };
    }
  }

  /**
   * Return current timestamp in PayPay format (yyyy-MM-dd HH:mm:ss) at GMT+1 (Angola/PayPay server zone).
   * PayPay rejects requests whose timestamp differs by more than 10 minutes from their server (GMT+1).
   */
  _getTimestamp() {
    const now = new Date(Date.now() + 60 * 60 * 1000); // UTC + 1h = GMT+1
    return now.toISOString().replace('T', ' ').substring(0, 19);
  }

  /**
   * Ensure private key is in PEM format (PayPay: 1024-bit RSA)
   */
  _getPrivateKeyPem(keyValue) {
    if (!keyValue || !keyValue.trim()) return null;
    const k = keyValue.trim();
    if (k.includes('BEGIN')) return k;
    const lines = k.match(/.{1,64}/g) || [k];
    return `-----BEGIN RSA PRIVATE KEY-----\n${lines.join('\n')}\n-----END RSA PRIVATE KEY-----`;
  }

  /**
   * Encrypt biz_content per PayPay doc 2.3: partner's RSA private key, RSA algorithm.
   * Uses segmented RSA (same as PayPay's Java SDK): splits plaintext into (keyBytes-11) byte
   * chunks, encrypts each with PKCS1 padding, concatenates cipher bytes, returns base64.
   * This handles 1024-bit keys (max 117 bytes/chunk) and larger keys automatically.
   */
  _encryptBizContent(bizContent) {
    const pem = this._getPrivateKeyPem(this.rsaPrivateKey);
    if (!pem) throw new Error('RSA private key required for encryption');
    const jsonStr = typeof bizContent === 'string' ? bizContent : JSON.stringify(bizContent);
    const buf = Buffer.from(jsonStr, 'utf8');

    // Detect key size to compute per-chunk plaintext capacity
    let keyBytes = 128; // default: 1024-bit
    try {
      const keyObj = crypto.createPrivateKey(pem);
      const modulusBits = keyObj.asymmetricKeyDetails?.modulusLength;
      if (modulusBits) keyBytes = Math.ceil(modulusBits / 8);
    } catch (_) { /* keep default */ }
    const chunkSize = keyBytes - 11; // PKCS1 v1.5 overhead

    const chunks = [];
    for (let i = 0; i < buf.length; i += chunkSize) {
      chunks.push(
        crypto.privateEncrypt(
          { key: pem, padding: crypto.constants.RSA_PKCS1_PADDING },
          buf.slice(i, i + chunkSize)
        )
      );
    }
    return Buffer.concat(chunks).toString('base64');
  }

  /**
   * Build sign string per PayPay doc 2.4: sort params by ASCII, concatenate key=value pairs.
   * Guide says to build sign string from raw (non-URL-encoded) param values, then URL-encode
   * the whole JSON for submission. Exclude sign and sign_type. Sign with SHA1withRSA.
   */
  _signRequest(params) {
    const pem = this._getPrivateKeyPem(this.rsaPrivateKey);
    if (!pem) throw new Error('RSA private key required for signature');
    const keys = Object.keys(params).filter(k => k !== 'sign' && k !== 'sign_type').sort();
    const pairs = keys.map(k => `${k}=${String(params[k])}`);
    const signString = pairs.join('&');
    console.log(`🔏 Sign string (${signString.length} chars): ${signString.substring(0, 200)}...`);
    const sign = crypto.createSign('RSA-SHA1');
    sign.update(signString);
    sign.end();
    return sign.sign(pem, 'base64');
  }

  /**
   * Per doc 3.1.1: "every value needs to be processed by URL Encoder" before submitting.
   * Returns JSON string with each value URL-encoded.
   */
  _encodeRequestParams(params) {
    const encoded = {};
    for (const k of Object.keys(params)) {
      encoded[k] = encodeURIComponent(String(params[k]));
    }
    return encoded;
  }

  /**
   * Build PayPay API request payload
   * @param {Object} transferData - Transfer details
   * @returns {Object} PayPay API request payload
   */
  buildPayPayRequest(transferData) {
    const timestamp = this._getTimestamp();
    const requestNo = `REQ_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    
    const bizContent = {
      out_trade_no: transferData.transaction_id,
      payer_identity_type: "1", // Member ID type
      payer_identity: this.partnerId,
      payee_identity_type: transferData.to_wallet_identity_type || "1",
      payee_identity: transferData.to_wallet,
      aging: "R", // Real-time transfer
      transfer_amount: parseFloat(transferData.amount).toFixed(2),
      currency: transferData.currency || "AOA",
      sale_product_code: this.saleProductCode || "XXXXXXXXX",
      memo: transferData.description || `Commission transfer - ${transferData.transaction_id}`
    };

    return {
      charset: "UTF-8",
      partner_id: this.partnerId,
      service: "transfer_to_account",
      request_no: requestNo,
      format: "JSON",
      language: "en",
      sign_type: "RSA",
      version: "1.0",
      timestamp: timestamp,
      biz_content: bizContent
    };
  }

  /**
   * Check whether PayPay is correctly connected using current config — no actual transfer is made.
   * Uses transfer_to_account with the partner's own ID as payee (same-party transfer).
   * PayPay will reject with a business error (e.g. F41179 same-party) but that confirms signing works.
   * Without RSA key: cannot call PayPay; return a config-only result.
   */
  async testConnection() {
    if (!this.rsaPrivateKey || !this.rsaPrivateKey.trim()) {
      return {
        success: false,
        code: 'CONFIG_PARTIAL',
        message: 'Configuration saved. To test the live connection, add your Company RSA private key. ' +
          'That is the private key from the RSA pair you generate; you upload the public key to PayPay and keep the private key here. ' +
          'PayPay requires it to sign and encrypt each request, so the connection test cannot call PayPay without it.'
      };
    }
    const timestamp = this._getTimestamp();
    const requestNo = `TEST_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    const requestPayload = {
      charset: 'UTF-8',
      partner_id: this.partnerId,
      service: 'transfer_to_account',
      request_no: requestNo,
      format: 'JSON',
      language: 'en',
      sign_type: 'RSA',
      version: '1.0',
      timestamp,
      biz_content: {
        out_trade_no: `TEST_${Date.now()}`,
        payer_identity_type: '1',
        payer_identity: this.partnerId,
        payee_identity_type: '1',
        payee_identity: this.partnerId,
        aging: 'R',
        transfer_amount: '0.01',
        currency: 'AOA',
        sale_product_code: this.saleProductCode || 'XXXXXXXXX',
        memo: 'Connection test'
      }
    };
    const response = await this.makePayPayApiRequest(requestPayload);
    const code = response.code || '';
    const subCode = response.sub_code || '';
    const msg = response.msg || '';
    const subMsg = response.sub_msg || '';
    // F41191 = Incorrect data signature — signing still broken
    // Any other code means PayPay accepted our signature (business/parameter errors are expected for a test call)
    const signatureOk = subCode !== 'F41191';
    return {
      success: code === 'S0001',
      connected: signatureOk,
      code,
      sub_code: subCode,
      message: subMsg || msg || 'No message from PayPay',
      signature_valid: signatureOk
    };
  }

  /**
   * Generic API request helper (used by balance check and wallet verification).
   * Delegates to PayPay-style signed request for the given path.
   * @param {string} path - e.g. '/balance' or '/verify'
   * @param {Object} options - { method, headers, body }
   * @returns {Promise<Object>} API response (shape depends on path)
   */
  async makeApiRequest(path, options = {}) {
    if (path === '/balance') {
      const memberId = (options.headers && options.headers['X-Wallet-Number']) || this.partnerId;
      const timestamp = this._getTimestamp();
      const requestNo = `BAL_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
      const requestPayload = {
        charset: 'UTF-8',
        partner_id: this.partnerId,
        service: 'query_balance',
        request_no: requestNo,
        format: 'JSON',
        language: 'en',
        sign_type: 'RSA',
        version: '1.0',
        timestamp,
        biz_content: { member_id: memberId }
      };
      const response = await this.makePayPayApiRequest(requestPayload);
      return {
        balance: response.biz_content?.available_balance ?? response.biz_content?.balance ?? 0,
        currency: response.biz_content?.currency || 'AOA',
        last_updated: response.biz_content?.last_updated || new Date().toISOString()
      };
    }
    if (path === '/verify') {
      const timestamp = this._getTimestamp();
      const requestNo = `VER_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
      const body = options.body ? JSON.parse(options.body) : {};
      const requestPayload = {
        charset: 'UTF-8',
        partner_id: this.partnerId,
        service: 'verify_wallet',
        request_no: requestNo,
        format: 'JSON',
        language: 'en',
        sign_type: 'RSA',
        version: '1.0',
        timestamp,
        biz_content: { wallet_number: body.wallet_number }
      };
      const response = await this.makePayPayApiRequest(requestPayload);
      return {
        is_valid: response.biz_content?.is_valid ?? true,
        wallet_type: response.biz_content?.wallet_type || 'paypay',
        verification_date: response.biz_content?.verification_date || new Date().toISOString()
      };
    }
    throw new Error(`Unknown API path: ${path}`);
  }

  /**
   * Make PayPay API request: encrypt biz_content (doc 2.3), sign (doc 2.4), POST JSON.
   * @param {Object} requestPayload - Request payload with plain biz_content
   * @returns {Promise<Object>} API response
   */
  async makePayPayApiRequest(requestPayload) {
    try {
      const { biz_content, ...rest } = requestPayload;

      if (!this.rsaPrivateKey || !this.rsaPrivateKey.trim()) {
        console.log(`📡 PayPay: no RSA private key, using mock response`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return this._mockPayPayResponse(requestPayload);
      }

      const encryptedBizContent = this._encryptBizContent(biz_content);
      const params = {
        biz_content: encryptedBizContent,
        charset: rest.charset || 'UTF-8',
        format: rest.format || 'JSON',
        language: rest.language || 'en',
        partner_id: rest.partner_id,
        request_no: rest.request_no,
        service: rest.service,
        sign_type: 'RSA',
        timestamp: rest.timestamp,
        version: rest.version || '1.0'
      };
      params.sign = this._signRequest(params);

      console.log(`📡 Making PayPay API request to: ${this.baseUrl} (service: ${params.service})`);
      console.log(`📋 PayPay request log:`);
      console.log(`   Raw biz_content (before encrypt):`, JSON.stringify(biz_content, null, 2));
      console.log(`   Params (encrypted biz_content truncated):`, {
        biz_content: params.biz_content ? `${params.biz_content.substring(0, 80)}...` : null,
        charset: params.charset,
        format: params.format,
        language: params.language,
        partner_id: params.partner_id,
        request_no: params.request_no,
        service: params.service,
        sign_type: params.sign_type,
        timestamp: params.timestamp,
        version: params.version,
        sign: params.sign ? `${params.sign.substring(0, 40)}...` : null
      });

      const bodyParams = this._encodeRequestParams(params);
      const body = JSON.stringify(bodyParams);
      const response = await this._httpsPost(this.baseUrl, body);

      if (response.code && response.code !== 'S0001') {
        console.error(`❌ PayPay API error: code=${response.code} sub_code=${response.sub_code} msg=${response.msg} sub_msg=${response.sub_msg}`);
      }
      return response;
    } catch (error) {
      console.error(`❌ PayPay API request failed:`, error);
      throw error;
    }
  }

  _mockPayPayResponse(requestPayload) {
    const bc = requestPayload.biz_content || {};
    return {
      code: 'S0001',
      sub_code: 'S0001',
      msg: 'success',
      sub_msg: 'success',
      sign: 'mock_signature',
      charset: 'UTF-8',
      sign_type: 'RSA',
      biz_content: {
        out_trade_no: bc.out_trade_no,
        trade_no: `101${Date.now()}${Math.random().toString().substr(2, 6)}`,
        order_time: this._getTimestamp(),
        status: 'S'
      }
    };
  }

  _httpsPost(urlString, body) {
    return new Promise((resolve, reject) => {
      const u = new URL(urlString);
      const options = {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body, 'utf8')
        }
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch {
            reject(new Error(`PayPay invalid JSON: ${data.slice(0, 200)}`));
          }
        });
      });
      req.on('error', reject);
      const timeoutMs = 60000; // 60s – PayPay gateway can be slow
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        reject(new Error(`PayPay request timeout (${timeoutMs / 1000}s)`));
      });
      req.write(body);
      req.end();
    });
  }

  /**
   * Calculate PayPay transaction fees
   * @param {number} amount - Transfer amount
   * @returns {number} Calculated fees
   */
  calculatePayPayFees(amount) {
    // PayPay fee structure for transfers
    const feeRate = 0.025; // 2.5% for PayPay transfers
    const fee = amount * feeRate;
    const minFee = 10; // Minimum fee in AOA for PayPay
    const maxFee = 1000; // Maximum fee in AOA for PayPay

    return Math.min(Math.max(fee, minFee), maxFee);
  }

  /**
   * Check wallet balance
   * @param {string} walletNumber - Wallet number to check
   * @returns {Promise<Object>} Balance information
   */
  async checkBalance(walletNumber) {
    try {
      if (this.simulationMode) {
        return await this.simulateBalanceCheck(walletNumber);
      } else {
        return await this.executeRealBalanceCheck(walletNumber);
      }
    } catch (error) {
      console.error(`❌ Balance check failed:`, error);
      return {
        success: false,
        error_message: error.message,
        balance: 0
      };
    }
  }

  /**
   * Simulate balance check
   * @param {string} walletNumber - Wallet number
   * @returns {Promise<Object>} Simulated balance
   */
  async simulateBalanceCheck(walletNumber) {
    console.log(`🎭 Simulating balance check for: ${walletNumber}`);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Simulate random balance
    const balance = Math.floor(Math.random() * 10000) + 1000;
    
    return {
      success: true,
      balance: balance,
      currency: 'AOA',
      last_updated: new Date().toISOString()
    };
  }

  /**
   * Execute real balance check via API
   * @param {string} walletNumber - Wallet number
   * @returns {Promise<Object>} Real balance
   */
  async executeRealBalanceCheck(walletNumber) {
    console.log(`🚀 Executing real balance check for: ${walletNumber}`);
    
    try {
      const response = await this.makeApiRequest('/balance', {
        method: 'GET',
        headers: {
          'X-Wallet-Number': walletNumber
        }
      });

      return {
        success: true,
        balance: response.balance,
        currency: response.currency || 'AOA',
        last_updated: response.last_updated || new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error_message: error.message,
        balance: 0
      };
    }
  }

  /**
   * Verify wallet number
   * @param {string} walletNumber - Wallet number to verify
   * @returns {Promise<Object>} Verification result
   */
  async verifyWallet(walletNumber) {
    try {
      if (this.simulationMode) {
        return await this.simulateWalletVerification(walletNumber);
      } else {
        return await this.executeRealWalletVerification(walletNumber);
      }
    } catch (error) {
      console.error(`❌ Wallet verification failed:`, error);
      return {
        success: false,
        error_message: error.message,
        is_valid: false
      };
    }
  }

  /**
   * Simulate wallet verification
   * @param {string} walletNumber - Wallet number
   * @returns {Promise<Object>} Simulated verification
   */
  async simulateWalletVerification(walletNumber) {
    console.log(`🎭 Simulating wallet verification for: ${walletNumber}`);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Simulate 90% success rate
    const isValid = Math.random() > 0.1;
    
    return {
      success: true,
      is_valid: isValid,
      wallet_type: this.provider,
      verification_date: new Date().toISOString()
    };
  }

  /**
   * Execute real wallet verification via API
   * @param {string} walletNumber - Wallet number
   * @returns {Promise<Object>} Real verification
   */
  async executeRealWalletVerification(walletNumber) {
    console.log(`🚀 Executing real wallet verification for: ${walletNumber}`);
    
    try {
      const response = await this.makeApiRequest('/verify', {
        method: 'POST',
        body: JSON.stringify({ wallet_number: walletNumber })
      });

      return {
        success: true,
        is_valid: response.is_valid,
        wallet_type: response.wallet_type || this.provider,
        verification_date: response.verification_date || new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error_message: error.message,
        is_valid: false
      };
    }
  }

  /**
   * Get service status
   * @returns {Object} Service status
   */
  getStatus() {
    return {
      initialized: !!this.apiKey,
      simulation_mode: this.simulationMode,
      provider: this.provider,
      base_url: this.baseUrl,
      has_credentials: !!(this.apiKey && this.apiSecret)
    };
  }
}

module.exports = new PayPayWalletApiService();
