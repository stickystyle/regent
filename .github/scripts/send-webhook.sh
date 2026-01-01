#!/bin/bash
# ABOUTME: Shared webhook retry logic for GitHub Actions workflows.
# ABOUTME: Sends HTTP POST to webhook URL with exponential backoff retry.

# Function to send webhook with retry logic
# Args: $1 = callback type label (for logging)
# Env vars required: WEBHOOK_URL, PAYLOAD
send_webhook_with_retry() {
  local CALLBACK_TYPE="$1"
  local MAX_RETRIES=3

  echo "Sending ${CALLBACK_TYPE} callback to webhook..."

  for i in $(seq 1 $MAX_RETRIES); do
    # Store HTTP response code and body separately
    HTTP_RESPONSE=$(curl -X POST "$WEBHOOK_URL" \
      -H "Content-Type: application/json" \
      -d "$PAYLOAD" \
      --silent --show-error --max-time 30 \
      -w "\n%{http_code}" 2>&1) || true

    # Extract HTTP code (last line) and body (everything else)
    HTTP_CODE=$(echo "$HTTP_RESPONSE" | tail -n1)
    HTTP_BODY=$(echo "$HTTP_RESPONSE" | sed '$d')

    # Check if we got a 2xx response (success)
    if [[ "$HTTP_CODE" =~ ^2[0-9][0-9]$ ]]; then
      echo "${CALLBACK_TYPE^} callback sent successfully (HTTP $HTTP_CODE)"
      return 0
    fi

    echo "Callback attempt $i failed (HTTP $HTTP_CODE)"

    # Only retry on 5xx errors or network timeouts (empty HTTP_CODE or connection errors)
    if [[ "$HTTP_CODE" =~ ^5[0-9][0-9]$ ]] || [ -z "$HTTP_CODE" ] || [ "$HTTP_CODE" == "000" ]; then
      if [ "$i" -lt "$MAX_RETRIES" ]; then
        # Determine retry delay: 5s after first failure, 10s after second
        if [ "$i" -eq 1 ]; then
          RETRY_DELAY=5
        else
          RETRY_DELAY=10
        fi
        echo "Retrying in ${RETRY_DELAY}s..."
        sleep $RETRY_DELAY
      fi
    else
      # 4xx errors are not retryable
      echo "::error::Non-retryable error (HTTP $HTTP_CODE): $HTTP_BODY"
      return 1
    fi
  done

  echo "::warning::Failed to send ${CALLBACK_TYPE} callback after $MAX_RETRIES attempts"
  return 1
}
