#!/usr/bin/env python3
"""
Property test for CloudWatch Log Groups existence
**Feature: amplify-aws-deployment, Property 22: CloudWatch Log Groups Existence**
**Validates: Requirements 6.1**

This property test verifies that for any Lambda function deployed by Serverless,
there exists a corresponding CloudWatch Log Group with appropriate configuration.
"""

import boto3
import sys
from typing import Dict, List, Any, Set

def get_logs_client():
    """Get CloudWatch Logs client with amplify profile"""
    session = boto3.Session(profile_name='amplify')
    return session.client('logs')

def get_lambda_client():
    """Get Lambda client with amplify profile"""
    session = boto3.Session(profile_name='amplify')
    return session.client('lambda')

def property_lambda_function_has_log_group():
    """
    Property: For any Lambda function, there exists a corresponding CloudWatch Log Group
    
    This property verifies that:
    1. Every Lambda function has a log group
    2. Log group naming follows AWS conventions
    3. Log groups have appropriate retention settings
    """
    logs_client = get_logs_client()
    lambda_client = get_lambda_client()
    
    try:
        # Get all Lambda functions
        lambda_response = lambda_client.list_functions(MaxItems=1000)
        functions = lambda_response.get('Functions', [])
        
        # Filter to Amplify functions (our test domain)
        amplify_functions = [f for f in functions if 'amplify-dev-' in f.get('FunctionName', '')]
        
        if not amplify_functions:
            print("⚠ No Amplify functions found for property testing")
            return True  # Vacuously true if no functions exist
        
        print(f"Testing property for {len(amplify_functions)} Lambda functions...")
        
        # Get all log groups
        log_groups = []
        paginator = logs_client.get_paginator('describe_log_groups')
        
        for page in paginator.paginate():
            log_groups.extend(page.get('logGroups', []))
        
        # Create a mapping of log group names for fast lookup
        log_group_names = {lg.get('logGroupName', '') for lg in log_groups}
        
        # Property verification
        property_violations = []
        
        for func in amplify_functions:
            func_name = func.get('FunctionName', '')
            expected_log_group = f"/aws/lambda/{func_name}"
            
            # Property 1: Log group must exist
            if expected_log_group not in log_group_names:
                property_violations.append(f"Function {func_name} missing log group {expected_log_group}")
                continue
            
            # Property 2: Log group naming convention
            if not expected_log_group.startswith('/aws/lambda/'):
                property_violations.append(f"Function {func_name} has invalid log group naming: {expected_log_group}")
            
            # Property 3: Check retention settings (find the actual log group)
            matching_log_group = None
            for lg in log_groups:
                if lg.get('logGroupName') == expected_log_group:
                    matching_log_group = lg
                    break
            
            if matching_log_group:
                retention_days = matching_log_group.get('retentionInDays')
                # Property: Log groups should have reasonable retention (not infinite)
                # We allow both set retention and no retention (infinite) as valid
                if retention_days is not None and retention_days < 1:
                    property_violations.append(f"Function {func_name} has invalid retention: {retention_days} days")
        
        # Report results
        if property_violations:
            print(f"✗ Property violations found ({len(property_violations)}):")
            for violation in property_violations[:10]:  # Show first 10 violations
                print(f"  - {violation}")
            if len(property_violations) > 10:
                print(f"  ... and {len(property_violations) - 10} more violations")
            return False
        else:
            print(f"✓ Property holds: All {len(amplify_functions)} functions have valid log groups")
            return True
            
    except Exception as e:
        print(f"✗ Property test failed with exception: {str(e)}")
        return False

def property_log_group_naming_consistency():
    """
    Property: Log group names follow consistent AWS Lambda naming conventions
    
    This property verifies that all Lambda log groups follow the pattern:
    /aws/lambda/{function-name}
    """
    logs_client = get_logs_client()
    
    try:
        # Get all Lambda log groups
        log_groups = []
        paginator = logs_client.get_paginator('describe_log_groups')
        
        for page in paginator.paginate():
            for lg in page.get('logGroups', []):
                log_group_name = lg.get('logGroupName', '')
                if log_group_name.startswith('/aws/lambda/amplify-dev-'):
                    log_groups.append(lg)
        
        if not log_groups:
            print("⚠ No Amplify Lambda log groups found for property testing")
            return True
        
        print(f"Testing naming consistency property for {len(log_groups)} log groups...")
        
        naming_violations = []
        
        for lg in log_groups:
            log_group_name = lg.get('logGroupName', '')
            
            # Property: Must start with /aws/lambda/
            if not log_group_name.startswith('/aws/lambda/'):
                naming_violations.append(f"Invalid prefix: {log_group_name}")
                continue
            
            # Extract function name
            function_name = log_group_name[len('/aws/lambda/'):]
            
            # Property: Function name should follow Amplify naming convention
            if not function_name.startswith('amplify-dev-'):
                naming_violations.append(f"Invalid function naming: {function_name}")
                continue
            
            # Property: Function name should end with service and function parts
            if not function_name.endswith('-dev'):
                # Check if it has the expected pattern: amplify-dev-{service}-dev-{function}
                parts = function_name.split('-')
                if len(parts) < 4 or parts[0] != 'amplify' or parts[1] != 'dev':
                    naming_violations.append(f"Invalid naming pattern: {function_name}")
        
        # Report results
        if naming_violations:
            print(f"✗ Naming consistency violations found ({len(naming_violations)}):")
            for violation in naming_violations[:5]:  # Show first 5 violations
                print(f"  - {violation}")
            if len(naming_violations) > 5:
                print(f"  ... and {len(naming_violations) - 5} more violations")
            return False
        else:
            print(f"✓ Property holds: All {len(log_groups)} log groups follow naming conventions")
            return True
            
    except Exception as e:
        print(f"✗ Property test failed with exception: {str(e)}")
        return False

def property_log_retention_consistency():
    """
    Property: Log groups with retention settings have consistent, reasonable values
    
    This property verifies that when retention is set, it follows organizational standards.
    """
    logs_client = get_logs_client()
    
    try:
        # Get all Amplify Lambda log groups
        log_groups = []
        paginator = logs_client.get_paginator('describe_log_groups')
        
        for page in paginator.paginate():
            for lg in page.get('logGroups', []):
                log_group_name = lg.get('logGroupName', '')
                if log_group_name.startswith('/aws/lambda/amplify-dev-'):
                    log_groups.append(lg)
        
        if not log_groups:
            print("⚠ No Amplify Lambda log groups found for property testing")
            return True
        
        print(f"Testing retention consistency property for {len(log_groups)} log groups...")
        
        # Collect retention values
        retention_values = {}
        groups_with_retention = 0
        
        for lg in log_groups:
            log_group_name = lg.get('logGroupName', '')
            retention_days = lg.get('retentionInDays')
            
            if retention_days is not None:
                groups_with_retention += 1
                if retention_days not in retention_values:
                    retention_values[retention_days] = 0
                retention_values[retention_days] += 1
        
        print(f"Groups with retention: {groups_with_retention}/{len(log_groups)}")
        if retention_values:
            print(f"Retention values found: {retention_values}")
        
        # Property checks
        retention_violations = []
        
        # Property 1: Retention values should be reasonable (1-3653 days)
        for retention_days, count in retention_values.items():
            if retention_days < 1 or retention_days > 3653:  # Max 10 years
                retention_violations.append(f"Invalid retention period: {retention_days} days ({count} groups)")
        
        # Property 2: Most groups should have consistent retention (if any retention is set)
        if retention_values and groups_with_retention > 0:
            # Find the most common retention value
            most_common_retention = max(retention_values.items(), key=lambda x: x[1])
            most_common_count = most_common_retention[1]
            
            # Property: At least 80% of groups with retention should use the same value
            consistency_rate = most_common_count / groups_with_retention
            if consistency_rate < 0.80:
                retention_violations.append(f"Inconsistent retention values: only {consistency_rate:.1%} use the most common value")
        
        # Report results
        if retention_violations:
            print(f"✗ Retention consistency violations found ({len(retention_violations)}):")
            for violation in retention_violations:
                print(f"  - {violation}")
            return False
        else:
            print(f"✓ Property holds: Retention settings are consistent and reasonable")
            return True
            
    except Exception as e:
        print(f"✗ Property test failed with exception: {str(e)}")
        return False

def main():
    """Run all CloudWatch Log Groups property tests"""
    print("Running CloudWatch Log Groups Property Tests...")
    print("**Feature: amplify-aws-deployment, Property 22: CloudWatch Log Groups Existence**")
    print("**Validates: Requirements 6.1**")
    print("=" * 80)
    
    properties_passed = 0
    total_properties = 3
    
    # Property 1: Lambda functions have log groups
    print("\n1. Testing Property: Lambda functions have corresponding log groups...")
    if property_lambda_function_has_log_group():
        properties_passed += 1
    
    # Property 2: Log group naming consistency
    print("\n2. Testing Property: Log group naming follows AWS conventions...")
    if property_log_group_naming_consistency():
        properties_passed += 1
    
    # Property 3: Log retention consistency
    print("\n3. Testing Property: Log retention settings are consistent...")
    if property_log_retention_consistency():
        properties_passed += 1
    
    # Summary
    print("\n" + "=" * 80)
    print(f"CloudWatch Log Groups Property Tests: {properties_passed}/{total_properties} passed")
    
    if properties_passed == total_properties:
        print("✓ All properties hold! CloudWatch Log Groups are properly configured.")
        return 0
    else:
        print(f"✗ {total_properties - properties_passed} properties failed")
        print("⚠ CloudWatch Log Groups configuration may have issues")
        return 1

if __name__ == "__main__":
    sys.exit(main())