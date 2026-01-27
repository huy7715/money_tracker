# Money Tracker with AI Assistant 💰✨

A full-stack financial management application featuring an AI assistant that understands Vietnamese currency and natural language commands.

## Features
- **Magic AI Assistant**: Supports Vietnamese currency terms like "3 triệu", "500k", "2 tỷ" and relative budget updates ("tăng thêm 500k").
- **Budget Manager**: Set and track monthly spending limits by category.
- **Visual Analytics**: Interactive charts showing your spending breakdown.
- **Responsive Design**: Modern, glassmorphic UI with dynamic backgrounds.

## Setup Instructions

### 1. Prerequisites
- Python 3.8+
- Node.js (if using building tools, otherwise use the included static files)

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Environment Variables
Create a `.env` file in the root directory:
```env
OPENAI_API_KEY=your_openai_key
GEMINI_API_KEY=your_gemini_key
```

### 4. Run the Application
```bash
python web/app.py
```
Visit `http://127.0.0.1:5000` in your browser.

## Deployment Note
This app uses a local SQLite database (`money_tracker.db`). When deploying to platforms like Render or Railway, ensure you use a persistent disk or migrate to a managed database if you need to keep data across deployments.
