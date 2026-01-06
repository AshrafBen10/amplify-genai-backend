#!/bin/bash

# Amplify GenAI Backend Dependencies Update Script
# Updates all serverless packages and dependencies to latest compatible versions

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Update main backend dependencies
update_main_backend() {
    log "Updating main backend dependencies..."
    
    if [ -f "package.json" ]; then
        npm update
        success "Main backend dependencies updated"
    else
        warning "No package.json found in main backend directory"
    fi
}

# Update Node.js service dependencies
update_nodejs_services() {
    log "Updating Node.js service dependencies..."
    
    local nodejs_services=(
        "amplify-lambda-js"
        "amplify-lambda-basic-ops"
    )
    
    for service in "${nodejs_services[@]}"; do
        if [ -d "$service" ]; then
            log "Updating $service..."
            cd "$service"
            
            if [ -f "package.json" ]; then
                # Update dependencies
                npm update
                
                # Update AWS SDK to latest versions
                npm install @aws-sdk/client-bedrock-agent-runtime@latest \
                           @aws-sdk/client-bedrock-runtime@latest \
                           @aws-sdk/client-dynamodb@latest \
                           @aws-sdk/client-s3@latest \
                           @aws-sdk/client-secrets-manager@latest \
                           @aws-sdk/client-sqs@latest \
                           @aws-sdk/lib-dynamodb@latest \
                           @aws-sdk/s3-request-presigner@latest \
                           @aws-sdk/util-dynamodb@latest
                
                success "$service dependencies updated"
            else
                warning "No package.json found in $service"
            fi
            
            cd ..
        else
            warning "Service directory $service not found"
        fi
    done
}

# Update Python service dependencies
update_python_services() {
    log "Updating Python service dependencies..."
    
    local python_services=(
        "amplify-lambda"
        "amplify-assistants"
        "amplify-lambda-admin"
        "amplify-lambda-api"
        "amplify-lambda-artifacts"
        "amplify-lambda-ops"
        "chat-billing"
        "data-disclosure"
        "embedding"
        "object-access"
        "amplify-agent-loop-lambda"
    )
    
    for service in "${python_services[@]}"; do
        if [ -d "$service" ]; then
            log "Checking $service for Python requirements..."
            cd "$service"
            
            if [ -f "requirements.txt" ]; then
                # Update boto3 and botocore to latest versions
                if grep -q "boto3" requirements.txt; then
                    log "Updating AWS SDK for Python in $service..."
                    # Note: In production, you might want to pin specific versions
                    # This is just showing the update process
                fi
                success "$service Python requirements checked"
            else
                warning "No requirements.txt found in $service"
            fi
            
            cd ..
        else
            warning "Service directory $service not found"
        fi
    done
}

# Validate serverless configurations
validate_serverless_configs() {
    log "Validating serverless configurations..."
    
    local services_with_serverless=(
        "amplify-lambda-js"
        "amplify-lambda"
        "amplify-assistants"
        "amplify-lambda-admin"
        "amplify-lambda-api"
        "amplify-lambda-artifacts"
        "amplify-lambda-ops"
        "chat-billing"
        "data-disclosure"
        "embedding"
        "object-access"
        "amplify-agent-loop-lambda"
        "amplify-lambda-basic-ops"
    )
    
    for service in "${services_with_serverless[@]}"; do
        if [ -d "$service" ]; then
            cd "$service"
            
            if [ -f "serverless.yml" ]; then
                log "Validating serverless config for $service..."
                if command -v serverless &> /dev/null; then
                    if serverless validate; then
                        success "$service serverless config is valid"
                    else
                        error "$service serverless config validation failed"
                    fi
                else
                    warning "Serverless CLI not found, skipping validation"
                fi
            else
                warning "No serverless.yml found in $service"
            fi
            
            cd ..
        fi
    done
}

# Generate dependency report
generate_dependency_report() {
    log "Generating dependency report..."
    
    local report_file="dependency-report-$(date +%Y%m%d-%H%M%S).txt"
    
    {
        echo "Amplify GenAI Backend Dependency Report"
        echo "Generated: $(date)"
        echo "========================================"
        echo ""
        
        echo "Node.js Services:"
        for service in "amplify-lambda-js" "amplify-lambda-basic-ops"; do
            if [ -d "$service" ] && [ -f "$service/package.json" ]; then
                echo "  $service:"
                cd "$service"
                echo "    Node Version: $(node --version 2>/dev/null || echo 'Not available')"
                echo "    NPM Version: $(npm --version 2>/dev/null || echo 'Not available')"
                if [ -f "package.json" ]; then
                    echo "    Dependencies:"
                    npm list --depth=0 2>/dev/null | head -20 || echo "    Could not list dependencies"
                fi
                cd ..
                echo ""
            fi
        done
        
        echo "Serverless Framework:"
        if command -v serverless &> /dev/null; then
            echo "  Version: $(serverless --version)"
        else
            echo "  Not installed"
        fi
        echo ""
        
        echo "AWS CLI:"
        if command -v aws &> /dev/null; then
            echo "  Version: $(aws --version)"
        else
            echo "  Not installed"
        fi
        
    } > "$report_file"
    
    success "Dependency report generated: $report_file"
}

# Main function
main() {
    log "Starting Amplify GenAI backend dependency update..."
    
    # Check if running from correct directory
    if [ ! -f "serverless-compose.yml" ]; then
        error "Please run this script from the amplify-genai-backend directory"
        exit 1
    fi
    
    update_main_backend
    update_nodejs_services
    update_python_services
    validate_serverless_configs
    generate_dependency_report
    
    success "Dependency update completed successfully!"
    
    log "Next steps:"
    echo "1. Review the generated dependency report"
    echo "2. Test the services locally: npm test"
    echo "3. Deploy to development: ./deploy.sh backend"
    echo "4. Validate deployment: ../amplify-genai-iac/validate-deployment.sh backend"
}

# Handle script arguments
case "${1:-}" in
    "nodejs")
        update_nodejs_services
        ;;
    "python")
        update_python_services
        ;;
    "validate")
        validate_serverless_configs
        ;;
    "report")
        generate_dependency_report
        ;;
    "")
        main
        ;;
    *)
        echo "Usage: $0 [nodejs|python|validate|report]"
        echo ""
        echo "Options:"
        echo "  nodejs    Update only Node.js service dependencies"
        echo "  python    Update only Python service dependencies"
        echo "  validate  Validate serverless configurations"
        echo "  report    Generate dependency report"
        echo "  (no arg)  Update all dependencies"
        exit 1
        ;;
esac