CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    user_type VARCHAR(20) DEFAULT 'contributor' CHECK (user_type IN ('contributor',
    'moderator',
    'expert',
    'admin')),
    reputation_score DECIMAL(5,2) DEFAULT 50.00 CHECK (reputation_score >= 0 AND reputation_score <= 100),
    profile_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_verified BOOLEAN DEFAULT FALSE,
    preferences JSONB
);