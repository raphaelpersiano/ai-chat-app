const express = require("express");
const session = require("express-session");
const passport = require("./config/passport");
const cors = require("cors");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
const axios = require("axios");
const { pool } = require("./config/database");
const sharedsession = require("express-socket.io-session");
const pdfParse = require("pdf-parse");
const ChatLogger = require("./models/chatLogger");

// WhatsApp Integration Modules
const WhatsAppWebhook = require("./whatsappWebhook");
const WhatsAppSessionManager = require("./whatsappSessionManager");
const WhatsAppAIProcessor = require("./whatsappAIProcessor");

require("dotenv").config();

const RESPONSE_DELAY_MS = 2000;

// --- Knowledge Base Configuration ---
const KNOWLEDGE_BASE_PDF_URLS = [
  "https://storage.googleapis.com/campaign-skorlife/Chatbot/Skorbantu%20Pre-Sales.pdf"
];
let knowledgeBaseContent = `Anda adalah asisten AI dasar. Knowledge base belum dimuat atau gagal dimuat.`;

// --- Function to Fetch and Extract Knowledge Base from Multiple URLs ---
async function updateKnowledgeBase() {
  console.log(`Mencoba mengambil knowledge base dari ${KNOWLEDGE_BASE_PDF_URLS.length} sumber PDF...`);
  let combinedText = "";
  let successCount = 0;

  const results = await Promise.allSettled(
    KNOWLEDGE_BASE_PDF_URLS.map(async (url) => {
      try {
        console.log(`Mengambil dari: ${url}`);
        const response = await axios.get(url, {
          responseType: "arraybuffer",
          timeout: 15000,
        });
        const data = await pdfParse(response.data);
        console.log(`Berhasil mengekstrak dari: ${url}`);
        return data.text;
      } catch (error) {
        console.error(`Gagal mengambil atau mengekstrak dari ${url}:`, error.message);
        throw new Error(`Gagal memproses ${url}: ${error.message}`);
      }
    })
  );

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
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
  }
}

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Initialize WhatsApp components
const whatsappWebhook = new WhatsAppWebhook();
const whatsappSessionManager = new WhatsAppSessionManager();
const whatsappAIProcessor = new WhatsAppAIProcessor();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../public")));

// Raw body parser for webhook signature verification
app.use('/webhook/whatsapp', express.raw({ type: 'application/json' }));

// Session configuration
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || "default_secret",
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

// --- WhatsApp Webhook Routes ---

// WhatsApp webhook verification (GET)
app.get("/webhook/whatsapp", (req, res) => {
  console.log("📞 WhatsApp webhook verification request received");
  whatsappWebhook.verifyWebhook(req, res);
});

// WhatsApp webhook message handler (POST)
app.post("/webhook/whatsapp", async (req, res) => {
  try {
    console.log("📞 WhatsApp webhook message received");
    
    // Verify webhook signature
    const signature = req.headers['x-hub-signature-256'];
    const rawBody = req.body;
    
    if (!whatsappWebhook.verifySignature(rawBody, signature)) {
      console.error("❌ Invalid webhook signature");
      return res.sendStatus(403);
    }

    // Parse JSON body
    const body = JSON.parse(rawBody);
    
    // Process webhook data
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry) {
        // Extract phone number and messages
        const phoneNumber = whatsappWebhook.extractPhoneNumber(entry);
        const messages = whatsappWebhook.extractMessages(entry);
        
        if (phoneNumber && messages.length > 0) {
          console.log(`📱 Received ${messages.length} messages from ${phoneNumber}`);
          
          // Buffer messages with debounced processing
          whatsappWebhook.bufferMessages(phoneNumber, messages, async (phone, bufferedMessages) => {
            await processWhatsAppMessages(phone, bufferedMessages);
          });
        }
      }
    }
    
    // Always respond with 200 to acknowledge receipt
    res.sendStatus(200);
    
  } catch (error) {
    console.error("❌ Error processing WhatsApp webhook:", error);
    res.sendStatus(500);
  }
});

// Process WhatsApp messages
async function processWhatsAppMessages(phoneNumber, messages) {
  try {
    console.log(`🔄 Processing ${messages.length} messages from ${phoneNumber}`);
    
    // Get or create session
    const session = await whatsappSessionManager.getOrCreateSession(phoneNumber);
    
    // Update session activity
    whatsappSessionManager.updateSessionActivity(phoneNumber);
    
    // Add user messages to conversation history
    for (const message of messages) {
      whatsappSessionManager.addToConversationHistory(phoneNumber, 'user', message.text);
    }
    
    // Send typing indicator
    await whatsappWebhook.sendTypingIndicator(phoneNumber);
    
    // Generate AI response
    const aiResponse = await whatsappAIProcessor.processBufferedMessages(
      session.userId,
      session.sessionId,
      session.conversationHistory,
      messages
    );
    
    // Add AI response to conversation history
    whatsappSessionManager.addToConversationHistory(phoneNumber, 'assistant', aiResponse);
    
    // Send response to WhatsApp
    const success = await whatsappWebhook.sendMessage(phoneNumber, aiResponse);
    
    if (success) {
      console.log(`✅ Successfully processed and responded to ${phoneNumber}`);
    } else {
      console.error(`❌ Failed to send response to ${phoneNumber}`);
    }
    
  } catch (error) {
    console.error(`❌ Error processing messages for ${phoneNumber}:`, error);
    
    // Send error message to user
    try {
      await whatsappWebhook.sendMessage(
        phoneNumber, 
        "Maaf, terjadi kesalahan saat memproses pesan Anda. Silakan coba lagi."
      );
    } catch (sendError) {
      console.error(`❌ Failed to send error message to ${phoneNumber}:`, sendError);
    }
  }
}

// --- Original Web App Routes ---

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

app.get("/chat-history", isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, "../public/chat-history.html"));
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

// Chat history and analytics routes
app.get("/api/chat/sessions", isAuthenticated, async (req, res) => {
  try {
    if (!ChatLogger.isEnabled()) {
      return res.json([]);
    }
    
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 10;
    const sessions = await ChatLogger.getUserSessions(userId, limit);
    res.json(sessions);
  } catch (error) {
    console.error("Error fetching user sessions:", error);
    res.status(500).json({ error: "Failed to fetch chat sessions" });
  }
});

app.get("/api/chat/sessions/:sessionId/messages", isAuthenticated, async (req, res) => {
  try {
    if (!ChatLogger.isEnabled()) {
      return res.json([]);
    }
    
    const { sessionId } = req.params;
    const limit = parseInt(req.query.limit) || 100;
    const messages = await ChatLogger.getSessionMessages(sessionId, limit);
    res.json(messages);
  } catch (error) {
    console.error("Error fetching session messages:", error);
    res.status(500).json({ error: "Failed to fetch session messages" });
  }
});

app.get("/api/chat/stats", isAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const days = parseInt(req.query.days) || 7;
    const stats = await ChatLogger.getUserChatStats(userId, days);
    res.json(stats);
  } catch (error) {
    console.error("Error fetching chat stats:", error);
    res.status(500).json({ error: "Failed to fetch chat statistics" });
  }
});

// --- WhatsApp Status and Management Routes ---

// WhatsApp configuration status
app.get("/api/whatsapp/status", (req, res) => {
  const webhookStatus = whatsappWebhook.getConfigStatus();
  const aiStatus = whatsappAIProcessor.getConfigStatus();
  const sessionStats = whatsappSessionManager.getSessionStats();
  
  res.json({
    webhook: webhookStatus,
    ai: aiStatus,
    sessions: sessionStats,
    isFullyConfigured: webhookStatus.isConfigured && aiStatus.isConfigured
  });
});

// Refresh knowledge base
app.post("/api/whatsapp/refresh-kb", async (req, res) => {
  try {
    const success = await whatsappAIProcessor.refreshKnowledgeBase();
    res.json({ success, message: success ? "Knowledge base refreshed" : "Failed to refresh knowledge base" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- Helper function to get credit data ---
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

// Helper function to get client IP address
function getClientIP(socket) {
  return socket.handshake.headers['x-forwarded-for'] || 
         socket.handshake.headers['x-real-ip'] || 
         socket.conn.remoteAddress || 
         socket.handshake.address;
}

// Helper function to get user agent
function getUserAgent(socket) {
  return socket.handshake.headers['user-agent'] || 'Unknown';
}

// --- Original Socket.IO Implementation (for web chat) ---
io.on("connection", async (socket) => {
  let currentUserId = null;
  let currentSessionId = null;
  let pendingTimer = null;

  if (socket.handshake.session && socket.handshake.session.passport && socket.handshake.session.passport.user) {
      currentUserId = socket.handshake.session.passport.user;
      console.log(`🔌 Client connected: ${socket.id}, User ID: ${currentUserId}`);
      
      try {
        if (ChatLogger.isEnabled()) {
          const userAgent = getUserAgent(socket);
          const ipAddress = getClientIP(socket);
          currentSessionId = await ChatLogger.createSession(currentUserId, socket.id, userAgent, ipAddress);
          
          if (currentSessionId) {
            await ChatLogger.logSystemMessage(currentSessionId, "Hai, ada yang bisa saya bantu?");
            console.log(`📝 New chat session created: ${currentSessionId}`);
          }
        } else {
          console.log(`⚠️ Chat logging is disabled - session not created`);
        }
      } catch (error) {
        console.error("❌ Error creating chat session:", error);
      }
  } else {
      console.log(`🔌 Client connected: ${socket.id}, but user is not authenticated via session.`);
  }

  const conversationHistory = [
    { role: "system", content: knowledgeBaseContent },
    { role: "assistant", content: "Halo! Selamat datang. Saya adalah asisten kredit AI Anda. Tanyakan apa saja tentang data kredit simulasi Anda." }
  ];

  // Original generateAIResponse function for web chat
  const generateAIResponse = async () => {
    const startTime = Date.now();
    pendingTimer = null;

    const openRouterApiKey = process.env.OPENROUTER_API_KEY;
    const openRouterUrl = process.env.OPENROUTER_URL || "https://openrouter.ai/api/v1/chat/completions";

    if (!process.env.DATABASE_URL) {
        console.error("DATABASE_URL not configured.");
        const errorMsg = "Maaf, konfigurasi database belum selesai.";
        socket.emit("receiveMessage", { sender: "Admin", text: errorMsg, timestamp: new Date() });
        
        if (currentSessionId && ChatLogger.isEnabled()) {
          try {
            await ChatLogger.logErrorMessage(currentSessionId, errorMsg);
          } catch (logError) {
            console.error("Error logging error message:", logError);
          }
        }
        
        conversationHistory.pop();
        return;
    }
    
    if (!openRouterApiKey || openRouterApiKey === "your_openrouter_api_key") {
      console.warn("OpenRouter API key not configured.");
      const errorMsg = "Maaf, konfigurasi AI admin belum selesai.";
      socket.emit("receiveMessage", { sender: "Admin", text: errorMsg, timestamp: new Date() });
      
      if (currentSessionId && ChatLogger.isEnabled()) {
        try {
          await ChatLogger.logErrorMessage(currentSessionId, errorMsg);
        } catch (logError) {
          console.error("Error logging error message:", logError);
        }
      }
      
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

      const messagesForLLM = [
          conversationHistory[0],
          { role: "system", content: `Current User's Simulated Credit Data:\n${creditDataContext}` },
          ...conversationHistory.slice(1)
      ];

      const resp = await axios.post(
        openRouterUrl,
        { model: "google/gemini-2.0-flash-exp:free", messages: messagesForLLM },
        { headers: { "Authorization": `Bearer ${openRouterApiKey}` } }
      );

      const aiText = resp.data.choices?.[0]?.message?.content
        || "Maaf, saya tidak bisa merespons saat ini.";

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      conversationHistory.push({ role: "assistant", content: aiText });
      socket.emit("receiveMessage", {
        sender: "Admin",
        text: aiText,
        timestamp: new Date(),
      });

      if (currentSessionId && ChatLogger.isEnabled()) {
        try {
          await ChatLogger.logAIResponse(
            currentSessionId, 
            aiText, 
            "google/gemini-2.0-flash-exp:free", 
            responseTime
          );
        } catch (logError) {
          console.error("Error logging AI response:", logError);
        }
      }

    } catch (error) {
      console.error("Error calling OpenRouter API:", error);
      let errorMsg = "Maaf, terjadi kesalahan saat memproses permintaan Anda.";
      
      if (error.response?.status === 429) {
        errorMsg = "Maaf, sistem sedang sibuk. Silakan coba lagi dalam beberapa saat.";
      }
      
      socket.emit("receiveMessage", { sender: "Admin", text: errorMsg, timestamp: new Date() });
      
      if (currentSessionId && ChatLogger.isEnabled()) {
        try {
          await ChatLogger.logErrorMessage(currentSessionId, errorMsg);
        } catch (logError) {
          console.error("Error logging error message:", logError);
        }
      }
      
      conversationHistory.pop();
    }
  };

  socket.on("sendMessage", async (data) => {
    if (!currentUserId) {
      socket.emit("receiveMessage", { sender: "System", text: "Anda harus login terlebih dahulu.", timestamp: new Date() });
      return;
    }

    const userMessage = data.text?.trim();
    if (!userMessage) return;

    conversationHistory.push({ role: "user", content: userMessage });
    
    if (currentSessionId && ChatLogger.isEnabled()) {
      try {
        await ChatLogger.logUserMessage(currentSessionId, currentUserId, userMessage);
      } catch (logError) {
        console.error("Error logging user message:", logError);
      }
    }

    if (pendingTimer) {
      clearTimeout(pendingTimer);
    }

    pendingTimer = setTimeout(generateAIResponse, 15000);
  });

  socket.on("disconnect", async () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
    
    if (pendingTimer) {
      clearTimeout(pendingTimer);
    }
    
    if (currentSessionId && ChatLogger.isEnabled()) {
      try {
        await ChatLogger.logSystemMessage(currentSessionId, "Chat session ended");
        await ChatLogger.endSession(currentSessionId);
        await ChatLogger.updateSessionAnalytics(currentSessionId);
        console.log(`📝 Chat session ended: ${currentSessionId}`);
      } catch (error) {
        console.error("❌ Error ending chat session:", error);
      }
    }
  });
});

// Cleanup jobs
if (ChatLogger.isEnabled() && process.env.ENABLE_CLEANUP === 'true') {
  setInterval(async () => {
    try {
      const cleanupDays = parseInt(process.env.CLEANUP_OLD_SESSIONS_DAYS) || 30;
      await ChatLogger.cleanupOldSessions(cleanupDays);
    } catch (error) {
      console.error("Error in cleanup job:", error);
    }
  }, 24 * 60 * 60 * 1000);
}

// Cleanup inactive WhatsApp sessions every hour
setInterval(() => {
  whatsappSessionManager.cleanupInactiveSessions();
}, 60 * 60 * 1000);

// Start server and fetch initial knowledge base
const PORT = process.env.PORT || 3000;
(async () => {
  await updateKnowledgeBase();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    
    // Database status messages
    if (process.env.DATABASE_URL) {
        console.log("✅ Main database (user credit data) connection configured");
    } else {
        console.warn("⚠️ DATABASE_URL environment variable is not set. Main database operations will fail.");
    }
    
    if (ChatLogger.isEnabled()) {
        console.log("✅ Chat logging is enabled (Supabase)");
    } else {
        console.warn("⚠️ Chat logging is disabled (SUPABASE_DATABASE_URL not configured)");
    }
    
    // WhatsApp configuration status
    const whatsappStatus = whatsappWebhook.getConfigStatus();
    if (whatsappStatus.isConfigured) {
        console.log("✅ WhatsApp integration is configured and ready");
    } else {
        console.warn("⚠️ WhatsApp integration is not fully configured. Check environment variables:");
        console.warn(`   - META_ACCESS_TOKEN: ${whatsappStatus.accessToken ? '✅' : '❌'}`);
        console.warn(`   - META_PHONE_NUMBER_ID: ${whatsappStatus.phoneNumberId ? '✅' : '❌'}`);
        console.warn(`   - META_WEBHOOK_VERIFY_TOKEN: ${whatsappStatus.verifyToken ? '✅' : '❌'}`);
        console.warn(`   - META_APP_SECRET: ${whatsappStatus.appSecret ? '✅' : '❌'}`);
    }
  });
})();

module.exports = { app, server, io };

