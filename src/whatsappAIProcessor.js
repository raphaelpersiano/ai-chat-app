const axios = require('axios');
const pdfParse = require('pdf-parse');
const { pool } = require('./config/database');
const ChatLogger = require('./models/chatLogger');
require('dotenv').config();

/**
 * WhatsApp AI Processor
 * Handles AI processing for WhatsApp messages using existing AI logic
 */
class WhatsAppAIProcessor {
    constructor() {
        this.openRouterApiKey = process.env.OPENROUTER_API_KEY;
        this.openRouterUrl = process.env.OPENROUTER_URL || "https://openrouter.ai/api/v1/chat/completions";
        this.knowledgeBaseContent = `Anda adalah asisten AI dasar. Knowledge base belum dimuat atau gagal dimuat.`;
        
        // Knowledge Base URLs (same as original system)
        this.KNOWLEDGE_BASE_PDF_URLS = [
            "https://storage.googleapis.com/campaign-skorlife/Chatbot/Skorbantu%20Pre-Sales.pdf"
        ];
        
        // Initialize knowledge base
        this.updateKnowledgeBase();
    }

    /**
     * Update knowledge base from PDF URLs
     */
    async updateKnowledgeBase() {
        console.log(`📚 Updating knowledge base from ${this.KNOWLEDGE_BASE_PDF_URLS.length} PDF sources...`);
        let combinedText = "";
        let successCount = 0;

        const results = await Promise.allSettled(
            this.KNOWLEDGE_BASE_PDF_URLS.map(async (url) => {
                try {
                    console.log(`📥 Fetching from: ${url}`);
                    const response = await axios.get(url, {
                        responseType: "arraybuffer",
                        timeout: 15000,
                    });
                    const data = await pdfParse(response.data);
                    console.log(`✅ Successfully extracted from: ${url}`);
                    return data.text;
                } catch (error) {
                    console.error(`❌ Failed to fetch/extract from ${url}:`, error.message);
                    throw new Error(`Failed to process ${url}: ${error.message}`);
                }
            })
        );

        results.forEach((result, index) => {
            if (result.status === "fulfilled") {
                combinedText += `\n\n--- Knowledge Base Document ${index + 1} ---\n\n` + result.value;
                successCount++;
            } else {
                console.error(`❌ Failed to process URL ${this.KNOWLEDGE_BASE_PDF_URLS[index]}: ${result.reason}`);
            }
        });

        if (successCount > 0) {
            this.knowledgeBaseContent = combinedText.trim();
            console.log(`✅ Successfully loaded and combined ${successCount} of ${this.KNOWLEDGE_BASE_PDF_URLS.length} knowledge base PDFs.`);
        } else {
            console.error("❌ Failed to load all knowledge base PDFs. Using fallback.");
        }
    }

    /**
     * Get credit data for user (adapted from original system)
     * @param {string} userId - User ID
     * @returns {Promise<Object|null>} - Credit data object or null
     */
    async getCreditDataForUser(userId) {
        const creditData = {};
        try {
            const insightsRes = await pool.query("SELECT * FROM usercreditinsights WHERE user_id = $1", [userId]);
            if (insightsRes.rows.length === 0) {
                console.log(`❌ No credit insights found for user ${userId}.`);
                return null;
            }
            creditData.insights = insightsRes.rows[0];
            
            const tradelinesRes = await pool.query("SELECT * FROM usertradelinedata WHERE user_id = $1", [userId]);
            creditData.tradelines = tradelinesRes.rows || [];
            
            for (const tl of creditData.tradelines) {
                const historyRes = await pool.query(
                    "SELECT * FROM userpaymenthistory WHERE tradeline_id = $1 ORDER BY payment_date DESC", 
                    [tl.tradeline_id]
                );
                tl.paymentHistory = historyRes.rows || [];
            }
            
            return creditData;
        } catch (err) {
            console.error(`❌ Error fetching credit data for user ${userId}:`, err);
            throw err;
        }
    }

    /**
     * Generate AI response for WhatsApp messages
     * @param {string} userId - User ID
     * @param {string} sessionId - Session ID
     * @param {Array} conversationHistory - Conversation history
     * @param {Array} newMessages - New messages to process
     * @returns {Promise<string>} - AI response
     */
    async generateAIResponse(userId, sessionId, conversationHistory, newMessages) {
        const startTime = Date.now();
        
        try {
            // Validate configuration
            if (!process.env.DATABASE_URL) {
                console.error("❌ DATABASE_URL not configured.");
                const errorMsg = "Maaf, konfigurasi database belum selesai.";
                
                if (sessionId && ChatLogger.isEnabled()) {
                    await ChatLogger.logErrorMessage(sessionId, errorMsg);
                }
                
                return errorMsg;
            }
            
            if (!this.openRouterApiKey || this.openRouterApiKey === "your_openrouter_api_key") {
                console.warn("⚠️ OpenRouter API key not configured.");
                const errorMsg = "Maaf, konfigurasi AI admin belum selesai.";
                
                if (sessionId && ChatLogger.isEnabled()) {
                    await ChatLogger.logErrorMessage(sessionId, errorMsg);
                }
                
                return errorMsg;
            }

            // Get user credit data
            const userCreditData = await this.getCreditDataForUser(userId);
            let creditDataContext = "No credit data available for this user.";
            
            if (userCreditData) {
                const insightsForLLM = { ...userCreditData.insights };
                delete insightsForLLM.user_id;
                delete insightsForLLM.email;
                delete insightsForLLM.last_updated;
                creditDataContext = `User Credit Data:\nInsights: ${JSON.stringify(insightsForLLM)}\nTradelines: ${JSON.stringify(userCreditData.tradelines)}`;
            } else {
                console.log(`⚠️ No credit data found for user ${userId} in DB.`);
                creditDataContext = "No specific credit data found for your account in the simulation database.";
            }

            // Combine all new messages into conversation history
            const updatedHistory = [...conversationHistory];
            for (const message of newMessages) {
                updatedHistory.push({ role: "user", content: message.text });
            }

            // Prepare messages for LLM
            const messagesForLLM = [
                { role: "system", content: this.knowledgeBaseContent },
                { role: "system", content: `Current User's Simulated Credit Data:\n${creditDataContext}` },
                ...updatedHistory
            ];

            // Call OpenRouter API
            const response = await axios.post(
                this.openRouterUrl,
                { 
                    model: "google/gemini-2.0-flash-exp:free", 
                    messages: messagesForLLM 
                },
                { 
                    headers: { 
                        "Authorization": `Bearer ${this.openRouterApiKey}`,
                        "Content-Type": "application/json"
                    },
                    timeout: 30000
                }
            );

            const aiText = response.data.choices?.[0]?.message?.content
                || "Maaf, saya tidak bisa merespons saat ini.";

            const endTime = Date.now();
            const responseTime = endTime - startTime;

            // Log AI response
            if (sessionId && ChatLogger.isEnabled()) {
                try {
                    await ChatLogger.logAIResponse(
                        sessionId, 
                        aiText, 
                        "google/gemini-2.0-flash-exp:free", 
                        responseTime
                    );
                } catch (logError) {
                    console.error("❌ Error logging AI response:", logError);
                }
            }

            console.log(`🤖 AI response generated in ${responseTime}ms for user ${userId}`);
            return aiText;

        } catch (error) {
            console.error(`❌ Error generating AI response for user ${userId}:`, error);
            
            let errorMsg = "Maaf, terjadi kesalahan saat memproses permintaan Anda.";
            
            if (error.response?.status === 429) {
                errorMsg = "Maaf, sistem sedang sibuk. Silakan coba lagi dalam beberapa saat.";
            } else if (error.code === 'ECONNABORTED') {
                errorMsg = "Maaf, respons AI membutuhkan waktu terlalu lama. Silakan coba lagi.";
            }
            
            // Log error
            if (sessionId && ChatLogger.isEnabled()) {
                try {
                    await ChatLogger.logErrorMessage(sessionId, errorMsg);
                } catch (logError) {
                    console.error("❌ Error logging error message:", logError);
                }
            }
            
            return errorMsg;
        }
    }

    /**
     * Process buffered messages and generate response
     * @param {string} userId - User ID
     * @param {string} sessionId - Session ID
     * @param {Array} conversationHistory - Conversation history
     * @param {Array} bufferedMessages - Buffered messages
     * @returns {Promise<string>} - AI response
     */
    async processBufferedMessages(userId, sessionId, conversationHistory, bufferedMessages) {
        try {
            // Log all user messages first
            if (sessionId && ChatLogger.isEnabled()) {
                for (const message of bufferedMessages) {
                    await ChatLogger.logUserMessage(sessionId, userId, message.text);
                }
            }

            // Generate AI response
            const aiResponse = await this.generateAIResponse(
                userId, 
                sessionId, 
                conversationHistory, 
                bufferedMessages
            );

            return aiResponse;

        } catch (error) {
            console.error(`❌ Error processing buffered messages for user ${userId}:`, error);
            return "Maaf, terjadi kesalahan saat memproses pesan Anda.";
        }
    }

    /**
     * Get configuration status
     * @returns {Object} - Configuration status
     */
    getConfigStatus() {
        return {
            openRouterApiKey: !!this.openRouterApiKey,
            databaseUrl: !!process.env.DATABASE_URL,
            knowledgeBaseLoaded: this.knowledgeBaseContent !== `Anda adalah asisten AI dasar. Knowledge base belum dimuat atau gagal dimuat.`,
            isConfigured: !!(this.openRouterApiKey && process.env.DATABASE_URL)
        };
    }

    /**
     * Refresh knowledge base manually
     * @returns {Promise<boolean>} - Success status
     */
    async refreshKnowledgeBase() {
        try {
            await this.updateKnowledgeBase();
            return true;
        } catch (error) {
            console.error("❌ Error refreshing knowledge base:", error);
            return false;
        }
    }
}

module.exports = WhatsAppAIProcessor;

