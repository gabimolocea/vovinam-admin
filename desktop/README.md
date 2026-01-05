# FRVV Athlete Manager - Desktop App

Offline desktop application for managing athletes with sync to Django backend.

## Features

- ✅ Offline athlete database (SQLite)
- ✅ Excel import/export
- ✅ Bidirectional sync with Django API
- ✅ Conflict detection and resolution
- ✅ Cross-platform (Windows, macOS, Linux)

## Installation

### Requirements
- Python 3.10+
- PyQt6
- Backend API running

### Setup

```bash
# Navigate to desktop folder
cd desktop

# Create virtual environment (optional but recommended)
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

## Running the App

```bash
python main.py
```

## Configuration

Set API endpoint via environment variable:

```bash
# Windows PowerShell
$env:FRVV_API_URL="http://127.0.0.1:8000/api"

# macOS/Linux
export FRVV_API_URL="http://127.0.0.1:8000/api"
```

Or edit `config.py` directly.

## Usage

### First Time Setup

1. Start the app
2. Go to `Sync > Test Connection` to verify backend connectivity
3. Go to `Sync > Download from Server` to pull initial data

### Offline Work

1. Import athletes from Excel: `File > Import Excel...`
2. View and manage athletes in the list
3. Export to Excel: `File > Export Excel...`

### Syncing

- **Download (⬇)**: Pull latest data from server
- **Upload (⬆)**: Push local changes to server
- **Full Sync (🔄)**: Sync both ways

### Excel Format

Expected columns:
1. First Name
2. Last Name
3. Date of Birth (YYYY-MM-DD)
4. Mobile Number
5. Club Name
6. City Name
7. Status (pending/approved/rejected)

## Building Executables

### Windows

```bash
pip install pyinstaller
pyinstaller --onefile --windowed --name "FRVV-Manager" main.py
```

### macOS

```bash
pip install pyinstaller
pyinstaller --onefile --windowed --name "FRVV Manager" main.py
```

The executable will be in the `dist/` folder.

## Data Storage

- Database: `desktop/data/offline_db.sqlite3`
- Excel files: `desktop/data/excel/`

## Troubleshooting

**Can't connect to API:**
- Verify backend server is running
- Check `FRVV_API_URL` environment variable
- Test connection: `Sync > Test Connection`

**Import fails:**
- Check Excel file format matches expected columns
- Use `Validate` button before importing
- Check error messages for specific row issues

## Development

Project structure:
```
desktop/
├── main.py              # Application entry point
├── config.py            # Configuration
├── requirements.txt     # Dependencies
├── models/              # Database models
│   └── db.py
├── sync/                # Sync manager
│   └── sync_manager.py
├── ui/                  # PyQt6 UI components
│   ├── main_window.py
│   ├── athlete_list.py
│   └── excel_import.py
└── data/                # Local data storage
    ├── offline_db.sqlite3
    └── excel/
```
