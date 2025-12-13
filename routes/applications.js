import express from 'express';
import mongoose from 'mongoose';
import LoanApplication from '../models/LoanApplication.js';
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

// Get all applications (Admin/Manager)
router.get('/', verifyToken, checkRole('admin', 'manager'), ensureDBConnection, async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    let query = {};

    if (status) {
      query.status = status;
    }

    // Manager can only see applications for loans they created
    if (req.user.role === 'manager') {
      const Loan = (await import('../models/Loan.js')).default;
      const managerLoans = await Loan.find({ createdBy: req.user.userId }).select('_id');
      query.loanId = { $in: managerLoans.map(l => l._id) };
    }

    const applications = await LoanApplication.find(query)
      .populate('loanId', 'title category')
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await LoanApplication.countDocuments(query);

    res.json({
      applications,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get user's applications
router.get('/my-loans', verifyToken, ensureDBConnection, async (req, res) => {
  try {
    const applications = await LoanApplication.find({ userId: req.user.userId })
      .populate('loanId', 'title category images')
      .sort({ createdAt: -1 });

    res.json(applications);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get single application
router.get('/:id', verifyToken, ensureDBConnection, async (req, res) => {
  try {
    const application = await LoanApplication.findById(req.params.id)
      .populate('loanId')
      .populate('userId', 'name email');

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    // Check authorization
    if (
      req.user.role !== 'admin' &&
      req.user.role !== 'manager' &&
      application.userId._id.toString() !== req.user.userId
    ) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    res.json(application);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create application
router.post('/', verifyToken, checkRole('borrower'), ensureDBConnection, async (req, res) => {
  try {
    const application = new LoanApplication({
      ...req.body,
      userId: req.user.userId,
      userEmail: req.user.email,
    });
    await application.save();
    res.status(201).json(application);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update application status (Manager/Admin)
router.patch('/:id/status', verifyToken, checkRole('admin', 'manager'), ensureDBConnection, async (req, res) => {
  try {
    const { status } = req.body;
    const application = await LoanApplication.findById(req.params.id);

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    application.status = status;
    if (status === 'Approved') {
      application.approvedAt = new Date();
      // Calculate total amount with interest
      const interestAmount = (application.loanAmount * application.interestRate) / 100;
      application.totalAmount = application.loanAmount + interestAmount;
      application.remainingAmount = application.totalAmount;
      application.repaymentStatus = 'Pending';
    }
    await application.save();

    res.json(application);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Cancel application (Borrower)
router.delete('/:id', verifyToken, ensureDBConnection, async (req, res) => {
  try {
    const application = await LoanApplication.findById(req.params.id);

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    if (application.userId.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    if (application.status !== 'Pending') {
      return res.status(400).json({ message: 'Can only cancel pending applications' });
    }

    await LoanApplication.findByIdAndDelete(req.params.id);
    res.json({ message: 'Application cancelled successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;

