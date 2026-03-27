/**
 * Test script to create sample sales and demonstrate cumulative cashback
 */

const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const CashbackTransaction = require('../models/CashbackTransaction');
const User = require('../models/User');

async function createTestData() {
  try {
    console.log('🧪 Creating test data for cumulative cashback...');
    
    // Connect to database
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/aguatwezah_admin_local';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to database');

    const saleModel = new Sale();
    const cashbackModel = new CashbackTransaction();
    const userModel = new User();

    // Check if user1 exists
    let testUser = await userModel.findOne({ email: 'user1@example.com' });
    if (!testUser) {
      console.log('👤 Creating test user...');
      testUser = await userModel.createUser({
        username: 'user1',
        email: 'user1@example.com',
        first_name: 'user1',
        last_name: 'Customer',
        phone: '+24492409',
        password: 'password123',
        role: 'customer',
        status: 'active',
        loyalty_tier: 'lead'
      });
    }

    console.log('👤 Test user:', testUser.email);

    // Create first sale (50 liters, 1000 Kz, no previous cashback)
    console.log('\n📦 Creating first sale...');
    const sale1Data = {
      sale_number: 'S250110001',
      transaction_id: 'TXN001',
      user_id: testUser._id,
      quantity: 50,
      unit_price: 20,
      subtotal: 1000, // Original amount
      total_amount: 1000, // Final payment (no cashback to apply)
      original_amount: 1000,
      cashback_applied: 0,
      currency: 'AOA',
      order_status: 'completed',
      cashback_earned: 120, // 12% cashback
      payment_method: 'cash',
      payment_status: 'paid',
      total_liters: 50,
      purchaser_name: 'user1 Customer',
      purchaser_phone: '+24492409',
      purchaser_email: 'user1@example.com',
      liters_purchased: 50,
      store_number: 'store1',
      created_at: new Date('2025-01-10T20:52:00Z'),
      notes: 'First purchase - 50L water'
    };

    const sale1 = await saleModel.create(sale1Data);
    console.log(`✅ Created sale 1: ${sale1._id}`);

    // Create cashback transaction for first sale
    const cashback1 = await cashbackModel.create({
      transaction_number: 'CASHBACK_EARNED_001',
      user: testUser._id,
      sale: sale1._id,
      amount: 120,
      type: 'earned',
      status: 'approved',
      notes: 'Cashback earned from first purchase',
      created_at: new Date('2025-01-10T20:52:00Z')
    });
    console.log(`✅ Created cashback 1: ${cashback1._id}`);

    // Create second sale (50 liters, 1000 Kz, with 120 Kz accumulated cashback)
    console.log('\n📦 Creating second sale...');
    const sale2Data = {
      sale_number: 'S250110002',
      transaction_id: 'TXN002',
      user_id: testUser._id,
      quantity: 50,
      unit_price: 20,
      subtotal: 1000, // Original amount
      total_amount: 880, // Final payment (1000 - 120 cashback)
      original_amount: 1000,
      cashback_applied: 120, // Used 120 Kz cashback
      currency: 'AOA',
      order_status: 'completed',
      cashback_earned: 100, // 10% cashback on final amount
      payment_method: 'cash',
      payment_status: 'paid',
      total_liters: 50,
      purchaser_name: 'user1 Customer',
      purchaser_phone: '+24492409',
      purchaser_email: 'user1@example.com',
      liters_purchased: 50,
      store_number: 'store1',
      created_at: new Date('2025-01-10T20:53:00Z'),
      notes: 'Second purchase - 50L water, used 120 Kz cashback'
    };

    const sale2 = await saleModel.create(sale2Data);
    console.log(`✅ Created sale 2: ${sale2._id}`);

    // Create cashback transaction for used cashback
    const cashbackUsed = await cashbackModel.create({
      transaction_number: 'CASHBACK_USED_001',
      user: testUser._id,
      sale: sale2._id,
      amount: 120,
      type: 'used',
      status: 'approved',
      notes: 'Cashback used for second purchase',
      created_at: new Date('2025-01-10T20:53:00Z')
    });
    console.log(`✅ Created used cashback: ${cashbackUsed._id}`);

    // Create cashback transaction for earned cashback
    const cashback2 = await cashbackModel.create({
      transaction_number: 'CASHBACK_EARNED_002',
      user: testUser._id,
      sale: sale2._id,
      amount: 100,
      type: 'earned',
      status: 'approved',
      notes: 'Cashback earned from second purchase',
      created_at: new Date('2025-01-10T20:53:00Z')
    });
    console.log(`✅ Created cashback 2: ${cashback2._id}`);

    // Verify the data
    console.log('\n📊 Verifying test data...');
    const allSales = await saleModel.findAll({ user_id: testUser._id });
    const userBalance = await cashbackModel.getUserBalance(testUser._id);
    
    console.log(`📦 Total sales: ${allSales.length}`);
    console.log(`💰 User cashback balance: ${userBalance} Kz`);
    
    allSales.forEach((sale, index) => {
      console.log(`   Sale ${index + 1}: Original ${sale.original_amount} Kz → Final ${sale.total_amount} Kz (Cashback: ${sale.cashback_applied} Kz)`);
    });

    console.log('\n🎉 Test data created successfully!');

  } catch (error) {
    console.error('❌ Error creating test data:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from database');
  }
}

// Run the test
createTestData();
