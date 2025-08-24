"""
Portia SDK Core Integration for AI Detective Application

This module provides a comprehensive Python integration for the Portia SDK,
implementing multi-agent orchestration, state management, and audit capabilities
for the Crowd-Sourced AI Detective misinformation detection system.

Key Features:
- Multi-agent architecture foundation
- PlanRunState tracking for audit transparency
- Async execution capabilities
- LLM provider configuration utilities
- Comprehensive error handling and logging
- Authentication and configuration management
"""

import os
import asyncio
import logging
import json
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Union, Callable, Type
from dataclasses import dataclass, asdict
from enum import Enum
import traceback

try:
    from portia import Portia, Config, LLMProvider
    from portia.tool import Tool, ToolRunContext
    from portia.errors import ToolHardError, ToolSoftError, PlanError, InvalidPlanRunStateError
    from portia.plan import Plan, PlanRun, PlanRunState
    from pydantic import BaseModel, Field
    PORTIA_AVAILABLE = True
except ImportError as e:
    logging.warning(f"Portia SDK not available: {e}")
    PORTIA_AVAILABLE = False
    # Mock classes for development
    class BaseModel:
        pass
    class Tool:
        pass
    class ToolRunContext:
        pass
    class ToolHardError(Exception):
        pass
    class ToolSoftError(Exception):
        pass
    class PlanError(Exception):
        pass
    class InvalidPlanRunStateError(Exception):
        pass

# Always import pydantic for data structures
try:
    from pydantic import BaseModel as PydanticBaseModel
    if not PORTIA_AVAILABLE:
        BaseModel = PydanticBaseModel
except ImportError:
    # Final fallback if pydantic is not available
    if not PORTIA_AVAILABLE:
        class BaseModel:
            pass


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class DetectiveAgentType(Enum):
    """Agent types for the AI Detective system"""
    CLAIM_PARSER = "claim_parser"
    EVIDENCE_COLLECTOR = "evidence_collector" 
    REPORT_GENERATOR = "report_generator"
    ORCHESTRATOR = "orchestrator"


class VerificationStatus(Enum):
    """Claim verification status states"""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    VERIFIED = "verified"
    DISPUTED = "disputed"
    INSUFFICIENT_EVIDENCE = "insufficient_evidence"
    ERROR = "error"


@dataclass
class AuditEvent:
    """Audit event for tracking system actions"""
    event_id: str
    timestamp: datetime
    agent_type: DetectiveAgentType
    event_type: str
    claim_id: Optional[str] = None
    user_id: Optional[str] = None
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert audit event to dictionary"""
        result = asdict(self)
        result['timestamp'] = self.timestamp.isoformat()
        result['agent_type'] = self.agent_type.value
        return result


@dataclass
class ClaimData:
    """Data structure for claims being processed"""
    claim_id: str
    content: str
    source_url: Optional[str] = None
    submitter_id: Optional[str] = None
    timestamp: Optional[datetime] = None
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class AgentResult:
    """Result from an agent operation"""
    agent_type: DetectiveAgentType
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    confidence: Optional[float] = None
    execution_time_ms: Optional[int] = None


class PortiaConfig:
    """Configuration management for Portia SDK"""
    
    def __init__(self, config_file: Optional[str] = None):
        self.config_file = config_file or ".env"
        self._load_config()
        
    def _load_config(self):
        """Load configuration from environment variables"""
        # LLM Provider Configuration
        self.llm_provider = os.getenv("AI_DETECTIVE_LLM_PROVIDER", "openai").lower()
        self.default_model = os.getenv("AI_DETECTIVE_DEFAULT_MODEL")
        
        # API Keys
        self.openai_api_key = os.getenv("OPENAI_API_KEY")
        self.anthropic_api_key = os.getenv("ANTHROPIC_API_KEY") 
        self.google_api_key = os.getenv("GOOGLE_API_KEY")
        self.mistral_api_key = os.getenv("MISTRAL_API_KEY")
        self.portia_api_key = os.getenv("PORTIA_API_KEY")
        
        # Azure OpenAI Configuration
        self.azure_openai_api_key = os.getenv("AZURE_OPENAI_API_KEY")
        self.azure_openai_endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
        
        # AWS Bedrock Configuration
        self.aws_access_key_id = os.getenv("AWS_ACCESS_KEY_ID")
        self.aws_secret_access_key = os.getenv("AWS_SECRET_ACCESS_KEY")
        self.aws_default_region = os.getenv("AWS_DEFAULT_REGION", "us-east-1")
        
        # System Configuration
        self.max_concurrent_agents = int(os.getenv("AI_DETECTIVE_MAX_CONCURRENT", "5"))
        self.timeout_seconds = int(os.getenv("AI_DETECTIVE_TIMEOUT", "300"))
        self.log_level = os.getenv("AI_DETECTIVE_LOG_LEVEL", "INFO")
        
        # Database Configuration
        self.database_url = os.getenv("DATABASE_URL")
        self.redis_url = os.getenv("REDIS_URL")
        
    def get_portia_config(self) -> Optional['Config']:
        """Create Portia Config object based on current settings"""
        if not PORTIA_AVAILABLE:
            logger.warning("Portia SDK not available")
            return None
            
        try:
            # Map provider strings to LLMProvider enum
            provider_map = {
                "openai": LLMProvider.OPENAI,
                "anthropic": LLMProvider.ANTHROPIC,
                "google": LLMProvider.GOOGLE,
                "mistral": LLMProvider.MISTRAL,
                "azure": LLMProvider.AZURE,
                "bedrock": LLMProvider.BEDROCK
            }
            
            provider = provider_map.get(self.llm_provider, LLMProvider.OPENAI)
            
            # Default models by provider
            default_models = {
                LLMProvider.OPENAI: "gpt-4-1106-preview",
                LLMProvider.ANTHROPIC: "claude-3-sonnet-20240229", 
                LLMProvider.GOOGLE: "gemini-pro",
                LLMProvider.MISTRAL: "mistral-large-latest",
                LLMProvider.AZURE: "gpt-4-1106-preview",
                LLMProvider.BEDROCK: "anthropic.claude-3-sonnet-20240229-v1:0"
            }
            
            model = self.default_model or default_models.get(provider)
            
            config_kwargs = {
                "llm_provider": provider,
                "default_model": model
            }
            
            # Add provider-specific API keys
            if provider == LLMProvider.OPENAI and self.openai_api_key:
                config_kwargs["openai_api_key"] = self.openai_api_key
            elif provider == LLMProvider.ANTHROPIC and self.anthropic_api_key:
                config_kwargs["anthropic_api_key"] = self.anthropic_api_key
            elif provider == LLMProvider.GOOGLE and self.google_api_key:
                config_kwargs["google_api_key"] = self.google_api_key
            elif provider == LLMProvider.MISTRAL and self.mistral_api_key:
                config_kwargs["mistral_api_key"] = self.mistral_api_key
            elif provider == LLMProvider.AZURE:
                if self.azure_openai_api_key:
                    config_kwargs["azure_openai_api_key"] = self.azure_openai_api_key
                if self.azure_openai_endpoint:
                    config_kwargs["azure_openai_endpoint"] = self.azure_openai_endpoint
            
            return Config.from_default(**config_kwargs)
            
        except Exception as e:
            logger.error(f"Failed to create Portia config: {e}")
            return None
            
    def validate(self) -> List[str]:
        """Validate configuration and return list of errors"""
        errors = []
        
        # Check for required LLM API key based on provider
        if self.llm_provider == "openai" and not self.openai_api_key:
            errors.append("OPENAI_API_KEY is required for OpenAI provider")
        elif self.llm_provider == "anthropic" and not self.anthropic_api_key:
            errors.append("ANTHROPIC_API_KEY is required for Anthropic provider")
        elif self.llm_provider == "google" and not self.google_api_key:
            errors.append("GOOGLE_API_KEY is required for Google provider")
        elif self.llm_provider == "mistral" and not self.mistral_api_key:
            errors.append("MISTRAL_API_KEY is required for Mistral provider")
        elif self.llm_provider == "azure":
            if not self.azure_openai_api_key:
                errors.append("AZURE_OPENAI_API_KEY is required for Azure provider")
            if not self.azure_openai_endpoint:
                errors.append("AZURE_OPENAI_ENDPOINT is required for Azure provider")
        
        return errors


class AuditManager:
    """Manages audit trails and state tracking for AI Detective operations"""
    
    def __init__(self):
        self.events: List[AuditEvent] = []
        self.plan_runs: Dict[str, Any] = {}
        
    def log_event(self, agent_type: DetectiveAgentType, event_type: str, 
                  claim_id: Optional[str] = None, user_id: Optional[str] = None,
                  data: Optional[Dict[str, Any]] = None, error: Optional[str] = None):
        """Log an audit event"""
        event = AuditEvent(
            event_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
            agent_type=agent_type,
            event_type=event_type,
            claim_id=claim_id,
            user_id=user_id,
            data=data,
            error=error
        )
        
        self.events.append(event)
        logger.info(f"Audit event: {event_type} by {agent_type.value}")
        
        return event.event_id
        
    def track_plan_run(self, plan_run_id: str, plan_run_data: Dict[str, Any]):
        """Track a Portia plan run for audit purposes"""
        self.plan_runs[plan_run_id] = {
            **plan_run_data,
            "tracked_at": datetime.now(timezone.utc).isoformat()
        }
        
    def get_claim_audit_trail(self, claim_id: str) -> List[Dict[str, Any]]:
        """Get complete audit trail for a specific claim"""
        return [event.to_dict() for event in self.events if event.claim_id == claim_id]
        
    def export_audit_data(self, start_date: Optional[datetime] = None,
                         end_date: Optional[datetime] = None) -> Dict[str, Any]:
        """Export audit data for compliance/reporting"""
        filtered_events = self.events
        
        if start_date:
            filtered_events = [e for e in filtered_events if e.timestamp >= start_date]
        if end_date:
            filtered_events = [e for e in filtered_events if e.timestamp <= end_date]
            
        return {
            "export_timestamp": datetime.now(timezone.utc).isoformat(),
            "event_count": len(filtered_events),
            "events": [event.to_dict() for event in filtered_events],
            "plan_runs": self.plan_runs
        }


class DetectiveAgentBase:
    """Base class for AI Detective agents using Portia SDK"""
    
    def __init__(self, agent_type: DetectiveAgentType, portia_client: 'PortiaCore',
                 audit_manager: AuditManager):
        self.agent_type = agent_type
        self.portia = portia_client
        self.audit_manager = audit_manager
        self.logger = logging.getLogger(f"detective.{agent_type.value}")
        
    async def process_claim(self, claim: ClaimData, **kwargs) -> AgentResult:
        """Process a claim - to be implemented by subclasses"""
        raise NotImplementedError("Subclasses must implement process_claim method")
        
    def _log_start(self, claim_id: str, operation: str):
        """Log agent operation start"""
        self.audit_manager.log_event(
            agent_type=self.agent_type,
            event_type=f"{operation}_started",
            claim_id=claim_id,
            data={"operation": operation}
        )
        
    def _log_success(self, claim_id: str, operation: str, result_data: Dict[str, Any]):
        """Log successful agent operation"""
        self.audit_manager.log_event(
            agent_type=self.agent_type,
            event_type=f"{operation}_completed",
            claim_id=claim_id,
            data={"operation": operation, "result": result_data}
        )
        
    def _log_error(self, claim_id: str, operation: str, error: str):
        """Log agent operation error"""
        self.audit_manager.log_event(
            agent_type=self.agent_type,
            event_type=f"{operation}_error",
            claim_id=claim_id,
            error=error
        )


class PortiaCore:
    """Core Portia SDK integration for AI Detective system"""
    
    def __init__(self, config: Optional[PortiaConfig] = None):
        self.config = config or PortiaConfig()
        self.audit_manager = AuditManager()
        self.portia_client: Optional['Portia'] = None
        self.agents: Dict[DetectiveAgentType, DetectiveAgentBase] = {}
        self.active_plan_runs: Dict[str, Any] = {}
        
        # Initialize logger
        logging.getLogger().setLevel(getattr(logging, self.config.log_level))
        self.logger = logging.getLogger("portia_core")
        
        # Initialize Portia client
        self._initialize_portia_client()
        
    def _initialize_portia_client(self):
        """Initialize the Portia client with configuration"""
        if not PORTIA_AVAILABLE:
            self.logger.warning("Portia SDK not available - running in mock mode")
            return
            
        try:
            # Validate configuration
            config_errors = self.config.validate()
            if config_errors:
                raise ValueError(f"Configuration errors: {', '.join(config_errors)}")
                
            portia_config = self.config.get_portia_config()
            if portia_config is None:
                raise ValueError("Failed to create Portia configuration")
                
            # Initialize Portia client with custom tools
            self.portia_client = Portia(
                config=portia_config,
                tools=self._get_detective_tools()
            )
            
            self.logger.info(f"Portia client initialized with {self.config.llm_provider} provider")
            
        except Exception as e:
            self.logger.error(f"Failed to initialize Portia client: {e}")
            raise
            
    def _get_detective_tools(self) -> List[Tool]:
        """Get custom tools for AI Detective system"""
        return [
            WebSearchTool(),
            FactCheckTool(),
            SourceCredibilityTool(),
            ContentAnalysisTool()
        ]
        
    def register_agent(self, agent: DetectiveAgentBase):
        """Register an agent with the system"""
        self.agents[agent.agent_type] = agent
        self.logger.info(f"Registered agent: {agent.agent_type.value}")
        
    async def process_claim_workflow(self, claim: ClaimData, 
                                   agents_to_run: Optional[List[DetectiveAgentType]] = None,
                                   user_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Execute the full claim processing workflow using multiple agents
        """
        workflow_id = str(uuid.uuid4())
        start_time = datetime.now(timezone.utc)
        
        # Log workflow start
        self.audit_manager.log_event(
            agent_type=DetectiveAgentType.ORCHESTRATOR,
            event_type="workflow_started",
            claim_id=claim.claim_id,
            user_id=user_id,
            data={
                "workflow_id": workflow_id,
                "agents_requested": [a.value for a in agents_to_run] if agents_to_run else "all"
            }
        )
        
        results = {}
        errors = []
        
        try:
            # Default to all agents if none specified
            if not agents_to_run:
                agents_to_run = [DetectiveAgentType.CLAIM_PARSER, 
                               DetectiveAgentType.EVIDENCE_COLLECTOR,
                               DetectiveAgentType.REPORT_GENERATOR]
            
            # Execute agents in sequence (could be made parallel)
            for agent_type in agents_to_run:
                if agent_type not in self.agents:
                    error_msg = f"Agent {agent_type.value} not registered"
                    errors.append(error_msg)
                    self.logger.warning(error_msg)
                    continue
                    
                try:
                    self.logger.info(f"Processing claim {claim.claim_id} with {agent_type.value}")
                    agent_result = await self.agents[agent_type].process_claim(claim)
                    results[agent_type.value] = asdict(agent_result)
                    
                except Exception as e:
                    error_msg = f"Agent {agent_type.value} failed: {str(e)}"
                    errors.append(error_msg)
                    self.logger.error(error_msg, exc_info=True)
                    
            # Calculate overall workflow result
            execution_time = (datetime.now(timezone.utc) - start_time).total_seconds()
            success = len(errors) == 0
            
            workflow_result = {
                "workflow_id": workflow_id,
                "claim_id": claim.claim_id,
                "success": success,
                "execution_time_seconds": execution_time,
                "agent_results": results,
                "errors": errors,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
            
            # Log workflow completion
            self.audit_manager.log_event(
                agent_type=DetectiveAgentType.ORCHESTRATOR,
                event_type="workflow_completed" if success else "workflow_error",
                claim_id=claim.claim_id,
                user_id=user_id,
                data=workflow_result,
                error="; ".join(errors) if errors else None
            )
            
            return workflow_result
            
        except Exception as e:
            error_msg = f"Workflow failed: {str(e)}"
            self.logger.error(error_msg, exc_info=True)
            
            # Log workflow error
            self.audit_manager.log_event(
                agent_type=DetectiveAgentType.ORCHESTRATOR,
                event_type="workflow_error",
                claim_id=claim.claim_id,
                user_id=user_id,
                error=error_msg
            )
            
            raise
            
    async def run_portia_plan(self, query: str, end_user: Optional[str] = None,
                            structured_output_schema: Optional[Type[BaseModel]] = None,
                            timeout_seconds: Optional[int] = None) -> Dict[str, Any]:
        """
        Execute a Portia plan with full audit tracking
        """
        if not self.portia_client:
            raise RuntimeError("Portia client not initialized")
            
        plan_run_id = str(uuid.uuid4())
        timeout = timeout_seconds or self.config.timeout_seconds
        
        try:
            # Execute plan with Portia
            plan_run_kwargs = {
                "query": query,
                "end_user": end_user or "ai_detective_system"
            }
            
            if structured_output_schema:
                plan_run_kwargs["structured_output_schema"] = structured_output_schema
                
            plan_run = await asyncio.wait_for(
                self.portia_client.arun(**plan_run_kwargs),
                timeout=timeout
            )
            
            # Track the plan run
            plan_run_data = {
                "id": plan_run.id,
                "plan_id": plan_run.plan_id,
                "state": plan_run.state.value if hasattr(plan_run.state, 'value') else str(plan_run.state),
                "query": query,
                "end_user": end_user,
                "final_output": getattr(plan_run, 'final_output', None),
                "current_step_index": getattr(plan_run, 'current_step_index', None)
            }
            
            self.audit_manager.track_plan_run(plan_run_id, plan_run_data)
            self.active_plan_runs[plan_run_id] = plan_run
            
            return {
                "plan_run_id": plan_run_id,
                "success": True,
                "final_output": plan_run_data["final_output"],
                "state": plan_run_data["state"],
                "plan_run_data": plan_run_data
            }
            
        except asyncio.TimeoutError:
            error_msg = f"Plan execution timed out after {timeout} seconds"
            self.logger.error(error_msg)
            raise TimeoutError(error_msg)
            
        except Exception as e:
            error_msg = f"Plan execution failed: {str(e)}"
            self.logger.error(error_msg, exc_info=True)
            
            # Log the error
            self.audit_manager.log_event(
                agent_type=DetectiveAgentType.ORCHESTRATOR,
                event_type="plan_execution_error",
                data={"query": query, "end_user": end_user},
                error=error_msg
            )
            
            raise
            
    def get_plan_run_state(self, plan_run_id: str) -> Optional[Dict[str, Any]]:
        """Get current state of a plan run"""
        return self.audit_manager.plan_runs.get(plan_run_id)
        
    def get_audit_trail(self, claim_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get audit trail, optionally filtered by claim ID"""
        if claim_id:
            return self.audit_manager.get_claim_audit_trail(claim_id)
        return [event.to_dict() for event in self.audit_manager.events]
        
    async def health_check(self) -> Dict[str, Any]:
        """System health check"""
        health_status = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "portia_sdk_available": PORTIA_AVAILABLE,
            "portia_client_initialized": self.portia_client is not None,
            "registered_agents": len(self.agents),
            "active_plan_runs": len(self.active_plan_runs),
            "total_audit_events": len(self.audit_manager.events),
            "configuration_valid": len(self.config.validate()) == 0
        }
        
        # Test LLM connectivity if possible
        if self.portia_client:
            try:
                test_plan = await asyncio.wait_for(
                    self.portia_client.aplan("System health check test"),
                    timeout=10
                )
                health_status["llm_connectivity"] = True
            except Exception as e:
                health_status["llm_connectivity"] = False
                health_status["llm_error"] = str(e)
        else:
            health_status["llm_connectivity"] = False
            
        return health_status


# Custom Tools for AI Detective System
class WebSearchTool(Tool):
    """Custom tool for web search functionality"""
    
    id: str = "web_search_tool"
    name: str = "Web Search Tool"
    description: str = "Search the web for information related to claims"
    
    def run(self, context: ToolRunContext, query: str, max_results: int = 10) -> dict:
        try:
            # Implementation would use actual web search API
            # This is a mock implementation
            return {
                "query": query,
                "results": [
                    {
                        "title": "Example search result",
                        "url": "https://example.com",
                        "snippet": "Mock search result content"
                    }
                ],
                "total_results": 1
            }
        except Exception as e:
            raise ToolSoftError(f"Web search failed: {str(e)}")


class FactCheckTool(Tool):
    """Custom tool for fact-checking against authoritative sources"""
    
    id: str = "fact_check_tool"
    name: str = "Fact Check Tool"
    description: str = "Check claims against authoritative fact-checking sources"
    
    def run(self, context: ToolRunContext, claim: str) -> dict:
        try:
            # Implementation would query fact-checking APIs
            # This is a mock implementation
            return {
                "claim": claim,
                "verification_status": "verified",
                "confidence": 0.85,
                "sources": [
                    {
                        "name": "Authoritative Source",
                        "url": "https://factcheck.example.com",
                        "verdict": "True"
                    }
                ]
            }
        except Exception as e:
            raise ToolSoftError(f"Fact checking failed: {str(e)}")


class SourceCredibilityTool(Tool):
    """Custom tool for assessing source credibility"""
    
    id: str = "source_credibility_tool" 
    name: str = "Source Credibility Tool"
    description: str = "Assess the credibility and bias of information sources"
    
    def run(self, context: ToolRunContext, source_url: str) -> dict:
        try:
            # Implementation would analyze source credibility
            # This is a mock implementation
            return {
                "source_url": source_url,
                "credibility_score": 0.78,
                "bias_rating": "neutral",
                "domain_authority": 85,
                "editorial_standards": "high"
            }
        except Exception as e:
            raise ToolSoftError(f"Source credibility assessment failed: {str(e)}")


class ContentAnalysisTool(Tool):
    """Custom tool for analyzing content quality and manipulation"""
    
    id: str = "content_analysis_tool"
    name: str = "Content Analysis Tool"
    description: str = "Analyze content for quality, bias, and potential manipulation"
    
    def run(self, context: ToolRunContext, content: str, content_type: str = "text") -> dict:
        try:
            # Implementation would perform content analysis
            # This is a mock implementation
            return {
                "content_type": content_type,
                "quality_score": 0.82,
                "bias_indicators": ["neutral_language", "cited_sources"],
                "manipulation_detected": False,
                "readability_score": 65,
                "sentiment": "neutral"
            }
        except Exception as e:
            raise ToolSoftError(f"Content analysis failed: {str(e)}")


# Utility functions
def create_detective_core(config_file: Optional[str] = None) -> PortiaCore:
    """Factory function to create a configured PortiaCore instance"""
    config = PortiaConfig(config_file)
    return PortiaCore(config)


async def quick_claim_verification(claim_text: str, source_url: Optional[str] = None,
                                 config: Optional[PortiaConfig] = None) -> Dict[str, Any]:
    """Quick utility function for basic claim verification"""
    core = create_detective_core()
    
    claim = ClaimData(
        claim_id=str(uuid.uuid4()),
        content=claim_text,
        source_url=source_url,
        timestamp=datetime.now(timezone.utc)
    )
    
    try:
        # Use Portia for basic verification
        verification_query = f"Verify this claim and provide evidence: {claim_text}"
        if source_url:
            verification_query += f" Source: {source_url}"
            
        result = await core.run_portia_plan(verification_query)
        
        return {
            "claim_id": claim.claim_id,
            "verification_result": result,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
    except Exception as e:
        logger.error(f"Quick verification failed: {e}")
        return {
            "claim_id": claim.claim_id,
            "error": str(e),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }


if __name__ == "__main__":
    # Example usage and testing
    import asyncio
    
    async def main():
        """Example usage of the Portia Core system"""
        try:
            # Initialize the system
            core = create_detective_core()
            
            # Run health check
            health = await core.health_check()
            print("Health Check:", json.dumps(health, indent=2))
            
            # Test quick verification
            result = await quick_claim_verification(
                "The Earth is round",
                "https://example.com/earth-shape"
            )
            print("Quick Verification:", json.dumps(result, indent=2))
            
        except Exception as e:
            print(f"Error: {e}")
            
    # Run the example
    if asyncio.get_event_loop().is_running():
        print("Running in existing event loop")
    else:
        asyncio.run(main())