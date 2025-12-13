import mongoose from 'mongoose';

// Database connection - optimized for Vercel serverless
let isConnecting = false;

export const connectDB = async () => {
  // If already connected, return
  if (mongoose.connection.readyState === 1) {
    return;
  }

  // If already connecting, wait
  if (isConnecting) {
    return new Promise((resolve) => {
      const checkConnection = setInterval(() => {
        if (mongoose.connection.readyState === 1) {
          clearInterval(checkConnection);
          resolve();
        } else if (!isConnecting) {
          clearInterval(checkConnection);
          resolve();
        }
      }, 100);
    });
  }

  const mongoUri = process.env.MONGODB_URI;
  
  if (!mongoUri) {
    console.error('MONGODB_URI environment variable is not set!');
    throw new Error('MONGODB_URI not set');
  }

  isConnecting = true;

  try {
    // Check if already connected
    if (mongoose.connection.readyState === 1) {
      isConnecting = false;
      return;
    }

    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000, // 10 seconds timeout
      socketTimeoutMS: 45000, // 45 seconds socket timeout
      dbName: 'db_loan_link', // Explicitly set database name
      maxPoolSize: 10, // Maintain up to 10 socket connections
      minPoolSize: 1, // Maintain at least 1 socket connection
    });
    console.log('✅ MongoDB connected successfully');
    isConnecting = false;
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    isConnecting = false;
    throw err;
  }
};

// Handle MongoDB connection events
mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected.');
  // Don't auto-reconnect in serverless - will connect on next request
});

mongoose.connection.on('connected', () => {
  console.log('✅ MongoDB connection established');
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ MongoDB reconnected');
});

// Try to connect on startup (for non-serverless environments)
if (!process.env.VERCEL) {
  connectDB();
}

