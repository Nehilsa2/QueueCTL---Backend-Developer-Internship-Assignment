#!/bin/bash
# ============================================================
# 🚀 QueueCTL — Universal Setup & Test Script
# Author: Nehil Sahu
# Description: Auto setup for Backend + Frontend + CLI (src)
# ============================================================

echo ""
echo "=============================================="
echo " ⚙️  Starting QueueCTL Setup & Test Workflow..."
echo "=============================================="
sleep 1

ROOT_DIR=$(pwd)

# --- Backend Setup ---
echo ""
echo "🧱 Setting up Backend..."
cd "$ROOT_DIR/Backend" || { echo "❌ Backend folder missing!"; exit 1; }
npm install --silent || { echo "❌ Backend install failed!"; exit 1; }

pkill -f "node app.js" >/dev/null 2>&1
nohup node app.js > "$ROOT_DIR/backend.log" 2>&1 &
BACK_PID=$!
sleep 3
echo "✅ Backend running at http://localhost:8080 (PID: $BACK_PID)"

# --- Frontend Setup ---
echo ""
echo "🎨 Setting up Frontend..."
cd "$ROOT_DIR/Frontend" || { echo "❌ Frontend folder missing!"; exit 1; }
npm install --silent || { echo "❌ Frontend install failed!"; exit 1; }

pkill -f "vite" >/dev/null 2>&1
nohup npm run dev > "$ROOT_DIR/frontend.log" 2>&1 &
FRONT_PID=$!
sleep 5
echo "✅ Frontend running at http://localhost:5173 (PID: $FRONT_PID)"

# --- CLI / Core Setup ---
echo ""
echo "🧠 Setting up Core (src)..."
cd "$ROOT_DIR/src" || { echo "❌ src folder missing!"; exit 1; }
npm install --silent || { echo "❌ CLI install failed!"; exit 1; }
echo "✅ CLI & Core setup complete."

# --- Enqueue Jobs ---
echo ""
echo "🧩 Enqueuing sample jobs..."
node cli.js enqueue '{"command":"echo Hello from QueueCTL!"}'
node cli.js enqueue '{"command":"sleep 2 && echo Job 2 done!"}'
node cli.js enqueue '{"command":"false"}'
sleep 1
echo "✅ Jobs enqueued successfully."

# --- List Jobs ---
echo ""
echo "📋 Current Jobs:"
node cli.js list

# --- Start Workers ---
echo ""
echo "⚙️ Starting 2 workers in background..."
nohup node cli.js worker start -c 2 > "$ROOT_DIR/worker.log" 2>&1 &
WORKER_PID=$!
echo "✅ Workers running (PID: $WORKER_PID)"
sleep 2

# --- Wait until all jobs are completed or dead ---
echo ""
echo "⏳ Waiting for workers to process jobs..."
MAX_WAIT=60   # 60 seconds max wait
CHECK_INTERVAL=3
TIME_PASSED=0

while [ $TIME_PASSED -lt $MAX_WAIT ]; do
  pending=$(node cli.js list | grep -c "pending")
  processing=$(node cli.js list | grep -c "processing")
  waiting=$(node cli.js list | grep -c "waiting")

  if [ $pending -eq 0 ] && [ $processing -eq 0 ] && [ $waiting -eq 0 ]; then
    echo "✅ All jobs have finished processing!"
    break
  fi

  echo "🕒 Still processing... (${TIME_PASSED}s elapsed)"
  sleep $CHECK_INTERVAL
  TIME_PASSED=$((TIME_PASSED + CHECK_INTERVAL))
done

if [ $TIME_PASSED -ge $MAX_WAIT ]; then
  echo "⚠️ Timeout reached (some jobs may still be processing)."
fi

# --- Display Metrics ---
echo ""
echo "📊 Queue Metrics Summary:"
node cli.js metrics

# --- Display Logs for First Job ---
FIRST_ID=$(node cli.js list | awk '/^[0-9a-f-]{8}/ {print $1; exit}')
if [ -n "$FIRST_ID" ]; then
  echo ""
  echo "🧾 Showing logs for job: $FIRST_ID"
  node cli.js logs "$FIRST_ID"
else
  echo "⚠️ No jobs found to show logs."
fi

# --- Summary ---
echo ""
echo "=============================================="
echo " ✅ QueueCTL test completed successfully!"
echo " 🌐 Dashboard: http://localhost:5173"
echo " ⚙️ API:       http://localhost:8080"
echo ""
echo " 🧠 Logs saved at:"
echo "    • backend.log"
echo "    • frontend.log"
echo "    • worker.log"
echo ""
echo " 💡 Stop all with:"
echo "    kill $BACK_PID $FRONT_PID $WORKER_PID"
echo "=============================================="
