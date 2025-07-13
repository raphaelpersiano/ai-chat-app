-- Chat Logging Database Schema
-- PostgreSQL/Supabase Implementation

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: chat_sessions
-- Stores information about each chat session
CREATE TABLE IF NOT EXISTS chat_sessions (
    session_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255) NOT NULL,
    socket_id VARCHAR(255) NOT NULL,
    session_start_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    session_end_time TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    user_agent TEXT,
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table: chat_messages
-- Stores all chat messages (user and AI)
CREATE TABLE IF NOT EXISTS chat_messages (
    message_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
    chat_by VARCHAR(50) NOT NULL, -- 'user' atau user_id untuk user messages, 'AI' untuk AI responses
    chat_script TEXT NOT NULL,
    message_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    message_type VARCHAR(20) DEFAULT 'text', -- 'text', 'system', 'error'
    ai_model VARCHAR(100), -- untuk tracking model AI yang digunakan
    response_time_ms INTEGER, -- waktu response AI dalam milliseconds
    token_count INTEGER, -- jumlah token yang digunakan (jika tersedia)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table: chat_analytics (Optional)
-- Stores analytics data for reporting
CREATE TABLE IF NOT EXISTS chat_analytics (
    analytics_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
    total_messages INTEGER DEFAULT 0,
    user_messages INTEGER DEFAULT 0,
    ai_messages INTEGER DEFAULT 0,
    session_duration_seconds INTEGER,
    avg_response_time_ms DECIMAL(10,2),
    total_tokens_used INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance optimization
-- chat_sessions indexes
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_socket_id ON chat_sessions(socket_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_active ON chat_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_start_time ON chat_sessions(session_start_time);

-- chat_messages indexes
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_timestamp ON chat_messages(message_timestamp);
CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_by ON chat_messages(chat_by);
CREATE INDEX IF NOT EXISTS idx_chat_messages_type ON chat_messages(message_type);

-- chat_analytics indexes
CREATE INDEX IF NOT EXISTS idx_chat_analytics_session_id ON chat_analytics(session_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to automatically update updated_at
CREATE TRIGGER update_chat_sessions_updated_at 
    BEFORE UPDATE ON chat_sessions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chat_analytics_updated_at 
    BEFORE UPDATE ON chat_analytics 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically update analytics when messages are inserted
CREATE OR REPLACE FUNCTION update_chat_analytics()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert or update analytics for the session
    INSERT INTO chat_analytics (session_id, total_messages, user_messages, ai_messages)
    VALUES (NEW.session_id, 1, 
            CASE WHEN NEW.chat_by != 'AI' THEN 1 ELSE 0 END,
            CASE WHEN NEW.chat_by = 'AI' THEN 1 ELSE 0 END)
    ON CONFLICT (session_id) DO UPDATE SET
        total_messages = chat_analytics.total_messages + 1,
        user_messages = chat_analytics.user_messages + 
            CASE WHEN NEW.chat_by != 'AI' THEN 1 ELSE 0 END,
        ai_messages = chat_analytics.ai_messages + 
            CASE WHEN NEW.chat_by = 'AI' THEN 1 ELSE 0 END,
        updated_at = CURRENT_TIMESTAMP;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Note: The above trigger assumes session_id is unique in chat_analytics
-- If you want to allow multiple analytics records per session, remove the ON CONFLICT clause

-- Trigger to update analytics on message insert
CREATE TRIGGER update_analytics_on_message_insert 
    AFTER INSERT ON chat_messages 
    FOR EACH ROW EXECUTE FUNCTION update_chat_analytics();

-- View for easy querying of chat sessions with message counts
CREATE OR REPLACE VIEW chat_sessions_summary AS
SELECT 
    cs.session_id,
    cs.user_id,
    cs.session_start_time,
    cs.session_end_time,
    cs.is_active,
    COALESCE(ca.total_messages, 0) as total_messages,
    COALESCE(ca.user_messages, 0) as user_messages,
    COALESCE(ca.ai_messages, 0) as ai_messages,
    CASE 
        WHEN cs.session_end_time IS NOT NULL 
        THEN EXTRACT(EPOCH FROM (cs.session_end_time - cs.session_start_time))
        ELSE EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - cs.session_start_time))
    END as session_duration_seconds
FROM chat_sessions cs
LEFT JOIN chat_analytics ca ON cs.session_id = ca.session_id;

-- Sample queries for testing
-- Get all messages for a specific session:
-- SELECT * FROM chat_messages WHERE session_id = 'your-session-id' ORDER BY message_timestamp;

-- Get session summary:
-- SELECT * FROM chat_sessions_summary WHERE user_id = 'your-user-id' ORDER BY session_start_time DESC;

-- Get recent chat activity:
-- SELECT cs.session_id, cs.user_id, cm.chat_by, cm.chat_script, cm.message_timestamp
-- FROM chat_sessions cs
-- JOIN chat_messages cm ON cs.session_id = cm.session_id
-- WHERE cs.session_start_time >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
-- ORDER BY cm.message_timestamp DESC;

