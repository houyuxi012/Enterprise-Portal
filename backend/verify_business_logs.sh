#!/bin/bash

BASE_URL="http://localhost:8000/api"

echo "1. Login as admin..."
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

echo "2. Query Business Logs..."
curl -s -X GET "$BASE_URL/logs/business?limit=50&source=db" \
  -b cookies.txt \
  -H "Content-Type: application/json" > business_response.json

# Check if response contains IAM actions (English or Chinese)
if grep -q "LOGIN" business_response.json || \
   grep -q "CREATE_USER" business_response.json || \
   grep -q '"action":"用户登录"' business_response.json || \
   grep -q '"action":"创建用户"' business_response.json; then
  echo "FAILED: Business logs still contain IAM actions."
  echo "Found actions:"
  grep -o '"action":"[^"]*"' business_response.json | sort | uniq
  exit 1
else
  echo "SUCCESS: IAM actions (LOGIN/CREATE_USER) filtered out."
fi

echo "Sample Business Logs:"
head -c 500 business_response.json
echo "..."

rm cookies.txt login_response.json business_response.json
