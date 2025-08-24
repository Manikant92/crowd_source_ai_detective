"""
Portia Human-in-the-Loop Clarification System for AI Detective Application

This module implements a comprehensive clarification system that integrates with the 
Portia SDK and AI Detective core to provide robust human oversight capabilities.

Key Features:
- All 5 Portia clarification types (Input, Multiple Choice, Value Confirmation, Action, Custom)
- Decision threshold logic for triggering human intervention
- Conflicting evidence scenario detection and clarification
- Confidence scoring and low-confidence detection
- Seamless multi-agent workflow integration
- Comprehensive state tracking and audit trails
- Formatted clarification prompt utilities

Integration:
- Builds on portia_core.py foundation
- Integrates with existing AuditManager
- Compatible with DetectiveAgentBase structure
- Leverages existing configuration and logging
"""

import asyncio
import logging
import json
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Union, Callable, Tuple
from dataclasses import dataclass, asdict
from enum import Enum
import statistics
from abc import ABC, abstractmethod

# Import from portia_core foundation
from portia_core import (
    PortiaCore, AuditManager, DetectiveAgentType, VerificationStatus,
    AgentResult, ClaimData, AuditEvent, PortiaConfig
)

try:
    from portia import Portia, Config
    from portia.tool import Tool, ToolRunContext
    from portia.errors import ToolHardError, ToolSoftError, PlanError
    from pydantic import BaseModel, Field
    PORTIA_AVAILABLE = True
except ImportError as e:
    logging.warning(f"Portia SDK not available: {e}")
    PORTIA_AVAILABLE = False
    # Mock classes for development
    class BaseModel:
        pass


# Configure logging
logger = logging.getLogger(__name__)


class ClarificationType(Enum):
    """Types of clarifications supported by Portia"""
    INPUT = "input"
    MULTIPLE_CHOICE = "multiple_choice" 
    VALUE_CONFIRMATION = "value_confirmation"
    ACTION = "action"
    CUSTOM = "custom"


class ClarificationPriority(Enum):
    """Priority levels for clarifications"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ClarificationStatus(Enum):
    """Status states for clarification requests"""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class ConflictType(Enum):
    """Types of evidence conflicts that trigger clarification"""
    CONTRADICTORY_SOURCES = "contradictory_sources"
    CONFLICTING_FACTS = "conflicting_facts"
    CREDIBILITY_DISPUTE = "credibility_dispute"
    TEMPORAL_INCONSISTENCY = "temporal_inconsistency"
    METHODOLOGY_CONFLICT = "methodology_conflict"


@dataclass
class ConfidenceMetrics:
    """Confidence scoring metrics for evidence and decisions"""
    overall_confidence: float
    source_reliability: float
    fact_verification: float
    temporal_consistency: float
    cross_reference_score: float
    methodology_score: float
    
    def to_dict(self) -> Dict[str, float]:
        """Convert to dictionary"""
        return asdict(self)
    
    def is_low_confidence(self, threshold: float = 0.7) -> bool:
        """Check if overall confidence is below threshold"""
        return self.overall_confidence < threshold
    
    def get_lowest_scoring_metric(self) -> Tuple[str, float]:
        """Get the metric with the lowest score"""
        metrics = self.to_dict()
        return min(metrics.items(), key=lambda x: x[1])


@dataclass
class EvidenceConflict:
    """Represents a conflict between pieces of evidence"""
    conflict_id: str
    conflict_type: ConflictType
    conflicting_sources: List[Dict[str, Any]]
    conflict_description: str
    severity: float  # 0.0 to 1.0
    detected_at: datetime
    resolution_required: bool = True
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        result = asdict(self)
        result['conflict_type'] = self.conflict_type.value
        result['detected_at'] = self.detected_at.isoformat()
        return result


@dataclass
class ClarificationRequest:
    """A request for human clarification"""
    request_id: str
    clarification_type: ClarificationType
    priority: ClarificationPriority
    status: ClarificationStatus
    claim_id: str
    agent_type: DetectiveAgentType
    title: str
    description: str
    context: Dict[str, Any]
    options: Optional[List[Dict[str, Any]]] = None
    default_value: Optional[Any] = None
    timeout_seconds: Optional[int] = None
    created_at: datetime = None
    updated_at: datetime = None
    response: Optional[Dict[str, Any]] = None
    response_user_id: Optional[str] = None
    
    def __post_init__(self):
        """Initialize timestamps"""
        if self.created_at is None:
            self.created_at = datetime.now(timezone.utc)
        if self.updated_at is None:
            self.updated_at = self.created_at
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        result = asdict(self)
        result['clarification_type'] = self.clarification_type.value
        result['priority'] = self.priority.value
        result['status'] = self.status.value
        result['agent_type'] = self.agent_type.value
        result['created_at'] = self.created_at.isoformat()
        result['updated_at'] = self.updated_at.isoformat()
        return result


@dataclass
class ClarificationResponse:
    """Response to a clarification request"""
    request_id: str
    response_data: Dict[str, Any]
    user_id: str
    response_time_seconds: float
    confidence: Optional[float] = None
    notes: Optional[str] = None
    timestamp: datetime = None
    
    def __post_init__(self):
        """Initialize timestamp"""
        if self.timestamp is None:
            self.timestamp = datetime.now(timezone.utc)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        result = asdict(self)
        result['timestamp'] = self.timestamp.isoformat()
        return result


class ClarificationDecisionEngine:
    """Decision engine for determining when human clarification is needed"""
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or self._get_default_config()
        self.logger = logging.getLogger("clarification.decision_engine")
    
    def _get_default_config(self) -> Dict[str, Any]:
        """Get default decision thresholds and parameters"""
        return {
            "confidence_thresholds": {
                "low": 0.5,
                "medium": 0.7,
                "high": 0.85
            },
            "conflict_severity_threshold": 0.6,
            "evidence_count_threshold": 3,
            "source_reliability_threshold": 0.6,
            "auto_escalation_enabled": True,
            "timeout_defaults": {
                "low": 3600,    # 1 hour
                "medium": 1800,  # 30 minutes
                "high": 900,     # 15 minutes
                "critical": 300  # 5 minutes
            }
        }
    
    def should_request_clarification(self, confidence: ConfidenceMetrics,
                                   conflicts: List[EvidenceConflict],
                                   agent_result: AgentResult) -> Tuple[bool, ClarificationPriority, str]:
        """
        Determine if clarification is needed based on confidence and conflicts
        
        Returns:
            Tuple of (should_clarify, priority, reason)
        """
        reasons = []
        max_priority = ClarificationPriority.LOW
        
        # Check confidence levels
        if confidence.overall_confidence < self.config["confidence_thresholds"]["low"]:
            reasons.append("Very low overall confidence")
            max_priority = ClarificationPriority.HIGH
        elif confidence.overall_confidence < self.config["confidence_thresholds"]["medium"]:
            reasons.append("Low overall confidence")
            max_priority = max(max_priority, ClarificationPriority.MEDIUM, key=lambda x: x.value)
        
        # Check for low-scoring individual metrics
        lowest_metric, lowest_score = confidence.get_lowest_scoring_metric()
        if lowest_score < self.config["confidence_thresholds"]["low"]:
            reasons.append(f"Low {lowest_metric} score: {lowest_score:.2f}")
            max_priority = max(max_priority, ClarificationPriority.MEDIUM, key=lambda x: x.value)
        
        # Check conflicts
        high_severity_conflicts = [c for c in conflicts if c.severity > self.config["conflict_severity_threshold"]]
        if high_severity_conflicts:
            reasons.append(f"High severity conflicts detected: {len(high_severity_conflicts)}")
            max_priority = ClarificationPriority.HIGH
        elif conflicts:
            reasons.append(f"Evidence conflicts detected: {len(conflicts)}")
            max_priority = max(max_priority, ClarificationPriority.MEDIUM, key=lambda x: x.value)
        
        # Check agent-specific errors
        if not agent_result.success and agent_result.error:
            reasons.append(f"Agent execution failed: {agent_result.error}")
            max_priority = max(max_priority, ClarificationPriority.MEDIUM, key=lambda x: x.value)
        
        should_clarify = len(reasons) > 0
        reason = "; ".join(reasons) if reasons else "No clarification needed"
        
        return should_clarify, max_priority, reason
    
    def get_timeout_for_priority(self, priority: ClarificationPriority) -> int:
        """Get timeout in seconds for given priority"""
        return self.config["timeout_defaults"][priority.value]


class ClarificationPromptFormatter:
    """Utility class for formatting clarification prompts"""
    
    @staticmethod
    def format_input_prompt(title: str, description: str, context: Dict[str, Any],
                          default_value: Optional[str] = None) -> Dict[str, Any]:
        """Format an input clarification prompt"""
        prompt = {
            "type": "input",
            "title": title,
            "description": description,
            "context_summary": ClarificationPromptFormatter._format_context(context),
        }
        
        if default_value:
            prompt["default_value"] = default_value
            prompt["description"] += f"\n\nDefault value: {default_value}"
        
        return prompt
    
    @staticmethod
    def format_multiple_choice_prompt(title: str, description: str,
                                    options: List[Dict[str, Any]], 
                                    context: Dict[str, Any],
                                    allow_multiple: bool = False) -> Dict[str, Any]:
        """Format a multiple choice clarification prompt"""
        prompt = {
            "type": "multiple_choice",
            "title": title,
            "description": description,
            "options": options,
            "allow_multiple": allow_multiple,
            "context_summary": ClarificationPromptFormatter._format_context(context)
        }
        
        return prompt
    
    @staticmethod
    def format_value_confirmation_prompt(title: str, value: Any, 
                                       confidence: float, context: Dict[str, Any]) -> Dict[str, Any]:
        """Format a value confirmation prompt"""
        prompt = {
            "type": "value_confirmation",
            "title": title,
            "value_to_confirm": value,
            "confidence": confidence,
            "description": f"Please confirm if this value is correct (confidence: {confidence:.2f})",
            "context_summary": ClarificationPromptFormatter._format_context(context)
        }
        
        return prompt
    
    @staticmethod
    def format_action_prompt(title: str, action: str, consequences: List[str],
                           context: Dict[str, Any]) -> Dict[str, Any]:
        """Format an action confirmation prompt"""
        prompt = {
            "type": "action",
            "title": title,
            "action": action,
            "consequences": consequences,
            "description": f"Should the system proceed with: {action}?",
            "consequence_summary": "\n".join([f"• {c}" for c in consequences]),
            "context_summary": ClarificationPromptFormatter._format_context(context)
        }
        
        return prompt
    
    @staticmethod
    def format_custom_prompt(title: str, description: str, custom_data: Dict[str, Any],
                           context: Dict[str, Any]) -> Dict[str, Any]:
        """Format a custom clarification prompt"""
        prompt = {
            "type": "custom",
            "title": title,
            "description": description,
            "custom_data": custom_data,
            "context_summary": ClarificationPromptFormatter._format_context(context)
        }
        
        return prompt
    
    @staticmethod
    def _format_context(context: Dict[str, Any]) -> str:
        """Format context information for display"""
        if not context:
            return "No additional context available."
        
        formatted_parts = []
        
        if "claim_id" in context:
            formatted_parts.append(f"Claim ID: {context['claim_id']}")
        
        if "agent_type" in context:
            formatted_parts.append(f"Agent: {context['agent_type']}")
        
        if "confidence_metrics" in context:
            metrics = context["confidence_metrics"]
            if isinstance(metrics, dict):
                overall = metrics.get("overall_confidence", 0)
                formatted_parts.append(f"Overall Confidence: {overall:.2f}")
        
        if "conflicts" in context and context["conflicts"]:
            conflict_count = len(context["conflicts"])
            formatted_parts.append(f"Evidence Conflicts: {conflict_count}")
        
        if "sources" in context:
            source_count = len(context["sources"])
            formatted_parts.append(f"Sources Analyzed: {source_count}")
        
        return " | ".join(formatted_parts) if formatted_parts else "Context available in details."


class ConflictDetector:
    """Detects conflicts in evidence and analysis results"""
    
    def __init__(self):
        self.logger = logging.getLogger("clarification.conflict_detector")
    
    def detect_conflicts(self, evidence_list: List[Dict[str, Any]],
                        agent_results: Dict[str, AgentResult]) -> List[EvidenceConflict]:
        """Detect conflicts in evidence and agent results"""
        conflicts = []
        
        # Detect contradictory sources
        conflicts.extend(self._detect_source_contradictions(evidence_list))
        
        # Detect conflicting facts
        conflicts.extend(self._detect_fact_conflicts(evidence_list))
        
        # Detect credibility disputes
        conflicts.extend(self._detect_credibility_conflicts(evidence_list))
        
        # Detect temporal inconsistencies
        conflicts.extend(self._detect_temporal_conflicts(evidence_list))
        
        # Detect methodology conflicts
        conflicts.extend(self._detect_methodology_conflicts(agent_results))
        
        return conflicts
    
    def _detect_source_contradictions(self, evidence_list: List[Dict[str, Any]]) -> List[EvidenceConflict]:
        """Detect contradictory information from different sources"""
        conflicts = []
        
        # Group evidence by claim/topic
        claim_groups = {}
        for evidence in evidence_list:
            claim = evidence.get("claim", "unknown")
            if claim not in claim_groups:
                claim_groups[claim] = []
            claim_groups[claim].append(evidence)
        
        # Check for contradictions within each claim group
        for claim, group in claim_groups.items():
            if len(group) < 2:
                continue
                
            # Look for opposing verdicts
            verdicts = [e.get("verdict", "unknown").lower() for e in group if "verdict" in e]
            unique_verdicts = set(verdicts)
            
            if len(unique_verdicts) > 1 and any(v in ["true", "false", "verified", "disputed"] for v in unique_verdicts):
                conflicting_sources = [
                    {
                        "source": e.get("source", "unknown"),
                        "verdict": e.get("verdict", "unknown"),
                        "confidence": e.get("confidence", 0)
                    }
                    for e in group
                ]
                
                conflict = EvidenceConflict(
                    conflict_id=str(uuid.uuid4()),
                    conflict_type=ConflictType.CONTRADICTORY_SOURCES,
                    conflicting_sources=conflicting_sources,
                    conflict_description=f"Sources provide contradictory verdicts for claim: {claim}",
                    severity=self._calculate_contradiction_severity(conflicting_sources),
                    detected_at=datetime.now(timezone.utc)
                )
                conflicts.append(conflict)
        
        return conflicts
    
    def _detect_fact_conflicts(self, evidence_list: List[Dict[str, Any]]) -> List[EvidenceConflict]:
        """Detect conflicts in factual claims"""
        conflicts = []
        
        # Look for numerical discrepancies
        numerical_claims = {}
        for evidence in evidence_list:
            if "facts" in evidence and isinstance(evidence["facts"], dict):
                for fact_key, fact_value in evidence["facts"].items():
                    if isinstance(fact_value, (int, float)):
                        if fact_key not in numerical_claims:
                            numerical_claims[fact_key] = []
                        numerical_claims[fact_key].append({
                            "value": fact_value,
                            "source": evidence.get("source", "unknown"),
                            "evidence": evidence
                        })
        
        # Check for significant discrepancies
        for fact_key, values in numerical_claims.items():
            if len(values) < 2:
                continue
                
            nums = [v["value"] for v in values]
            mean_val = statistics.mean(nums)
            std_dev = statistics.stdev(nums) if len(nums) > 1 else 0
            
            # Flag if standard deviation is more than 20% of mean
            if std_dev > (mean_val * 0.2):
                conflict = EvidenceConflict(
                    conflict_id=str(uuid.uuid4()),
                    conflict_type=ConflictType.CONFLICTING_FACTS,
                    conflicting_sources=values,
                    conflict_description=f"Significant discrepancy in numerical fact '{fact_key}': {nums}",
                    severity=min(std_dev / mean_val, 1.0) if mean_val != 0 else 1.0,
                    detected_at=datetime.now(timezone.utc)
                )
                conflicts.append(conflict)
        
        return conflicts
    
    def _detect_credibility_conflicts(self, evidence_list: List[Dict[str, Any]]) -> List[EvidenceConflict]:
        """Detect conflicts in source credibility assessments"""
        conflicts = []
        
        # Group by source URL/domain
        source_credibility = {}
        for evidence in evidence_list:
            source = evidence.get("source_url", evidence.get("source", "unknown"))
            if source and "credibility_score" in evidence:
                if source not in source_credibility:
                    source_credibility[source] = []
                source_credibility[source].append(evidence)
        
        # Check for credibility score discrepancies
        for source, assessments in source_credibility.items():
            if len(assessments) < 2:
                continue
                
            scores = [a.get("credibility_score", 0) for a in assessments]
            score_range = max(scores) - min(scores)
            
            # Flag if credibility scores vary by more than 0.3
            if score_range > 0.3:
                conflict = EvidenceConflict(
                    conflict_id=str(uuid.uuid4()),
                    conflict_type=ConflictType.CREDIBILITY_DISPUTE,
                    conflicting_sources=assessments,
                    conflict_description=f"Credibility scores for '{source}' vary significantly: {scores}",
                    severity=min(score_range, 1.0),
                    detected_at=datetime.now(timezone.utc)
                )
                conflicts.append(conflict)
        
        return conflicts
    
    def _detect_temporal_conflicts(self, evidence_list: List[Dict[str, Any]]) -> List[EvidenceConflict]:
        """Detect temporal inconsistencies in evidence"""
        conflicts = []
        
        # Look for timeline inconsistencies
        temporal_claims = []
        for evidence in evidence_list:
            if "timeline" in evidence or "date" in evidence:
                temporal_claims.append(evidence)
        
        # Simple check for contradictory dates
        if len(temporal_claims) >= 2:
            dates = []
            for claim in temporal_claims:
                if "date" in claim:
                    dates.append(claim["date"])
            
            # This is a simplified check - in practice would need more sophisticated temporal reasoning
            if len(set(dates)) != len(dates):  # Duplicate dates for potentially conflicting events
                conflict = EvidenceConflict(
                    conflict_id=str(uuid.uuid4()),
                    conflict_type=ConflictType.TEMPORAL_INCONSISTENCY,
                    conflicting_sources=temporal_claims,
                    conflict_description="Temporal inconsistencies detected in evidence timeline",
                    severity=0.6,
                    detected_at=datetime.now(timezone.utc)
                )
                conflicts.append(conflict)
        
        return conflicts
    
    def _detect_methodology_conflicts(self, agent_results: Dict[str, AgentResult]) -> List[EvidenceConflict]:
        """Detect conflicts in analysis methodologies"""
        conflicts = []
        
        # Check for conflicting agent conclusions
        verdicts = {}
        for agent_type, result in agent_results.items():
            if result.success and result.data:
                verdict = result.data.get("verdict", result.data.get("conclusion"))
                if verdict:
                    verdicts[agent_type] = {
                        "verdict": verdict,
                        "confidence": result.confidence or 0.5,
                        "result": result
                    }
        
        # Check for conflicting verdicts between agents
        verdict_values = [v["verdict"] for v in verdicts.values()]
        unique_verdicts = set([str(v).lower() for v in verdict_values])
        
        if len(unique_verdicts) > 1:
            # Check if contradictory (true/false, verified/disputed, etc.)
            contradictory_pairs = [
                ("true", "false"), ("verified", "disputed"), 
                ("confirmed", "denied"), ("valid", "invalid")
            ]
            
            is_contradictory = any(
                pair[0] in unique_verdicts and pair[1] in unique_verdicts
                for pair in contradictory_pairs
            )
            
            if is_contradictory:
                conflict = EvidenceConflict(
                    conflict_id=str(uuid.uuid4()),
                    conflict_type=ConflictType.METHODOLOGY_CONFLICT,
                    conflicting_sources=list(verdicts.values()),
                    conflict_description="Different analysis methods reached contradictory conclusions",
                    severity=0.8,
                    detected_at=datetime.now(timezone.utc)
                )
                conflicts.append(conflict)
        
        return conflicts
    
    def _calculate_contradiction_severity(self, conflicting_sources: List[Dict[str, Any]]) -> float:
        """Calculate severity of contradiction based on source confidence"""
        if not conflicting_sources:
            return 0.0
        
        confidences = [s.get("confidence", 0.5) for s in conflicting_sources]
        avg_confidence = statistics.mean(confidences)
        
        # Higher average confidence in contradictory sources = higher severity
        return min(avg_confidence * 1.2, 1.0)


class ClarificationStateTracker:
    """Tracks state and provides audit trails for clarification requests"""
    
    def __init__(self, audit_manager: AuditManager):
        self.audit_manager = audit_manager
        self.active_requests: Dict[str, ClarificationRequest] = {}
        self.completed_requests: Dict[str, ClarificationRequest] = {}
        self.request_responses: Dict[str, ClarificationResponse] = {}
        self.logger = logging.getLogger("clarification.state_tracker")
    
    def track_request(self, request: ClarificationRequest):
        """Add a clarification request to tracking"""
        self.active_requests[request.request_id] = request
        
        # Log to audit trail
        self.audit_manager.log_event(
            agent_type=request.agent_type,
            event_type="clarification_requested",
            claim_id=request.claim_id,
            data={
                "request_id": request.request_id,
                "clarification_type": request.clarification_type.value,
                "priority": request.priority.value,
                "title": request.title
            }
        )
        
        self.logger.info(f"Tracking clarification request {request.request_id} for claim {request.claim_id}")
    
    def update_request_status(self, request_id: str, new_status: ClarificationStatus,
                            user_id: Optional[str] = None):
        """Update the status of a clarification request"""
        if request_id in self.active_requests:
            request = self.active_requests[request_id]
            old_status = request.status
            request.status = new_status
            request.updated_at = datetime.now(timezone.utc)
            
            # Log status change
            self.audit_manager.log_event(
                agent_type=request.agent_type,
                event_type="clarification_status_changed",
                claim_id=request.claim_id,
                user_id=user_id,
                data={
                    "request_id": request_id,
                    "old_status": old_status.value,
                    "new_status": new_status.value
                }
            )
            
            # Move to completed if finished
            if new_status in [ClarificationStatus.COMPLETED, ClarificationStatus.CANCELLED, ClarificationStatus.EXPIRED]:
                self.completed_requests[request_id] = self.active_requests.pop(request_id)
    
    def record_response(self, response: ClarificationResponse):
        """Record a response to a clarification request"""
        self.request_responses[response.request_id] = response
        
        # Update request with response
        if response.request_id in self.active_requests:
            request = self.active_requests[response.request_id]
            request.response = response.response_data
            request.response_user_id = response.user_id
            self.update_request_status(response.request_id, ClarificationStatus.COMPLETED, response.user_id)
        
        # Log response
        self.audit_manager.log_event(
            agent_type=DetectiveAgentType.ORCHESTRATOR,  # System event
            event_type="clarification_responded",
            user_id=response.user_id,
            data={
                "request_id": response.request_id,
                "response_time_seconds": response.response_time_seconds,
                "confidence": response.confidence
            }
        )
        
        self.logger.info(f"Recorded response for clarification {response.request_id} from user {response.user_id}")
    
    def get_request_status(self, request_id: str) -> Optional[ClarificationRequest]:
        """Get current status of a clarification request"""
        if request_id in self.active_requests:
            return self.active_requests[request_id]
        elif request_id in self.completed_requests:
            return self.completed_requests[request_id]
        return None
    
    def get_claim_clarifications(self, claim_id: str) -> List[ClarificationRequest]:
        """Get all clarifications for a specific claim"""
        claim_clarifications = []
        
        # Check active requests
        for request in self.active_requests.values():
            if request.claim_id == claim_id:
                claim_clarifications.append(request)
        
        # Check completed requests
        for request in self.completed_requests.values():
            if request.claim_id == claim_id:
                claim_clarifications.append(request)
        
        # Sort by creation time
        return sorted(claim_clarifications, key=lambda x: x.created_at)
    
    def get_pending_requests(self, user_id: Optional[str] = None) -> List[ClarificationRequest]:
        """Get all pending clarification requests"""
        pending = [r for r in self.active_requests.values() if r.status == ClarificationStatus.PENDING]
        
        # Sort by priority and creation time
        return sorted(pending, key=lambda x: (x.priority.value, x.created_at))
    
    def cleanup_expired_requests(self, timeout_seconds: int = 3600):
        """Clean up expired clarification requests"""
        current_time = datetime.now(timezone.utc)
        expired_requests = []
        
        for request_id, request in self.active_requests.items():
            if request.timeout_seconds:
                expiry_time = request.created_at.timestamp() + request.timeout_seconds
                if current_time.timestamp() > expiry_time:
                    expired_requests.append(request_id)
        
        # Mark expired requests
        for request_id in expired_requests:
            self.update_request_status(request_id, ClarificationStatus.EXPIRED)
            self.logger.warning(f"Clarification request {request_id} expired")
    
    def export_clarification_audit(self, claim_id: Optional[str] = None) -> Dict[str, Any]:
        """Export clarification audit data"""
        if claim_id:
            requests = self.get_claim_clarifications(claim_id)
        else:
            requests = list(self.active_requests.values()) + list(self.completed_requests.values())
        
        # Get associated responses
        responses = []
        for request in requests:
            if request.request_id in self.request_responses:
                responses.append(self.request_responses[request.request_id].to_dict())
        
        return {
            "export_timestamp": datetime.now(timezone.utc).isoformat(),
            "claim_id": claim_id,
            "request_count": len(requests),
            "requests": [r.to_dict() for r in requests],
            "responses": responses,
            "active_count": len([r for r in requests if r.status == ClarificationStatus.PENDING]),
            "completed_count": len([r for r in requests if r.status == ClarificationStatus.COMPLETED])
        }


class HumanInTheLoopClarificationSystem:
    """
    Main Human-in-the-Loop Clarification System
    
    Integrates all components to provide comprehensive clarification capabilities
    """
    
    def __init__(self, portia_core: PortiaCore, config: Optional[Dict[str, Any]] = None):
        self.portia_core = portia_core
        self.config = config or {}
        
        # Initialize components
        self.decision_engine = ClarificationDecisionEngine(self.config.get("decision_engine"))
        self.prompt_formatter = ClarificationPromptFormatter()
        self.conflict_detector = ConflictDetector()
        self.state_tracker = ClarificationStateTracker(portia_core.audit_manager)
        
        # Callbacks for external integration
        self.clarification_callbacks: List[Callable] = []
        
        self.logger = logging.getLogger("clarification.main_system")
        
        # Start cleanup task
        self._start_cleanup_task()
    
    def register_clarification_callback(self, callback: Callable):
        """Register a callback function for when clarification is requested"""
        self.clarification_callbacks.append(callback)
    
    async def evaluate_and_request_clarification(self, claim: ClaimData,
                                               agent_results: Dict[str, AgentResult],
                                               evidence_list: List[Dict[str, Any]],
                                               confidence: ConfidenceMetrics,
                                               user_id: Optional[str] = None) -> Optional[ClarificationRequest]:
        """
        Main method to evaluate if clarification is needed and request it
        """
        try:
            # Detect conflicts in evidence
            conflicts = self.conflict_detector.detect_conflicts(evidence_list, agent_results)
            
            # Decide if clarification is needed
            should_clarify, priority, reason = self.decision_engine.should_request_clarification(
                confidence, conflicts, list(agent_results.values())[0] if agent_results else AgentResult(DetectiveAgentType.ORCHESTRATOR, True)
            )
            
            if not should_clarify:
                self.logger.debug(f"No clarification needed for claim {claim.claim_id}: {reason}")
                return None
            
            # Determine clarification type based on the situation
            clarification_type = self._determine_clarification_type(confidence, conflicts, agent_results)
            
            # Create clarification request
            request = await self._create_clarification_request(
                claim, clarification_type, priority, confidence, conflicts, agent_results, reason
            )
            
            # Track the request
            self.state_tracker.track_request(request)
            
            # Notify callbacks
            await self._notify_clarification_callbacks(request)
            
            self.logger.info(f"Clarification requested for claim {claim.claim_id}: {request.title}")
            return request
            
        except Exception as e:
            self.logger.error(f"Error in clarification evaluation: {e}", exc_info=True)
            raise
    
    async def process_clarification_response(self, request_id: str, response_data: Dict[str, Any],
                                           user_id: str) -> ClarificationResponse:
        """Process a response to a clarification request"""
        request = self.state_tracker.get_request_status(request_id)
        if not request:
            raise ValueError(f"Clarification request {request_id} not found")
        
        if request.status != ClarificationStatus.PENDING:
            raise ValueError(f"Clarification request {request_id} is not pending (status: {request.status.value})")
        
        # Calculate response time
        response_time = (datetime.now(timezone.utc) - request.created_at).total_seconds()
        
        # Create response
        response = ClarificationResponse(
            request_id=request_id,
            response_data=response_data,
            user_id=user_id,
            response_time_seconds=response_time,
            confidence=response_data.get("confidence"),
            notes=response_data.get("notes")
        )
        
        # Record response
        self.state_tracker.record_response(response)
        
        self.logger.info(f"Processed clarification response for {request_id} from user {user_id}")
        return response
    
    def get_pending_clarifications(self, user_id: Optional[str] = None) -> List[ClarificationRequest]:
        """Get all pending clarifications, optionally filtered by user"""
        return self.state_tracker.get_pending_requests(user_id)
    
    def get_claim_clarifications(self, claim_id: str) -> List[ClarificationRequest]:
        """Get all clarifications for a specific claim"""
        return self.state_tracker.get_claim_clarifications(claim_id)
    
    def calculate_confidence_metrics(self, evidence_list: List[Dict[str, Any]],
                                   agent_results: Dict[str, AgentResult]) -> ConfidenceMetrics:
        """Calculate confidence metrics from evidence and agent results"""
        # Source reliability
        source_scores = [e.get("credibility_score", 0.5) for e in evidence_list if "credibility_score" in e]
        source_reliability = statistics.mean(source_scores) if source_scores else 0.5
        
        # Fact verification
        verified_facts = [e for e in evidence_list if e.get("verified", False)]
        fact_verification = len(verified_facts) / len(evidence_list) if evidence_list else 0.5
        
        # Agent confidence
        agent_confidences = [r.confidence for r in agent_results.values() if r.confidence is not None]
        agent_confidence = statistics.mean(agent_confidences) if agent_confidences else 0.5
        
        # Temporal consistency (simplified)
        temporal_consistency = 0.8  # Would be more sophisticated in practice
        
        # Cross-reference score
        cross_reference_score = min(len(evidence_list) / 5.0, 1.0)  # More sources = higher score
        
        # Methodology score (based on agent success)
        successful_agents = sum(1 for r in agent_results.values() if r.success)
        methodology_score = successful_agents / len(agent_results) if agent_results else 0.5
        
        # Overall confidence (weighted average)
        overall_confidence = (
            source_reliability * 0.25 +
            fact_verification * 0.25 +
            agent_confidence * 0.25 +
            temporal_consistency * 0.1 +
            cross_reference_score * 0.1 +
            methodology_score * 0.05
        )
        
        return ConfidenceMetrics(
            overall_confidence=overall_confidence,
            source_reliability=source_reliability,
            fact_verification=fact_verification,
            temporal_consistency=temporal_consistency,
            cross_reference_score=cross_reference_score,
            methodology_score=methodology_score
        )
    
    def _determine_clarification_type(self, confidence: ConfidenceMetrics,
                                    conflicts: List[EvidenceConflict],
                                    agent_results: Dict[str, AgentResult]) -> ClarificationType:
        """Determine the appropriate clarification type"""
        # If there are conflicts, use multiple choice to resolve
        if conflicts:
            return ClarificationType.MULTIPLE_CHOICE
        
        # If confidence is very low, ask for input/guidance
        if confidence.overall_confidence < 0.4:
            return ClarificationType.INPUT
        
        # If confidence is moderate, confirm findings
        if confidence.overall_confidence < 0.8:
            return ClarificationType.VALUE_CONFIRMATION
        
        # Default to custom for complex situations
        return ClarificationType.CUSTOM
    
    async def _create_clarification_request(self, claim: ClaimData, clarification_type: ClarificationType,
                                          priority: ClarificationPriority, confidence: ConfidenceMetrics,
                                          conflicts: List[EvidenceConflict],
                                          agent_results: Dict[str, AgentResult],
                                          reason: str) -> ClarificationRequest:
        """Create a clarification request based on the situation"""
        context = {
            "claim_id": claim.claim_id,
            "confidence_metrics": confidence.to_dict(),
            "conflicts": [c.to_dict() for c in conflicts],
            "agent_results": {k: v.data for k, v in agent_results.items() if v.data},
            "reason": reason
        }
        
        # Generate content based on type
        if clarification_type == ClarificationType.MULTIPLE_CHOICE:
            title = "Resolve Evidence Conflicts"
            description = f"Multiple sources provide conflicting information about: {claim.content[:100]}..."
            options = self._generate_conflict_resolution_options(conflicts, agent_results)
            
        elif clarification_type == ClarificationType.VALUE_CONFIRMATION:
            title = "Confirm Analysis Results"
            description = f"Please confirm the analysis results for: {claim.content[:100]}..."
            options = None
            
        elif clarification_type == ClarificationType.INPUT:
            title = "Provide Additional Guidance"
            description = f"The system needs additional guidance for: {claim.content[:100]}..."
            options = None
            
        else:  # CUSTOM
            title = "Complex Situation Review"
            description = f"A complex situation requires human review: {claim.content[:100]}..."
            options = None
        
        request = ClarificationRequest(
            request_id=str(uuid.uuid4()),
            clarification_type=clarification_type,
            priority=priority,
            status=ClarificationStatus.PENDING,
            claim_id=claim.claim_id,
            agent_type=DetectiveAgentType.ORCHESTRATOR,
            title=title,
            description=description,
            context=context,
            options=options,
            timeout_seconds=self.decision_engine.get_timeout_for_priority(priority)
        )
        
        return request
    
    def _generate_conflict_resolution_options(self, conflicts: List[EvidenceConflict],
                                            agent_results: Dict[str, AgentResult]) -> List[Dict[str, Any]]:
        """Generate options for resolving conflicts"""
        options = []
        
        # Add options based on conflicting sources
        for conflict in conflicts:
            if conflict.conflict_type == ConflictType.CONTRADICTORY_SOURCES:
                for i, source in enumerate(conflict.conflicting_sources):
                    options.append({
                        "id": f"source_{conflict.conflict_id}_{i}",
                        "label": f"Trust {source.get('source', 'Unknown Source')}",
                        "description": f"Verdict: {source.get('verdict', 'Unknown')} (Confidence: {source.get('confidence', 0):.2f})",
                        "data": source
                    })
        
        # Add option to request more evidence
        options.append({
            "id": "request_more_evidence",
            "label": "Request Additional Evidence",
            "description": "Ask for more sources before making a decision",
            "data": {"action": "request_more_evidence"}
        })
        
        # Add option for manual review
        options.append({
            "id": "manual_review",
            "label": "Escalate for Manual Review",
            "description": "Flag this claim for detailed manual investigation",
            "data": {"action": "escalate"}
        })
        
        return options
    
    async def _notify_clarification_callbacks(self, request: ClarificationRequest):
        """Notify registered callbacks about new clarification request"""
        for callback in self.clarification_callbacks:
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(request)
                else:
                    callback(request)
            except Exception as e:
                self.logger.error(f"Error in clarification callback: {e}", exc_info=True)
    
    def _start_cleanup_task(self):
        """Start background task for cleaning up expired requests"""
        async def cleanup_task():
            while True:
                try:
                    self.state_tracker.cleanup_expired_requests()
                    await asyncio.sleep(300)  # Run every 5 minutes
                except Exception as e:
                    self.logger.error(f"Error in cleanup task: {e}", exc_info=True)
                    await asyncio.sleep(60)  # Wait before retrying
        
        # Start the task (in practice would use proper task management)
        asyncio.create_task(cleanup_task())


# Factory function for easy initialization
def create_clarification_system(portia_core: PortiaCore,
                               config: Optional[Dict[str, Any]] = None) -> HumanInTheLoopClarificationSystem:
    """Factory function to create a configured clarification system"""
    return HumanInTheLoopClarificationSystem(portia_core, config)


# Example usage and integration
if __name__ == "__main__":
    # Example of how to integrate with the AI Detective system
    import asyncio
    from portia_core import create_detective_core, ClaimData
    
    async def example_clarification_workflow():
        """Example workflow showing clarification system integration"""
        try:
            # Initialize core system
            core = create_detective_core()
            
            # Initialize clarification system
            clarification_system = create_clarification_system(core)
            
            # Example claim
            claim = ClaimData(
                claim_id=str(uuid.uuid4()),
                content="The COVID-19 vaccine contains microchips for tracking",
                source_url="https://example.com/claim",
                timestamp=datetime.now(timezone.utc)
            )
            
            # Simulate agent results with low confidence
            agent_results = {
                "claim_parser": AgentResult(
                    agent_type=DetectiveAgentType.CLAIM_PARSER,
                    success=True,
                    data={"verdict": "false", "confidence": 0.4},
                    confidence=0.4
                ),
                "evidence_collector": AgentResult(
                    agent_type=DetectiveAgentType.EVIDENCE_COLLECTOR,
                    success=True,
                    data={"sources_found": 3, "credible_sources": 1},
                    confidence=0.3
                )
            }
            
            # Simulate evidence with conflicts
            evidence_list = [
                {
                    "source": "Medical Journal",
                    "verdict": "false",
                    "confidence": 0.9,
                    "credibility_score": 0.95
                },
                {
                    "source": "Social Media Post",
                    "verdict": "true",
                    "confidence": 0.8,
                    "credibility_score": 0.2
                }
            ]
            
            # Calculate confidence metrics
            confidence = clarification_system.calculate_confidence_metrics(evidence_list, agent_results)
            
            print(f"Confidence Metrics: {confidence.to_dict()}")
            
            # Evaluate and potentially request clarification
            request = await clarification_system.evaluate_and_request_clarification(
                claim, agent_results, evidence_list, confidence
            )
            
            if request:
                print(f"Clarification requested: {request.title}")
                print(f"Type: {request.clarification_type.value}")
                print(f"Priority: {request.priority.value}")
                print(f"Options: {len(request.options) if request.options else 0}")
                
                # Simulate response
                response_data = {
                    "selected_option": "source_" + str(uuid.uuid4()) + "_0",
                    "confidence": 0.8,
                    "notes": "Medical journal is more credible"
                }
                
                response = await clarification_system.process_clarification_response(
                    request.request_id, response_data, "human_reviewer_123"
                )
                
                print(f"Response processed: {response.response_time_seconds:.2f} seconds")
            else:
                print("No clarification needed")
                
        except Exception as e:
            print(f"Error: {e}")
    
    # Run example
    asyncio.run(example_clarification_workflow())
