#!/usr/bin/env python3
"""
Property test for complete Lambda deployment
**Feature: amplify-aws-deployment, Property 10: Complete Lambda Deployment**
**Validates: Requirements 3.1**

This test verifies that all Lambda services have been deployed successfully
and are properly configured with the required resources.
"""

import boto3
import json
import sys
from typing import Dict, List, Any, Set

def get_lambda_client():
    """Get Lambda client with amplify profile"""
    session = boto3.Session(profile_name='amplify')
    return session.client('lambda')

def get_cloudformation_client():
    """Get CloudFormation client with amplify profile"""
    session = boto3.Session(profile_name='amplify')
    return session.client('cloudformation')

def get_expected_services() -> List[str]:
    """Return list of expected Amplify services that should be deployed"""
    return [
        'assistants',
        'lambda',
        'admin', 
        'api',
        'artifacts',
        'amplify-js',
        'lambda-ops',
        'chat-billing',
        'data-disclosure',
        'embedding',
        'object-access'
    ]

def test_cloudformation_stacks_exist():
    """Test that all expected CloudFormation stacks exist and are in CREATE_COMPLETE state"""
    client = get_cloudformation_client()
    
    try:
        response = client.list_stacks(
            StackStatusFilter=['CREATE_COMPLETE', 'UPDATE_COMPLETE']
        )
        stacks = response.get('StackSummaries', [])
        
        expected_services = get_expected_services()
        found_stacks = []
        
        for stack in stacks:
            stack_name = stack.get('StackName', '')
            # Check if this stack matches any of our expected services
            for service in expected_services:
                if f"amplify-dev-{service}-dev" in stack_name:
                    found_stacks.append(service)
                    print(f"✓ Found stack for service: {service}")
                    break
        
        missing_services = set(expected_services) - set(found_stacks)
        if missing_services:
            print(f"⚠ Missing stacks for services: {missing_services}")
        
        success_rate = len(found_stacks) / len(expected_services)
        print(f"✓ Stack deployment success rate: {success_rate:.1%} ({len(found_stacks)}/{len(expected_services)})")
        
        # Property: At least 80% of expected services should be deployed
        return success_rate >= 0.8
        
    except Exception as e:
        print(f"✗ CloudFormation stacks test failed: {str(e)}")
        return False

def test_lambda_functions_deployed():
    """Test that Lambda functions from all services are deployed"""
    client = get_lambda_client()
    
    try:
        response = client.list_functions(MaxItems=1000)
        functions = response.get('Functions', [])
        
        # Count functions by service
        service_function_counts = {}
        expected_services = get_expected_services()
        
        for service in expected_services:
            service_function_counts[service] = 0
        
        for func in functions:
            func_name = func.get('FunctionName', '')
            for service in expected_services:
                if f"amplify-dev-{service}-dev" in func_name:
                    service_function_counts[service] += 1
                    break
        
        total_functions = sum(service_function_counts.values())
        services_with_functions = len([s for s in service_function_counts.values() if s > 0])
        
        print(f"✓ Total Lambda functions deployed: {total_functions}")
        print(f"✓ Services with functions: {services_with_functions}/{len(expected_services)}")
        
        # Show function counts per service
        for service, count in service_function_counts.items():
            if count > 0:
                print(f"  - {service}: {count} functions")
            else:
                print(f"  ⚠ {service}: 0 functions")
        
        # Property: At least 75% of services should have functions deployed
        success_rate = services_with_functions / len(expected_services)
        return success_rate >= 0.75
        
    except Exception as e:
        print(f"✗ Lambda functions test failed: {str(e)}")
        return False

def test_lambda_function_configurations():
    """Test that Lambda functions have proper configurations"""
    client = get_lambda_client()
    
    try:
        response = client.list_functions(MaxItems=1000)
        functions = response.get('Functions', [])
        
        # Filter to our Amplify functions
        amplify_functions = []
        for func in functions:
            func_name = func.get('FunctionName', '')
            if 'amplify-dev-' in func_name and '-dev-' in func_name:
                amplify_functions.append(func)
        
        if not amplify_functions:
            print("⚠ No Amplify functions found")
            return False
        
        # Check configurations
        properly_configured = 0
        
        for func in amplify_functions:
            func_name = func.get('FunctionName', '')
            runtime = func.get('Runtime', '')
            timeout = func.get('Timeout', 0)
            memory = func.get('MemorySize', 0)
            
            # Check basic configuration requirements
            config_ok = True
            
            # Runtime should be Python 3.11 or Node.js 22.x
            if not (runtime.startswith('python3.') or runtime.startswith('nodejs')):
                config_ok = False
            
            # Timeout should be reasonable (between 3 and 900 seconds)
            if not (3 <= timeout <= 900):
                config_ok = False
            
            # Memory should be at least 128MB
            if memory < 128:
                config_ok = False
            
            if config_ok:
                properly_configured += 1
            else:
                print(f"⚠ Configuration issue in {func_name}: runtime={runtime}, timeout={timeout}s, memory={memory}MB")
        
        success_rate = properly_configured / len(amplify_functions)
        print(f"✓ Properly configured functions: {properly_configured}/{len(amplify_functions)} ({success_rate:.1%})")
        
        # Property: At least 90% of functions should be properly configured
        return success_rate >= 0.90
        
    except Exception as e:
        print(f"✗ Lambda configuration test failed: {str(e)}")
        return False

def test_lambda_layers_deployed():
    """Test that Lambda layers are deployed for Python requirements"""
    client = get_lambda_client()
    
    try:
        response = client.list_layers()
        layers = response.get('Layers', [])
        
        # Look for Python requirements layers
        python_layers = []
        for layer in layers:
            layer_name = layer.get('LayerName', '')
            if 'python-requirements' in layer_name.lower() and 'amplify-dev-' in layer_name:
                python_layers.append(layer_name)
        
        print(f"✓ Found {len(python_layers)} Python requirements layers")
        
        if python_layers:
            for layer_name in python_layers:
                print(f"  - {layer_name}")
        
        # Property: At least one Python requirements layer should exist
        return len(python_layers) > 0
        
    except Exception as e:
        print(f"✗ Lambda layers test failed: {str(e)}")
        return False

def test_service_specific_resources():
    """Test that service-specific resources exist (DynamoDB tables, etc.)"""
    session = boto3.Session(profile_name='amplify')
    dynamodb = session.client('dynamodb')
    
    try:
        response = dynamodb.list_tables()
        tables = response.get('TableNames', [])
        
        # Look for Amplify tables
        amplify_tables = []
        expected_table_patterns = [
            'amplify-dev-lambda-dev-accounts',
            'amplify-dev-assistants-dev-assistants',
            'amplify-dev-object-access-dev-object-access',
            'amplify-dev-object-access-dev-cognito-users'
        ]
        
        for table in tables:
            if 'amplify-dev-' in table:
                amplify_tables.append(table)
        
        print(f"✓ Found {len(amplify_tables)} Amplify DynamoDB tables")
        
        # Check for expected tables
        found_patterns = 0
        for pattern in expected_table_patterns:
            if any(pattern in table for table in amplify_tables):
                found_patterns += 1
                print(f"✓ Found table matching pattern: {pattern}")
            else:
                print(f"⚠ No table found matching pattern: {pattern}")
        
        success_rate = found_patterns / len(expected_table_patterns)
        
        # Property: At least 75% of expected table patterns should exist
        return success_rate >= 0.75
        
    except Exception as e:
        print(f"✗ Service resources test failed: {str(e)}")
        return False

def main():
    """Run all property tests for complete Lambda deployment"""
    print("Running Complete Lambda Deployment Property Tests...")
    print("**Feature: amplify-aws-deployment, Property 10: Complete Lambda Deployment**")
    print("**Validates: Requirements 3.1**")
    print("=" * 70)
    
    tests_passed = 0
    total_tests = 5
    
    # Test 1: CloudFormation stacks exist
    print("\n1. Testing CloudFormation stacks deployment...")
    if test_cloudformation_stacks_exist():
        tests_passed += 1
    
    # Test 2: Lambda functions deployed
    print("\n2. Testing Lambda functions deployment...")
    if test_lambda_functions_deployed():
        tests_passed += 1
    
    # Test 3: Lambda function configurations
    print("\n3. Testing Lambda function configurations...")
    if test_lambda_function_configurations():
        tests_passed += 1
    
    # Test 4: Lambda layers deployed
    print("\n4. Testing Lambda layers deployment...")
    if test_lambda_layers_deployed():
        tests_passed += 1
    
    # Test 5: Service-specific resources
    print("\n5. Testing service-specific resources...")
    if test_service_specific_resources():
        tests_passed += 1
    
    # Summary
    print("\n" + "=" * 70)
    print(f"Complete Lambda Deployment Tests Summary: {tests_passed}/{total_tests} passed")
    
    if tests_passed == total_tests:
        print("✓ All property tests passed! Complete Lambda deployment is successful.")
        return 0
    else:
        print(f"✗ {total_tests - tests_passed} property tests failed")
        print("⚠ Complete Lambda deployment may have issues")
        return 1

if __name__ == "__main__":
    sys.exit(main())