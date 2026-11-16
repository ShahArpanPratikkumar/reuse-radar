const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/reuseradar';

  try {
    const isAtlas = uri.includes('@');
    console.log(`[MongoDB] Connecting to ${isAtlas ? 'MongoDB Atlas Cloud' : 'Local MongoDB'}...`);

    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000, // Fail fast (5s) instead of hanging indefinitely
    });

    console.log(`✅ [MongoDB] Successfully Connected to: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`❌ [MongoDB] Connection Failed: ${error.message}`);

    // If Atlas failed, try falling back to local MongoDB if available
    const localUri = 'mongodb://127.0.0.1:27017/reuseradar';
    if (uri !== localUri) {
      console.log(`🔄 [MongoDB] Attempting fallback to local MongoDB (${localUri})...`);
      try {
        const localConn = await mongoose.connect(localUri, {
          serverSelectionTimeoutMS: 3000,
        });
        console.log(`✅ [MongoDB] Connected to Local Database: ${localConn.connection.host}`);
        return localConn;
      } catch (localErr) {
        console.error(`❌ [MongoDB] Local fallback also failed: ${localErr.message}`);
      }
    }
  }
};

module.exports = connectDB;
