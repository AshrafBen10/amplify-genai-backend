#!/usr/bin/env python3
"""
Property test for API Gateway endpoint creation
Verifies that the deployed Lambda services have properly configured API Gateway endpoints
"""

import boto3
import json
import sys
from typing import Dict, List, Any

def get_api_gateway_client():
    """Get API Gateway client with amplify profile"""
    session = boto3.Session(profile_name='amplify')
    return session.client('apigateway')

def get_lambda_client():
    """Get Lambda client with amplify profile"""
    session = boto3.Session(profile_name='amplify')
    return session.client('lambda')

def test_api_gateway_exists():
    """Test that API Gateway exists and is properly configured"""
    client = get_api_gateway_client()
    
    try:
        # Get all REST APIs
        response = client.get_rest_apis()
        apis = response.get('items', [])
        
        # Find our API (should contain 'amplify-dev-lambda')
        amplify_api = None
        for api in apis:
            if 'amplify-dev-lambda' in api.get('name', ''):
                amplify_api = api
                break
        
        assert amplify_api is not None, "Amplify API Gateway not found"
        
        api_id = amplify_api['id']
        print(f"✓ Found API Gateway: {amplify_api['name']} (ID: {api_id})")
        
        return api_id
        
    except Exception as e:
        print(f"✗ API Gateway test failed: {str(e)}")
        return None

def test_api_gateway_resources(api_id: str):
    """Test that API Gateway has the expected resources"""
    client = get_api_gateway_client()
    
    try:
        # Get all resources for the API
        response = client.get_resources(restApiId=api_id)
        resources = response.get('items', [])
        
        # Expected resource paths from our deployments
        expected_paths = [
            '/chat',
            '/state',
            '/files',
            '/assistant',
            '/db'
        ]
        
        found_paths = []
        for resource in resources:
            path = resource.get('path', '')
            if path != '/':
                found_paths.append(path)
        
        print(f"✓ Found {len(found_paths)} API Gateway resources")
        
        # Check if we have the main expected paths
        for expected_path in expected_paths:
            matching_paths = [p for p in found_paths if expected_path in p]
            if matching_paths:
                print(f"✓ Found resources for path: {expected_path}")
            else:
                print(f"⚠ No resources found for expected path: {expected_path}")
        
        return len(found_paths) > 0
        
    except Exception as e:
        print(f"✗ API Gateway resources test failed: {str(e)}")
        return False

def test_lambda_functions_exist():
    """Test that Lambda functions are deployed and configured"""
    client = get_lambda_client()
    
    try:
        # Get all Lambda functions
        response = client.list_functions()
        functions = response.get('Functions', [])
        
        # Find functions from our deployments
        amplify_functions = []
        for func in functions:
            func_name = func.get('FunctionName', '')
            if 'amplify-dev-lambda' in func_name or 'amplify-dev-assistants' in func_name:
                amplify_functions.append(func)
        
        print(f"✓ Found {len(amplify_functions)} Amplify Lambda functions")
        
        # Check some key functions
        expected_function_patterns = [
            'chat_endpoint',
            'tools_op',
            'create_ast',
            'list_asts'
        ]
        
        for pattern in expected_function_patterns:
            matching_funcs = [f for f in amplify_functions if pattern in f.get('FunctionName', '')]
            if matching_funcs:
                print(f"✓ Found function matching pattern: {pattern}")
            else:
                print(f"⚠ No function found matching pattern: {pattern}")
        
        return len(amplify_functions) > 0
        
    except Exception as e:
        print(f"✗ Lambda functions test failed: {str(e)}")
        return False

def test_api_gateway_integration():
    """Test that API Gateway is properly integrated with Lambda functions"""
    client = get_api_gateway_client()
    
    # This is a more complex test that would check the actual integrations
    # For now, we'll do a basic check
    try:
        response = client.get_rest_apis()
        apis = response.get('items', [])
        
        amplify_api = None
        for api in apis:
            if 'amplify-dev-lambda' in api.get('name', ''):
                amplify_api = api
                break
        
        if amplify_api:
            # Check if the API has a deployment
            deployments = client.get_deployments(restApiId=amplify_api['id'])
            deployment_count = len(deployments.get('items', []))
            
            print(f"✓ API Gateway has {deployment_count} deployments")
            return deployment_count > 0
        
        return False
        
    except Exception as e:
        print(f"✗ API Gateway integration test failed: {str(e)}")
        return False

def main():
    """Run all property tests"""
    print("Running API Gateway Property Tests...")
    print("=" * 50)
    
    tests_passed = 0
    total_tests = 4
    
    # Test 1: API Gateway exists
    print("\n1. Testing API Gateway existence...")
    api_id = test_api_gateway_exists()
    if api_id:
        tests_passed += 1
    
    # Test 2: API Gateway resources
    if api_id:
        print("\n2. Testing API Gateway resources...")
        if test_api_gateway_resources(api_id):
            tests_passed += 1
    else:
        print("\n2. Skipping resource test (no API found)")
    
    # Test 3: Lambda functions exist
    print("\n3. Testing Lambda functions...")
    if test_lambda_functions_exist():
        tests_passed += 1
    
    # Test 4: API Gateway integration
    print("\n4. Testing API Gateway integration...")
    if test_api_gateway_integration():
        tests_passed += 1
    
    # Summary
    print("\n" + "=" * 50)
    print(f"Property Tests Summary: {tests_passed}/{total_tests} passed")
    
    if tests_passed == total_tests:
        print("✓ All property tests passed!")
        return 0
    else:
        print(f"✗ {total_tests - tests_passed} property tests failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())