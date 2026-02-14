-- Authentication system migration
-- Add this to your existing database

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE
);

-- Insert default admin user (password: admin123)
-- You should change this password after first login
INSERT INTO users (email, password_hash, name, role) 
VALUES ('admin@example.com', '$2b$10$ZIy8U82810QtF4v4AuSbY.LdpCyq.f43dc3e.G9plOPqsNs.Ysqf2', 'Admin User', 'admin')
ON CONFLICT (email) DO NOTHING;

-- Grant permissions (adjust as needed for your setup)
-- GRANT ALL PRIVILEGES ON TABLE users TO your_username;
-- GRANT ALL PRIVILEGES ON TABLE user_sessions TO your_username;
-- GRANT USAGE, SELECT ON SEQUENCE users_id_seq TO your_username;
-- GRANT USAGE, SELECT ON SEQUENCE user_sessions_id_seq TO your_username;
