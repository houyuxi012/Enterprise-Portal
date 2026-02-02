#!/bin/bash

BASE_URL="http://localhost:8000/api"

echo "1. Login as admin..."
# Assuming username=admin, password=admin
curl -s -X POST "$BASE_URL/auth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=admin" \
  -c cookies.txt -b cookies.txt > login_response.json

if grep -q "Login successful" login_response.json; then
  echo "Login successful."
else
  echo "Login failed."
  cat login_response.json
  exit 1
fi

echo "2. Query IAM Audit Logs..."
curl -s -X GET "$BASE_URL/iam/audit/logs?page=1&page_size=5" \
  -b cookies.txt \
  -H "Content-Type: application/json" > audit_response.json

# Check if response contains "items" and "total"
if grep -q "items" audit_response.json && grep -q "total" audit_response.json; then
  echo "Audit logs structure verified (items/total present)."
else
  echo "Audit logs verification FAILED."
  cat audit_response.json
  exit 1
fi

# Check for 'result' field in the output (simple string match)
if grep -q "\"result\"\:" audit_response.json; then
  echo "Field 'result' found in response."
else
  echo "WARNING: Field 'result' NOT found (logs might be empty or missing field)."
  cat audit_response.json
fi

echo "Detailed response:"
head -n 20 audit_response.json
echo "..."

echo "Verification COMPLETE."
rm cookies.txt login_response.json audit_response.json
