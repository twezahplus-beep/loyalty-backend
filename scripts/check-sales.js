const mongoose = require('mongoose');

async function checkSales() {
  try {
    await mongoose.connect('mongodb://localhost:27017/aguatwezah_admin_local');
    console.log('✅ Connected to database');

    const sales = await mongoose.connection.db.collection('sales').find({}).toArray();
    console.log(`📊 Found ${sales.length} sales:`);
    
    sales.forEach((sale, index) => {
      console.log(`\nSale ${index + 1}:`);
      console.log(`  Original Amount: ${sale.original_amount} Kz`);
      console.log(`  Final Amount: ${sale.total_amount} Kz`);
      console.log(`  Cashback Applied: ${sale.cashback_applied} Kz`);
      console.log(`  Cashback Earned: ${sale.cashback_earned} Kz`);
      console.log(`  Date: ${sale.created_at}`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from database');
  }
}

checkSales();
