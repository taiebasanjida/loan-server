import express from 'express';
import mongoose from 'mongoose';
import Stripe from 'stripe';
import LoanApplication from '../models/LoanApplication.js';
import { verifyToken } from '../middleware/auth.js';
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
// Initialize Stripe only if secret key is available
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

// Create payment intent
router.post('/create-intent', verifyToken, ensureDBConnection, async (req, res) => {
  try {
    // Check if Stripe is configured
    if (!stripe) {
      return res.status(503).json({ 
        message: 'Payment service is not configured. Please contact administrator.' 
      });
    }

    const { applicationId } = req.body;

    if (!applicationId) {
      return res.status(400).json({ message: 'Application ID is required' });
    }

    const application = await LoanApplication.findById(applicationId);

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    if (application.userId.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Not authorized to pay for this application' });
    }

    // Check if already paid
    if (application.applicationFeeStatus === 'Paid') {
      return res.status(400).json({ message: 'Application fee has already been paid' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: 1000, // $10 in cents
      currency: 'usd',
      metadata: {
        applicationId: applicationId.toString(),
        userId: req.user.userId.toString(),
      },
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error('Payment intent creation error:', error);
    const errorMessage = error.type === 'StripeInvalidRequestError' 
      ? 'Invalid payment request. Please try again.'
      : error.message || 'Failed to create payment intent';
    res.status(500).json({ message: errorMessage });
  }
});

// Create repayment intent
router.post('/create-repayment-intent', verifyToken, ensureDBConnection, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ 
        message: 'Payment service is not configured. Please contact administrator.' 
      });
    }

    const { applicationId, amount } = req.body;

    if (!applicationId || !amount) {
      return res.status(400).json({ message: 'Application ID and amount are required' });
    }

    const application = await LoanApplication.findById(applicationId);

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    if (application.userId.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    if (application.status !== 'Approved') {
      return res.status(400).json({ message: 'Loan must be approved before making repayments' });
    }

    if (amount > application.remainingAmount * 100) {
      return res.status(400).json({ message: 'Payment amount exceeds remaining balance' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: 'usd',
      metadata: {
        applicationId: applicationId.toString(),
        userId: req.user.userId.toString(),
        type: 'repayment',
      },
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error('Repayment intent creation error:', error);
    const errorMessage = error.type === 'StripeInvalidRequestError' 
      ? 'Invalid payment request. Please try again.'
      : error.message || 'Failed to create repayment intent';
    res.status(500).json({ message: errorMessage });
  }
});

// Confirm payment
router.post('/confirm', verifyToken, ensureDBConnection, async (req, res) => {
  try {
    const { applicationId, transactionId, amount, type } = req.body;
    const application = await LoanApplication.findById(applicationId);

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    // Check if it's a repayment or application fee
    if (type === 'repayment') {
      // Handle repayment
      const repaymentAmount = amount / 100; // Convert from cents
      
      application.repayments.push({
        amount: repaymentAmount,
        paymentDate: new Date(),
        transactionId: transactionId || '',
        paymentMethod: 'Stripe',
      });

      application.paidAmount = (application.paidAmount || 0) + repaymentAmount;
      application.remainingAmount = application.totalAmount - application.paidAmount;

      if (application.remainingAmount <= 0) {
        application.repaymentStatus = 'Complete';
        application.remainingAmount = 0;
      } else {
        application.repaymentStatus = 'In Progress';
      }
    } else {
      // Handle application fee
      application.applicationFeeStatus = 'Paid';
      application.paymentDetails = {
        transactionId,
        paymentDate: new Date(),
        amount: amount / 100,
      };
    }

    await application.save();

    res.json({ message: 'Payment confirmed', application });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;

