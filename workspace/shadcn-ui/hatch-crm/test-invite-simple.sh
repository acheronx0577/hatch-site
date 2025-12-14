#!/bin/bash

# Simple test script for agent invite flow
# Tests the invite creation endpoint directly

API_URL="http://localhost:4000/api/v1"
ORG_ID="org-hatch"
BROKER_ID="user-broker"
TEST_EMAIL="test-agent-$(date +%s)@example.com"

echo "🧪 Testing Cognito Agent Invite Flow (Simple)"
echo "============================================================"
echo ""

# First, let's test if we can register a new user and get a token
echo "📝 Step 1: Creating temporary admin user to get auth token..."

# Try to use the existing broker or create a test token
# For testing, we'll create a simple payload and manually sign it
# This is just for testing - in production, proper auth is required

echo "⚠️  Note: This test requires valid authentication."
echo "    Please provide a valid access token or login first."
echo ""
echo "To get a token, you can:"
echo "  1. Login via the frontend and copy the token from DevTools"
echo "  2. Use Postman to call POST /api/v1/auth/login"
echo "  3. Or register a new user and use their token"
echo ""

# Let's try to login with different credentials
echo "Trying to login as broker@hatchcrm.test..."

LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "broker@hatchcrm.test",
    "password": "password123"
  }')

echo "Login response: $LOGIN_RESPONSE"
echo ""

# Check if we got a token
if echo "$LOGIN_RESPONSE" | grep -q "accessToken"; then
  echo "✅ Login successful!"
  ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
  echo "Token: ${ACCESS_TOKEN:0:50}..."
  echo ""

  # Now test invite creation
  echo "📧 Step 2: Creating agent invite..."
  INVITE_RESPONSE=$(curl -s -X POST "$API_URL/organizations/$ORG_ID/invites" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -d "{
      \"email\": \"$TEST_EMAIL\"
    }")

  echo "Invite response: $INVITE_RESPONSE"
  echo ""

  if echo "$INVITE_RESPONSE" | grep -q "token"; then
    echo "✅ Invite created successfully!"

    # Extract invite token
    INVITE_TOKEN=$(echo "$INVITE_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

    # Generate Cognito URL
    COGNITO_DOMAIN="${COGNITO_DOMAIN:-https://us-east-1ch1jwrise.auth.us-east-1.amazoncognito.com}"
    CLIENT_ID="${COGNITO_CLIENT_ID:-3offtahrkccej3n55avkl8mkkn}"
    REDIRECT_URI="${COGNITO_REDIRECT_URI:-https://d84l1y8p4kdic.cloudfront.net}"

    STATE=$(echo -n "{\"inviteToken\":\"$INVITE_TOKEN\"}" | base64)
    SIGNUP_URL="${COGNITO_DOMAIN}/signup?client_id=${CLIENT_ID}&response_type=code&scope=openid+email+profile&redirect_uri=${REDIRECT_URI}/auth/cognito/callback&state=${STATE}&login_hint=${TEST_EMAIL}"

    echo ""
    echo "🔗 Cognito Signup URL:"
    echo "$SIGNUP_URL"
    echo ""
    echo "✅ Test completed successfully!"
  else
    echo "❌ Failed to create invite"
    echo "Response: $INVITE_RESPONSE"
  fi
else
  echo "❌ Login failed"
  echo "Response: $LOGIN_RESPONSE"
  echo ""
  echo "Debug info:"
  echo "  - Check if broker user exists in database"
  echo "  - Check if passwordHash is set correctly"
  echo "  - Try logging in via Postman or the frontend first"
fi

echo ""
echo "============================================================"
