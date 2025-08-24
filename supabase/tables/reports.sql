CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL,
    report_type VARCHAR(30) DEFAULT 'fact_check' CHECK (report_type IN ('fact_check',
    'source_analysis',
    'consensus_summary',
    'audit_trail')),
    report_data JSONB NOT NULL,
    reliability_breakdown JSONB,
    evidence_summary JSONB,
    community_consensus JSONB,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_published BOOLEAN DEFAULT FALSE,
    publish_url VARCHAR(500)
);