const { Pool } = require("pg");
require("dotenv").config();

// Check if the DATABASE_URL environment variable is set (for main application database)
if (!process.env.DATABASE_URL) {
  console.error("FATAL ERROR: DATABASE_URL environment variable is not set.");
  console.error("This is required for the main application database (user credit data).");
  // In a real application, you might want to exit or handle this more gracefully
  // For now, we create a dummy pool to avoid immediate crashes on require, 
  // but operations will fail.
  // process.exit(1); // Uncomment to force exit if DATABASE_URL is missing
}

// Check if the SUPABASE_DATABASE_URL environment variable is set (for chat logging)
if (!process.env.SUPABASE_DATABASE_URL) {
  console.error("FATAL ERROR: SUPABASE_DATABASE_URL environment variable is not set.");
  console.error("This is required for chat logging functionality.");
  // Chat logging will be disabled if this is missing
}

// Create a new pool instance for the main application database
// This is used for user credit data, tradelines, payment history, etc.
const mainPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Optional: Add SSL configuration if required by your provider
  // ssl: {
  //   rejectUnauthorized: process.env.NODE_ENV === "production", // Adjust based on your needs
  // }
});

// Create a new pool instance for Supabase (chat logging)
// This is used for chat sessions, messages, and analytics
const supabasePool = process.env.SUPABASE_DATABASE_URL ? new Pool({
  connectionString: process.env.SUPABASE_DATABASE_URL,
  // Supabase usually requires SSL in production
  ssl: {
    rejectUnauthorized: process.env.NODE_ENV === "production",
  }
}) : null;

// Test the main database connection (optional but recommended)
mainPool.query("SELECT NOW()", (err, res) => {
  if (err) {
    console.error("Error connecting to main PostgreSQL database:", err.message);
    // If connection fails, subsequent queries will also likely fail.
  } else {
    console.log("Successfully connected to main PostgreSQL database at", res.rows[0].now);
  }
});

// Test the Supabase connection (optional but recommended)
if (supabasePool) {
  supabasePool.query("SELECT NOW()", (err, res) => {
    if (err) {
      console.error("Error connecting to Supabase database:", err.message);
      console.error("Chat logging functionality will be disabled.");
    } else {
      console.log("Successfully connected to Supabase database at", res.rows[0].now);
      console.log("Chat logging functionality is enabled.");
    }
  });
} else {
  console.warn("Supabase database connection not configured. Chat logging will be disabled.");
}

// Export both pools for use in other parts of the application
module.exports = {
  // Main application database pool (for user credit data)
  pool: mainPool,
  mainPool: mainPool,
  
  // Supabase database pool (for chat logging)
  supabasePool: supabasePool,
  
  // Helper function to check if chat logging is available
  isChatLoggingEnabled: () => {
    return supabasePool !== null && process.env.ENABLE_CHAT_LOGGING !== 'false';
  },
  
  // Helper function to get the appropriate pool for chat logging
  getChatLoggingPool: () => {
    if (!supabasePool) {
      throw new Error('Chat logging is not configured. Please set SUPABASE_DATABASE_URL in your environment variables.');
    }
    return supabasePool;
  }
};

// For backward compatibility, export the main pool as default
// This ensures existing code that uses `require('./config/database')` still works
module.exports.default = mainPool;

