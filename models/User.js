import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  photoURL: {
    type: String,
    default: '',
  },
  role: {
    type: String,
    enum: ['borrower', 'manager', 'admin'],
    default: 'borrower',
  },
  password: {
    type: String,
    required: true,
  },
  isSuspended: {
    type: Boolean,
    default: false,
  },
  suspendReason: {
    type: String,
    default: '',
  },
  suspendFeedback: {
    type: String,
    default: '',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model('User', userSchema);

