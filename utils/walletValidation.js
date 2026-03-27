/**
 * Wallet Validation Utility
 * Provides comprehensive validation for different wallet providers
 */

class WalletValidation {
  constructor() {
    this.providers = {
      paypay: {
        name: 'PayPay',
        patterns: {
          // PayPay account number (member ID format)
          member_id: /^[0-9]{6,32}$/,
          // PayPay phone number (Angola format)
          phone: /^(\+244|244)?[0-9]{9}$/,
          // PayPay email format
          email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
        },
        validationRules: {
          minLength: 6,
          maxLength: 50,
          allowPlus: true,
          allowSpaces: false,
          allowDashes: true,
          allowLetters: true,
          allowDots: true,
          allowAt: true,
          caseSensitive: false
        }
      }
    };
  }

  /**
   * Validate wallet number for a specific provider
   * @param {string} walletNumber - The wallet number to validate
   * @param {string} provider - The wallet provider type
   * @param {string} country - Optional country code for region-specific validation
   * @returns {Object} Validation result with success, error, and suggestions
   */
  validateWalletNumber(walletNumber, provider, country = 'AO') {
    if (!walletNumber || typeof walletNumber !== 'string') {
      return {
        success: false,
        error: 'Wallet number is required and must be a string',
        suggestions: []
      };
    }

    if (!this.providers[provider]) {
      return {
        success: false,
        error: `Unsupported wallet provider: ${provider}`,
        suggestions: Object.keys(this.providers)
      };
    }

    const trimmedNumber = walletNumber.trim();
    const providerConfig = this.providers[provider];
    const validationRules = providerConfig.validationRules;

    // Basic length validation
    if (trimmedNumber.length < validationRules.minLength) {
      return {
        success: false,
        error: `Wallet number must be at least ${validationRules.minLength} characters long`,
        suggestions: [`Enter a ${providerConfig.name} number with at least ${validationRules.minLength} characters`]
      };
    }

    if (trimmedNumber.length > validationRules.maxLength) {
      return {
        success: false,
        error: `Wallet number must not exceed ${validationRules.maxLength} characters`,
        suggestions: [`Enter a ${providerConfig.name} number with maximum ${validationRules.maxLength} characters`]
      };
    }

    // Character validation
    const invalidChars = this.findInvalidCharacters(trimmedNumber, validationRules);
    if (invalidChars.length > 0) {
      return {
        success: false,
        error: `Invalid characters found: ${invalidChars.join(', ')}`,
        suggestions: [`Remove invalid characters: ${invalidChars.join(', ')}`]
      };
    }

    // Pattern validation
    const patternMatch = this.matchPatterns(trimmedNumber, providerConfig.patterns, country);
    if (!patternMatch.success) {
      return {
        success: false,
        error: patternMatch.error,
        suggestions: patternMatch.suggestions
      };
    }

    return {
      success: true,
      error: null,
      suggestions: [],
      detectedFormat: patternMatch.detectedFormat,
      normalizedNumber: this.normalizeWalletNumber(trimmedNumber, provider)
    };
  }

  /**
   * Find invalid characters based on validation rules
   * @param {string} walletNumber - The wallet number to check
   * @param {Object} rules - Validation rules
   * @returns {Array} Array of invalid characters
   */
  findInvalidCharacters(walletNumber, rules) {
    const invalidChars = [];
    let allowedChars = /[0-9]/;
    
    if (rules.allowLetters) {
      allowedChars = /[0-9a-zA-Z]/;
    }
    if (rules.allowPlus) {
      allowedChars = /[0-9a-zA-Z+]/;
    }
    if (rules.allowDashes) {
      allowedChars = /[0-9a-zA-Z+-]/;
    }
    if (rules.allowDots) {
      allowedChars = /[0-9a-zA-Z+-.]/;
    }
    if (rules.allowAt) {
      allowedChars = /[0-9a-zA-Z+-.@]/;
    }

    for (const char of walletNumber) {
      if (!allowedChars.test(char)) {
        if (!invalidChars.includes(char)) {
          invalidChars.push(char);
        }
      }
    }

    return invalidChars;
  }

  /**
   * Match wallet number against provider patterns
   * @param {string} walletNumber - The wallet number to match
   * @param {Object} patterns - Provider patterns
   * @param {string} country - Country code
   * @returns {Object} Match result
   */
  matchPatterns(walletNumber, patterns, country) {
    for (const [patternName, pattern] of Object.entries(patterns)) {
      if (pattern.test(walletNumber)) {
        return {
          success: true,
          detectedFormat: patternName,
          error: null,
          suggestions: []
        };
      }
    }

    // Generate suggestions based on failed patterns
    const suggestions = [];
    
    if (patterns.angola && country === 'AO') {
      suggestions.push('Angola mobile numbers should be 9 digits (e.g., 923456789)');
    }
    
    if (patterns.standard) {
      suggestions.push('Bank account numbers should be 10-20 digits');
    }
    
    if (patterns.bitcoin) {
      suggestions.push('Bitcoin addresses should start with 1 or 3 and be 26-35 characters');
    }
    
    if (patterns.ethereum) {
      suggestions.push('Ethereum addresses should start with 0x and be 42 characters');
    }
    
    if (patterns.email) {
      suggestions.push('Digital wallet should be a valid email address');
    }

    return {
      success: false,
      detectedFormat: null,
      error: 'Wallet number format does not match expected patterns',
      suggestions
    };
  }

  /**
   * Normalize wallet number for consistent storage
   * @param {string} walletNumber - The wallet number to normalize
   * @param {string} provider - The wallet provider
   * @returns {string} Normalized wallet number
   */
  normalizeWalletNumber(walletNumber, provider) {
    let normalized = walletNumber.trim();

    switch (provider) {
      case 'paypay':
        // Normalize PayPay account identifier
        if (normalized.includes('@')) {
          // Email format - normalize to lowercase
          normalized = normalized.toLowerCase();
        } else if (normalized.match(/^(\+244|244)?[0-9]{9}$/)) {
          // Phone number format - remove country code prefix
          normalized = normalized.replace(/^(\+244|244)/, '');
        } else {
          // Member ID or other format - keep as-is
          normalized = normalized;
        }
        break;

      default:
        // Fallback for any other provider (shouldn't happen with PayPay-only)
        normalized = normalized.trim();
        break;
    }

    return normalized;
  }

  /**
   * Validate multiple wallet numbers
   * @param {Array} walletNumbers - Array of wallet numbers to validate
   * @param {string} provider - The wallet provider
   * @returns {Object} Batch validation results
   */
  validateBatch(walletNumbers, provider) {
    const results = {
      valid: [],
      invalid: [],
      summary: {
        total: walletNumbers.length,
        validCount: 0,
        invalidCount: 0,
        errors: {}
      }
    };

    walletNumbers.forEach((walletNumber, index) => {
      const validation = this.validateWalletNumber(walletNumber, provider);
      
      if (validation.success) {
        results.valid.push({
          index,
          walletNumber,
          normalizedNumber: validation.normalizedNumber,
          detectedFormat: validation.detectedFormat
        });
        results.summary.validCount++;
      } else {
        results.invalid.push({
          index,
          walletNumber,
          error: validation.error,
          suggestions: validation.suggestions
        });
        results.summary.invalidCount++;
        
        // Count error types
        if (!results.summary.errors[validation.error]) {
          results.summary.errors[validation.error] = 0;
        }
        results.summary.errors[validation.error]++;
      }
    });

    return results;
  }

  /**
   * Get validation rules for a provider
   * @param {string} provider - The wallet provider
   * @returns {Object} Validation rules
   */
  getValidationRules(provider) {
    return this.providers[provider]?.validationRules || null;
  }

  /**
   * Get supported providers
   * @returns {Array} Array of supported providers
   */
  getSupportedProviders() {
    return Object.keys(this.providers).map(key => ({
      key,
      name: this.providers[key].name
    }));
  }

  /**
   * Generate test wallet numbers for development
   * @param {string} provider - The wallet provider
   * @param {number} count - Number of test numbers to generate
   * @returns {Array} Array of test wallet numbers
   */
  generateTestNumbers(provider, count = 5) {
    const testNumbers = [];

    switch (provider) {
      case 'paypay':
        for (let i = 0; i < count; i++) {
          // Generate different types of PayPay identifiers
          if (i % 3 === 0) {
            // Member ID format
            const memberId = '20000183571' + String(i).padStart(1, '0');
            testNumbers.push(memberId);
          } else if (i % 3 === 1) {
            // Phone number format
            const phone = '92345678' + (i + 1);
            testNumbers.push(phone);
          } else {
            // Email format
            const email = `testuser${i + 1}@paypay.ao`;
            testNumbers.push(email);
          }
        }
        break;

      default:
        // Fallback - shouldn't happen with PayPay-only
        for (let i = 0; i < count; i++) {
          testNumbers.push(`test_${i + 1}`);
        }
        break;
    }

    return testNumbers;
  }
}

module.exports = new WalletValidation();
