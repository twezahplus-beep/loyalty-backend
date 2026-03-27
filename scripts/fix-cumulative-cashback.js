/**
 * Script to fix existing sales data for cumulative cashback system
 * This script will:
 * 1. Find all existing sales that don't have cashback_applied field
 * 2. Calculate the final payment amount based on accumulated cashback
 * 3. Update the sales with the correct final payment amounts
 */

const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const CashbackTransaction = require('../models/CashbackTransaction');

async function fixCumulativeCashback() {
  try {
    console.log('🔧 Starting cumulative cashback fix...');
    
    // Connect to database
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/aguatwezah_admin_local';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to database');

    const saleModel = new Sale();
    const cashbackModel = new CashbackTransaction();

    // Find all sales that don't have cashback_applied field (old sales)
    const oldSales = await saleModel.findAll({
      cashback_applied: { $exists: false },
      user_id: { $exists: true }
    });

    console.log(`📊 Found ${oldSales.length} sales to fix`);

    let fixedCount = 0;
    let skippedCount = 0;

    for (const sale of oldSales) {
      try {
        // Get user's accumulated cashback balance at the time of this sale
        const accumulatedCashback = await cashbackModel.getUserBalance(sale.user_id);
        
        // Calculate how much cashback could have been used for this sale
        const originalAmount = sale.total_amount || sale.subtotal || 0;
        const cashbackUsed = Math.min(accumulatedCashback, originalAmount);
        const finalPaymentAmount = originalAmount - cashbackUsed;

        // Update the sale with cumulative cashback information
        await saleModel.update({ _id: sale._id }, {
          original_amount: originalAmount,
          cashback_applied: cashbackUsed,
          total_amount: finalPaymentAmount, // This should be the final payment amount
          subtotal: originalAmount, // Keep original amount in subtotal
          notes: sale.notes ? `${sale.notes} | Cashback applied: ${cashbackUsed} Kz (cumulative fix)` : `Cashback applied: ${cashbackUsed} Kz (cumulative fix)`
        });

        // Create a cashback transaction record for the used cashback
        if (cashbackUsed > 0) {
          const transactionNumber = `CASHBACK_USED_FIX_${Date.now()}_${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
          
          await cashbackModel.create({
            transaction_number: transactionNumber,
            user: sale.user_id,
            sale: sale._id,
            amount: cashbackUsed,
            type: 'used',
            status: 'approved',
            notes: `Cashback used for purchase - Sale ${sale._id} (cumulative fix)`,
            created_at: sale.created_at || new Date()
          });
        }

        fixedCount++;
        console.log(`✅ Fixed sale ${sale._id}: Original ${originalAmount} Kz → Final ${finalPaymentAmount} Kz (Cashback: ${cashbackUsed} Kz)`);

      } catch (error) {
        console.error(`❌ Error fixing sale ${sale._id}:`, error.message);
        skippedCount++;
      }
    }

    console.log(`\n🎉 Cumulative cashback fix completed!`);
    console.log(`   ✅ Fixed: ${fixedCount} sales`);
    console.log(`   ⏭️  Skipped: ${skippedCount} sales`);
    console.log(`   📊 Total processed: ${oldSales.length} sales`);

  } catch (error) {
    console.error('❌ Error in cumulative cashback fix:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from database');
  }
}

// Run the fix
fixCumulativeCashback();
