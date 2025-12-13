import express from 'express';
import mongoose from 'mongoose';
import LoanApplication from '../models/LoanApplication.js';
import { verifyToken } from '../middleware/auth.js';
import { connectDB } from '../db.js';

const router = express.Router();

// Middleware to ensure database connection
const ensureDBConnection = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      await connectDB();
    }
    
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        message: 'Database connection error. Please try again later.',
      });
    }
    
    next();
  } catch (error) {
    console.error('Database connection error:', error);
    return res.status(503).json({ 
      message: 'Database connection error. Please try again later.',
    });
  }
};

// Get repayment details for an application (Borrower or Admin/Manager)
router.get('/:applicationId', verifyToken, ensureDBConnection, async (req, res) => {
  try {
    const application = await LoanApplication.findById(req.params.applicationId);

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    // Check authorization: User owns the application OR user is admin/manager
    const isOwner = application.userId.toString() === req.user.userId;
    const isAdminOrManager = req.user.role === 'admin' || req.user.role === 'manager';
    
    if (!isOwner && !isAdminOrManager) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Calculate total amount if not set (for old approved loans)
    let totalAmount = application.totalAmount;
    if (!totalAmount || totalAmount === 0) {
      if (application.status === 'Approved' && application.loanAmount) {
        // Calculate total amount with interest for old approved loans
        const interestAmount = (application.loanAmount * (application.interestRate || 0)) / 100;
        totalAmount = application.loanAmount + interestAmount;
        
        // Update the application if totalAmount was missing
        if (!application.totalAmount || application.totalAmount === 0) {
          application.totalAmount = totalAmount;
          if (!application.remainingAmount || application.remainingAmount === 0) {
            application.remainingAmount = totalAmount;
          }
          await application.save();
        }
      } else {
        totalAmount = application.loanAmount || 0;
      }
    }

    // Calculate remaining amount if not set or invalid
    let remainingAmount = application.remainingAmount;
    if (!remainingAmount || remainingAmount < 0) {
      const paidAmount = application.paidAmount || 0;
      remainingAmount = totalAmount - paidAmount;
      if (remainingAmount < 0) remainingAmount = 0;
    }

    res.json({
      totalAmount: totalAmount,
      paidAmount: application.paidAmount || 0,
      remainingAmount: remainingAmount,
      repaymentStatus: application.repaymentStatus || 'Pending',
      repayments: application.repayments || [],
      repaymentSchedule: application.repaymentSchedule || 'Monthly',
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create a repayment (Borrower or Admin/Manager)
router.post('/:applicationId', verifyToken, ensureDBConnection, async (req, res) => {
  try {
    const { amount, transactionId, paymentMethod } = req.body;
    const application = await LoanApplication.findById(req.params.applicationId);

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    // Check authorization: User owns the application OR user is admin/manager
    const isOwner = application.userId.toString() === req.user.userId;
    const isAdminOrManager = req.user.role === 'admin' || req.user.role === 'manager';
    
    if (!isOwner && !isAdminOrManager) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Check if loan is approved
    if (application.status !== 'Approved') {
      return res.status(400).json({ message: 'Loan must be approved before making repayments' });
    }

    // Calculate total amount if not set (for old approved loans)
    if (!application.totalAmount || application.totalAmount === 0) {
      const interestAmount = (application.loanAmount * (application.interestRate || 0)) / 100;
      application.totalAmount = application.loanAmount + interestAmount;
    }

    // Calculate remaining amount if not set
    if (!application.remainingAmount || application.remainingAmount < 0) {
      const paidAmount = application.paidAmount || 0;
      application.remainingAmount = application.totalAmount - paidAmount;
      if (application.remainingAmount < 0) application.remainingAmount = 0;
    }

    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid payment amount' });
    }

    if (amount > application.remainingAmount) {
      return res.status(400).json({ message: `Payment amount exceeds remaining balance. Maximum: $${application.remainingAmount.toLocaleString()}` });
    }

    // Add repayment
    application.repayments.push({
      amount,
      paymentDate: new Date(),
      transactionId: transactionId || '',
      paymentMethod: paymentMethod || 'Stripe',
    });

    // Update amounts
    application.paidAmount = (application.paidAmount || 0) + amount;
    application.remainingAmount = application.totalAmount - application.paidAmount;

    // Update repayment status
    if (application.remainingAmount <= 0) {
      application.repaymentStatus = 'Complete';
      application.remainingAmount = 0;
    } else {
      application.repaymentStatus = 'In Progress';
    }

    await application.save();

    res.json({
      message: 'Repayment recorded successfully',
      application: {
        totalAmount: application.totalAmount,
        paidAmount: application.paidAmount,
        remainingAmount: application.remainingAmount,
        repaymentStatus: application.repaymentStatus,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;

