#!/bin/bash
BASE_URL="http://localhost:8000/api"

echo "---------------------------------------------------"
echo "IAM REFACTORING ACCEPTANCE VERIFICATION"
echo "---------------------------------------------------"

# 1. Login (Get Token)
echo "[1/4] Authenticating..."
rm -f cookies.txt
curl -s -X POST "$BASE_URL/auth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=admin" \
  -c cookies.txt -b cookies.txt > login.json

if grep -q "Login successful" login.json; then
  echo "✅ Login Successful."
else
  echo "❌ Login Failed."
  cat login.json
  exit 1
fi

# 2. Check New Paths
echo -e "\n[2/4] Verifying New Paths..."
# /iam/auth/me
ME_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$BASE_URL/iam/auth/me" -b cookies.txt)
if [ "$ME_STATUS" == "200" ]; then
  echo "✅ /iam/auth/me is Accessible (200)."
else
  echo "❌ /iam/auth/me Failed ($ME_STATUS)."
fi

# /iam/auth/me content check for permissions & perm_version
echo -e "\n[3/4] Verifying /iam/auth/me Structure..."
curl -s -X GET "$BASE_URL/iam/auth/me" -b cookies.txt > me.json
if grep -q "\"permissions\":" me.json && grep -q "\"perm_version\":" me.json; then
  echo "✅ Response contains 'permissions' and 'perm_version'."
  PERM_VER=$(cat me.json | grep -o '"perm_version":[0-9]*' | cut -d: -f2)
  echo "   Current Perm Version: $PERM_VER"
else
  echo "❌ Response missing 'permissions' or 'perm_version'."
  cat me.json
fi

# 3. Check Audit Logs (IAM)
echo -e "\n[4/4] Verifying IAM Audit Logs..."
AUDIT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$BASE_URL/iam/audit/logs?limit=5" -b cookies.txt)
if [ "$AUDIT_STATUS" == "200" ]; then
  echo "✅ /iam/audit/logs is Accessible (200)."
  curl -s -X GET "$BASE_URL/iam/audit/logs?limit=1" -b cookies.txt > audit.json
  if grep -q "iam.login.success" audit.json || grep -q "user_id" audit.json; then
      echo "✅ Audit logs contain expected content."
  else
      echo "⚠️ Audit logs empty or missing expected fields (might need to generate traffic)."
  fi
else
  echo "❌ /iam/audit/logs Failed ($AUDIT_STATUS)."
fi

echo -e "\n---------------------------------------------------"
echo "Verification Complete."
rm -f cookies.txt login.json me.json audit.json
