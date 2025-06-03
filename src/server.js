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
const pdfParse = require("pdf-parse"); // Import pdf-parse
require("dotenv").config();

// --- Knowledge Base Configuration ---
// Use an array for multiple knowledge base URLs
const KNOWLEDGE_BASE_PDF_URLS = [
  "https://storage.googleapis.com/campaign-skorlife/SkorBot%20Briefing%20v1.pdf",
  "https://storage.googleapis.com/campaign-skorlife/SkorBot%20Briefing%20v1.pdf",
  "https://storage.googleapis.com/campaign-skorlife/SkorBot%20Briefing%20v1.pdf",
  "https://storage.googleapis.com/campaign-skorlife/SkorBot%20Briefing%20v1.pdf",
  "https://storage.googleapis.com/campaign-skorlife/SkorBot%20Briefing%20v1.pdf"
];
let knowledgeBaseContent = `Anda adalah asisten AI dasar. Knowledge base belum dimuat atau gagal dimuat.`; // Default fallback

// --- Function to Fetch and Extract Knowledge Base from Multiple URLs ---
async function updateKnowledgeBase() {
  console.log(`Mencoba mengambil knowledge base dari ${KNOWLEDGE_BASE_PDF_URLS.length} sumber PDF...`);
  let combinedText = "";
  let successCount = 0;

  // Use Promise.allSettled to fetch and parse all PDFs concurrently
  const results = await Promise.allSettled(
    KNOWLEDGE_BASE_PDF_URLS.map(async (url) => {
      try {
        console.log(`Mengambil dari: ${url}`);
        const response = await axios.get(url, {
          responseType: "arraybuffer",
          timeout: 15000, // Add timeout for network requests
        });
        const data = await pdfParse(response.data);
        console.log(`Berhasil mengekstrak dari: ${url}`);
        return data.text;
      } catch (error) {
        console.error(`Gagal mengambil atau mengekstrak dari ${url}:`, error.message);
        // Throw error to be caught by allSettled as 'rejected'
        throw new Error(`Gagal memproses ${url}: ${error.message}`);
      }
    })
  );

  // Process results
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      // Optional: Add separator or context marker between documents
      combinedText += `\n\n--- Knowledge Base Dokumen ${index + 1} ---\n\n` + result.value;
      successCount++;
    } else {
      console.error(`Gagal memproses URL ${KNOWLEDGE_BASE_PDF_URLS[index]}: ${result.reason}`);
    }
  });

  if (successCount > 0) {
    knowledgeBaseContent = combinedText.trim();
    console.log(`Berhasil memuat dan menggabungkan ${successCount} dari ${KNOWLEDGE_BASE_PDF_URLS.length} knowledge base PDF.`);
  } else {
    console.error("Gagal memuat semua knowledge base PDF. Menggunakan fallback.");
    // Keep the default fallback content
  }
}
// --- End Knowledge Base Function ---

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
  secret: process.env.SESSION_SECRET || "default_secret", // Use env var or default
  resave: false,
  saveUninitialized: false,
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
        const result = await pool.query(
          "SELECT 1 FROM usercreditinsights WHERE user_id = $1",
          [id]
        );
        if (result.rows.length === 0) {
          console.log(`User ${id} tidak ada di usercreditinsights. Membuat dummy data.`);
           await pool.query(
            `INSERT INTO usercreditinsights (
              user_id, credit_score, KOL_score, outstanding_amount,
              number_of_unsecured_loan, number_of_secured_loan, penalty_amount,
              max_dpd, last_updated, number_of_cc, full_name, email
            ) VALUES (
              $1, 650, 1, 10000000, 2, 1, 0, 5, NOW(), 1, $2, $3
            )`,
            [id, displayName, email]
          );
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
          full_name: req.user.displayName,
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
    const insightsRes = await pool.query("SELECT * FROM usercreditinsights WHERE user_id = $1", [userId]);
    if (insightsRes.rows.length === 0) {
      console.log(`No credit insights found for user ${userId}.`);
      return null;
    }
    creditData.insights = insightsRes.rows[0];
    const tradelinesRes = await pool.query("SELECT * FROM usertradelinedata WHERE user_id = $1", [userId]);
    creditData.tradelines = tradelinesRes.rows || [];
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
  let currentUserId = null;
  if (socket.handshake.session && socket.handshake.session.passport && socket.handshake.session.passport.user) {
      currentUserId = socket.handshake.session.passport.user;
      console.log(`Client connected: ${socket.id}, User ID: ${currentUserId}`);
  } else {
      console.log(`Client connected: ${socket.id}, but user is not authenticated via session.`);
  }

  // Initialize conversation history using the combined knowledge base
  const conversationHistory = [
    { role: "system", content: knowledgeBaseContent }, // Use the combined dynamic content
    { role: "assistant", content: "Halo! Selamat datang. Saya adalah asisten kredit AI Anda. Tanyakan apa saja tentang data kredit simulasi Anda." }
  ];

  socket.on("sendMessage", async (message) => {
    if (!currentUserId) {
        console.log(`Message received from unauthenticated socket ${socket.id}`);
        socket.emit("receiveMessage", { sender: "Admin", text: "Sesi Anda tidak valid atau telah berakhir. Silakan login kembali.", timestamp: new Date() });
        return;
    }

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
      const userCreditData = await getCreditDataForUser(currentUserId);
      let creditDataContext = "No credit data available for this user.";
      if (userCreditData) {
          const insightsForLLM = { ...userCreditData.insights };
          delete insightsForLLM.user_id;
          delete insightsForLLM.email;
          delete insightsForLLM.last_updated;
          creditDataContext = `User Credit Data:\nInsights: ${JSON.stringify(insightsForLLM)}\nTradelines: ${JSON.stringify(userCreditData.tradelines)}`;
      } else {
          console.log(`No credit data found for user ${currentUserId} in DB.`);
          creditDataContext = "No specific credit data found for your account in the simulation database.";
      }

      // Prepare messages for LLM, including dynamic system prompt and user data context
      const messagesForLLM = [
          conversationHistory[0], // The dynamic system prompt (combined KB)
          { role: "system", content: `Current User's Simulated Credit Data:\n${creditDataContext}` },
          ...conversationHistory.slice(1) // Assistant greeting + user messages
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

// Start server and fetch initial knowledge base
const PORT = process.env.PORT || 3000;
(async () => {
  await updateKnowledgeBase(); // Fetch KB before starting server
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    if (process.env.DATABASE_URL) {
        console.log("Attempting to connect to PostgreSQL via DATABASE_URL");
    } else {
        console.warn("DATABASE_URL environment variable is not set. Database operations will fail.");
    }
  });
})();

module.exports = { app, server, io };

