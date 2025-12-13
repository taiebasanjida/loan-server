import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import User from '../models/User.js';
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
        message: 'Database not connected. Please check your MongoDB connection.' 
      });
    }
    
    next();
  } catch (error) {
    console.error('Database connection error:', error);
    return res.status(503).json({ 
      message: 'Database connection error. Please check your MongoDB connection.' 
    });
  }
};

// Test MongoDB connection endpoint
router.get('/test-db', async (req, res) => {
  try {
    // Try to connect if not connected
    if (mongoose.connection.readyState !== 1) {
      await connectDB();
    }
    
    const state = mongoose.connection.readyState;
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    
    res.json({
      status: states[state] || 'unknown',
      readyState: state,
      connected: state === 1,
      mongoUri: process.env.MONGODB_URI ? 'Set (hidden)' : 'Not Set',
      message: state === 1 ? 'Database connected successfully' : 'Database not connected',
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      connected: false,
    });
  }
});

// Register
router.post('/register', ensureDBConnection, async (req, res) => {
  try {

    const { name, email, photoURL, role, password } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({ 
        message: 'Name, email, and password are required' 
      });
    }

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = new User({
      name,
      email,
      photoURL: photoURL || '',
      role: role || 'borrower',
      password: hashedPassword,
    });

    await user.save();

    // Generate token
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    // Set cookie with cross-origin support
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('token', token, {
      httpOnly: true,
      secure: isProduction, // Must be true for sameSite: 'none'
      sameSite: isProduction ? 'none' : 'lax', // 'none' for cross-origin in production
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/',
    });

    res.status(201).json({
      message: 'User registered successfully',
      token: token, // Also send token in response for Authorization header fallback
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        photoURL: user.photoURL,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    console.error('Error stack:', error.stack);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    
    // Check if it's a database connection error
    if (error.name === 'MongoServerError' || 
        error.name === 'MongoNetworkError' ||
        error.message?.includes('MongoServerError') ||
        error.message?.includes('MongoNetworkError') ||
        error.message?.includes('connection') ||
        error.message?.includes('timeout')) {
      return res.status(503).json({ 
        message: 'Database connection error. Please check your MongoDB connection.',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    // Check if it's a duplicate key error (user already exists)
    if (error.code === 11000 || error.name === 'MongoServerError' && error.message?.includes('duplicate')) {
      return res.status(400).json({ 
        message: 'User already exists' 
      });
    }
    
    // Check if it's a validation error
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        message: 'Validation error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    // Generic error
    res.status(500).json({ 
      message: 'Registration failed. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Login
router.post('/login', ensureDBConnection, async (req, res) => {
  try {

    // Validate request body
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        message: 'Email and password are required' 
      });
    }

    // Find user
    let user;
    try {
      user = await User.findOne({ email });
    } catch (dbError) {
      console.error('Database query error:', dbError);
      return res.status(503).json({ 
        message: 'Database error. Please try again later.',
        error: process.env.NODE_ENV === 'development' ? dbError.message : undefined
      });
    }

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check if suspended
    if (user.isSuspended) {
      return res.status(403).json({ 
        message: 'Account suspended',
        reason: user.suspendReason,
        feedback: user.suspendFeedback,
      });
    }

    // Handle Google authentication (password starts with 'google-auth')
    const isGoogleAuth = password && password.startsWith('google-auth');
    
    if (!isGoogleAuth) {
      // Verify password for regular login
      // Check if user has a password (for Google users who might not have password)
      if (!user.password) {
        return res.status(401).json({ 
          message: 'Invalid credentials. Please use Google login.' 
        });
      }

      try {
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
          return res.status(401).json({ message: 'Invalid credentials' });
        }
      } catch (bcryptError) {
        console.error('Password comparison error:', bcryptError);
        return res.status(500).json({ 
          message: 'Authentication error. Please try again.',
          error: process.env.NODE_ENV === 'development' ? bcryptError.message : undefined
        });
      }
    }

    // Generate token
    let token;
    try {
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret || jwtSecret === 'your-secret-key') {
        console.error('JWT_SECRET not properly configured');
        return res.status(500).json({ 
          message: 'Server configuration error. Please contact administrator.' 
        });
      }

      token = jwt.sign(
        { userId: user._id.toString(), email: user.email, role: user.role },
        jwtSecret,
        { expiresIn: '7d' }
      );
    } catch (jwtError) {
      console.error('JWT token generation error:', jwtError);
      return res.status(500).json({ 
        message: 'Token generation failed. Please try again.',
        error: process.env.NODE_ENV === 'development' ? jwtError.message : undefined
      });
    }

    // Set cookie with cross-origin support
    const isProduction = process.env.NODE_ENV === 'production';
    try {
      res.cookie('token', token, {
        httpOnly: true,
        secure: isProduction, // Must be true for sameSite: 'none'
        sameSite: isProduction ? 'none' : 'lax', // 'none' for cross-origin in production
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/',
      });
    } catch (cookieError) {
      console.error('Cookie setting error:', cookieError);
      // Cookie error is not critical, continue with response
    }

    // Send response with token for Authorization header fallback
    res.json({
      message: 'Login successful',
      token: token, // Also send token in response for Authorization header fallback
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        photoURL: user.photoURL,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    console.error('Error stack:', error.stack);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    
    // Check if it's a database connection error
    if (error.name === 'MongoServerError' || 
        error.name === 'MongoNetworkError' ||
        error.message?.includes('MongoServerError') ||
        error.message?.includes('MongoNetworkError') ||
        error.message?.includes('connection') ||
        error.message?.includes('timeout')) {
      return res.status(503).json({ 
        message: 'Database connection error. Please check your MongoDB connection.',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
    
    // Check if it's a validation error
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        message: 'Validation error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    // Check if it's a JWT error
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        message: 'Token error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
    
    // Generic error
    res.status(500).json({ 
      message: 'Login failed. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Logout
router.post('/logout', (req, res) => {
  try {
    const isProduction = process.env.NODE_ENV === 'production';
    // Clear cookie with same settings as login
    res.clearCookie('token', {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: '/',
    });
    res.json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error);
    // Even if cookie clearing fails, return success (user is logged out on client side)
    res.json({ message: 'Logout successful' });
  }
});

// Get current user
router.get('/me', ensureDBConnection, async (req, res) => {
  try {

    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Also send token in response for frontend to store (if not already in localStorage)
    // This helps users who logged in before the localStorage fix
    res.json({
      ...user.toObject(),
      token: token, // Include token so frontend can store it
    });
  } catch (error) {
    console.error('Get current user error:', error);
    // Check if it's a JWT error
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }
    // Check if it's a database connection error
    if (error.name === 'MongoServerError' || error.message.includes('MongoServerError')) {
      return res.status(500).json({ 
        message: 'Database connection error. Please check your MongoDB connection.' 
      });
    }
    res.status(401).json({ message: 'Invalid token' });
  }
});

export default router;

