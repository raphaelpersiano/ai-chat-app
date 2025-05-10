const express = require("express");
const session = require("express-session");
const passport = require("./config/passport");
const cors = require("cors");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
const axios = require("axios");
const pool = require("./config/database"); // Import the PostgreSQL pool
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
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    // Consider using connect-pg-simple for session storage in production with PostgreSQL
  })
);

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

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
  (req, res) => {
    res.redirect("/chat");
  }
);

app.get("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    req.session.destroy((err) => {
        if (err) {
            return next(err);
        }
        res.clearCookie("connect.sid");
        res.redirect("/login");
    });
  });
});

// User info route
app.get("/api/user", isAuthenticated, (req, res) => {
  if (req.user && req.user.id) {
      res.json({
          id: req.user.id,
          displayName: req.user.displayName,
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
    const insightsRes = await pool.query("SELECT * FROM UserCreditInsights WHERE user_id = $1", [userId]);
    if (insightsRes.rows.length === 0) {
      return null; // No data found for user
    }
    creditData.insights = insightsRes.rows[0];

    // Fetch tradelines
    const tradelinesRes = await pool.query("SELECT * FROM UserTradelineData WHERE user_id = $1", [userId]);
    creditData.tradelines = tradelinesRes.rows || [];

    // Fetch payment history for each tradeline
    for (const tl of creditData.tradelines) {
      const historyRes = await pool.query("SELECT * FROM UserPaymentHistory WHERE tradeline_id = $1 ORDER BY payment_date DESC", [tl.tradeline_id]);
      tl.paymentHistory = historyRes.rows || [];
    }

    return creditData;
  } catch (err) {
    console.error("Error fetching credit data from PostgreSQL:", err);
    throw err; // Re-throw the error to be caught by the caller
  }
}
// --- End Helper function ---

io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);
  // TODO: Properly associate socket with authenticated user ID from session/handshake
  const currentUserId = "dummy_google_id_123"; // Still using dummy ID for simulation

  const conversationHistory = [
    {
      role: "system",
      content: `
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
      `
    },
    {
      role: "assistant",
      content: "Hello! Welcome to Chat App. I'm here to help you understand your credit data and share tips to keep your score healthy. Feel free to ask me anything."
    }
  ];
  

  socket.on("sendMessage", async (message) => {
    console.log(`Message received from ${socket.id}:`, message);
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
      // --- Fetch credit data for the user (using PostgreSQL helper) ---
      const userCreditData = await getCreditDataForUser(currentUserId);
      let creditDataContext = "No credit data available for this user.";
      if (userCreditData) {
          creditDataContext = `User Credit Data:\nInsights: ${JSON.stringify(userCreditData.insights)}\nTradelines: ${JSON.stringify(userCreditData.tradelines)}`;
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
          model: "meta-llama/llama-4-scout:free",
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

      console.log(`AI Response for ${socket.id}:`, aiResponseText);
      conversationHistory.push({ role: "assistant", content: aiResponseText });

      socket.emit("receiveMessage", {
        sender: "Admin",
        text: aiResponseText,
        timestamp: new Date(),
      });

    } catch (error) {
      console.error("Error during AI processing or data fetching:", error.response ? error.response.data : error.message);
      conversationHistory.pop();
      socket.emit("receiveMessage", {
        sender: "Admin",
        text: "Maaf, terjadi kesalahan saat memproses permintaan Anda atau mengambil data kredit.",
        timestamp: new Date(),
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
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

