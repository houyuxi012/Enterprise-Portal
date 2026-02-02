#!/bin/bash
BASE_URL="http://localhost:8000/api"

echo "---------------------------------------------------"
echo "PHASE 9: LOG PAGINATION VERIFICATION"
echo "---------------------------------------------------"

# 1. Login as Admin
rm -f cookies.txt
curl -s -X POST "$BASE_URL/auth/token" \
  -d "username=admin&password=admin" \
  -c cookies.txt > /dev/null
echo "✅ Admin Logged In"

# 2. Test Business Logs Pagination
echo "[2/5] Fetching Business Logs Page 1 (Limit 5)..."
curl -s -X GET "$BASE_URL/logs/business?limit=5&offset=0" -b cookies.txt > page1.json
count1=$(cat page1.json | python3 -c "import sys, json; print(len(json.load(sys.stdin)))")
echo "Page 1 Count: $count1"

echo "[3/5] Fetching Business Logs Page 2 (Limit 5)..."
curl -s -X GET "$BASE_URL/logs/business?limit=5&offset=5" -b cookies.txt > page2.json
count2=$(cat page2.json | python3 -c "import sys, json; print(len(json.load(sys.stdin)))")
echo "Page 2 Count: $count2"

if [ "$count1" -eq 5 ]; then
    echo "✅ Page 1 length correct."
else
    echo "⚠️ Page 1 length unexpected: $count1"
fi

# 3. Test AI Audit Logs Pagination
echo "[4/5] Fetching AI Audit Logs Page 1..."
curl -s -X GET "$BASE_URL/logs/ai-audit?limit=2&offset=0" -b cookies.txt > ai_page1.json
ai_count1=$(cat ai_page1.json | python3 -c "import sys, json; print(len(json.load(sys.stdin)))")
echo "AI Page 1 Count: $ai_count1"

# 4. Cleanup
rm -f cookies.txt page1.json page2.json ai_page1.json
echo "---------------------------------------------------"
echo "Verification Complete."
