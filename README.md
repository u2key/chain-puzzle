# Drop & Connect - Physics Puzzle Game

This is a physics-based puzzle game where players drop and connect gems to score points within a 60-second time limit. It features a responsive layout designed for 9:16 mobile screens, centering automatically on larger displays. The game includes an online leaderboard using a backend API.

## Project Structure

The project has been refactored so that `index.html` and `server.js` are in the root directory for easier access:

- `/index.html`: The main entry point for the frontend.
- `/server.js`: The backend API server script (Express + SQLite).
- `/frontend/`: Contains the Vite configuration and source code for the Phaser game.
  - `src/main.js`: Main game logic using Phaser 3 and Matter.js.
  - `src/style.css`: Styles for the UI overlays.
- `/backend/`: Contains backend-related files (like `database.sqlite` and `package.json` for dependencies).
- `/software-requirements-specifications/`: SRS documents.

## How to Run

### 1. Start the Backend Server

The backend runs on **port 25563**. It provides the ranking and score submission API.

```bash
cd backend
npm install   # If not already installed
cd ..
node server.js
```
*Note: Make sure to run `node server.js` from the root directory, or ensure that you are in the directory where `server.js` resides.*

### 2. Start the Frontend Development Server

The frontend uses Vite. The Vite configuration is located in the `frontend` folder, but it serves the `index.html` from the root directory.

```bash
cd frontend
npm install   # If not already installed
npm run dev
```

Open the local URL provided by Vite (e.g., `http://localhost:5173`) in your browser to play the game!

## Features
- **Physics Engine**: Uses Matter.js via Phaser 3 for realistic gem dropping.
- **Match & Chain Logic**: Drag across matching gems to connect them. Minimum of 3 gems required to clear.
- **Anti-Stacking Mechanism**: Automatically resolves jams if gems get stuck.
- **Global Leaderboard**: Fetch and submit scores to a local SQLite database.
