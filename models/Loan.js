import mongoose from 'mongoose';

const loanSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    required: true,
  },
  interestRate: {
    type: Number,
    required: true,
  },
  maxLoanLimit: {
    type: Number,
    required: true,
  },
  requiredDocuments: {
    type: [String],
    default: [],
  },
  emiPlans: {
    type: [String],
    required: true,
  },
  images: {
    type: [String],
    default: [],
  },
  showOnHome: {
    type: Boolean,
    default: false,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model('Loan', loanSchema);

