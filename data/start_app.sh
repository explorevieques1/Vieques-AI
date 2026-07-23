#!/usr/bin/env bash
# start_app.sh — launch the Vieques AI backend and frontend together.
# Stops both cleanly when you press Ctrl+C.

BACKEND="/home/giancarlo/Desktop/Vieques AI/backend"
FRONTEND="/home/giancarlo/Desktop/Vieques AI/frontend"

# Kill both child processes on exit (Ctrl+C)
cleanup() {
  echo ""
  echo "Shutting down…"
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
  wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
  echo "Stopped."
}
trap cleanup EXIT INT TERM

echo "Starting backend…"
cd "$BACKEND" || { echo "Backend path not found: $BACKEND"; exit 1; }
npm start &
BACKEND_PID=$!

echo "Starting frontend…"
cd "$FRONTEND" || { echo "Frontend path not found: $FRONTEND"; exit 1; }
npm run dev &
FRONTEND_PID=$!

echo ""
echo "Vieques AI is running:"
echo "  backend  -> http://localhost:3001  (PID $BACKEND_PID)"
echo "  frontend -> http://localhost:5173  (PID $FRONTEND_PID)"
echo "Press Ctrl+C to stop both."
echo ""

# Wait for either process to exit
wait