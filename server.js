const express = require('./backend/node_modules/express');
const sqlite3 = require('./backend/node_modules/sqlite3').verbose();
const cors = require('./backend/node_modules/cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 25563;

app.use(cors());
app.use(express.json());

// Set up SQLite Database
const dbPath = path.join(__dirname, 'backend', 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        db.run(`
            CREATE TABLE IF NOT EXISTS scores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                score INTEGER NOT NULL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }
});

// Serve frontend build if needed
// app.use(express.static(path.join(__dirname, '../frontend/dist')));

app.get('/api/ranking', (req, res) => {
    const query = `
        SELECT username, MAX(score) AS max_score, MIN(created_at) AS achieved_at
        FROM scores
        GROUP BY username
        ORDER BY max_score DESC, achieved_at ASC
        LIMIT 10
    `;
    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('Error fetching ranking', err);
            return res.status(500).json({ status: 'error', message: 'Internal server error' });
        }
        res.json({
            status: 'success',
            ranking: rows.map((row, index) => ({
                rank: index + 1,
                username: row.username,
                score: row.max_score,
                achieved_at: row.achieved_at
            }))
        });
    });
});

app.post('/api/score', (req, res) => {
    const { username, score } = req.body;
    
    // Validation
    if (!username || typeof username !== 'string' || username.trim().length === 0 || username.trim().length > 15) {
        return res.status(400).json({ status: 'error', message: 'Invalid username. Must be 1-15 characters long.' });
    }
    if (/<|>/g.test(username)) {
        return res.status(400).json({ status: 'error', message: 'Invalid username. HTML tags are not allowed.' });
    }
    if (typeof score !== 'number' || score < 0) {
        return res.status(400).json({ status: 'error', message: 'Invalid score.' });
    }

    const safeUsername = username.trim();

    db.run(`INSERT INTO scores (username, score) VALUES (?, ?)`, [safeUsername, score], function(err) {
        if (err) {
            console.error('Error saving score', err);
            return res.status(500).json({ status: 'error', message: 'Internal server error' });
        }
        
        // Find rank of the user
        const query = `
            SELECT username, MAX(score) AS max_score, MIN(created_at) AS achieved_at
            FROM scores
            GROUP BY username
            ORDER BY max_score DESC, achieved_at ASC
        `;
        db.all(query, [], (err, rows) => {
            if (err) {
                return res.json({ status: 'success', message: 'Score saved successfully, but failed to fetch rank.', your_rank: -1 });
            }
            const rankIndex = rows.findIndex(row => row.username === safeUsername);
            res.json({
                status: 'success',
                message: 'Score saved successfully.',
                your_rank: rankIndex !== -1 ? rankIndex + 1 : -1
            });
        });
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
