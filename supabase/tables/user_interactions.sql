CREATE TABLE user_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    target_user_id UUID,
    target_claim_id UUID,
    target_verification_id UUID,
    action_type VARCHAR(30) NOT NULL CHECK (action_type IN ('upvote',
    'downvote',
    'flag',
    'report',
    'bookmark',
    'share')),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);