-- Migration: User Registration Invites & Department Enhancement
CREATE TABLE IF NOT EXISTS user_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token VARCHAR(64) UNIQUE NOT NULL,
    role_id INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    department_id INT REFERENCES departments(id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    note VARCHAR(255),
    max_uses INT DEFAULT 1,
    used_count INT DEFAULT 0,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_invites_token ON user_invites(token);

SELECT setval(pg_get_serial_sequence('departments', 'id'), coalesce(max(id), 0) + 1, false) FROM departments;

INSERT INTO departments (name, code, description) VALUES
('Marketing', 'MKT', 'Marketing, branding, social media, and advertising content')
ON CONFLICT (name) DO NOTHING;
