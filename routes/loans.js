import express from 'express';
import mongoose from 'mongoose';
import Loan from '../models/Loan.js';
import { verifyToken, checkRole } from '../middleware/auth.js';
import { connectDB } from '../db.js';

const router = express.Router();

// Middleware to ensure database connection
const ensureDBConnection = async (req, res, next) => {
  try {
    // Check if connected
    if (mongoose.connection.readyState !== 1) {
      // Try to connect
      await connectDB();
    }
    
    // Check again after connection attempt
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        message: 'Database connection error. Please try again later.',
        error: process.env.NODE_ENV === 'development' ? 'MongoDB not connected' : undefined
      });
    }
    
    next();
  } catch (error) {
    console.error('Database connection error:', error);
    return res.status(503).json({ 
      message: 'Database connection error. Please try again later.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get all loan categories
router.get('/categories', ensureDBConnection, async (req, res) => {
  try {
    const categories = await Loan.distinct('category');
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get loans by category
router.get('/category/:category', ensureDBConnection, async (req, res) => {
  try {
    const { category } = req.params;
    const loans = await Loan.find({ category })
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });
    res.json(loans);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get featured loans (showOnHome = true)
router.get('/featured', ensureDBConnection, async (req, res) => {
  try {
    const loans = await Loan.find({ showOnHome: true })
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(6);
    res.json(loans);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get popular loans (most applications - requires LoanApplication model)
router.get('/popular', ensureDBConnection, async (req, res) => {
  try {
    const LoanApplication = (await import('../models/LoanApplication.js')).default;
    
    // Get loan IDs with most applications
    const popularLoanIds = await LoanApplication.aggregate([
      { $group: { _id: '$loanId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 6 },
    ]);

    const loanIds = popularLoanIds.map(item => item._id);
    const loans = await Loan.find({ _id: { $in: loanIds } })
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    res.json(loans);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all loans
router.get('/', ensureDBConnection, async (req, res) => {
  try {
    const { showOnHome, search, category } = req.query;
    let query = {};

    if (showOnHome === 'true') {
      query.showOnHome = true;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
      ];
    }

    if (category) {
      query.category = category;
    }

    const loans = await Loan.find(query)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(showOnHome === 'true' ? 6 : 100);

    res.json(loans);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get single loan
router.get('/:id', ensureDBConnection, async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id).populate('createdBy', 'name email');
    if (!loan) {
      return res.status(404).json({ message: 'Loan not found' });
    }
    res.json(loan);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create loan (Manager/Admin only)
router.post('/', verifyToken, checkRole('manager', 'admin'), ensureDBConnection, async (req, res) => {
  try {
    const loan = new Loan({
      ...req.body,
      createdBy: req.user.userId,
    });
    await loan.save();
    res.status(201).json(loan);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update loan
router.put('/:id', verifyToken, checkRole('manager', 'admin'), ensureDBConnection, async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id);
    if (!loan) {
      return res.status(404).json({ message: 'Loan not found' });
    }

    // Check if manager owns the loan or is admin
    if (loan.createdBy.toString() !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    Object.assign(loan, req.body);
    await loan.save();
    res.json(loan);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete loan
router.delete('/:id', verifyToken, checkRole('manager', 'admin'), ensureDBConnection, async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id);
    if (!loan) {
      return res.status(404).json({ message: 'Loan not found' });
    }

    // Check if manager owns the loan or is admin
    if (loan.createdBy.toString() !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    await Loan.findByIdAndDelete(req.params.id);
    res.json({ message: 'Loan deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;

