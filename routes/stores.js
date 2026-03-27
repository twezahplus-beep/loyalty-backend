const express = require('express');
const { body, validationResult } = require('express-validator');
const { verifyToken, requireManager } = require('../middleware/auth');
const Seller = require('../schemas/Seller');
const bcrypt = require('bcryptjs');

const router = express.Router();

// Helper: map seller doc to store-shaped object for frontend
function sellerToStore(s) {
  return {
    _id: s._id,
    name: s.name,
    store_number: s.store_number,
    code: s.store_number,
    email: s.email,
    phone: s.phone,
    status: s.status,
    address: {
      street: '',
      city: '',
      state: '',
      postal_code: s.store_number,
      country: 'Angola'
    },
    contact: {
      name: s.name,
      email: s.email,
      phone: s.phone
    },
    total_sales: s.total_sales || 0,
    total_purchases: s.total_purchases || 0,
    total_liters: s.total_liters || 0,
    total_customers: s.total_customers || 0,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt
  };
}

// @route   GET /api/stores/stats/overview
// @desc    Get store statistics overview (from sellers)
// @access  Private (Manager+)
router.get('/stats/overview', [verifyToken, requireManager], async (req, res) => {
  try {
    const total = await Seller.countDocuments();
    const active = await Seller.countDocuments({ status: 'active' });

    res.json({
      success: true,
      data: {
        total_stores: total,
        active_stores: active,
        inactive_stores: total - active
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// @route   GET /api/stores/search/:term
// @desc    Search stores (sellers)
// @access  Private (Manager+)
router.get('/search/:term', [verifyToken, requireManager], async (req, res) => {
  try {
    const { term } = req.params;
    const { limit = 10 } = req.query;
    const sellers = await Seller.find({
      $or: [
        { name: { $regex: term, $options: 'i' } },
        { store_number: { $regex: term, $options: 'i' } },
        { email: { $regex: term, $options: 'i' } },
        { phone: { $regex: term, $options: 'i' } }
      ]
    }).select('-password_hash').limit(parseInt(limit));

    res.json({
      success: true,
      data: sellers.map(sellerToStore)
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// @route   GET /api/stores/location/nearby
// @desc    Get stores by location (not applicable for sellers, return all)
// @access  Private (Manager+)
router.get('/location/nearby', [verifyToken, requireManager], async (req, res) => {
  try {
    const sellers = await Seller.find({ status: 'active' }).select('-password_hash');
    res.json({
      success: true,
      data: sellers.map(sellerToStore)
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// @route   GET /api/stores/city/:city
// @desc    Get stores by city (search sellers by name/number)
// @access  Private (Manager+)
router.get('/city/:city', [verifyToken, requireManager], async (req, res) => {
  try {
    const sellers = await Seller.find({ status: 'active' }).select('-password_hash');
    res.json({
      success: true,
      data: sellers.map(sellerToStore)
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// @route   GET /api/stores/country/:country
// @desc    Get stores by country (return all sellers)
// @access  Private (Manager+)
router.get('/country/:country', [verifyToken, requireManager], async (req, res) => {
  try {
    const sellers = await Seller.find({ status: 'active' }).select('-password_hash');
    res.json({
      success: true,
      data: sellers.map(sellerToStore)
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// @route   GET /api/stores
// @desc    Get all stores (from sellers collection)
// @access  Private (Manager+)
router.get('/', [verifyToken, requireManager], async (req, res) => {
  try {
    const { search, status, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { store_number: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Seller.countDocuments(filter);
    const sellers = await Seller.find(filter)
      .select('-password_hash')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: sellers.map(sellerToStore),
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// @route   GET /api/stores/:id
// @desc    Get store (seller) by ID
// @access  Private (Manager+)
router.get('/:id', [verifyToken, requireManager], async (req, res) => {
  try {
    const seller = await Seller.findById(req.params.id).select('-password_hash');
    if (!seller) {
      return res.status(404).json({ success: false, error: 'Store not found' });
    }
    res.json({
      success: true,
      data: { store: sellerToStore(seller) }
    });
  } catch (error) {
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
});

// @route   GET /api/stores/:id/stats
// @desc    Get specific store statistics
// @access  Private (Manager+)
router.get('/:id/stats', [verifyToken, requireManager], async (req, res) => {
  try {
    const seller = await Seller.findById(req.params.id).select('-password_hash');
    if (!seller) {
      return res.status(404).json({ success: false, error: 'Store not found' });
    }
    res.json({
      success: true,
      data: {
        total_sales: seller.total_sales || 0,
        total_purchases: seller.total_purchases || 0,
        total_liters: seller.total_liters || 0,
        total_customers: seller.total_customers || 0
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// @route   POST /api/stores
// @desc    Create new store (seller)
// @access  Private (Manager+)
router.post('/', [
  verifyToken,
  requireManager,
  body('name').trim().isLength({ min: 2 }).withMessage('Store name must be at least 2 characters'),
  body('email').isEmail().withMessage('Email must be a valid email address'),
  body('phone').isMobilePhone().withMessage('Phone must be a valid mobile number'),
  body('store_number').trim().isLength({ min: 1 }).withMessage('Store number is required'),
  body('status').optional().isIn(['active', 'inactive', 'suspended']).withMessage('Invalid status')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const { name, email, phone, store_number, status, password } = req.body;

    // Check for duplicate store_number or email
    const existing = await Seller.findOne({
      $or: [{ store_number }, { email }]
    });
    if (existing) {
      return res.status(400).json({
        success: false,
        error: existing.email === email ? 'Email already exists' : 'Store number already exists'
      });
    }

    // Create seller with a default password if not provided
    const hashedPassword = await bcrypt.hash(password || 'seller123', 10);
    const seller = await Seller.create({
      name,
      email,
      phone,
      store_number,
      password_hash: hashedPassword,
      status: status || 'active'
    });

    res.status(201).json({
      success: true,
      message: 'Store created successfully',
      data: { store: sellerToStore(seller) }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// @route   PUT /api/stores/:id
// @desc    Update store (seller)
// @access  Private (Manager+)
router.put('/:id', [
  verifyToken,
  requireManager,
  body('name').optional().trim().isLength({ min: 2 }).withMessage('Store name must be at least 2 characters'),
  body('phone').optional().isMobilePhone().withMessage('Phone must be a valid mobile number'),
  body('email').optional().isEmail().withMessage('Email must be a valid email address'),
  body('status').optional().isIn(['active', 'inactive', 'suspended']).withMessage('Invalid status')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const { name, email, phone, store_number, status } = req.body;
    const update = {};
    if (name) update.name = name;
    if (email) update.email = email;
    if (phone) update.phone = phone;
    if (store_number) update.store_number = store_number;
    if (status) update.status = status;

    const seller = await Seller.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true }
    ).select('-password_hash');

    if (!seller) {
      return res.status(404).json({ success: false, error: 'Store not found' });
    }

    res.json({
      success: true,
      message: 'Store updated successfully',
      data: { store: sellerToStore(seller) }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// @route   DELETE /api/stores/:id
// @desc    Delete store (seller)
// @access  Private (Manager+)
router.delete('/:id', [verifyToken, requireManager], async (req, res) => {
  try {
    const seller = await Seller.findByIdAndDelete(req.params.id);
    if (!seller) {
      return res.status(404).json({ success: false, error: 'Store not found' });
    }
    res.json({
      success: true,
      message: 'Store deleted successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// @route   PATCH /api/stores/:id/status
// @desc    Update store status
// @access  Private (Manager+)
router.patch('/:id/status', [
  verifyToken,
  requireManager,
  body('status').isIn(['active', 'inactive', 'suspended']).withMessage('Invalid status')
], async (req, res) => {
  try {
    const { status } = req.body;
    const seller = await Seller.findByIdAndUpdate(
      req.params.id,
      { $set: { status } },
      { new: true }
    ).select('-password_hash');

    if (!seller) {
      return res.status(404).json({ success: false, error: 'Store not found' });
    }

    res.json({
      success: true,
      message: 'Store status updated successfully',
      data: { store: sellerToStore(seller) }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
