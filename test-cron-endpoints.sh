#!/bin/bash

# Test script for Vercel Cron endpoints
# Make sure your dev server is running: npm run dev
# Set your CRON_SECRET in .env.local

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get CRON_SECRET from .env.local
if [ -f .env.local ]; then
  export $(grep -v '^#' .env.local | grep CRON_SECRET | xargs)
fi

if [ -z "$CRON_SECRET" ]; then
  echo -e "${RED}ERROR: CRON_SECRET not found in .env.local${NC}"
  echo "Please add: CRON_SECRET=your-secret-key-here"
  exit 1
fi

BASE_URL="${BASE_URL:-http://localhost:3000}"

echo -e "${YELLOW}Testing Cron Endpoints...${NC}\n"

# Test 1: Ingest Jobs
echo -e "${YELLOW}1. Testing /api/cron/ingest-jobs${NC}"
echo "   Schedule: Every 6 hours (0 */6 * * *)"
response=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $CRON_SECRET" "$BASE_URL/api/cron/ingest-jobs")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" = "200" ]; then
  echo -e "${GREEN}   ✓ Success (200)${NC}"
  echo "   Response: $body"
else
  echo -e "${RED}   ✗ Failed ($http_code)${NC}"
  echo "   Response: $body"
fi
echo ""

# Test 2: Send Alerts
echo -e "${YELLOW}2. Testing /api/cron/send-alerts${NC}"
echo "   Schedule: Daily at 8:00 AM (0 8 * * *)"
response=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $CRON_SECRET" "$BASE_URL/api/cron/send-alerts")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" = "200" ]; then
  echo -e "${GREEN}   ✓ Success (200)${NC}"
  echo "   Response: $body"
else
  echo -e "${RED}   ✗ Failed ($http_code)${NC}"
  echo "   Response: $body"
fi
echo ""

# Test 3: Expiry Warnings
echo -e "${YELLOW}3. Testing /api/cron/expiry-warnings${NC}"
echo "   Schedule: Daily at 9:00 AM (0 9 * * *)"
response=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $CRON_SECRET" "$BASE_URL/api/cron/expiry-warnings")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" = "200" ]; then
  echo -e "${GREEN}   ✓ Success (200)${NC}"
  echo "   Response: $body"
else
  echo -e "${RED}   ✗ Failed ($http_code)${NC}"
  echo "   Response: $body"
fi
echo ""

# Test 4: Cleanup Expired
echo -e "${YELLOW}4. Testing /api/cron/cleanup-expired${NC}"
echo "   Schedule: Daily at 2:00 AM (0 2 * * *)"
response=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $CRON_SECRET" "$BASE_URL/api/cron/cleanup-expired")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" = "200" ]; then
  echo -e "${GREEN}   ✓ Success (200)${NC}"
  echo "   Response: $body"
else
  echo -e "${RED}   ✗ Failed ($http_code)${NC}"
  echo "   Response: $body"
fi
echo ""

echo -e "${YELLOW}Testing complete!${NC}"

