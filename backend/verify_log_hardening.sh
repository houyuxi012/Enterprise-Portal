#!/bin/bash
BASE_URL="http://localhost:8000/api"

echo "---------------------------------------------------"
echo "PHASE 9: LOG HARDENING VERIFICATION"
echo "---------------------------------------------------"

# 1. Login as Admin (Has System/Business/Forwarding Perms)
echo "[1/4] Authenticating as Admin..."
rm -f cookies.txt
curl -s -X POST "$BASE_URL/auth/token" \
  -d "username=admin&password=admin" \
  -c cookies.txt > login.json

if grep -q "Login successful" login.json; then
  echo "✅ Admin Login Successful."
else
  echo "❌ Admin Login Failed."
  exit 1
fi

# 2. Check Business Logs (Should return 200)
echo -e "\n[2/4] Verifying Business Logs (Admin)..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$BASE_URL/logs/business" -b cookies.txt)
if [ "$STATUS" == "200" ]; then
  echo "✅ /logs/business Accessible (200)."
else
  echo "❌ /logs/business Failed ($STATUS)."
fi

# 3. Check System Logs (Should return 200)
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$BASE_URL/logs/system" -b cookies.txt)
if [ "$STATUS" == "200" ]; then
  echo "✅ /logs/system Accessible (200)."
else
  echo "❌ /logs/system Failed ($STATUS)."
fi

# 4. Create User without Permissions (or simulate unauthorized call)
# Since we can't easily create a restricted user via CLI without full flow, 
# we'll use a direct curl without cookies to simulate 401/403 (Token missing/invalid).
# To properly test 403 (Valid Token but missing perm), we would need a restricted user.
# For now, verify 401 is enforced (Guard exist).

echo -e "\n[3/4] Verifying Unauthorized Access (No Token)..."
STATUS_401=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$BASE_URL/logs/business")
if [ "$STATUS_401" == "401" ]; then
  echo "✅ Access Denied as Expected (401) for unauthenticated."
else
  echo "❌ Access Allowed or Wrong Status ($STATUS_401) for unauthenticated."
fi

# 5. Verify Domain Field in DB (Optional, requires DB access or API reflection)
# API returns source=DB/LOKI. If domain filtering works, result should not contain IAM actions.
# We trust previous verification manual check for this granular logic.

echo -e "\n[4/4] Verifying Configuration..."
# Check /logs/config endpoint
STATUS_CFG=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$BASE_URL/logs/config" -b cookies.txt)
if [ "$STATUS_CFG" == "200" ]; then
  echo "✅ /logs/config Accessible (200)."
else
  echo "❌ /logs/config Failed ($STATUS_CFG)."
fi

echo -e "\n---------------------------------------------------"
echo "Verification Complete."
rm -f cookies.txt login.json
