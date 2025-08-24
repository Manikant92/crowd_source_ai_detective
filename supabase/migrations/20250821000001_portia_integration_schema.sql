-- Enhanced database schema for full Portia SDK integration
-- Supports multi-agent workflows, clarifications, audit trails, and real-time tracking

-- Workflow tracking table for Portia multi-agent orchestration
CREATE TABLE IF NOT EXISTS agent_workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID REFERENCES claims(id) ON DELETE CASCADE,
    workflow_id TEXT NOT NULL,
    step_name TEXT NOT NULL,
    step_index INTEGER NOT NULL,
    agent_type TEXT NOT NULL, -- claim_parser, evidence_collector, report_generator
    status TEXT NOT NULL DEFAULT 'pending', -- pending, running, completed, failed, waiting_clarification
    input_data JSONB,
    output_data JSONB,
    confidence_score NUMERIC(5, 4),
    execution_time_ms INTEGER,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    UNIQUE(claim_id, workflow_id, step_index)
);

-- Human clarification requests table
CREATE TABLE IF NOT EXISTS clarification_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id TEXT UNIQUE NOT NULL,
    claim_id UUID REFERENCES claims(id) ON DELETE CASCADE,
    clarification_type TEXT NOT NULL, -- input, multiple_choice, value_confirmation, action, custom
    priority TEXT NOT NULL DEFAULT 'medium', -- low, medium, high, critical
    status TEXT NOT NULL DEFAULT 'pending', -- pending, in_progress, completed, cancelled, expired
    agent_type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    context_data JSONB,
    options JSONB, -- For multiple choice clarifications
    default_value JSONB,
    timeout_seconds INTEGER DEFAULT 3600,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    response_data JSONB,
    response_user_id UUID REFERENCES auth.users(id),
    response_time_seconds NUMERIC(10, 3),
    response_notes TEXT
);

-- Evidence items collected by web retrieval agents
CREATE TABLE IF NOT EXISTS evidence_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID REFERENCES claims(id) ON DELETE CASCADE,
    source_url TEXT NOT NULL,
    domain TEXT NOT NULL,
    source_type TEXT NOT NULL, -- news_outlet, fact_checker, academic, government, social_media, etc.
    reliability_score NUMERIC(5, 4) NOT NULL,
    title TEXT,
    content TEXT,
    snippet TEXT,
    relevance_score NUMERIC(5, 4),
    evidence_type TEXT NOT NULL, -- supporting, contradicting, neutral
    confidence NUMERIC(5, 4),
    extraction_method TEXT, -- api, scraping, browser_automation
    metadata JSONB,
    content_hash TEXT,
    crawl_depth INTEGER DEFAULT 0,
    parent_url TEXT,
    collected_at TIMESTAMPTZ DEFAULT NOW(),
    last_validated TIMESTAMPTZ
);

-- Comprehensive audit trail for transparency
CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT UNIQUE NOT NULL,
    claim_id UUID REFERENCES claims(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    agent_type TEXT,
    event_type TEXT NOT NULL,
    event_data JSONB,
    confidence_metrics JSONB,
    plan_run_state JSONB, -- Complete Portia PlanRunState for transparency
    error_details TEXT,
    execution_time_ms INTEGER,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT
);

-- Real-time progress tracking for WebSocket updates
CREATE TABLE IF NOT EXISTS claim_progress (
    claim_id UUID PRIMARY KEY REFERENCES claims(id) ON DELETE CASCADE,
    current_status TEXT NOT NULL DEFAULT 'submitted',
    current_agent TEXT,
    progress_percentage NUMERIC(5, 2) DEFAULT 0.00,
    estimated_completion TIMESTAMPTZ,
    agent_results JSONB DEFAULT '{}',
    active_clarifications INTEGER DEFAULT 0,
    total_evidence_items INTEGER DEFAULT 0,
    confidence_metrics JSONB,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- Enhanced reports table with comprehensive data
ALTER TABLE reports ADD COLUMN IF NOT EXISTS confidence_breakdown JSONB;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS evidence_summary JSONB;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS processing_timeline JSONB;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS clarifications_used JSONB;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS plan_run_states JSONB;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS transparency_score NUMERIC(5, 4);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS methodology_notes TEXT;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_agent_workflows_claim_id ON agent_workflows(claim_id);
CREATE INDEX IF NOT EXISTS idx_agent_workflows_status ON agent_workflows(status);
CREATE INDEX IF NOT EXISTS idx_agent_workflows_workflow_id ON agent_workflows(workflow_id);

CREATE INDEX IF NOT EXISTS idx_clarification_requests_claim_id ON clarification_requests(claim_id);
CREATE INDEX IF NOT EXISTS idx_clarification_requests_status ON clarification_requests(status);
CREATE INDEX IF NOT EXISTS idx_clarification_requests_priority ON clarification_requests(priority);

CREATE INDEX IF NOT EXISTS idx_evidence_items_claim_id ON evidence_items(claim_id);
CREATE INDEX IF NOT EXISTS idx_evidence_items_source_type ON evidence_items(source_type);
CREATE INDEX IF NOT EXISTS idx_evidence_items_reliability_score ON evidence_items(reliability_score DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_claim_id ON audit_events(claim_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_timestamp ON audit_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_agent_type ON audit_events(agent_type);

-- Real-time subscriptions setup
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE clarification_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_progress ENABLE ROW LEVEL SECURITY;

-- Policies for real-time access
CREATE POLICY "Claims are viewable by everyone" ON claims FOR SELECT USING (true);
CREATE POLICY "Agent workflows are viewable by everyone" ON agent_workflows FOR SELECT USING (true);
CREATE POLICY "Clarification requests are viewable by everyone" ON clarification_requests FOR SELECT USING (true);
CREATE POLICY "Claim progress is viewable by everyone" ON claim_progress FOR SELECT USING (true);

-- Function to update claim progress
CREATE OR REPLACE FUNCTION update_claim_progress()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO claim_progress (claim_id, current_status, current_agent, last_updated)
    VALUES (NEW.claim_id, NEW.status, NEW.agent_type, NOW())
    ON CONFLICT (claim_id)
    DO UPDATE SET
        current_status = NEW.status,
        current_agent = NEW.agent_type,
        last_updated = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update progress tracking
CREATE TRIGGER update_claim_progress_trigger
    AFTER INSERT OR UPDATE ON agent_workflows
    FOR EACH ROW
    EXECUTE FUNCTION update_claim_progress();
