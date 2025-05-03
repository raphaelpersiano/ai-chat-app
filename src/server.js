const express = require("express");
const session = require("express-session");
const passport = require("./config/passport");
const cors = require("cors");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
const axios = require("axios"); // Import axios
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

app.get("/logout", (req, res) => {
  req.logout((err) => {
    if (err) {
      // In newer express versions, req.logout requires a callback
      // In passport 0.6+, req.logout is async and needs a callback or promise handling
      return next(err);
    }
    res.redirect("/login");
  });
});

// User info route
app.get("/api/user", isAuthenticated, (req, res) => {
  res.json(req.user);
});

// Socket.io connection
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  // Store conversation history per socket connection (simple in-memory example)
  const conversationHistory = [
    { role: "system", content: "You are a helpful assistant acting as the admin in a chat application. Keep your responses concise and friendly." },
    { role: "assistant", content: "Halo! Selamat datang di Chat App. Ada yang bisa saya bantu?" } // Initial greeting
  ];

  socket.on("sendMessage", async (message) => {
    console.log(`Message received from ${socket.id}:`, message);

    // Add user message to history
    conversationHistory.push({ role: "user", content: message.text });

    const openRouterApiKey = process.env.OPENROUTER_API_KEY;
    const openRouterUrl = process.env.OPENROUTER_URL || "https://openrouter.ai/api/v1/chat/completions";

    if (!openRouterApiKey || openRouterApiKey === "your_openrouter_api_key") {
      console.warn("OpenRouter API key not configured.");
      socket.emit("receiveMessage", {
        sender: "Admin",
        text: "Maaf, konfigurasi AI admin belum selesai. Silakan hubungi pengembang.",
        timestamp: new Date(),
      });
      // Remove user message if AI is not configured
      conversationHistory.pop(); 
      return;
    }

    try {
      const response = await axios.post(
        openRouterUrl,
        {
          model: "meta-llama/llama-3-8b-instruct", // Using Llama 3 8B Instruct as a capable model
          messages: conversationHistory,
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

      // Add AI response to history
      conversationHistory.push({ role: "assistant", content: aiResponseText });

      // Send AI response back to the client
      socket.emit("receiveMessage", {
        sender: "Admin",
        text: aiResponseText,
        timestamp: new Date(),
      });

    } catch (error) {
      console.error("Error calling OpenRouter API:", error.response ? error.response.data : error.message);
      // Remove user message from history on error
      conversationHistory.pop(); 
      socket.emit("receiveMessage", {
        sender: "Admin",
        text: "Maaf, terjadi kesalahan saat menghubungi admin AI. Coba lagi nanti.",
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
});

module.exports = { app, server, io };

