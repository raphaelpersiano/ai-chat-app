const express = require("express");
const session = require("express-session");
const passport = require("./config/passport");
const cors = require("cors");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
const axios = require("axios");
const pool = require("./config/database"); // Import the PostgreSQL pool
const sharedsession = require("express-socket.io-session"); // Import shared session
require("dotenv").config();

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../public")));

// Session configuration
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  // Consider using connect-pg-simple for session storage in production with PostgreSQL
});
app.use(sessionMiddleware);

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Share session with Socket.IO
io.use(sharedsession(sessionMiddleware, {
    autoSave: true
}));

// Authentication middleware
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/login");
};

// Routes
app.get("/", (req, res) => {
  if (req.isAuthenticated()) {
    res.redirect("/chat");
  } else {
    res.redirect("/login");
  }
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/login.html"));
});

app.get("/chat", isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, "../public/chat.html"));
});

// Google OAuth routes
app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  async (req, res) => {
    if (req.user && req.user.id) {
      const { id, displayName, email } = req.user;

      try {
        // Cek apakah user_id sudah ada di usercreditinsights
        const result = await pool.query(
          "SELECT 1 FROM usercreditinsights WHERE user_id = $1",
          [id]
        );

        if (result.rows.length === 0) {
          console.log(`User ${id} tidak ada di usercreditinsights. Membuat dummy data.`);

          // 1️⃣ Insert ke usercreditinsights
          await pool.query(
            `INSERT INTO usercreditinsights (
              user_id, credit_score, collectability, outstanding_amount,
              number_of_unsecured_loan, number_of_secured_loan, penalty_amount,
              max_dpd, last_updated, number_of_cc, full_name, email
            ) VALUES (
              $1, 650, 1, 10000000, 2, 1, 0, 5, NOW(), 1, $2, $3
            )`,
            [id, displayName, email]
          );

          // 2️⃣ Insert ke usertradelinedata (dummy 2 tradeline)
          const tradelineRes = await pool.query(
            `INSERT INTO usertradelinedata (
              user_id, creditor, loan_type, credit_limit, outstanding,
              monthly_payment, interest_rate, tenure, open_date, status
            ) VALUES
              ($1, 'Bank ABC', 'personal_loan', 5000000, 3000000, 500000, 12.5, 24, NOW(), 'active'),
              ($1, 'Bank XYZ', 'credit_card', 10000000, 2000000, 300000, 18.0, 36, NOW(), 'active')
            RETURNING tradeline_id`,
            [id]
          );

          const tradelineIds = tradelineRes.rows.map(row => row.tradeline_id);

          // 3️⃣ Insert ke userpaymenthistory untuk masing-masing tradeline
          for (const tid of tradelineIds) {
            await pool.query(
              `INSERT INTO userpaymenthistory (
                tradeline_id, payment_date, payment_amount, penalty_amount, dpd
              ) VALUES
                ($1, NOW() - INTERVAL '30 days', 500000, 0, 0),
                ($1, NOW() - INTERVAL '60 days', 500000, 0, 0)`,
              [tid]
            );
          }

          console.log(`Dummy data berhasil dibuat untuk user ${id}`);
        } else {
          console.log(`User ${id} sudah ada di usercreditinsights.`);
        }

        // Tetap update basic user info (full_name, email, last_updated)
        await pool.query(
          `INSERT INTO usercreditinsights (user_id, full_name, email, last_updated)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (user_id)
           DO UPDATE SET full_name = EXCLUDED.full_name, email = EXCLUDED.email, last_updated = NOW()`,
          [id, displayName, email]
        );

      } catch (err) {
        console.error("Error checking/inserting user data:", err);
      }

      res.redirect("/chat");
    } else {
      res.redirect("/login");
    }
  }
);

// User info route
app.get("/api/user", isAuthenticated, (req, res) => {
  if (req.user && req.user.id) {
      res.json({
          id: req.user.id,
          full_name: req.user.displayName, // Tetap kirim displayName dari Google
          email: req.user.email,
          photo: req.user.photo
      });
  } else {
      res.status(401).json({ error: "User not authenticated or user data missing" });
  }
});

// --- Helper function to get credit data (PostgreSQL version) ---
async function getCreditDataForUser(userId) {
  const creditData = {};
  try {
    // Fetch insights
    const insightsRes = await pool.query("SELECT * FROM usercreditinsights WHERE user_id = $1", [userId]);
    if (insightsRes.rows.length === 0) {
      console.log(`No credit insights found for user ${userId}. They might need dummy data inserted.`);
      return null; 
    }
    creditData.insights = insightsRes.rows[0];

    // Fetch tradelines
    const tradelinesRes = await pool.query("SELECT * FROM usertradelinedata WHERE user_id = $1", [userId]);
    creditData.tradelines = tradelinesRes.rows || [];

    // Fetch payment history for each tradeline
    for (const tl of creditData.tradelines) {
      const historyRes = await pool.query("SELECT * FROM userpaymenthistory WHERE tradeline_id = $1 ORDER BY payment_date DESC", [tl.tradeline_id]);
      tl.paymentHistory = historyRes.rows || [];
    }

    return creditData;
  } catch (err) {
    console.error(`Error fetching credit data for user ${userId} from PostgreSQL:`, err);
    throw err;
  }
}
// --- End Helper function ---

io.on("connection", (socket) => {
  // --- Access user session data via socket handshake ---
  let currentUserId = null;
  if (socket.handshake.session && socket.handshake.session.passport && socket.handshake.session.passport.user) {
      currentUserId = socket.handshake.session.passport.user; // This should be the Google ID
      console.log(`Client connected: ${socket.id}, User ID: ${currentUserId}`);
  } else {
      console.log(`Client connected: ${socket.id}, but user is not authenticated via session.`);
      // Optionally disconnect unauthenticated sockets or handle them differently
      // socket.disconnect(true);
      // return;
  }
  // --- End Access user session data ---

  const conversationHistory = [
    { role: "system", content: `
        You are an assistant helping users understand their credit data in this chat application.
        You understand user's credit data, including account types, outstanding balances, credit limits, payment history, credit scores, etc.
        Your role is to explain the user's credit profile and payment behavior in simple way and give practical advice they can take to maintain or improve their credit score.
        Your tone should resemble that of a friendly financial advisor who doesn’t sound condescending. Use everyday, polite, short/concise, and easy-to-understand language.
        Every amount is always on Rupiah currency, never use other currency.
        You must only answer questions related to credit. If the user asks about anything unrelated to credit, politely decline and explain that you are a credit assistant and not designed to assist with other topics.
        If user has some loan and don't have any financial difficulty, you can offer them our financial product partners (kredivo for paylater, adapundi for cash loan, skorcard for credit card).
        If user has some financial difficulty and they don't own any valuable asset (no closed secured loan), you can offer them mediation, advisory, debt repayment plan.
        If user has some financial difficulty, own any valuable asset (closed secured loan), and asset used as collateral (has active secured loan), you can offer them takeover, mediation.
        If user has some financial difficulty, own any valuable asset (closed secured loan), and asset not used as collateral (no active secured loan), you can offer collateralization, consolidation.
        If user doesn't have any loan, you canoffer them to start their first credit reputation building via our financial product partners (kredivo for paylater, adapundi for cash loan, skorcard for credit card).
        For any mediation, advisory, or debt repayment plan services, please contact Fuja (+628675629222).
        Never recommend user to talk with collectors. We need to give it to Fuja to solve for them, therefore user has to pay Fuja for the service.
        For any refinancing or takeover services, please contact Raphael (+6287879565390).
        Avoid technical terms unless the user asks for it.
        Never tell any data without being asked.
        Always write in narratives, never utilize bullet-point or number-list.
        Your response is maximum 3 sentences, so be wise to allocate the last sentences for recommendation or follow-up question or clarification question.
        never bold any text, and always use bahasa indonesia.
      ` },
    { role: "assistant", content: "Halo! Selamat datang. Saya adalah asisten kredit AI Anda. Tanyakan apa saja tentang data kredit simulasi Anda." }
  ];

  socket.on("sendMessage", async (message) => {
    // --- Check if user ID is available ---
    if (!currentUserId) {
        console.log(`Message received from unauthenticated socket ${socket.id}`);
        socket.emit("receiveMessage", { sender: "Admin", text: "Sesi Anda tidak valid atau telah berakhir. Silakan login kembali.", timestamp: new Date() });
        return;
    }
    // --- End Check user ID ---

    console.log(`Message received from ${socket.id} (User: ${currentUserId}):`, message);
    conversationHistory.push({ role: "user", content: message.text });

    const openRouterApiKey = process.env.OPENROUTER_API_KEY;
    const openRouterUrl = process.env.OPENROUTER_URL || "https://openrouter.ai/api/v1/chat/completions";

    if (!process.env.DATABASE_URL) {
        console.error("DATABASE_URL not configured.");
        socket.emit("receiveMessage", { sender: "Admin", text: "Maaf, konfigurasi database belum selesai.", timestamp: new Date() });
        conversationHistory.pop();
        return;
    }
    if (!openRouterApiKey || openRouterApiKey === "your_openrouter_api_key") {
      console.warn("OpenRouter API key not configured.");
      socket.emit("receiveMessage", { sender: "Admin", text: "Maaf, konfigurasi AI admin belum selesai.", timestamp: new Date() });
      conversationHistory.pop();
      return;
    }

    try {
      // --- Fetch credit data for the AUTHENTICATED user ---
      const userCreditData = await getCreditDataForUser(currentUserId);
      let creditDataContext = "No credit data available for this user.";
      if (userCreditData) {
          // Only include relevant parts, avoid sending sensitive info like email back to LLM if not needed
          const insightsForLLM = { ...userCreditData.insights };
          delete insightsForLLM.user_id;
          delete insightsForLLM.email;
          delete insightsForLLM.last_updated;
          
          creditDataContext = `User Credit Data:\nInsights: ${JSON.stringify(insightsForLLM)}\nTradelines: ${JSON.stringify(userCreditData.tradelines)}`;
      } else {
          console.log(`No credit data found for user ${currentUserId} in DB.`);
          // Optionally inform the user or just proceed without context
          creditDataContext = "No specific credit data found for your account in the simulation database.";
      }
      // --- End Fetch credit data ---

      const messagesForLLM = [
          ...conversationHistory.slice(0, 1),
          { role: "system", content: `Current User's Simulated Credit Data:\n${creditDataContext}` },
          ...conversationHistory.slice(1)
      ];

      const response = await axios.post(
        openRouterUrl,
        {
          model: "google/gemini-2.0-flash-exp:free",
          messages: messagesForLLM,
        },
        {
          headers: {
            "Authorization": `Bearer ${openRouterApiKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      let aiResponseText = "Maaf, saya tidak bisa merespons saat ini.";
      if (response.data && response.data.choices && response.data.choices.length > 0) {
        aiResponseText = response.data.choices[0].message.content;
      }

      console.log(`AI Response for ${socket.id} (User: ${currentUserId}):`, aiResponseText);
      conversationHistory.push({ role: "assistant", content: aiResponseText });

      socket.emit("receiveMessage", {
        sender: "Admin",
        text: aiResponseText,
        timestamp: new Date(),
      });

    } catch (error) {
      console.error(`Error during AI processing or data fetching for user ${currentUserId}:`, error.response ? error.response.data : error.message);
      conversationHistory.pop();
      socket.emit("receiveMessage", {
        sender: "Admin",
        text: "Maaf, terjadi kesalahan saat memproses permintaan Anda atau mengambil data kredit.",
        timestamp: new Date(),
      });
    }
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id} (User: ${currentUserId || 'N/A'})`);
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  if (process.env.DATABASE_URL) {
      console.log("Attempting to connect to PostgreSQL via DATABASE_URL");
  } else {
      console.warn("DATABASE_URL environment variable is not set. Database operations will fail.");
  }
});

module.exports = { app, server, io };

