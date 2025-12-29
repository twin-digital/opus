#!/bin/bash

# Helper script to test the Lambda function running in Docker

ENDPOINT="http://localhost:9000/2015-03-31/functions/function/invocations"

# Sample event payload
EVENT='{
  "rawPath": "/render/html",
  "requestContext": {
    "http": {
      "method": "GET"
    }
  }
}'

echo "Testing Lambda function..."
echo "Endpoint: $ENDPOINT"
echo ""

curl -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "$EVENT" | jq .

echo ""

