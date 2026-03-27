/**
 * Create a comprehensive demo of the cumulative cashback system
 * This will create multiple purchases for the same user to demonstrate
 * how cashback accumulates and is applied to subsequent purchases
 */

const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const CashbackTransaction = require('../models/CashbackTransaction');
const User = require('../models/User');

async function createCumulativeDemo() {
  try {
    console.log('🎬 Creating cumulative cashback demonstration...');
    
    // Connect to database
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/aguatwezah_admin_local';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to database');

    const saleModel = new Sale();
    const cashbackModel = new CashbackTransaction();
    const userModel = new User();

    // Find or create a demo user
    let demoUser = await userModel.findOne({ email: 'demo@example.com' });
    if (!demoUser) {
      console.log('👤 Creating demo user...');
      demoUser = await userModel.createUser({
        username: 'demo_user',
        email: 'demo@example.com',
        first_name: 'Demo',
        last_name: 'Customer',
        phone: '+244912345678',
        password: 'password123',
        role: 'customer',
        status: 'active',
        loyalty_tier: 'lead'
      });
    }

    console.log('👤 Demo user:', demoUser.email);

    // Clear any existing sales for this user to start fresh
    await saleModel.model.deleteMany({ user_id: demoUser._id });
    await cashbackModel.model.deleteMany({ user: demoUser._id });

    console.log('\n🔄 Starting cumulative cashback demonstration...\n');

    // Purchase 1: 50L water, 1000 Kz (no previous cashback)
    console.log('📦 Purchase 1: 50L water, 1000 Kz');
    const sale1 = await createSale(saleModel, {
      user_id: demoUser._id,
      quantity: 50,
      unit_price: 20,
      subtotal: 1000,
      total_amount: 1000, // No cashback to apply
      original_amount: 1000,
      cashback_applied: 0,
      cashback_earned: 120, // 12% cashback
      purchaser_name: 'Demo Customer',
      purchaser_phone: '+244912345678',
      purchaser_email: 'demo@example.com',
      sale_number: 'DEMO001',
      transaction_id: 'TXN_DEMO_001',
      notes: 'First purchase - 50L water, no cashback applied'
    });

    await createCashback(cashbackModel, {
      user: demoUser._id,
      sale: sale1._id,
      amount: 120,
      type: 'earned',
      transaction_number: 'CASHBACK_EARNED_DEMO_001',
      notes: 'Cashback earned from first purchase'
    });

    const balance1 = await cashbackModel.getUserBalance(demoUser._id);
    console.log(`   💰 Cashback earned: 120 Kz`);
    console.log(`   💰 Total balance: ${balance1} Kz`);
    console.log(`   💳 Final payment: 1000 Kz\n`);

    // Purchase 2: 50L water, 1000 Kz (apply 120 Kz cashback)
    console.log('📦 Purchase 2: 50L water, 1000 Kz');
    const sale2 = await createSale(saleModel, {
      user_id: demoUser._id,
      quantity: 50,
      unit_price: 20,
      subtotal: 1000,
      total_amount: 880, // 1000 - 120 cashback
      original_amount: 1000,
      cashback_applied: 120,
      cashback_earned: 100, // Cashback on final amount
      purchaser_name: 'Demo Customer',
      purchaser_phone: '+244912345678',
      purchaser_email: 'demo@example.com',
      sale_number: 'DEMO002',
      transaction_id: 'TXN_DEMO_002',
      notes: 'Second purchase - 50L water, used 120 Kz cashback'
    });

    // Create used cashback transaction
    await createCashback(cashbackModel, {
      user: demoUser._id,
      sale: sale2._id,
      amount: 120,
      type: 'used',
      transaction_number: 'CASHBACK_USED_DEMO_001',
      notes: 'Cashback used for second purchase'
    });

    // Create earned cashback transaction
    await createCashback(cashbackModel, {
      user: demoUser._id,
      sale: sale2._id,
      amount: 100,
      type: 'earned',
      transaction_number: 'CASHBACK_EARNED_DEMO_002',
      notes: 'Cashback earned from second purchase'
    });

    const balance2 = await cashbackModel.getUserBalance(demoUser._id);
    console.log(`   💰 Cashback used: 120 Kz`);
    console.log(`   💰 Cashback earned: 100 Kz`);
    console.log(`   💰 Total balance: ${balance2} Kz`);
    console.log(`   💳 Final payment: 880 Kz\n`);

    // Purchase 3: 30L water, 600 Kz (apply 100 Kz cashback)
    console.log('📦 Purchase 3: 30L water, 600 Kz');
    const sale3 = await createSale(saleModel, {
      user_id: demoUser._id,
      quantity: 30,
      unit_price: 20,
      subtotal: 600,
      total_amount: 500, // 600 - 100 cashback
      original_amount: 600,
      cashback_applied: 100,
      cashback_earned: 60, // Cashback on final amount
      purchaser_name: 'Demo Customer',
      purchaser_phone: '+244912345678',
      purchaser_email: 'demo@example.com',
      sale_number: 'DEMO003',
      transaction_id: 'TXN_DEMO_003',
      notes: 'Third purchase - 30L water, used 100 Kz cashback'
    });

    // Create used cashback transaction
    await createCashback(cashbackModel, {
      user: demoUser._id,
      sale: sale3._id,
      amount: 100,
      type: 'used',
      transaction_number: 'CASHBACK_USED_DEMO_002',
      notes: 'Cashback used for third purchase'
    });

    // Create earned cashback transaction
    await createCashback(cashbackModel, {
      user: demoUser._id,
      sale: sale3._id,
      amount: 60,
      type: 'earned',
      transaction_number: 'CASHBACK_EARNED_DEMO_003',
      notes: 'Cashback earned from third purchase'
    });

    const balance3 = await cashbackModel.getUserBalance(demoUser._id);
    console.log(`   💰 Cashback used: 100 Kz`);
    console.log(`   💰 Cashback earned: 60 Kz`);
    console.log(`   💰 Total balance: ${balance3} Kz`);
    console.log(`   💳 Final payment: 500 Kz\n`);

    // Summary
    console.log('📊 CUMULATIVE CASHBACK DEMONSTRATION SUMMARY:');
    console.log('===============================================');
    console.log('Purchase 1: 1000 Kz → 1000 Kz (earned 120 Kz cashback)');
    console.log('Purchase 2: 1000 Kz → 880 Kz (used 120 Kz, earned 100 Kz)');
    console.log('Purchase 3: 600 Kz → 500 Kz (used 100 Kz, earned 60 Kz)');
    console.log('===============================================');
    console.log(`Total saved: ${(1000 + 1000 + 600) - (1000 + 880 + 500)} Kz`);
    console.log(`Current cashback balance: ${balance3} Kz`);

    console.log('\n🎉 Cumulative cashback demonstration created successfully!');

  } catch (error) {
    console.error('❌ Error creating cumulative demo:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from database');
  }
}

async function createSale(saleModel, saleData) {
  const sale = await saleModel.create({
    ...saleData,
    currency: 'AOA',
    order_status: 'completed',
    payment_method: 'cash',
    payment_status: 'paid',
    total_liters: saleData.quantity,
    liters_purchased: saleData.quantity,
    store_number: 'store1',
    created_at: new Date()
  });
  return sale;
}

async function createCashback(cashbackModel, cashbackData) {
  const cashback = await cashbackModel.create({
    ...cashbackData,
    status: 'approved',
    created_at: new Date()
  });
  return cashback;
}

// Run the demo
createCumulativeDemo();
