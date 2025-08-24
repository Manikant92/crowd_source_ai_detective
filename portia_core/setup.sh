#!/bin/bash

# AI Detective Portia SDK Setup Script
# This script sets up the Portia SDK core integration for the AI Detective application

set -e  # Exit on any error

echo "🔍 AI Detective - Portia SDK Core Setup"
echo "========================================="

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Python 3.8+ is available
check_python() {
    print_status "Checking Python version..."
    
    if command -v python3 &> /dev/null; then
        PYTHON_VERSION=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
        PYTHON_MAJOR=$(echo $PYTHON_VERSION | cut -d. -f1)
        PYTHON_MINOR=$(echo $PYTHON_VERSION | cut -d. -f2)
        
        if [ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -ge 8 ]; then
            print_success "Python $PYTHON_VERSION found"
            PYTHON_CMD="python3"
        else
            print_error "Python 3.8+ required. Found Python $PYTHON_VERSION"
            exit 1
        fi
    else
        print_error "Python 3 not found. Please install Python 3.8 or later."
        exit 1
    fi
}

# Create virtual environment
create_venv() {
    print_status "Creating virtual environment..."
    
    if [ ! -d "venv" ]; then
        $PYTHON_CMD -m venv venv
        print_success "Virtual environment created"
    else
        print_warning "Virtual environment already exists"
    fi
    
    # Activate virtual environment
    source venv/bin/activate
    print_success "Virtual environment activated"
}

# Install dependencies
install_dependencies() {
    print_status "Installing dependencies..."
    
    # Upgrade pip first
    pip install --upgrade pip
    
    # Install base requirements
    pip install -r code/requirements.txt
    
    print_success "Dependencies installed"
}

# Setup configuration
setup_config() {
    print_status "Setting up configuration..."
    
    if [ ! -f ".env" ]; then
        cp code/.env.example .env
        print_success "Configuration file created (.env)"
        print_warning "Please edit .env file with your API keys and configuration"
    else
        print_warning ".env file already exists, skipping..."
    fi
}

# Validate installation
validate_installation() {
    print_status "Validating installation..."
    
    # Test Python imports
    $PYTHON_CMD -c "
import sys
sys.path.insert(0, 'code')

try:
    from portia_core import create_detective_core, PortiaConfig
    print('✓ Core modules import successfully')
    
    # Test configuration
    config = PortiaConfig()
    errors = config.validate()
    if errors:
        print('⚠ Configuration validation errors:')
        for error in errors:
            print(f'  - {error}')
        print('Please update your .env file with proper API keys')
    else:
        print('✓ Configuration validation passed')
        
except ImportError as e:
    print(f'✗ Import error: {e}')
    sys.exit(1)
except Exception as e:
    print(f'✗ Validation error: {e}')
    sys.exit(1)
"
    
    if [ $? -eq 0 ]; then
        print_success "Installation validation completed"
    else
        print_error "Installation validation failed"
        exit 1
    fi
}

# Create example usage script
create_example() {
    print_status "Creating example usage script..."
    
    cat > run_example.py << 'EOF'
#!/usr/bin/env python3
"""
Example usage of the AI Detective Portia Core system
Run this script to test the basic functionality
"""

import asyncio
import sys
import os

# Add the code directory to Python path
sys.path.insert(0, 'code')

from portia_core import create_detective_core, quick_claim_verification, ClaimData
from datetime import datetime, timezone
import json

async def main():
    """Test the AI Detective Portia Core system"""
    print("🔍 AI Detective Portia Core - Example Usage")
    print("=" * 50)
    
    try:
        # Initialize the system
        print("\n1. Initializing Portia Core...")
        core = create_detective_core()
        
        # Run health check
        print("\n2. Running health check...")
        health = await core.health_check()
        print("Health Status:")
        for key, value in health.items():
            status = "✓" if value in [True, "True"] else "✗" if value in [False, "False"] else "ℹ"
            print(f"  {status} {key}: {value}")
        
        # Test quick verification (if LLM is configured)
        if health.get('llm_connectivity'):
            print("\n3. Testing quick claim verification...")
            result = await quick_claim_verification(
                "The Earth orbits around the Sun",
                "https://example.com/astronomy"
            )
            print("Verification Result:")
            print(json.dumps(result, indent=2))
        else:
            print("\n3. Skipping LLM test - no LLM connectivity")
            print("   Please configure your LLM API keys in .env file")
        
        # Test audit trail
        print("\n4. Testing audit trail...")
        audit_events = core.get_audit_trail()
        print(f"Total audit events: {len(audit_events)}")
        
        if audit_events:
            print("Latest events:")
            for event in audit_events[-3:]:  # Show last 3 events
                print(f"  - {event['timestamp']}: {event['event_type']} by {event['agent_type']}")
        
        print("\n✅ Example completed successfully!")
        print("\nNext steps:")
        print("1. Configure your API keys in the .env file")
        print("2. Implement your custom agents using the DetectiveAgentBase class")
        print("3. Register agents with core.register_agent()")
        print("4. Use core.process_claim_workflow() for full claim verification")
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        print("\nTroubleshooting:")
        print("1. Make sure you've activated the virtual environment: source venv/bin/activate")
        print("2. Check that all dependencies are installed: pip install -r code/requirements.txt")
        print("3. Verify your .env configuration")
        return 1
    
    return 0

if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
EOF
    
    chmod +x run_example.py
    print_success "Example script created (run_example.py)"
}

# Main installation process
main() {
    echo
    print_status "Starting AI Detective Portia SDK setup..."
    echo
    
    check_python
    create_venv
    install_dependencies
    setup_config
    validate_installation
    create_example
    
    echo
    print_success "🎉 Setup completed successfully!"
    echo
    echo -e "${BLUE}Next steps:${NC}"
    echo "1. Activate the virtual environment: ${YELLOW}source venv/bin/activate${NC}"
    echo "2. Edit the .env file with your API keys and configuration"
    echo "3. Test the installation: ${YELLOW}python run_example.py${NC}"
    echo "4. Import portia_core in your application: ${YELLOW}from code.portia_core import create_detective_core${NC}"
    echo
    echo -e "${BLUE}Documentation:${NC}"
    echo "- Core module: code/portia_core.py"
    echo "- Configuration: code/.env.example"
    echo "- Dependencies: code/requirements.txt"
    echo
}

# Run main function
main "$@"
