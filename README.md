# Sports Management System

A full-stack web application for managing sports organizations, built with Django REST Framework and React.

## 🚀 Features

### Backend (Django REST API)
- **Sports Management**: Athletes, clubs, competitions, matches
- **News System**: CMS for news articles with rich text editor
- **Landing Page**: Dynamic content management for homepage
- **User Authentication**: Role-based access control
- **Admin Interface**: Django admin for content management

### Frontend (React + Material-UI)
- **Responsive Design**: Mobile-first approach with Material-UI
- **News Portal**: Dynamic news listing and article pages
- **Search & Filtering**: Real-time search functionality
- **Modern UI**: Clean, professional interface
- **SEO Friendly**: Proper meta tags and URL structure

## 🛠️ Technology Stack

### Backend
- **Django 4.2+**: Web framework
- **Django REST Framework**: API development
- **CKEditor 5**: Rich text editor
- **SQLite/PostgreSQL**: Database
- **Pillow**: Image processing

### Frontend
- **React 18**: UI library
- **Material-UI (MUI)**: Component library
- **React Router**: Client-side routing
- **Vite**: Build tool
- **date-fns**: Date utilities

## 📦 Installation

### Prerequisites
- Python 3.8+
- Node.js 16+
- npm or yarn

### Quick Setup
```bash
# Clone the repository
git clone https://github.com/gabimolocea/frvv-admin.git
cd frvv-admin

# Install frontend dependencies (use the lockfile for reproducible installs)
cd frontend
npm ci

# Start development servers
npm run dev



# Navigate to backend directory
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On macOS/Linux:
# source venv/bin/activate
# On Windows (PowerShell):
# venv\Scripts\Activate.ps1
# If execution policy blocks scripts, run PowerShell as Administrator and execute:
# Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Install Python dependencies
pip install -r requirements.txt

# Run migrations
python manage.py makemigrations
python manage.py migrate

# Create superuser
python manage.py createsuperuser

# Start Django server
python manage.py runserver



# Navigate to frontend directory and install dependencies
cd frontend
npm ci

# Start frontend dev server
npm run dev


🚀 Usage
Development
Backend: Access Django admin at http://localhost:8000/admin/
API: REST API available at http://localhost:8000/api/
Frontend: React app at http://localhost:5173/
API Endpoints
Main API (/api/)
GET /api/ - API root with all available endpoints
GET /api/athletes/ - List all athletes
GET /api/clubs/ - List all clubs
GET /api/competitions/ - List all competitions
GET /api/matches/ - List all matches
Landing API (/landing/)
GET /landing/news/ - List news articles
GET /landing/news/{id}/ - Get specific article
GET /landing/events/ - List events
GET /landing/about/ - About sections
POST /landing/contact/submit/ - Submit contact form
Creating Content
Login to Admin: http://localhost:8000/admin/
Add News: Go to "Landing" → "News Posts"
Manage Sports Data: Use the respective sections in admin
Content appears automatically in the React frontend



# Install concurrently for running both servers
npm install concurrently --save-dev


Recommended Platforms
Backend: Railway, Heroku, DigitalOcean
Frontend: Vercel, Netlify, GitHub Pages
Database: PostgreSQL (Railway, Heroku Postgres)
🤝 Contributing
Fork the repository
Create a feature branch (git checkout -b feature/amazing-feature)
Commit your changes (git commit -m 'Add some amazing feature')
Push to the branch (git push origin feature/amazing-feature)
Open a Pull Request
📝 License
This project is licensed under the MIT License - see the LICENSE file for details.

🐛 Issues
If you encounter any issues, please create an issue.

🙏 Acknowledgments
Django REST Framework documentation
Material-UI team
React community
Contributors and testers