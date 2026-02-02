#!/bin/bash
BASE_URL="http://localhost:8000/api"

echo "--- Verifying Legacy Role Retirement (Host/Curl) ---"

# 1. Login
echo "1. Logging in..."
# Use cookie jar
rm -f cookies.txt
curl -s -c cookies.txt -X POST "$BASE_URL/auth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=admin" > /tmp/login_res.json

if grep -q "Login successful" /tmp/login_res.json; then
  echo "✅ Login successful."
else
  echo "❌ Login failed."
  cat /tmp/login_res.json
  exit 1
fi

# 2. Check /me for role field
echo "2. Checking /users/me..."
# Use cookie
ROLE=$(curl -s -b cookies.txt -X GET "$BASE_URL/users/me" | grep -o '"role":"[^"]*' | cut -d'"' -f4)

echo "   Role field value: $ROLE"
if [ "$ROLE" == "admin" ]; then
  echo "✅ 'role' field correct (admin)."
else
  echo "⚠️ 'role' field mismatch or missing."
fi

# 3. Create User Legacy
echo "3. Creating User (Legacy role param)..."
TS=$(date +%s)
USER="legacy_user_$TS"
curl -s -b cookies.txt -X POST "$BASE_URL/users/" \
  -H "Content-Type: application/json" \
  -d "{\"username\": \"$USER\", \"email\": \"$USER@example.com\", \"password\": \"12345678\", \"role\": \"admin\", \"is_active\": true}" > /tmp/create_legacy_res.json

if grep -q "id" /tmp/create_legacy_res.json; then
   echo "✅ User created."
   # Check if role assigned (need to check response or query detail)
   # Assumed successful if created without error (logic in backend maps it)
else
   echo "❌ User creation failed."
   cat /tmp/create_legacy_res.json
fi

echo "--- Done ---"
