import mongoose from 'mongoose';

const loanApplicationSchema = new mongoose.Schema({
  loanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Loan',
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  userEmail: {
    type: String,
    required: true,
  },
  loanTitle: {
    type: String,
    required: true,
  },
  interestRate: {
    type: Number,
    required: true,
  },
  firstName: {
    type: String,
    required: true,
  },
  lastName: {
    type: String,
    required: true,
  },
  contactNumber: {
    type: String,
    required: true,
  },
  nationalId: {
    type: String,
    required: true,
  },
  incomeSource: {
    type: String,
    required: true,
  },
  monthlyIncome: {
    type: Number,
    required: true,
  },
  loanAmount: {
    type: Number,
    required: true,
  },
  reasonForLoan: {
    type: String,
    required: true,
  },
  address: {
    type: String,
    required: true,
  },
  extraNotes: {
    type: String,
    default: '',
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending',
  },
  applicationFeeStatus: {
    type: String,
    enum: ['Paid', 'Unpaid'],
    default: 'Unpaid',
  },
  paymentDetails: {
    transactionId: String,
    paymentDate: Date,
    amount: Number,
  },
  approvedAt: {
    type: Date,
  },
  // Repayment fields
  repaymentSchedule: {
    type: String,
    enum: ['Monthly', 'Weekly'],
    default: 'Monthly',
  },
  totalAmount: {
    type: Number,
    default: 0, // Loan amount + interest
  },
  paidAmount: {
    type: Number,
    default: 0,
  },
  remainingAmount: {
    type: Number,
    default: 0,
  },
  repayments: [{
    amount: {
      type: Number,
      required: true,
    },
    paymentDate: {
      type: Date,
      default: Date.now,
    },
    transactionId: String,
    paymentMethod: String,
  }],
  repaymentStatus: {
    type: String,
    enum: ['Pending', 'In Progress', 'Complete'],
    default: 'Pending',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model('LoanApplication', loanApplicationSchema);

