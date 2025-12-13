import express from 'express';
import User from '../models/User.js';
import { verifyToken, checkRole } from '../middleware/auth.js';

const router = express.Router();

// Get all users (Admin only)
router.get('/', verifyToken, checkRole('admin'), async (req, res) => {
  try {
    const { search, role, page = 1, limit = 10 } = req.query;
    let query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    if (role) {
      query.role = role;
    }

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(query);

    res.json({
      users,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update user role (Admin only)
router.put('/:id/role', verifyToken, checkRole('admin'), async (req, res) => {
  try {
    const { role } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.role = role;
    await user.save();

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Suspend user (Admin only)
router.put('/:id/suspend', verifyToken, checkRole('admin'), async (req, res) => {
  try {
    const { suspendReason, suspendFeedback } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.isSuspended = true;
    user.suspendReason = suspendReason;
    user.suspendFeedback = suspendFeedback;
    await user.save();

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Unsuspend user (Admin only)
router.put('/:id/unsuspend', verifyToken, checkRole('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.isSuspended = false;
    user.suspendReason = '';
    user.suspendFeedback = '';
    await user.save();

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;

