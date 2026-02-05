#!/usr/bin/env python3
"""
Quick start script for FRVV Scoring System
"""
import sys
import os

# Add desktop directory to path
desktop_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, desktop_dir)

from main_launcher import main

if __name__ == '__main__':
    print("🥋 FRVV Vovinam Scoring System")
    print("=" * 50)
    print("Starting launcher...")
    print()
    main()
