#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Run the Money Tracker Telegram Bot
Usage: python run_bot.py
"""

import sys
import os

# Fix Windows console encoding
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from money_tracker.backend.telegram_bot import run_bot

if __name__ == "__main__":
    print("[BOT] Starting Money Tracker Telegram Bot...")
    print("[INFO] Open Telegram and find @MoneyTrackersl_bot")
    print("[INFO] Press Ctrl+C to stop")
    print("")
    run_bot()
