import express from 'express';
import mongoose from 'mongoose';
import ContactMessage from '../models/ContactMessage.js';
import { verifyToken, checkRole } from '../middleware/auth.js';
import { connectDB } from '../db.js';
import { sendContactReply } from '../utils/emailService.js';

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

// Submit contact message (Public, but can accept optional token for logged-in users)
router.post('/', ensureDBConnection, async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({ 
        message: 'All fields are required' 
      });
    }

    // Check if user is logged in (optional token)
    let userId = null;
    try {
      const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
      if (token) {
        const jwt = await import('jsonwebtoken');
        const decoded = jwt.default.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        userId = decoded.userId;
      }
    } catch (tokenError) {
      // Token invalid or not provided - continue as anonymous user
      userId = null;
    }

    const contactMessage = new ContactMessage({
      name,
      email,
      subject,
      message,
      userId: userId || null, // Save userId if user is logged in
    });

    await contactMessage.save();

    res.status(201).json({
      message: 'Thank you for contacting us! We will get back to you soon.',
      id: contactMessage._id,
    });
  } catch (error) {
    console.error('Contact message error:', error);
    res.status(500).json({ 
      message: 'Failed to send message. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get all contact messages (Admin only)
router.get('/', verifyToken, checkRole('admin'), ensureDBConnection, async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    let query = {};

    if (status) {
      query.status = status;
    }

    const messages = await ContactMessage.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await ContactMessage.countDocuments(query);

    res.json({
      messages,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    console.error('Get contact messages error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get single contact message (Admin only)
router.get('/:id', verifyToken, checkRole('admin'), ensureDBConnection, async (req, res) => {
  try {
    const message = await ContactMessage.findById(req.params.id);
    
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Mark as read if it's new
    if (message.status === 'New') {
      message.status = 'Read';
      await message.save();
    }

    res.json(message);
  } catch (error) {
    console.error('Get contact message error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Update message status (Admin only)
router.patch('/:id/status', verifyToken, checkRole('admin'), ensureDBConnection, async (req, res) => {
  try {
    const { status, replyMessage } = req.body;
    const message = await ContactMessage.findById(req.params.id);

    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    if (status) {
      message.status = status;
    }

    if (replyMessage) {
      message.replyMessage = replyMessage;
      message.repliedAt = new Date();
      message.status = 'Replied';
      
      await message.save();

      // Send reply email to the user
      try {
        const emailResult = await sendContactReply(message, replyMessage);
        if (emailResult.success) {
          console.log('📧 Reply email sent successfully to:', message.email);
        } else {
          console.error('📧 Failed to send reply email:', emailResult.error);
          // Don't fail the request if email fails, reply is still saved
        }
      } catch (emailError) {
        console.error('📧 Email sending error:', emailError);
        // Continue even if email fails
      }
    } else {
      await message.save();
    }

    res.json({
      message: 'Message updated successfully',
      contactMessage: message,
    });
  } catch (error) {
    console.error('Update message error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get user's own messages (Logged-in users)
router.get('/my-messages', verifyToken, ensureDBConnection, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const messages = await ContactMessage.find({ userId: req.user.userId })
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await ContactMessage.countDocuments({ userId: req.user.userId });

    res.json({
      messages,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    console.error('Get user messages error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get single user message (Logged-in users can view their own messages)
router.get('/my-messages/:id', verifyToken, ensureDBConnection, async (req, res) => {
  try {
    const message = await ContactMessage.findOne({
      _id: req.params.id,
      userId: req.user.userId, // Ensure user can only view their own messages
    });
    
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    res.json(message);
  } catch (error) {
    console.error('Get user message error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Delete contact message (Admin only)
router.delete('/:id', verifyToken, checkRole('admin'), ensureDBConnection, async (req, res) => {
  try {
    const message = await ContactMessage.findByIdAndDelete(req.params.id);
    
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ message: error.message });
  }
});

export default router;

