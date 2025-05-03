const { Pool } = require("pg");
require("dotenv").config();

// Check if the DATABASE_URL environment variable is set
if (!process.env.DATABASE_URL) {
  console.error("FATAL ERROR: DATABASE_URL environment variable is not set.");
  // In a real application, you might want to exit or handle this more gracefully
  // For now, we create a dummy pool to avoid immediate crashes on require, 
  // but operations will fail.
  // process.exit(1); // Uncomment to force exit if DATABASE_URL is missing
}

// Create a new pool instance using the connection string from the environment variable
// It's recommended to use DATABASE_URL for connection strings (e.g., from Neon, Heroku, Render)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Optional: Add SSL configuration if required by your provider (Neon usually requires it)
  // ssl: {
  //   rejectUnauthorized: process.env.NODE_ENV === "production", // Adjust based on your needs
  // }
});

// Test the connection (optional but recommended)
pool.query("SELECT NOW()", (err, res) => {
  if (err) {
    console.error("Error connecting to PostgreSQL database:", err.message);
    // If connection fails, subsequent queries will also likely fail.
  } else {
    console.log("Successfully connected to PostgreSQL database at", res.rows[0].now);
  }
});

// Export the pool for use in other parts of the application
module.exports = pool;

