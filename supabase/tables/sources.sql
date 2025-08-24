CREATE TABLE sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_url VARCHAR(2048) UNIQUE NOT NULL,
    source_title VARCHAR(500),
    source_domain VARCHAR(255) NOT NULL,
    credibility_score DECIMAL(4,3) DEFAULT 0.5 CHECK (credibility_score >= 0.0 AND credibility_score <= 1.0),
    source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('news',
    'academic',
    'government',
    'social',
    'blog',
    'other')),
    source_metadata JSONB,
    first_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_verified TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_whitelisted BOOLEAN DEFAULT FALSE,
    is_blacklisted BOOLEAN DEFAULT FALSE,
    verification_history JSONB
);