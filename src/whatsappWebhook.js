const crypto = require('crypto');
const axios = require('axios');
const ChatLogger = require('./models/chatLogger');
require('dotenv').config();

/**
 * WhatsApp Webhook Handler
 * Handles incoming WhatsApp messages and sends responses via Meta WhatsApp Business API
 */
class WhatsAppWebhook {
    constructor() {
        this.accessToken = process.env.META_ACCESS_TOKEN;
        this.phoneNumberId = process.env.META_PHONE_NUMBER_ID;
        this.verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
        this.appSecret = process.env.META_APP_SECRET;
        this.whatsappApiUrl = `https://graph.facebook.com/v18.0/${this.phoneNumberId}/messages`;
        
        // Store for message buffering (phone_number -> {messages: [], timer: timeout})
        this.messageBuffers = new Map();
        this.BUFFER_DELAY_MS = 15000; // 15 seconds
    }

    /**
     * Verify webhook for Meta WhatsApp
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    verifyWebhook(req, res) {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        if (mode && token) {
            if (mode === 'subscribe' && token === this.verifyToken) {
                console.log('✅ WhatsApp webhook verified successfully');
                res.status(200).send(challenge);
            } else {
                console.error('❌ WhatsApp webhook verification failed');
                res.sendStatus(403);
            }
        } else {
            console.error('❌ Missing webhook verification parameters');
            res.sendStatus(400);
        }
    }

    /**
     * Verify webhook signature from Meta
     * @param {string} payload - Raw request body
     * @param {string} signature - X-Hub-Signature-256 header
     * @returns {boolean} - True if signature is valid
     */
    verifySignature(payload, signature) {
        if (!this.appSecret || !signature) {
            return false;
        }

        const expectedSignature = crypto
            .createHmac('sha256', this.appSecret)
            .update(payload, 'utf8')
            .digest('hex');

        const receivedSignature = signature.replace('sha256=', '');
        return crypto.timingSafeEqual(
            Buffer.from(expectedSignature, 'hex'),
            Buffer.from(receivedSignature, 'hex')
        );
    }

    /**
     * Extract phone number from WhatsApp webhook payload
     * @param {Object} entry - Webhook entry object
     * @returns {string|null} - Phone number or null
     */
    extractPhoneNumber(entry) {
        try {
            const changes = entry.changes;
            if (changes && changes.length > 0) {
                const value = changes[0].value;
                if (value && value.messages && value.messages.length > 0) {
                    return value.messages[0].from;
                }
            }
            return null;
        } catch (error) {
            console.error('❌ Error extracting phone number:', error);
            return null;
        }
    }

    /**
     * Extract message content from WhatsApp webhook payload
     * @param {Object} entry - Webhook entry object
     * @returns {Array} - Array of message objects
     */
    extractMessages(entry) {
        try {
            const messages = [];
            const changes = entry.changes;
            
            if (changes && changes.length > 0) {
                const value = changes[0].value;
                if (value && value.messages && value.messages.length > 0) {
                    for (const message of value.messages) {
                        if (message.type === 'text' && message.text && message.text.body) {
                            messages.push({
                                id: message.id,
                                from: message.from,
                                text: message.text.body,
                                timestamp: message.timestamp
                            });
                        }
                    }
                }
            }
            
            return messages;
        } catch (error) {
            console.error('❌ Error extracting messages:', error);
            return [];
        }
    }

    /**
     * Send message to WhatsApp user
     * @param {string} phoneNumber - Recipient phone number
     * @param {string} message - Message text to send
     * @returns {Promise<boolean>} - Success status
     */
    async sendMessage(phoneNumber, message) {
        try {
            const payload = {
                messaging_product: 'whatsapp',
                to: phoneNumber,
                type: 'text',
                text: {
                    body: message
                }
            };

            const response = await axios.post(this.whatsappApiUrl, payload, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.status === 200) {
                console.log(`✅ Message sent to ${phoneNumber}`);
                return true;
            } else {
                console.error(`❌ Failed to send message to ${phoneNumber}:`, response.data);
                return false;
            }
        } catch (error) {
            console.error(`❌ Error sending message to ${phoneNumber}:`, error.response?.data || error.message);
            return false;
        }
    }

    /**
     * Send typing indicator to WhatsApp user
     * @param {string} phoneNumber - Recipient phone number
     * @returns {Promise<boolean>} - Success status
     */
    async sendTypingIndicator(phoneNumber) {
        try {
            const payload = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: phoneNumber,
                type: 'text',
                text: {
                    body: '⌨️ Sedang mengetik...'
                }
            };

            await axios.post(this.whatsappApiUrl, payload, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            return true;
        } catch (error) {
            console.error(`❌ Error sending typing indicator to ${phoneNumber}:`, error.message);
            return false;
        }
    }

    /**
     * Buffer messages for a phone number with debounced processing
     * @param {string} phoneNumber - Phone number
     * @param {Array} messages - Array of message objects
     * @param {Function} processCallback - Callback function to process buffered messages
     */
    bufferMessages(phoneNumber, messages, processCallback) {
        // Clear existing timer if any
        if (this.messageBuffers.has(phoneNumber)) {
            const buffer = this.messageBuffers.get(phoneNumber);
            if (buffer.timer) {
                clearTimeout(buffer.timer);
            }
            // Add new messages to existing buffer
            buffer.messages.push(...messages);
        } else {
            // Create new buffer
            this.messageBuffers.set(phoneNumber, {
                messages: [...messages],
                timer: null
            });
        }

        // Set new timer
        const buffer = this.messageBuffers.get(phoneNumber);
        buffer.timer = setTimeout(async () => {
            try {
                // Process all buffered messages
                const allMessages = buffer.messages;
                this.messageBuffers.delete(phoneNumber);
                
                console.log(`📝 Processing ${allMessages.length} buffered messages for ${phoneNumber}`);
                await processCallback(phoneNumber, allMessages);
            } catch (error) {
                console.error(`❌ Error processing buffered messages for ${phoneNumber}:`, error);
                this.messageBuffers.delete(phoneNumber);
            }
        }, this.BUFFER_DELAY_MS);

        console.log(`⏱️ Messages buffered for ${phoneNumber}. Will process in ${this.BUFFER_DELAY_MS}ms`);
    }

    /**
     * Generate user ID from phone number
     * @param {string} phoneNumber - Phone number
     * @returns {string} - User ID
     */
    generateUserId(phoneNumber) {
        // Remove any non-digit characters and add prefix
        const cleanNumber = phoneNumber.replace(/\D/g, '');
        return `whatsapp_${cleanNumber}`;
    }

    /**
     * Format phone number for display
     * @param {string} phoneNumber - Raw phone number
     * @returns {string} - Formatted phone number
     */
    formatPhoneNumber(phoneNumber) {
        // Remove any non-digit characters
        const cleanNumber = phoneNumber.replace(/\D/g, '');
        
        // Add country code if missing (assume Indonesia +62)
        if (!cleanNumber.startsWith('62') && cleanNumber.startsWith('0')) {
            return '62' + cleanNumber.substring(1);
        } else if (!cleanNumber.startsWith('62')) {
            return '62' + cleanNumber;
        }
        
        return cleanNumber;
    }

    /**
     * Validate phone number format
     * @param {string} phoneNumber - Phone number to validate
     * @returns {boolean} - True if valid
     */
    isValidPhoneNumber(phoneNumber) {
        if (!phoneNumber) return false;
        
        // Remove any non-digit characters
        const cleanNumber = phoneNumber.replace(/\D/g, '');
        
        // Check if it's a valid length (8-15 digits)
        return cleanNumber.length >= 8 && cleanNumber.length <= 15;
    }

    /**
     * Get configuration status
     * @returns {Object} - Configuration status
     */
    getConfigStatus() {
        return {
            accessToken: !!this.accessToken,
            phoneNumberId: !!this.phoneNumberId,
            verifyToken: !!this.verifyToken,
            appSecret: !!this.appSecret,
            isConfigured: !!(this.accessToken && this.phoneNumberId && this.verifyToken && this.appSecret)
        };
    }
}

module.exports = WhatsAppWebhook;

