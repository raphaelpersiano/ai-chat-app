const { getChatLoggingPool, isChatLoggingEnabled } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

/**
 * Chat Logger Model
 * Handles all database operations for chat logging using Supabase connection
 */
class ChatLogger {
    
    /**
     * Get the Supabase pool connection
     * @returns {Pool} - Supabase database pool
     */
    static getPool() {
        return getChatLoggingPool();
    }

    /**
     * Check if chat logging is enabled
     * @returns {boolean} - True if chat logging is enabled
     */
    static isEnabled() {
        return isChatLoggingEnabled();
    }

    /**
     * Create a new chat session
     * @param {string} userId - User ID from Google OAuth
     * @param {string} socketId - Socket.IO connection ID
     * @param {string} userAgent - Browser user agent
     * @param {string} ipAddress - Client IP address
     * @returns {Promise<string>} - Session ID
     */
    static async createSession(userId, socketId, userAgent = null, ipAddress = null) {
        if (!this.isEnabled()) {
            console.warn('⚠️ Chat logging is disabled. Session not created.');
            return null;
        }

        try {
            const pool = this.getPool();
            const sessionId = uuidv4();
            const query = `
                INSERT INTO chat_sessions (session_id, user_id, socket_id, user_agent, ip_address)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING session_id
            `;
            const values = [sessionId, userId, socketId, userAgent, ipAddress];
            
            const result = await pool.query(query, values);
            console.log(`✅ New chat session created: ${sessionId} for user: ${userId}`);
            return result.rows[0].session_id;
        } catch (error) {
            console.error('❌ Error creating chat session:', error);
            throw error;
        }
    }

    /**
     * End a chat session
     * @param {string} sessionId - Session ID to end
     * @returns {Promise<boolean>} - Success status
     */
    static async endSession(sessionId) {
        if (!this.isEnabled() || !sessionId) {
            return false;
        }

        try {
            const pool = this.getPool();
            const query = `
                UPDATE chat_sessions 
                SET session_end_time = CURRENT_TIMESTAMP, is_active = false
                WHERE session_id = $1 AND is_active = true
                RETURNING session_id
            `;
            const result = await pool.query(query, [sessionId]);
            
            if (result.rows.length > 0) {
                console.log(`✅ Chat session ended: ${sessionId}`);
                return true;
            } else {
                console.log(`⚠️ Session not found or already ended: ${sessionId}`);
                return false;
            }
        } catch (error) {
            console.error('❌ Error ending chat session:', error);
            throw error;
        }
    }

    /**
     * Log a chat message
     * @param {string} sessionId - Session ID
     * @param {string} chatBy - Who sent the message ('AI' or user_id)
     * @param {string} chatScript - Message content
     * @param {string} messageType - Type of message ('text', 'system', 'error')
     * @param {string} aiModel - AI model used (for AI messages)
     * @param {number} responseTimeMs - Response time in milliseconds (for AI messages)
     * @param {number} tokenCount - Token count (if available)
     * @returns {Promise<string>} - Message ID
     */
    static async logMessage(sessionId, chatBy, chatScript, messageType = 'text', aiModel = null, responseTimeMs = null, tokenCount = null) {
        if (!this.isEnabled() || !sessionId) {
            return null;
        }

        try {
            const pool = this.getPool();
            const messageId = uuidv4();
            const query = `
                INSERT INTO chat_messages (
                    message_id, session_id, chat_by, chat_script, 
                    message_type, ai_model, response_time_ms, token_count
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING message_id
            `;
            const values = [messageId, sessionId, chatBy, chatScript, messageType, aiModel, responseTimeMs, tokenCount];
            
            const result = await pool.query(query, values);
            console.log(`📝 Message logged: ${messageId} from ${chatBy} in session ${sessionId}`);
            return result.rows[0].message_id;
        } catch (error) {
            console.error('❌ Error logging message:', error);
            throw error;
        }
    }

    /**
     * Log user message
     * @param {string} sessionId - Session ID
     * @param {string} userId - User ID
     * @param {string} message - Message content
     * @returns {Promise<string>} - Message ID
     */
    static async logUserMessage(sessionId, userId, message) {
        return await this.logMessage(sessionId, userId, message, 'text');
    }

    /**
     * Log AI response
     * @param {string} sessionId - Session ID
     * @param {string} response - AI response content
     * @param {string} aiModel - AI model used
     * @param {number} responseTimeMs - Response time in milliseconds
     * @param {number} tokenCount - Token count (if available)
     * @returns {Promise<string>} - Message ID
     */
    static async logAIResponse(sessionId, response, aiModel = 'google/gemini-2.0-flash-exp:free', responseTimeMs = null, tokenCount = null) {
        return await this.logMessage(sessionId, 'AI', response, 'text', aiModel, responseTimeMs, tokenCount);
    }

    /**
     * Log system message
     * @param {string} sessionId - Session ID
     * @param {string} message - System message content
     * @returns {Promise<string>} - Message ID
     */
    static async logSystemMessage(sessionId, message) {
        return await this.logMessage(sessionId, 'SYSTEM', message, 'system');
    }

    /**
     * Log error message
     * @param {string} sessionId - Session ID
     * @param {string} errorMessage - Error message content
     * @returns {Promise<string>} - Message ID
     */
    static async logErrorMessage(sessionId, errorMessage) {
        return await this.logMessage(sessionId, 'SYSTEM', errorMessage, 'error');
    }

    /**
     * Get session by socket ID
     * @param {string} socketId - Socket.IO connection ID
     * @returns {Promise<Object|null>} - Session object or null
     */
    static async getSessionBySocketId(socketId) {
        if (!this.isEnabled()) {
            return null;
        }

        try {
            const pool = this.getPool();
            const query = `
                SELECT * FROM chat_sessions 
                WHERE socket_id = $1 AND is_active = true
                ORDER BY session_start_time DESC
                LIMIT 1
            `;
            const result = await pool.query(query, [socketId]);
            return result.rows.length > 0 ? result.rows[0] : null;
        } catch (error) {
            console.error('❌ Error getting session by socket ID:', error);
            throw error;
        }
    }

    /**
     * Get all messages for a session
     * @param {string} sessionId - Session ID
     * @param {number} limit - Maximum number of messages to return
     * @returns {Promise<Array>} - Array of message objects
     */
    static async getSessionMessages(sessionId, limit = 100) {
        if (!this.isEnabled()) {
            return [];
        }

        try {
            const pool = this.getPool();
            const query = `
                SELECT * FROM chat_messages 
                WHERE session_id = $1 
                ORDER BY message_timestamp ASC
                LIMIT $2
            `;
            const result = await pool.query(query, [sessionId, limit]);
            return result.rows;
        } catch (error) {
            console.error('❌ Error getting session messages:', error);
            throw error;
        }
    }

    /**
     * Get user's recent sessions
     * @param {string} userId - User ID
     * @param {number} limit - Maximum number of sessions to return
     * @returns {Promise<Array>} - Array of session objects with summary
     */
    static async getUserSessions(userId, limit = 10) {
        if (!this.isEnabled()) {
            return [];
        }

        try {
            const pool = this.getPool();
            const query = `
                SELECT * FROM chat_sessions_summary 
                WHERE user_id = $1 
                ORDER BY session_start_time DESC
                LIMIT $2
            `;
            const result = await pool.query(query, [userId, limit]);
            return result.rows;
        } catch (error) {
            console.error('❌ Error getting user sessions:', error);
            throw error;
        }
    }

    /**
     * Get session analytics
     * @param {string} sessionId - Session ID
     * @returns {Promise<Object|null>} - Analytics object or null
     */
    static async getSessionAnalytics(sessionId) {
        if (!this.isEnabled()) {
            return null;
        }

        try {
            const pool = this.getPool();
            const query = `
                SELECT * FROM chat_analytics 
                WHERE session_id = $1
            `;
            const result = await pool.query(query, [sessionId]);
            return result.rows.length > 0 ? result.rows[0] : null;
        } catch (error) {
            console.error('❌ Error getting session analytics:', error);
            throw error;
        }
    }

    /**
     * Update session analytics manually (if needed)
     * @param {string} sessionId - Session ID
     * @returns {Promise<boolean>} - Success status
     */
    static async updateSessionAnalytics(sessionId) {
        if (!this.isEnabled() || !sessionId) {
            return false;
        }

        try {
            const pool = this.getPool();
            // Calculate session duration
            const durationQuery = `
                UPDATE chat_analytics 
                SET session_duration_seconds = (
                    SELECT EXTRACT(EPOCH FROM (
                        COALESCE(cs.session_end_time, CURRENT_TIMESTAMP) - cs.session_start_time
                    ))
                    FROM chat_sessions cs 
                    WHERE cs.session_id = $1
                ),
                avg_response_time_ms = (
                    SELECT AVG(response_time_ms)
                    FROM chat_messages 
                    WHERE session_id = $1 AND response_time_ms IS NOT NULL
                ),
                total_tokens_used = (
                    SELECT SUM(token_count)
                    FROM chat_messages 
                    WHERE session_id = $1 AND token_count IS NOT NULL
                )
                WHERE session_id = $1
                RETURNING analytics_id
            `;
            
            const result = await pool.query(durationQuery, [sessionId]);
            return result.rows.length > 0;
        } catch (error) {
            console.error('❌ Error updating session analytics:', error);
            throw error;
        }
    }

    /**
     * Clean up old sessions (for maintenance)
     * @param {number} daysOld - Number of days old to consider for cleanup
     * @returns {Promise<number>} - Number of sessions cleaned up
     */
    static async cleanupOldSessions(daysOld = 30) {
        if (!this.isEnabled()) {
            return 0;
        }

        try {
            const pool = this.getPool();
            const query = `
                DELETE FROM chat_sessions 
                WHERE session_start_time < CURRENT_TIMESTAMP - INTERVAL '${daysOld} days'
                AND is_active = false
            `;
            const result = await pool.query(query);
            console.log(`🧹 Cleaned up ${result.rowCount} old sessions`);
            return result.rowCount;
        } catch (error) {
            console.error('❌ Error cleaning up old sessions:', error);
            throw error;
        }
    }

    /**
     * Get chat statistics for a user
     * @param {string} userId - User ID
     * @param {number} days - Number of days to look back
     * @returns {Promise<Object>} - Statistics object
     */
    static async getUserChatStats(userId, days = 7) {
        if (!this.isEnabled()) {
            return {
                total_sessions: 0,
                total_messages: 0,
                user_messages: 0,
                ai_messages: 0,
                avg_response_time_ms: null,
                total_tokens_used: 0
            };
        }

        try {
            const pool = this.getPool();
            const query = `
                SELECT 
                    COUNT(DISTINCT cs.session_id) as total_sessions,
                    COUNT(cm.message_id) as total_messages,
                    COUNT(CASE WHEN cm.chat_by != 'AI' THEN 1 END) as user_messages,
                    COUNT(CASE WHEN cm.chat_by = 'AI' THEN 1 END) as ai_messages,
                    AVG(cm.response_time_ms) as avg_response_time_ms,
                    SUM(cm.token_count) as total_tokens_used
                FROM chat_sessions cs
                LEFT JOIN chat_messages cm ON cs.session_id = cm.session_id
                WHERE cs.user_id = $1 
                AND cs.session_start_time >= CURRENT_TIMESTAMP - INTERVAL '${days} days'
            `;
            const result = await pool.query(query, [userId]);
            return result.rows[0];
        } catch (error) {
            console.error('❌ Error getting user chat stats:', error);
            throw error;
        }
    }
}

module.exports = ChatLogger;

