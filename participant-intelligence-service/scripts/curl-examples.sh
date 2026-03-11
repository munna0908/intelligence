#!/bin/bash

# Sample curl commands for the Participant Intelligence Service
# Usage: Run individual commands or source this file

BASE_URL="${BASE_URL:-http://localhost:3000}"

echo "Participant Intelligence Service - Sample API Calls"
echo "===================================================="
echo ""

# Health check
echo "1. Health Check"
echo "curl -X GET $BASE_URL/health"
echo ""
curl -s -X GET "$BASE_URL/health" | jq .
echo ""

# Get intelligence object
echo "2. Get Intelligence Object"
echo "curl -X GET $BASE_URL/v1/intelligence/participant_001"
echo ""
curl -s -X GET "$BASE_URL/v1/intelligence/participant_001" | jq .
echo ""

# Get category refs
echo "3. Get Category Refs"
echo 'curl -X POST $BASE_URL/v1/categories/get -H "Content-Type: application/json" -d {...}'
echo ""
curl -s -X POST "$BASE_URL/v1/categories/get" \
  -H "Content-Type: application/json" \
  -d '{
    "participantId": "participant_001",
    "categories": ["FOOD", "HEALTH"]
  }' | jq .
echo ""

# Get session
echo "4. Get Session"
echo "curl -X GET $BASE_URL/v1/sessions/participant_001/sess_existing_001"
echo ""
curl -s -X GET "$BASE_URL/v1/sessions/participant_001/sess_existing_001" | jq .
echo ""

# Ensure session (existing valid session)
echo "5. Ensure Session (existing)"
echo 'curl -X POST $BASE_URL/v1/sessions/ensure -H "Content-Type: application/json" -d {...}'
echo ""
curl -s -X POST "$BASE_URL/v1/sessions/ensure" \
  -H "Content-Type: application/json" \
  -d '{
    "participantId": "participant_001",
    "agentId": "openclaw_whatsapp_bot",
    "purpose": "food_ordering",
    "requiredCategories": ["FOOD"],
    "requiredScopes": ["preferences.food.read"],
    "requestedUses": 3,
    "ttlSeconds": 1800
  }' | jq .
echo ""

# Ensure session (new session required)
echo "6. Ensure Session (new - will return pending_signature)"
echo 'curl -X POST $BASE_URL/v1/sessions/ensure -H "Content-Type: application/json" -d {...}'
echo ""
curl -s -X POST "$BASE_URL/v1/sessions/ensure" \
  -H "Content-Type: application/json" \
  -d '{
    "participantId": "participant_002",
    "agentId": "new_agent",
    "purpose": "address_lookup",
    "requiredCategories": ["ADDRESS"],
    "requiredScopes": ["profile.address.read"],
    "requestedUses": 5,
    "ttlSeconds": 1800
  }' | jq .
echo ""

# Validate session
echo "7. Validate Session"
echo 'curl -X POST $BASE_URL/v1/sessions/validate -H "Content-Type: application/json" -d {...}'
echo ""
CURRENT_TIME=$(date +%s)
curl -s -X POST "$BASE_URL/v1/sessions/validate" \
  -H "Content-Type: application/json" \
  -d "{
    \"participantId\": \"participant_001\",
    \"agentId\": \"openclaw_whatsapp_bot\",
    \"sessionId\": \"sess_existing_001\",
    \"requiredCategories\": [\"FOOD\"],
    \"requiredScopes\": [\"preferences.food.read\"],
    \"currentTime\": $CURRENT_TIME
  }" | jq .
echo ""

# Prepare write
echo "8. Prepare Write (update_category_ref)"
echo 'curl -X POST $BASE_URL/v1/writes/prepare -H "Content-Type: application/json" -d {...}'
echo ""
PREPARE_RESPONSE=$(curl -s -X POST "$BASE_URL/v1/writes/prepare" \
  -H "Content-Type: application/json" \
  -d "{
    \"requestId\": \"req_$(date +%s)\",
    \"participantId\": \"participant_001\",
    \"action\": \"update_category_ref\",
    \"params\": {
      \"category\": \"FOOD\",
      \"ref\": \"bafy_new_food_cid_$(date +%s)\",
      \"schemaVersion\": \"1.0\",
      \"updatedAt\": $CURRENT_TIME
    }
  }")
echo "$PREPARE_RESPONSE" | jq .
echo ""

# Submit write (using the prepared response)
echo "9. Submit Write"
echo 'curl -X POST $BASE_URL/v1/writes/submit -H "Content-Type: application/json" -d {...}'
echo ""
PAYLOAD=$(echo "$PREPARE_RESPONSE" | jq -c '.payload')
REQUEST_ID=$(echo "$PREPARE_RESPONSE" | jq -r '.requestId')

curl -s -X POST "$BASE_URL/v1/writes/submit" \
  -H "Content-Type: application/json" \
  -d "{
    \"requestId\": \"$REQUEST_ID\",
    \"participantId\": \"participant_001\",
    \"action\": \"update_category_ref\",
    \"payload\": $PAYLOAD,
    \"signature\": \"0x1234567890abcdef1234567890abcdef\"
  }" | jq .
echo ""

# Get write status
echo "10. Get Write Status"
echo "curl -X GET $BASE_URL/v1/writes/status/0x..."
echo ""
curl -s -X GET "$BASE_URL/v1/writes/status/0xabc123def456" | jq .
echo ""

echo "Done!"
