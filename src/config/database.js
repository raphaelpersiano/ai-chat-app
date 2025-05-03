const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// Path to the SQLite database file
const dbPath = path.resolve(__dirname, "../../credit_sim.db");

// Initialize the database connection
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Error opening database:", err.message);
  } else {
    console.log("Connected to the SQLite database.");
    initializeDatabase();
  }
});

// Function to initialize database tables
function initializeDatabase() {
  db.serialize(() => {
    // Create UserCreditInsights table
    db.run(`
      CREATE TABLE IF NOT EXISTS UserCreditInsights (
          user_id TEXT PRIMARY KEY, 
          credit_score INTEGER, 
          collectability INTEGER, 
          outstanding_amount REAL, 
          number_of_unsecured_loan INTEGER, 
          number_of_secured_loan INTEGER, 
          penalty_amount REAL, 
          max_dpd INTEGER, 
          last_updated TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error("Error creating UserCreditInsights table:", err.message);
      else console.log("UserCreditInsights table checked/created.");
    });

    // Create UserTradelineData table
    db.run(`
      CREATE TABLE IF NOT EXISTS UserTradelineData (
          tradeline_id INTEGER PRIMARY KEY AUTOINCREMENT, 
          user_id TEXT REFERENCES UserCreditInsights(user_id), 
          creditor TEXT, 
          loan_type TEXT, 
          credit_limit REAL, 
          outstanding REAL, 
          monthly_payment REAL, 
          interest_rate REAL, 
          tenure INTEGER, 
          open_date TEXT, 
          status TEXT 
      )
    `, (err) => {
      if (err) console.error("Error creating UserTradelineData table:", err.message);
      else console.log("UserTradelineData table checked/created.");
    });

    // Create UserPaymentHistory table
    db.run(`
      CREATE TABLE IF NOT EXISTS UserPaymentHistory (
          payment_id INTEGER PRIMARY KEY AUTOINCREMENT, 
          tradeline_id INTEGER REFERENCES UserTradelineData(tradeline_id), 
          payment_date TEXT, 
          payment_amount REAL, 
          penalty_amount REAL, 
          dpd INTEGER 
      )
    `, (err) => {
      if (err) console.error("Error creating UserPaymentHistory table:", err.message);
      else console.log("UserPaymentHistory table checked/created.");
    });
    
    // Optional: Insert some dummy data for testing if tables are newly created
    // Note: This is a simple check; a more robust seeding mechanism might be needed
    db.get("SELECT COUNT(*) as count FROM UserCreditInsights", (err, row) => {
        if (!err && row.count === 0) {
            console.log("Inserting dummy data...");
            insertDummyData();
        }
    });
  });
}

// Function to insert dummy data (example)
function insertDummyData() {
    const dummyUserId = 'dummy_google_id_123'; // Use a consistent ID for testing
    db.run(`INSERT INTO UserCreditInsights (user_id, credit_score, collectability, outstanding_amount, number_of_unsecured_loan, number_of_secured_loan, penalty_amount, max_dpd) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 
        [dummyUserId, 680, 1, 55000000.00, 2, 1, 0.00, 15], (err) => {
        if (err) console.error("Error inserting dummy UserCreditInsights:", err.message);
        else {
            db.run(`INSERT INTO UserTradelineData (user_id, creditor, loan_type, credit_limit, outstanding, monthly_payment, interest_rate, tenure, open_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
                [dummyUserId, 'Bank ABC', 'Kartu Kredit', 10000000.00, 4500000.00, 500000.00, 18.5, null, '2022-01-15', 'Aktif'], function(err) { // Use function() to get lastID
                if (err) console.error("Error inserting dummy UserTradelineData (CC):", err.message);
                else {
                    const ccTradelineId = this.lastID;
                    db.run(`INSERT INTO UserPaymentHistory (tradeline_id, payment_date, payment_amount, penalty_amount, dpd) VALUES (?, ?, ?, ?, ?)`, 
                        [ccTradelineId, '2024-04-10', 500000.00, 0.00, 0]);
                    db.run(`INSERT INTO UserPaymentHistory (tradeline_id, payment_date, payment_amount, penalty_amount, dpd) VALUES (?, ?, ?, ?, ?)`, 
                        [ccTradelineId, '2024-03-12', 500000.00, 0.00, 0]);
                }
            });
            db.run(`INSERT INTO UserTradelineData (user_id, creditor, loan_type, credit_limit, outstanding, monthly_payment, interest_rate, tenure, open_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
                [dummyUserId, 'Finance XYZ', 'Pinjaman Pribadi', null, 10500000.00, 1200000.00, 12.0, 12, '2023-05-20', 'Aktif'], function(err) {
                if (err) console.error("Error inserting dummy UserTradelineData (PL):", err.message);
                else {
                     const plTradelineId = this.lastID;
                     db.run(`INSERT INTO UserPaymentHistory (tradeline_id, payment_date, payment_amount, penalty_amount, dpd) VALUES (?, ?, ?, ?, ?)`, 
                        [plTradelineId, '2024-04-20', 1200000.00, 0.00, 0]);
                     db.run(`INSERT INTO UserPaymentHistory (tradeline_id, payment_date, payment_amount, penalty_amount, dpd) VALUES (?, ?, ?, ?, ?)`, 
                        [plTradelineId, '2024-03-25', 1200000.00, 50000.00, 5]); // Example late payment
                }
            });
        }
    });
}

// Export the database connection object
module.exports = db;

