#!/bin/bash
# Find the latest transactions*.csv in ~/Downloads and upload it to prod.
# Intended to be run by cron daily at 13:00.

DOWNLOADS="$HOME/Downloads"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$SCRIPT_DIR/../logs/upload-csv.log"

mkdir -p "$(dirname "$LOG")"

{
  echo "=== $(date) ==="

  # Find the most recently modified transactions*.csv file
  LATEST=$(ls -t "$DOWNLOADS"/transactions*.csv 2>/dev/null | head -1)

  if [ -z "$LATEST" ]; then
    echo "No transactions*.csv found in $DOWNLOADS"
    exit 0
  fi

  echo "Found: $LATEST"

  # Only upload if the file was modified in the last 25 hours (avoid re-uploading old files)
  if [ "$(find "$LATEST" -mmin -1500 2>/dev/null)" ]; then
    python3 "$SCRIPT_DIR/upload-csv.py" "$LATEST" prod
  else
    echo "Skipping: file is older than 25 hours"
  fi

  echo ""
} >> "$LOG" 2>&1
