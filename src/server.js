const express = require("express");
const session = require("express-session");
const passport = require("./config/passport");
const cors = require("cors");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
const axios = require("axios");
const { pool } = require("./config/database"); // Main database pool for user credit data
const sharedsession = require("express-socket.io-session"); // Import shared session
const pdfParse = require("pdf-parse"); // Import pdf-parse
const ChatLogger = require("./models/chatLogger"); // Import chat logger (uses Supabase)
require("dotenv").config();

const RESPONSE_DELAY_MS = 3500;

// --- WhatsApp Cloud API Configuration ---
const whatsappToken = process.env.WHATSAPP_TOKEN;
const whatsappPhoneId = process.env.WHATSAPP_PHONE_ID;
const whatsappVerifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
const whatsappApiUrl = whatsappPhoneId
  ? `https://graph.facebook.com/v23.0/${whatsappPhoneId}/messages`
  : null;
const waConversations = {};
const waSessions = {};
const WA_MESSAGE_WINDOW_MS = parseInt(
  process.env.WA_MESSAGE_WINDOW_MS || "6000",
  10
); // Wait this long after the last message before responding
const waBuffers = {};

// Ensure a chat logging session exists for a WhatsApp user
async function ensureWaSession(from) {
  if (waSessions[from]) {
    return waSessions[from];
  }
  if (ChatLogger.isEnabled()) {
    try {
      const sessionId = await ChatLogger.createSession(
        `wa_${from}`,
        `whatsapp-${from}`,
        'WhatsApp Cloud API'
      );
      if (sessionId) {
        await ChatLogger.logSystemMessage(sessionId, 'Hai, ada yang bisa saya bantu?');
        waSessions[from] = sessionId;
        console.log(`✅ WhatsApp session created for ${from}: ${sessionId}`);
        return sessionId;
      }
    } catch (err) {
      console.error('Error creating WhatsApp session:', err);
    }
  }
  return null;
}

// --- Knowledge Base Configuration ---
// Use an array for multiple knowledge base URLs
const KNOWLEDGE_BASE_PDF_URLS = [
  "https://storage.googleapis.com/campaign-skorlife/Chatbot/SkorBot%20Briefing.pdf",
  "https://storage.googleapis.com/campaign-skorlife/Chatbot/FAQ%20Skorlife.pdf",
  "https://storage.googleapis.com/campaign-skorlife/Chatbot/Product%20and%20Services%20Lineup.pdf"
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
        // Use main database pool for user credit data operations
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

// New API routes for chat history and analytics (using Supabase)
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

// --- WhatsApp Cloud API webhook ---
app.get('/whatsapp-webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === whatsappVerifyToken) {
    console.log('✅ WhatsApp webhook verified');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

app.post('/whatsapp-webhook', (req, res) => {
  const entry = req.body.entry?.[0];
  const changes = entry?.changes?.[0];
  const msg = changes?.value?.messages?.[0];

  if (msg && msg.from && msg.text?.body) {
    console.log(`📱 WhatsApp message received from ${msg.from}: ${msg.text.body}`);
    // Queue message so multiple texts in quick succession are combined
    queueWhatsAppMessage(msg.from, msg.text.body);
  }

  // Respond immediately to comply with WhatsApp's 10s webhook timeout
  res.sendStatus(200);
});

// --- Helper function to get credit data (PostgreSQL version) ---
async function getCreditDataForUser(userId) {
  const creditData = {};
  try {
    // Use main database pool for user credit data
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

// --- Queue WhatsApp messages so multiple texts within a short window are combined ---
function queueWhatsAppMessage(from, text) {
  if (!waBuffers[from]) {
    waBuffers[from] = { texts: [], timer: null };
  }
  const buf = waBuffers[from];
  buf.texts.push(text);
  
  // PERBAIKAN: Log setiap pesan WhatsApp yang masuk secara langsung
  console.log(`📝 Logging WhatsApp message from ${from}: ${text}`);
  if (ChatLogger.isEnabled()) {
    ensureWaSession(from)
      .then((sessionId) => {
        if (sessionId) {
          return ChatLogger.logUserMessage(sessionId, `wa_${from}`, text);
        }
      })
      .then((messageId) => {
        if (messageId) {
          console.log(`✅ WhatsApp user message logged: ${messageId}`);
        }
      })
      .catch((err) => {
        console.error('❌ Error logging WA user message:', err);
      });
  }
  
  if (buf.timer) clearTimeout(buf.timer);
  buf.timer = setTimeout(() => {
    const combined = buf.texts.join('\n');
    buf.texts = [];
    buf.timer = null;
    handleWhatsAppMessage(from, combined).catch((err) => {
      console.error('handleWhatsAppMessage error:', err);
    });
  }, WA_MESSAGE_WINDOW_MS);
}

// --- Handle combined WhatsApp message ---
async function handleWhatsAppMessage(from, text) {
  if (!whatsappApiUrl || !whatsappToken) {
    console.warn('WhatsApp API not configured.');
    return;
  }

  console.log(`🤖 Processing WhatsApp message from ${from}: ${text}`);
  const sessionId = await ensureWaSession(from);

  if (!waConversations[from]) {
    waConversations[from] = [
      { role: 'system', content: knowledgeBaseContent },
      { role: 'assistant', content: 'Halo! Selamat datang. Saya adalah asisten kredit AI Anda. Tanyakan apa saja tentang data kredit simulasi Anda.' }
    ];
  }

  const convo = waConversations[from];
  convo.push({ role: 'user', content: text });

  try {
    const openRouterApiKey = process.env.OPENROUTER_API_KEY;
    const openRouterUrl = process.env.OPENROUTER_URL || 'https://openrouter.ai/api/v1/chat/completions';

    const startTime = Date.now();
    const resp = await axios.post(
      openRouterUrl,
      { model: 'google/gemini-2.0-flash-exp:free', messages: convo },
      { headers: { Authorization: `Bearer ${openRouterApiKey}` } }
    );
    const responseTime = Date.now() - startTime;

    const aiText = resp.data.choices?.[0]?.message?.content || 'Maaf, saya tidak bisa merespons saat ini.';
    convo.push({ role: 'assistant', content: aiText });
    
    // PERBAIKAN: Log response AI ke Supabase dengan informasi tambahan
    if (sessionId && ChatLogger.isEnabled()) {
      try {
        const messageId = await ChatLogger.logAIResponse(
          sessionId, 
          aiText, 
          'google/gemini-2.0-flash-exp:free',
          responseTime,
          resp.data.usage?.total_tokens || null
        );
        console.log(`✅ WhatsApp AI response logged: ${messageId}`);
      } catch (err) {
        console.error('❌ Error logging WA AI response:', err);
      }
    }

    // Send response via WhatsApp
    await axios.post(
      whatsappApiUrl,
      {
        messaging_product: 'whatsapp',
        to: from,
        text: { body: aiText }
      },
      { headers: { Authorization: `Bearer ${whatsappToken}` } }
    );
    
    console.log(`✅ WhatsApp response sent to ${from}`);
  } catch (err) {
    console.error('❌ WhatsApp AI error:', err);
    
    // Log error message
    if (sessionId && ChatLogger.isEnabled()) {
      try {
        await ChatLogger.logErrorMessage(sessionId, `Error processing message: ${err.message}`);
      } catch (logErr) {
        console.error('❌ Error logging error message:', logErr);
      }
    }
  }
}

io.on("connection", async (socket) => {
  let currentUserId = null;
  let currentSessionId = null;
  let pendingTimer = null;

  // Get current user ID from session
  if (socket.handshake.session && socket.handshake.session.passport && socket.handshake.session.passport.user) {
      currentUserId = socket.handshake.session.passport.user;
      console.log(`🔌 Client connected: ${socket.id}, User ID: ${currentUserId}`);
      
      // Create new chat session for this connection (using Supabase)
      try {
        if (ChatLogger.isEnabled()) {
          const userAgent = getUserAgent(socket);
          const ipAddress = getClientIP(socket);
          currentSessionId = await ChatLogger.createSession(currentUserId, socket.id, userAgent, ipAddress);
          
          if (currentSessionId) {
            // Log system message for session start
            await ChatLogger.logSystemMessage(currentSessionId, "Hai, ada yang bisa saya bantu?");
            console.log(`📝 New chat session created: ${currentSessionId}`);
          }
        } else {
          console.log(`⚠️ Chat logging is disabled - session not created for user ${currentUserId}`);
        }
      } catch (error) {
        console.error("Error creating chat session:", error);
      }
  } else {
      console.log(`🔌 Client connected: ${socket.id}, User not authenticated`);
  }

  socket.on("message", async (data) => {
    if (!currentUserId) {
      socket.emit("response", { error: "User not authenticated" });
      return;
    }

    const userMessage = data.message;
    console.log(`💬 Message from user ${currentUserId}: ${userMessage}`);

    // PERBAIKAN: Log user message ke Supabase segera setelah diterima
    if (currentSessionId && ChatLogger.isEnabled()) {
      try {
        const messageId = await ChatLogger.logUserMessage(currentSessionId, currentUserId, userMessage);
        console.log(`✅ User message logged: ${messageId}`);
      } catch (error) {
        console.error("❌ Error logging user message:", error);
      }
    }

    // Clear any existing timer
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }

    // Set a new timer for response delay
    pendingTimer = setTimeout(async () => {
      try {
        // Get user credit data
        const creditData = await getCreditDataForUser(currentUserId);
        
        // Prepare context with credit data
        let contextMessage = knowledgeBaseContent;
        if (creditData) {
          contextMessage += `\n\nData Kredit User:\n${JSON.stringify(creditData, null, 2)}`;
        }

        // Prepare conversation for AI
        const conversation = [
          { role: "system", content: contextMessage },
          { role: "user", content: userMessage }
        ];

        // Call OpenRouter API
        const openRouterApiKey = process.env.OPENROUTER_API_KEY;
        const openRouterUrl = process.env.OPENROUTER_URL || 'https://openrouter.ai/api/v1/chat/completions';

        const startTime = Date.now();
        const response = await axios.post(
          openRouterUrl,
          {
            model: "google/gemini-2.0-flash-exp:free",
            messages: conversation,
          },
          {
            headers: {
              Authorization: `Bearer ${openRouterApiKey}`,
              "Content-Type": "application/json",
            },
          }
        );
        const responseTime = Date.now() - startTime;

        const aiResponse = response.data.choices[0].message.content;
        
        // PERBAIKAN: Log AI response ke Supabase dengan informasi tambahan
        if (currentSessionId && ChatLogger.isEnabled()) {
          try {
            const messageId = await ChatLogger.logAIResponse(
              currentSessionId, 
              aiResponse, 
              'google/gemini-2.0-flash-exp:free',
              responseTime,
              response.data.usage?.total_tokens || null
            );
            console.log(`✅ AI response logged: ${messageId}`);
          } catch (error) {
            console.error("❌ Error logging AI response:", error);
          }
        }

        // Send response to client
        socket.emit("response", { message: aiResponse });
        console.log(`🤖 AI response sent to user ${currentUserId}`);

      } catch (error) {
        console.error("Error processing message:", error);
        
        // PERBAIKAN: Log error message ke Supabase
        if (currentSessionId && ChatLogger.isEnabled()) {
          try {
            await ChatLogger.logErrorMessage(currentSessionId, `Error processing message: ${error.message}`);
          } catch (logError) {
            console.error("❌ Error logging error message:", logError);
          }
        }
        
        socket.emit("response", { 
          error: "Maaf, terjadi kesalahan dalam memproses pesan Anda. Silakan coba lagi." 
        });
      }
    }, RESPONSE_DELAY_MS);
  });

  socket.on("disconnect", async () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
    
    // Clear any pending timer
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    
    // End chat session (using Supabase)
    if (currentSessionId && ChatLogger.isEnabled()) {
      try {
        await ChatLogger.endSession(currentSessionId);
        console.log(`📝 Chat session ended: ${currentSessionId}`);
      } catch (error) {
        console.error("Error ending chat session:", error);
      }
    }
  });
});

// Logout route
app.post("/logout", (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: "Logout failed" });
    }
    res.json({ message: "Logged out successfully" });
  });
});

// Start server and initialize knowledge base
const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  
  // Initialize knowledge base
  try {
    await updateKnowledgeBase();
    console.log("✅ Knowledge base initialized");
  } catch (error) {
    console.error("❌ Error initializing knowledge base:", error);
  }
  
  // Log chat logging status
  if (ChatLogger.isEnabled()) {
    console.log("✅ Chat logging to Supabase is enabled");
  } else {
    console.log("⚠️ Chat logging is disabled");
  }
});
