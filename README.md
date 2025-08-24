# Crowd-Sourced AI Detective - Portia SDK Core Integration

A comprehensive Python integration of the Portia SDK for the Crowd-Sourced AI Detective application, providing multi-agent orchestration, Human-in-the-Loop clarification system, state management, and audit capabilities for misinformation detection.

## 🎯 Key Features

- **Multi-Agent Architecture** - Orchestrated claim parsing, evidence collection, and report generation
- **Human-in-the-Loop Clarification** - 5 clarification types with automatic conflict detection
- **Comprehensive Audit Trails** - Complete transparency and compliance tracking
- **Flexible LLM Support** - OpenAI, Anthropic, Google, Mistral, Azure, AWS Bedrock
- **Async Execution** - High-performance concurrent processing
- **Robust Error Handling** - Graceful degradation and recovery

## 🚀 Quick Start

### 1. Installation

Run the setup script to install all dependencies and configure the environment:

```bash
cd code/
bash setup.sh
```

Alternatively, install manually:

```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Setup configuration
cp .env.example .env
```

### 2. Configuration

Edit the `.env` file with your API keys and settings:

```bash
# Primary LLM Provider
AI_DETECTIVE_LLM_PROVIDER=openai
OPENAI_API_KEY=sk-your-api-key-here

# Optional: Portia Cloud features
PORTIA_API_KEY=pk-your-portia-key-here
```

### 3. Basic Usage

```python
import asyncio
from portia_core import create_detective_core, quick_claim_verification
from clarification_system import create_clarification_system

async def main():
    # Initialize the system
    core = create_detective_core()
    clarification = create_clarification_system(core)
    
    # Health check
    health = await core.health_check()
    print(f"System healthy: {health['portia_client_initialized']}")
    
    # Quick claim verification
    result = await quick_claim_verification(
        "Climate change is primarily caused by human activities"
    )
    print(f"Verification: {result}")
    
    # Register clarification callback
    async def handle_clarification(request):
        print(f"Human review needed: {request.title}")
    
    clarification.register_clarification_callback(handle_clarification)

asyncio.run(main())
```

## 📖 Documentation

### Core Components

#### PortiaCore
The main integration class that orchestrates all AI Detective operations:

- **Multi-agent workflow execution**
- **Plan run state tracking** 
- **Comprehensive audit trails**
- **Async execution support**
- **Error handling and recovery**

#### HumanInTheLoopClarificationSystem
Comprehensive clarification system providing human oversight capabilities:

- **5 Portia clarification types**: Input, Multiple Choice, Value Confirmation, Action, Custom
- **Decision threshold logic** for automatic intervention triggering
- **Conflict detection** for contradictory evidence scenarios
- **Confidence scoring** and low-confidence detection
- **State tracking & audit trails** for all clarification requests
- **Seamless multi-agent integration**

```python
from portia_core import create_detective_core
from clarification_system import create_clarification_system

# Initialize systems
core = create_detective_core()
clarification = create_clarification_system(core)

# Register callback for clarification requests
async def handle_clarification(request):
    print(f"Human input needed: {request.title}")
    # Integration with UI/notification system

clarification.register_clarification_callback(handle_clarification)
```

#### DetectiveAgentBase
Base class for implementing specialized agents:

```python
from portia_core import DetectiveAgentBase, DetectiveAgentType, ClaimData, AgentResult

class MyCustomAgent(DetectiveAgentBase):
    def __init__(self, portia_client, audit_manager):
        super().__init__(DetectiveAgentType.CLAIM_PARSER, portia_client, audit_manager)
    
    async def process_claim(self, claim: ClaimData, **kwargs) -> AgentResult:
        # Your agent implementation
        return AgentResult(
            agent_type=self.agent_type,
            success=True,
            data={"result": "processed"},
            confidence=0.85
        )
```

#### Configuration Management
Flexible configuration supporting multiple LLM providers:

```python
from portia_core import PortiaConfig

config = PortiaConfig()
errors = config.validate()
if errors:
    print("Configuration errors:", errors)
```

### Agent Types

The system supports four main agent types:

1. **CLAIM_PARSER** - Extract and structure verifiable claims
2. **EVIDENCE_COLLECTOR** - Gather supporting/contradicting evidence  
3. **REPORT_GENERATOR** - Generate comprehensive verification reports
4. **ORCHESTRATOR** - Coordinate multi-agent workflows

### Human-in-the-Loop Clarification System

The clarification system provides robust human oversight with 5 distinct clarification types:

#### Clarification Types

1. **Input Clarification** - Request human input/guidance for complex scenarios
2. **Multiple Choice** - Resolve conflicts with predefined options  
3. **Value Confirmation** - Confirm system findings before proceeding
4. **Action Confirmation** - Confirm actions before execution
5. **Custom** - Handle complex situations requiring specialized review

#### Usage Example

```python
# Evaluate claim and trigger clarification if needed
confidence = clarification.calculate_confidence_metrics(evidence_list, agent_results)
request = await clarification.evaluate_and_request_clarification(
    claim, agent_results, evidence_list, confidence
)

if request:
    print(f"Type: {request.clarification_type.value}")
    print(f"Priority: {request.priority.value}")
    
    # Process human response
    response = await clarification.process_clarification_response(
        request.request_id, 
        {"selected_option": "option_1", "confidence": 0.8},
        "reviewer_user_id"
    )
```

#### Automatic Conflict Detection

The system automatically detects and flags:

- **Contradictory Sources** - Sources providing opposing verdicts
- **Conflicting Facts** - Numerical discrepancies in factual claims
- **Credibility Disputes** - Varying assessments of source reliability
- **Temporal Inconsistencies** - Timeline contradictions
- **Methodology Conflicts** - Different analysis methods reaching opposing conclusions

#### Decision Thresholds

Configurable thresholds for automatic clarification triggering:

```python
config = {
    "decision_engine": {
        "confidence_thresholds": {
            "low": 0.5,      # Trigger high-priority clarification
            "medium": 0.7,   # Trigger medium-priority clarification  
            "high": 0.85     # System proceeds with confidence
        },
        "conflict_severity_threshold": 0.6,
        "auto_escalation_enabled": True
    }
}
```

#### Monitoring & Analytics

```python
# Get all pending clarifications
pending = clarification.get_pending_clarifications()

# Get clarifications for specific claim
claim_requests = clarification.get_claim_clarifications("claim_id")

# Export audit data for analytics
audit_data = clarification.state_tracker.export_clarification_audit()
```

### Workflow Execution

Execute complete verification workflows:

```python
from portia_core import ClaimData
from datetime import datetime, timezone

# Create a claim
claim = ClaimData(
    claim_id="unique-id",
    content="The Earth is flat",
    source_url="https://example.com",
    timestamp=datetime.now(timezone.utc)
)

# Process with multiple agents
result = await core.process_claim_workflow(
    claim=claim,
    agents_to_run=[DetectiveAgentType.CLAIM_PARSER, DetectiveAgentType.EVIDENCE_COLLECTOR],
    user_id="user123"
)
```

### Audit and State Management

Full audit trails are automatically maintained:

```python
# Get audit trail for specific claim
audit_trail = core.get_audit_trail(claim_id="unique-id")

# Get all audit events
all_events = core.get_audit_trail()

# Export audit data for compliance
audit_data = core.audit_manager.export_audit_data(
    start_date=datetime(2024, 1, 1),
    end_date=datetime(2024, 12, 31)
)
```

### Custom Tools

Implement custom tools for specialized functionality:

```python
from portia.tool import Tool, ToolRunContext
from portia.errors import ToolSoftError

class CustomFactCheckTool(Tool[dict]):
    id: str = "custom_fact_check"
    name: str = "Custom Fact Checker"
    description: str = "Check facts against custom database"
    
    def run(self, context: ToolRunContext, claim: str) -> dict:
        try:
            # Your custom fact-checking logic
            return {"verification": "verified", "confidence": 0.9}
        except Exception as e:
            raise ToolSoftError(f"Fact check failed: {e}")
```

## 🔧 Advanced Configuration

### LLM Provider Options

The system supports multiple LLM providers:

| Provider | Environment Variable | Default Model |
|----------|---------------------|---------------|
| OpenAI | `OPENAI_API_KEY` | gpt-4-1106-preview |
| Anthropic | `ANTHROPIC_API_KEY` | claude-3-sonnet |
| Google | `GOOGLE_API_KEY` | gemini-pro |
| Mistral | `MISTRAL_API_KEY` | mistral-large-latest |
| Azure OpenAI | `AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_ENDPOINT` | gpt-4-1106-preview |
| AWS Bedrock | `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` | claude-3-sonnet |

### Performance Tuning

```bash
# Concurrent agent execution
AI_DETECTIVE_MAX_CONCURRENT=10

# Operation timeouts
AI_DETECTIVE_TIMEOUT=600

# Logging level
AI_DETECTIVE_LOG_LEVEL=DEBUG
```

### Database Integration

For production deployments, configure external storage:

```bash
# PostgreSQL for audit data
DATABASE_URL=postgresql://user:pass@localhost:5432/ai_detective

# Redis for state management
REDIS_URL=redis://localhost:6379/0
```

## 🏗️ Architecture

The system implements a **Hierarchical Agent Pattern** with **Event-Driven Communication**:

```
┌─────────────────────────────────────────┐
│              PortiaCore                 │
│  ┌─────────────┐    ┌─────────────────┐ │
│  │ Config Mgr  │    │  Audit Manager  │ │
│  └─────────────┘    └─────────────────┘ │
│  ┌─────────────────────────────────────┐ │
│  │        Portia Client               │ │
│  │  ┌──────────┐ ┌──────────────────┐ │ │
│  │  │   Plan   │ │   Custom Tools   │ │ │
│  │  │   Exec   │ │                  │ │ │
│  │  └──────────┘ └──────────────────┘ │ │
│  └─────────────────────────────────────┘ │
│  ┌─────────────────────────────────────┐ │
│  │         Agent Registry             │ │
│  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────────┐ │ │
│  │  │ CP  │ │ EC  │ │ RG  │ │  ORCH   │ │ │
│  │  └─────┘ └─────┘ └─────┘ └─────────┘ │ │
│  └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

- **CP**: Claim Parser Agent
- **EC**: Evidence Collector Agent  
- **RG**: Report Generator Agent
- **ORCH**: Orchestrator Agent

## 🔍 Testing

Run the clarification system demonstration to test your setup:

```bash
python clarification_demo.py
```

This comprehensive demo shows:
- Automatic conflict detection in evidence
- Human-in-the-Loop clarification triggering
- Multiple clarification types in action
- Confidence scoring and decision thresholds
- Audit trail generation and monitoring

For basic system testing:

```bash
python run_example.py
```

For unit testing:

```python
import pytest
import asyncio
from portia_core import create_detective_core

@pytest.mark.asyncio
async def test_health_check():
    core = create_detective_core()
    health = await core.health_check()
    assert health['portia_sdk_available'] == True
```

## 🚨 Error Handling

The system provides comprehensive error handling:

```python
from portia.errors import ToolHardError, ToolSoftError, PlanError

try:
    result = await core.run_portia_plan("Verify this claim")
except ToolSoftError as e:
    # Recoverable error - retry with different approach
    logger.warning(f"Soft error: {e}")
except ToolHardError as e:
    # Critical error - requires intervention
    logger.error(f"Hard error: {e}")
except PlanError as e:
    # Plan generation failed
    logger.error(f"Plan error: {e}")
```

## 📊 Monitoring

Built-in health checks and monitoring:

```python
# System health
health = await core.health_check()

# Audit statistics
stats = {
    "active_plan_runs": len(core.active_plan_runs),
    "total_events": len(core.audit_manager.events),
    "registered_agents": len(core.agents)
}

# Performance metrics
execution_times = [event.data.get('execution_time_ms') 
                   for event in core.audit_manager.events 
                   if event.data and 'execution_time_ms' in event.data]
```

## 🔐 Security

Security best practices:

1. **API Key Management**: Use environment variables, never commit keys
2. **Input Validation**: All inputs are validated using Pydantic schemas
3. **Audit Logging**: Complete audit trail for all operations
4. **Error Handling**: Sensitive information is not exposed in error messages
5. **Access Control**: Use `end_user` parameter for user-specific operations

## 📝 Contributing

1. Follow the existing code structure and patterns
2. Add comprehensive logging for new features
3. Include audit events for all operations
4. Write unit tests for new functionality
5. Update documentation for new features

## 🔗 References

- [Portia SDK Documentation](https://docs.portialabs.ai/)
- [Portia GitHub Repository](https://github.com/portiaAI/portia-sdk-python)
- [AI Detective System Architecture](../docs/system_architecture.md)
- [Portia SDK Analysis](../docs/portia_sdk_analysis.md)

