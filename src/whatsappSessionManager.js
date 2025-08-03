const { pool } = require('./config/database');
const ChatLogger = require('./models/chatLogger');

/**
 * WhatsApp Session Manager
 * Manages user sessions and data for WhatsApp users
 */
class WhatsAppSessionManager {
    constructor() {
        // Store active sessions (phone_number -> session_data)
        this.activeSessions = new Map();
    }

    /**
     * Get or create user in database
     * @param {string} phoneNumber - Phone number
     * @returns {Promise<Object>} - User object
     */
    async getOrCreateUser(phoneNumber) {
        try {
            const userId = this.generateUserId(phoneNumber);
            const formattedPhone = this.formatPhoneNumber(phoneNumber);
            
            // Check if user exists
            const existingUser = await pool.query(
                "SELECT * FROM usercreditinsights WHERE user_id = $1",
                [userId]
            );

            if (existingUser.rows.length > 0) {
                console.log(`👤 Existing WhatsApp user found: ${userId}`);
                return {
                    id: userId,
                    phone_number: formattedPhone,
                    full_name: existingUser.rows[0].full_name || `WhatsApp User ${formattedPhone}`,
                    email: existingUser.rows[0].email || `${userId}@whatsapp.local`,
                    isNewUser: false
                };
            }

            // Create new user with dummy credit data
            console.log(`👤 Creating new WhatsApp user: ${userId}`);
            
            const displayName = `WhatsApp User ${formattedPhone}`;
            const email = `${userId}@whatsapp.local`;

            // Insert user credit insights
            await pool.query(
                `INSERT INTO usercreditinsights (
                    user_id, credit_score, KOL_score, outstanding_amount,
                    number_of_unsecured_loan, number_of_secured_loan, penalty_amount,
                    max_dpd, last_updated, number_of_cc, full_name, email
                ) VALUES (
                    $1, 650, 1, 10000000, 2, 1, 0, 5, NOW(), 1, $2, $3
                )`,
                [userId, displayName, email]
            );

            // Insert dummy tradeline data
            const tradelineRes = await pool.query(
                `INSERT INTO usertradelinedata (
                    user_id, creditor, loan_type, credit_limit, outstanding,
                    monthly_payment, interest_rate, tenure, open_date, status
                ) VALUES
                    ($1, 'Bank ABC', 'personal_loan', 5000000, 3000000, 500000, 12.5, 24, NOW(), 'active'),
                    ($1, 'Bank XYZ', 'credit_card', 10000000, 2000000, 300000, 18.0, 36, NOW(), 'active')
                RETURNING tradeline_id`,
                [userId]
            );

            // Insert dummy payment history
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

            console.log(`✅ WhatsApp user created successfully: ${userId}`);

            return {
                id: userId,
                phone_number: formattedPhone,
                full_name: displayName,
                email: email,
                isNewUser: true
            };

        } catch (error) {
            console.error(`❌ Error getting/creating WhatsApp user for ${phoneNumber}:`, error);
            throw error;
        }
    }

    /**
     * Get or create chat session for WhatsApp user
     * @param {string} phoneNumber - Phone number
     * @param {string} userAgent - User agent (optional)
     * @param {string} ipAddress - IP address (optional)
     * @returns {Promise<Object>} - Session object
     */
    async getOrCreateSession(phoneNumber, userAgent = 'WhatsApp', ipAddress = null) {
        try {
            const formattedPhone = this.formatPhoneNumber(phoneNumber);
            
            // Check if there's an active session
            if (this.activeSessions.has(formattedPhone)) {
                const session = this.activeSessions.get(formattedPhone);
                console.log(`🔄 Using existing WhatsApp session: ${session.sessionId}`);
                return session;
            }

            // Get or create user
            const user = await this.getOrCreateUser(phoneNumber);

            // Create new chat session
            let sessionId = null;
            if (ChatLogger.isEnabled()) {
                sessionId = await ChatLogger.createSession(
                    user.id,
                    `whatsapp_${formattedPhone}`,
                    userAgent,
                    ipAddress
                );

                if (sessionId) {
                    // Log welcome message for new users
                    const welcomeMessage = user.isNewUser 
                        ? "Selamat datang! Saya adalah asisten kredit AI Anda. Tanyakan apa saja tentang data kredit simulasi Anda."
                        : "Hai! Selamat datang kembali. Ada yang bisa saya bantu?";
                    
                    await ChatLogger.logSystemMessage(sessionId, welcomeMessage);
                    console.log(`📝 WhatsApp chat session created: ${sessionId}`);
                }
            }

            // Create session object
            const session = {
                sessionId: sessionId,
                userId: user.id,
                phoneNumber: formattedPhone,
                user: user,
                conversationHistory: [
                    { role: "assistant", content: user.isNewUser 
                        ? "Selamat datang! Saya adalah asisten kredit AI Anda. Tanyakan apa saja tentang data kredit simulasi Anda."
                        : "Hai! Selamat datang kembali. Ada yang bisa saya bantu?" 
                    }
                ],
                createdAt: new Date(),
                lastActivity: new Date()
            };

            // Store in active sessions
            this.activeSessions.set(formattedPhone, session);
            
            console.log(`✅ WhatsApp session created for ${formattedPhone}`);
            return session;

        } catch (error) {
            console.error(`❌ Error creating WhatsApp session for ${phoneNumber}:`, error);
            throw error;
        }
    }

    /**
     * Get active session for phone number
     * @param {string} phoneNumber - Phone number
     * @returns {Object|null} - Session object or null
     */
    getActiveSession(phoneNumber) {
        const formattedPhone = this.formatPhoneNumber(phoneNumber);
        return this.activeSessions.get(formattedPhone) || null;
    }

    /**
     * Update session activity
     * @param {string} phoneNumber - Phone number
     */
    updateSessionActivity(phoneNumber) {
        const formattedPhone = this.formatPhoneNumber(phoneNumber);
        const session = this.activeSessions.get(formattedPhone);
        if (session) {
            session.lastActivity = new Date();
        }
    }

    /**
     * Add message to conversation history
     * @param {string} phoneNumber - Phone number
     * @param {string} role - Message role ('user' or 'assistant')
     * @param {string} content - Message content
     */
    addToConversationHistory(phoneNumber, role, content) {
        const formattedPhone = this.formatPhoneNumber(phoneNumber);
        const session = this.activeSessions.get(formattedPhone);
        if (session) {
            session.conversationHistory.push({ role, content });
            session.lastActivity = new Date();
            
            // Keep conversation history manageable (last 20 messages)
            if (session.conversationHistory.length > 20) {
                session.conversationHistory = session.conversationHistory.slice(-20);
            }
        }
    }

    /**
     * Get conversation history for phone number
     * @param {string} phoneNumber - Phone number
     * @returns {Array} - Conversation history array
     */
    getConversationHistory(phoneNumber) {
        const formattedPhone = this.formatPhoneNumber(phoneNumber);
        const session = this.activeSessions.get(formattedPhone);
        return session ? session.conversationHistory : [];
    }

    /**
     * End session for phone number
     * @param {string} phoneNumber - Phone number
     * @returns {Promise<boolean>} - Success status
     */
    async endSession(phoneNumber) {
        try {
            const formattedPhone = this.formatPhoneNumber(phoneNumber);
            const session = this.activeSessions.get(formattedPhone);
            
            if (session) {
                // End session in ChatLogger
                if (session.sessionId && ChatLogger.isEnabled()) {
                    await ChatLogger.endSession(session.sessionId);
                }
                
                // Remove from active sessions
                this.activeSessions.delete(formattedPhone);
                console.log(`✅ WhatsApp session ended for ${formattedPhone}`);
                return true;
            }
            
            return false;
        } catch (error) {
            console.error(`❌ Error ending WhatsApp session for ${phoneNumber}:`, error);
            return false;
        }
    }

    /**
     * Clean up inactive sessions (older than 1 hour)
     */
    cleanupInactiveSessions() {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const toRemove = [];
        
        for (const [phoneNumber, session] of this.activeSessions.entries()) {
            if (session.lastActivity < oneHourAgo) {
                toRemove.push(phoneNumber);
            }
        }
        
        for (const phoneNumber of toRemove) {
            this.endSession(phoneNumber);
        }
        
        if (toRemove.length > 0) {
            console.log(`🧹 Cleaned up ${toRemove.length} inactive WhatsApp sessions`);
        }
    }

    /**
     * Generate user ID from phone number
     * @param {string} phoneNumber - Phone number
     * @returns {string} - User ID
     */
    generateUserId(phoneNumber) {
        const cleanNumber = phoneNumber.replace(/\D/g, '');
        return `whatsapp_${cleanNumber}`;
    }

    /**
     * Format phone number
     * @param {string} phoneNumber - Raw phone number
     * @returns {string} - Formatted phone number
     */
    formatPhoneNumber(phoneNumber) {
        const cleanNumber = phoneNumber.replace(/\D/g, '');
        
        if (!cleanNumber.startsWith('62') && cleanNumber.startsWith('0')) {
            return '62' + cleanNumber.substring(1);
        } else if (!cleanNumber.startsWith('62')) {
            return '62' + cleanNumber;
        }
        
        return cleanNumber;
    }

    /**
     * Get session statistics
     * @returns {Object} - Session statistics
     */
    getSessionStats() {
        return {
            activeSessions: this.activeSessions.size,
            sessions: Array.from(this.activeSessions.entries()).map(([phone, session]) => ({
                phoneNumber: phone,
                userId: session.userId,
                createdAt: session.createdAt,
                lastActivity: session.lastActivity,
                messageCount: session.conversationHistory.length
            }))
        };
    }
}

module.exports = WhatsAppSessionManager;

