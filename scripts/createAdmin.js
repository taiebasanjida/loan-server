import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

// Admin credentials
const ADMIN_EMAIL = 'admin@loanlink.com';
const ADMIN_PASSWORD = 'Admin@123';
const ADMIN_NAME = 'LoanLink Admin';

// User Schema (inline to avoid import issues)
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  photoURL: { type: String, default: '' },
  role: { type: String, enum: ['borrower', 'manager', 'admin'], default: 'borrower' },
  password: { type: String, required: true },
  isSuspended: { type: Boolean, default: false },
  suspendReason: { type: String, default: '' },
  suspendFeedback: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model('User', userSchema);

async function createAdmin() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/loanlink';
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: ADMIN_EMAIL });
    if (existingAdmin) {
      console.log('Admin user already exists!');
      console.log('Email:', ADMIN_EMAIL);
      console.log('Role:', existingAdmin.role);
      await mongoose.disconnect();
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);

    // Create admin user
    const admin = new User({
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      password: hashedPassword,
      role: 'admin',
      photoURL: 'https://ui-avatars.com/api/?name=LoanLink+Admin&background=0D9488&color=fff',
    });

    await admin.save();

    console.log('\n✅ Admin user created successfully!');
    console.log('=====================================');
    console.log('Email:', ADMIN_EMAIL);
    console.log('Password:', ADMIN_PASSWORD);
    console.log('Role: admin');
    console.log('=====================================\n');

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error creating admin:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

createAdmin();

