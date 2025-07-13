const fs = require('fs');
const path = require('path');
const { Pool } = require("pg");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

/**
 * Database Setup Script for Chat Logging
 * This script creates the necessary tables and indexes for chat logging in Supabase
 */

async function setupDatabase() {
    console.log('🚀 Starting Supabase database setup for chat logging...');
    
    // Check if SUPABASE_DATABASE_URL is configured
    if (!process.env.SUPABASE_DATABASE_URL) {
        console.error('❌ SUPABASE_DATABASE_URL not found in environment variables');
        console.error('   Please copy .env.example to .env and configure your Supabase credentials\n');
        process.exit(1);
    }
    
    // Create a dedicated pool for setup (separate from the one in config/database.js)
    const setupPool = new Pool({
        connectionString: process.env.SUPABASE_DATABASE_URL,
        ssl: {
            rejectUnauthorized: process.env.NODE_ENV === "production",
        }
    });
    
    try {
        // Test connection first
        console.log('🔌 Testing Supabase database connection...');
        const testResult = await setupPool.query('SELECT NOW() as current_time, version() as db_version');
        console.log(`✅ Supabase database connected successfully`);
        console.log(`   Time: ${testResult.rows[0].current_time}`);
        console.log(`   Version: ${testResult.rows[0].db_version.split(' ')[0]}\n`);
        
        // Check if tables already exist
        console.log('📋 Checking if required tables exist in Supabase...');
        const tables = ['chat_sessions', 'chat_messages', 'chat_analytics'];
        const existingTablesResult = await setupPool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = ANY($1)
        `, [tables]);
        
        const existingTables = existingTablesResult.rows.map(row => row.table_name);
        
        tables.forEach(table => {
            if (existingTables.includes(table)) {
                console.log(`   ✅ ${table} (already exists)`);
            } else {
                console.log(`   ❌ ${table} (missing)`);
            }
        });
        console.log('');
        
        // Read the schema SQL file
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        
        console.log('📄 Executing schema SQL on Supabase...');
        
        // Execute the schema SQL
        await setupPool.query(schemaSql);
        
        console.log('✅ Supabase database schema created successfully!');
        
        // Test the setup by inserting a test session
        console.log('🧪 Testing database setup...');
        
        const testSessionId = uuidv4();
        const testUserId = 'test-user-123';
        
        // Insert test session
        await setupPool.query(`
            INSERT INTO chat_sessions (session_id, user_id, socket_id, user_agent, ip_address)
            VALUES ($1, $2, $3, $4, $5)
        `, [testSessionId, testUserId, 'test-socket-123', 'Test User Agent', '127.0.0.1']);
        
        // Insert test message
        await setupPool.query(`
            INSERT INTO chat_messages (session_id, chat_by, chat_script, message_type)
            VALUES ($1, $2, $3, $4)
        `, [testSessionId, testUserId, 'Hello, this is a test message!', 'text']);
        
        // Insert AI response
        await setupPool.query(`
            INSERT INTO chat_messages (session_id, chat_by, chat_script, message_type, ai_model, response_time_ms)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [testSessionId, 'AI', 'Hello! This is a test AI response.', 'text', 'test-model', 1500]);
        
        // Check if data was inserted correctly
        const sessionCheck = await setupPool.query('SELECT * FROM chat_sessions WHERE session_id = $1', [testSessionId]);
        const messagesCheck = await setupPool.query('SELECT * FROM chat_messages WHERE session_id = $1 ORDER BY message_timestamp', [testSessionId]);
        const analyticsCheck = await setupPool.query('SELECT * FROM chat_analytics WHERE session_id = $1', [testSessionId]);
        
        console.log('📊 Test Results:');
        console.log(`   Sessions: ${sessionCheck.rows.length} found`);
        console.log(`   Messages: ${messagesCheck.rows.length} found`);
        console.log(`   Analytics: ${analyticsCheck.rows.length} found`);
        
        if (sessionCheck.rows.length > 0 && messagesCheck.rows.length > 0) {
            console.log('✅ Database test successful!');
            
            // Clean up test data
            await setupPool.query('DELETE FROM chat_sessions WHERE session_id = $1', [testSessionId]);
            console.log('🧹 Test data cleaned up');
        } else {
            console.log('❌ Database test failed!');
        }
        
        // Show table information
        console.log('\n📋 Database Tables Created in Supabase:');
        const finalTablesResult = await setupPool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('chat_sessions', 'chat_messages', 'chat_analytics')
            ORDER BY table_name
        `);
        
        finalTablesResult.rows.forEach(row => {
            console.log(`   ✓ ${row.table_name}`);
        });
        
        // Show indexes
        console.log('\n📋 Indexes Created:');
        const indexes = await setupPool.query(`
            SELECT indexname, tablename 
            FROM pg_indexes 
            WHERE tablename IN ('chat_sessions', 'chat_messages', 'chat_analytics')
            AND indexname NOT LIKE '%_pkey'
            ORDER BY tablename, indexname
        `);
        
        indexes.rows.forEach(row => {
            console.log(`   ✓ ${row.indexname} on ${row.tablename}`);
        });
        
        console.log('\n🎉 Supabase database setup completed successfully!');
        console.log('\n📝 Next steps:');
        console.log('   1. Verify your .env file has both DATABASE_URL and SUPABASE_DATABASE_URL');
        console.log('   2. Replace src/server.js with src/server_with_logging.js');
        console.log('   3. Restart your application');
        console.log('   4. Test chat logging functionality');
        
    } catch (error) {
        console.error('❌ Supabase database setup failed:', error);
        console.error('\n🔍 Troubleshooting:');
        console.error('   1. Check your SUPABASE_DATABASE_URL in .env file');
        console.error('   2. Ensure your Supabase database is accessible');
        console.error('   3. Verify your Supabase database credentials');
        console.error('   4. Make sure you have the correct permissions');
        console.error('   5. Check if your Supabase project is active');
        process.exit(1);
    } finally {
        // Close the database connection
        if (setupPool) {
            await setupPool.end();
            console.log('👋 Setup completed. Database connection closed.');
        }
    }
}

// Additional utility functions for testing

async function testSupabaseConnection() {
    console.log('🔌 Testing Supabase database connection...');
    
    if (!process.env.SUPABASE_DATABASE_URL) {
        console.error('❌ SUPABASE_DATABASE_URL not configured.');
        return false;
    }
    
    const testPool = new Pool({
        connectionString: process.env.SUPABASE_DATABASE_URL,
        ssl: {
            rejectUnauthorized: process.env.NODE_ENV === "production",
        }
    });
    
    try {
        const result = await testPool.query('SELECT NOW() as current_time, version() as db_version');
        console.log(`✅ Supabase database connected successfully`);
        console.log(`   Time: ${result.rows[0].current_time}`);
        console.log(`   Version: ${result.rows[0].db_version.split(' ')[0]}\n`);
        return true;
    } catch (error) {
        console.error('❌ Supabase database connection failed:', error.message);
        return false;
    } finally {
        await testPool.end();
    }
}

async function testTablesExist() {
    console.log('📋 Checking if required tables exist in Supabase...');
    
    if (!process.env.SUPABASE_DATABASE_URL) {
        console.error('❌ SUPABASE_DATABASE_URL not configured.');
        return false;
    }
    
    const testPool = new Pool({
        connectionString: process.env.SUPABASE_DATABASE_URL,
        ssl: {
            rejectUnauthorized: process.env.NODE_ENV === "production",
        }
    });
    
    try {
        const tables = ['chat_sessions', 'chat_messages', 'chat_analytics'];
        const result = await testPool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = ANY($1)
        `, [tables]);
        
        const existingTables = result.rows.map(row => row.table_name);
        
        tables.forEach(table => {
            if (existingTables.includes(table)) {
                console.log(`   ✅ ${table}`);
            } else {
                console.log(`   ❌ ${table} (missing)`);
            }
        });
        
        console.log('');
        return existingTables.length === tables.length;
    } catch (error) {
        console.error('❌ Table check failed:', error.message);
        return false;
    } finally {
        await testPool.end();
    }
}

// Main execution
async function main() {
    console.log('🚀 Supabase Chat Logging Database Setup\n');
    
    // Check environment
    if (!process.env.SUPABASE_DATABASE_URL) {
        console.error('❌ SUPABASE_DATABASE_URL not found in environment variables');
        console.error('   Please copy .env.example to .env and configure your Supabase credentials\n');
        process.exit(1);
    }
    
    // Run main setup
    await setupDatabase();
}

// Run setup if this file is executed directly
if (require.main === module) {
    main().catch(error => {
        console.error('💥 Unexpected error:', error);
        process.exit(1);
    });
}

module.exports = { setupDatabase, testSupabaseConnection, testTablesExist };

