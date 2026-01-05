"""
Configuration for FRVV Offline Desktop App
"""
import os
from pathlib import Path

# App info
APP_NAME = "FRVV Athlete Manager"
APP_VERSION = "1.0.0"

# Directories
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
EXCEL_DIR = DATA_DIR / "excel"
DB_PATH = DATA_DIR / "offline_db.sqlite3"

# Create directories if they don't exist
DATA_DIR.mkdir(exist_ok=True)
EXCEL_DIR.mkdir(exist_ok=True)

# API Configuration
API_BASE_URL = os.getenv("FRVV_API_URL", "http://127.0.0.1:8000/api")

# Sync settings
SYNC_BATCH_SIZE = 100
SYNC_TIMEOUT = 30  # seconds

# UI Settings
WINDOW_TITLE = f"{APP_NAME} v{APP_VERSION}"
WINDOW_WIDTH = 1200
WINDOW_HEIGHT = 800
