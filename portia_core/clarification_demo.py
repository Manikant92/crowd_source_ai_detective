#!/usr/bin/env python3
"""
Example demonstrating the Human-in-the-Loop Clarification System
for the AI Detective application.

This example shows:
1. How to integrate the clarification system with portia_core
2. Automatic conflict detection and clarification triggering
3. Processing human responses to clarification requests
4. Monitoring and audit trail functionality
"""

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone

# Import core components
from portia_core import (
    create_detective_core, ClaimData, DetectiveAgentType, AgentResult
)
from clarification_system import (
    create_clarification_system, ClarificationPriority, ClarificationStatus,
    ConflictType, EvidenceConflict, ConfidenceMetrics
)

# Configure logging for the example
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def clarification_callback(request):
    """Example callback function that would integrate with UI/notification system"""
    print(f"\n🔔 CLARIFICATION REQUESTED")
    print(f"   Request ID: {request.request_id}")
    print(f"   Title: {request.title}")
    print(f"   Type: {request.clarification_type.value}")
    print(f"   Priority: {request.priority.value}")
    print(f"   Description: {request.description}")
    
    if request.options:
        print(f"   Options available: {len(request.options)}")
        for i, option in enumerate(request.options):
            print(f"     {i+1}. {option.get('label', 'Option')} - {option.get('description', '')}")
    
    print(f"   Timeout: {request.timeout_seconds}s")
    print("   🔗 This would trigger UI notification/email to human reviewer")


def create_mock_evidence_with_conflicts():
    """Create mock evidence data with intentional conflicts for demonstration"""
    return [
        {
            "source": "Medical Authority Website",
            "source_url": "https://medical-authority.example.com",
            "verdict": "false",
            "confidence": 0.95,
            "credibility_score": 0.9,
            "facts": {
                "microchip_size": None,  # No microchips found
                "vaccine_ingredients": ["mRNA", "lipids", "salts"]
            },
            "verified": True
        },
        {
            "source": "Conspiracy Blog", 
            "source_url": "https://conspiracy-blog.example.com",
            "verdict": "true",
            "confidence": 0.8,
            "credibility_score": 0.2,
            "facts": {
                "microchip_size": "5nm",  # Claims microchips present
                "vaccine_ingredients": ["mRNA", "microchips", "tracking_devices"]
            },
            "verified": False
        },
        {
            "source": "Independent Fact Checker",
            "source_url": "https://factcheck.example.com", 
            "verdict": "false",
            "confidence": 0.85,
            "credibility_score": 0.85,
            "facts": {
                "microchip_size": None,
                "vaccine_ingredients": ["mRNA", "lipids", "salts", "preservatives"]
            },
            "verified": True
        },
        {
            "source": "Social Media Post",
            "source_url": "https://socialmedia.example.com/post123",
            "verdict": "disputed",
            "confidence": 0.3,
            "credibility_score": 0.1,
            "facts": {
                "microchip_size": "unknown",
                "vaccine_ingredients": ["unknown substances"]
            },
            "verified": False
        }
    ]


def create_mock_agent_results():
    """Create mock agent results with varying confidence levels"""
    return {
        "claim_parser": AgentResult(
            agent_type=DetectiveAgentType.CLAIM_PARSER,
            success=True,
            data={
                "claim_type": "factual_claim",
                "verifiable_elements": ["vaccine_ingredients", "microchip_presence"],
                "verdict": "false",
                "reasoning": "No scientific evidence supports microchip presence in vaccines"
            },
            confidence=0.6  # Moderate confidence due to conflicting sources
        ),
        "evidence_collector": AgentResult(
            agent_type=DetectiveAgentType.EVIDENCE_COLLECTOR,
            success=True,
            data={
                "sources_found": 4,
                "credible_sources": 2,
                "contradictory_sources": 2,
                "verdict": "false",
                "source_reliability_avg": 0.51
            },
            confidence=0.4  # Low confidence due to source conflicts
        ),
        "report_generator": AgentResult(
            agent_type=DetectiveAgentType.REPORT_GENERATOR,
            success=True,
            data={
                "report_type": "conflicted_evidence",
                "final_verdict": "requires_human_review",
                "evidence_conflicts": 2,
                "recommendation": "human_clarification_needed"
            },
            confidence=0.3  # Very low confidence, recommending human review
        )
    }


async def simulate_human_response(clarification, request):
    """Simulate a human responding to a clarification request"""
    print(f"\n🤖 SIMULATING HUMAN RESPONSE for {request.request_id}")
    
    # Simulate human taking time to review
    await asyncio.sleep(2)
    
    if request.clarification_type.value == "multiple_choice" and request.options:
        # Human chooses the most credible source
        medical_authority_option = None
        for option in request.options:
            if "Medical Authority" in option.get("label", ""):
                medical_authority_option = option
                break
        
        if medical_authority_option:
            response_data = {
                "selected_option": medical_authority_option["id"],
                "confidence": 0.9,
                "notes": "Medical authority source is most credible based on scientific evidence"
            }
        else:
            response_data = {
                "selected_option": request.options[0]["id"],
                "confidence": 0.7,
                "notes": "Selected most credible available option"
            }
    else:
        # For other types, provide appropriate response
        response_data = {
            "decision": "proceed_with_verification",
            "confidence": 0.8,
            "notes": "Evidence strongly supports rejecting the claim despite conflicts"
        }
    
    # Process the response
    response = await clarification.process_clarification_response(
        request.request_id,
        response_data,
        "human_reviewer_demo"
    )
    
    print(f"   ✅ Response processed in {response.response_time_seconds:.2f} seconds")
    print(f"   💭 Human notes: {response.notes}")
    return response


async def demonstrate_clarification_system():
    """Main demonstration of the clarification system"""
    print("🚀 AI Detective - Human-in-the-Loop Clarification System Demo")
    print("=" * 65)
    
    # Initialize core system
    print("\n1️⃣  Initializing AI Detective Core...")
    core = create_detective_core()
    
    # Initialize clarification system
    print("2️⃣  Initializing Clarification System...")
    clarification = create_clarification_system(core, {
        "decision_engine": {
            "confidence_thresholds": {
                "low": 0.5,
                "medium": 0.7,
                "high": 0.85
            },
            "conflict_severity_threshold": 0.6
        }
    })
    
    # Register our callback
    clarification.register_clarification_callback(clarification_callback)
    
    # Create example claim with controversy
    print("\n3️⃣  Creating Example Claim...")
    claim = ClaimData(
        claim_id=str(uuid.uuid4()),
        content="COVID-19 vaccines contain microchips for tracking people",
        source_url="https://example.com/controversial-claim",
        submitter_id="user_12345",
        timestamp=datetime.now(timezone.utc)
    )
    print(f"   📝 Claim: {claim.content}")
    
    # Create mock evidence and agent results with conflicts
    print("\n4️⃣  Gathering Evidence & Agent Results...")
    evidence_list = create_mock_evidence_with_conflicts()
    agent_results = create_mock_agent_results()
    
    print(f"   📊 Evidence sources: {len(evidence_list)}")
    print(f"   🤖 Agents executed: {len(agent_results)}")
    
    # Calculate confidence metrics
    print("\n5️⃣  Calculating Confidence Metrics...")
    confidence = clarification.calculate_confidence_metrics(evidence_list, agent_results)
    
    print(f"   📈 Overall Confidence: {confidence.overall_confidence:.2f}")
    print(f"   🔍 Source Reliability: {confidence.source_reliability:.2f}")
    print(f"   ✅ Fact Verification: {confidence.fact_verification:.2f}")
    print(f"   ⏰ Temporal Consistency: {confidence.temporal_consistency:.2f}")
    print(f"   🔗 Cross-Reference Score: {confidence.cross_reference_score:.2f}")
    print(f"   🛠️  Methodology Score: {confidence.methodology_score:.2f}")
    
    # Evaluate and potentially request clarification
    print("\n6️⃣  Evaluating Need for Human Clarification...")
    request = await clarification.evaluate_and_request_clarification(
        claim, agent_results, evidence_list, confidence
    )
    
    if request:
        print(f"   🎯 Clarification System Decision: HUMAN REVIEW REQUIRED")
        print(f"   🏷️  Type: {request.clarification_type.value}")
        print(f"   ⚡ Priority: {request.priority.value}")
        
        # Simulate human response
        print("\n7️⃣  Processing Human Response...")
        await simulate_human_response(clarification, request)
        
        # Show final status
        final_request = clarification.state_tracker.get_request_status(request.request_id)
        print(f"   📊 Final Status: {final_request.status.value}")
        
    else:
        print(f"   ✅ System Decision: NO CLARIFICATION NEEDED")
    
    # Display monitoring information
    print("\n8️⃣  System Monitoring & Analytics...")
    pending = clarification.get_pending_clarifications()
    claim_clarifications = clarification.get_claim_clarifications(claim.claim_id)
    
    print(f"   📋 Pending clarifications: {len(pending)}")
    print(f"   📑 Clarifications for this claim: {len(claim_clarifications)}")
    
    # Export audit data
    audit_data = clarification.state_tracker.export_clarification_audit(claim.claim_id)
    print(f"   📚 Audit events: {audit_data['request_count']} requests, {len(audit_data['responses'])} responses")
    
    # Show system health
    print("\n9️⃣  System Health Check...")
    health = await core.health_check()
    print(f"   💚 System Status: {'Healthy' if health['configuration_valid'] else 'Issues Detected'}")
    print(f"   🔌 Portia SDK: {'Available' if health['portia_sdk_available'] else 'Unavailable'}")
    print(f"   📊 Total Audit Events: {health['total_audit_events']}")
    
    print("\n" + "=" * 65)
    print("🎉 Demo completed successfully!")
    print("💡 In production, clarification callbacks would integrate with:")
    print("   • Web dashboard for human reviewers")
    print("   • Email/Slack notifications")  
    print("   • Queue management systems")
    print("   • Analytics and reporting dashboards")


async def run_advanced_conflict_detection_demo():
    """Demonstrate advanced conflict detection capabilities"""
    print("\n\n🔬 ADVANCED CONFLICT DETECTION DEMO")
    print("=" * 50)
    
    # Initialize systems
    core = create_detective_core()
    clarification = create_clarification_system(core)
    
    # Create evidence with multiple conflict types
    complex_evidence = [
        {
            "source": "Source A",
            "verdict": "true",
            "confidence": 0.9,
            "credibility_score": 0.8,
            "facts": {"death_toll": 1000, "date": "2024-01-15"},
            "timeline": {"event_start": "2024-01-15", "event_end": "2024-01-16"}
        },
        {
            "source": "Source B", 
            "verdict": "false",
            "confidence": 0.85,
            "credibility_score": 0.7,
            "facts": {"death_toll": 1500, "date": "2024-01-15"},  # Conflicting number
            "timeline": {"event_start": "2024-01-14", "event_end": "2024-01-17"}  # Conflicting timeline
        },
        {
            "source": "Source A",  # Same source, different credibility assessment
            "verdict": "true", 
            "confidence": 0.9,
            "credibility_score": 0.3,  # Conflicting credibility score for same source
            "facts": {"death_toll": 950, "date": "2024-01-15"},
        }
    ]
    
    agent_results = {
        "agent1": AgentResult(DetectiveAgentType.CLAIM_PARSER, True, {"verdict": "true"}, confidence=0.8),
        "agent2": AgentResult(DetectiveAgentType.EVIDENCE_COLLECTOR, True, {"verdict": "false"}, confidence=0.7)  # Conflicting verdict
    }
    
    # Detect conflicts
    conflicts = clarification.conflict_detector.detect_conflicts(complex_evidence, agent_results)
    
    print(f"🔍 Detected {len(conflicts)} conflicts:")
    for i, conflict in enumerate(conflicts):
        print(f"   {i+1}. {conflict.conflict_type.value}")
        print(f"      Severity: {conflict.severity:.2f}")
        print(f"      Description: {conflict.conflict_description}")
        print(f"      Sources involved: {len(conflict.conflicting_sources)}")
    
    print("\n✨ This demonstrates the system's ability to automatically detect:")
    print("   • Contradictory source verdicts")
    print("   • Numerical fact discrepancies") 
    print("   • Credibility assessment conflicts")
    print("   • Timeline inconsistencies")
    print("   • Methodology conflicts between agents")


if __name__ == "__main__":
    """Run the clarification system demonstration"""
    print("Starting Human-in-the-Loop Clarification System Demo...\n")
    
    try:
        # Run main demo
        asyncio.run(demonstrate_clarification_system())
        
        # Run advanced conflict detection demo
        asyncio.run(run_advanced_conflict_detection_demo())
        
    except KeyboardInterrupt:
        print("\n\n⏹️  Demo interrupted by user")
    except Exception as e:
        print(f"\n\n❌ Demo failed with error: {e}")
        import traceback
        traceback.print_exc()
