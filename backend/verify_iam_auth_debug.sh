#!/bin/bash
BASE_URL="http://localhost:8000/api"

echo "1. Login as admin..."
rm -f cookies.txt
curl -s -X POST "$BASE_URL/auth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=admin" \
  -c cookies.txt -b cookies.txt > login.json

if grep -q "Login successful" login.json; then
  echo "Login successful."
else
  echo "Login failed."
  cat login.json
  exit 1
fi

echo -e "\n2. Check Business Logs (Reference)..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$BASE_URL/logs/business?limit=5&source=db" -b cookies.txt)
echo "Business Logs Status: $STATUS"

echo -e "\n3. Check IAM Audit Logs (Target)..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/iam/audit/logs?page=1&page_size=10" -b cookies.txt)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "IAM Audit Logs Status: $HTTP_CODE"
echo "Response Body Start: ${BODY:0:200}..."

if [ "$HTTP_CODE" == "200" ]; then
  echo "SUCCESS: Backend API works. 401 is likely frontend/browser specific."
elif [ "$HTTP_CODE" == "401" ]; then
  echo "FAILURE: Backend rejects request with 401. Token implementation discrepancy?"
elif [ "$HTTP_CODE" == "403" ]; then
  echo "FAILURE: 403 Forbidden. Permission missing."
else
  echo "FAILURE: Unexpected status $HTTP_CODE"
fi

rm -f cookies.txt login.json
