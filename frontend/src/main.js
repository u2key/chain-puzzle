

// UI Elements
const titleScreen = document.getElementById('title-screen');
const resultScreen = document.getElementById('result-screen');
const rankingScreen = document.getElementById('ranking-screen');
const pauseScreen = document.getElementById('pause-screen');

const usernameInput = document.getElementById('username-input');
const startBtn = document.getElementById('start-btn');
const resumeBtn = document.getElementById('resume-btn');
const backTitleBtn = document.getElementById('back-title-btn');
const retrySendBtn = document.getElementById('retry-send-btn');

const titleRankingList = document.getElementById('title-ranking-list');
const finalRankingList = document.getElementById('final-ranking-list');
const finalScoreDisplay = document.getElementById('final-score');
const yourRankDisplay = document.getElementById('your-rank-val');
const loadingSpinner = document.getElementById('loading-spinner');
const errorMsg = document.getElementById('error-message');

let gameInstance = null;
let currentUsername = "";

// Initialize Game
function initGame() {
    if (gameInstance) {
        gameInstance.destroy(true);
    }
    
    const config = {
        type: Phaser.AUTO,
        width: 1080,
        height: 1920,
        parent: 'game-container',
        transparent: true,
        scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        physics: {
            default: 'matter',
            matter: {
                debug: false,
                gravity: { y: 2 },
            }
        },
        scene: [BootScene, GameScene]
    };
    
    gameInstance = new Phaser.Game(config);
}

// Scene: Boot
class BootScene extends Phaser.Scene {
    constructor() {
        super('BootScene');
    }
    preload() {
        // Generate gem textures using Canvas API
        const colors = [0xff0044, 0x00ccff, 0x33ff00, 0xffcc00, 0xcc00ff];
        for (let i = 0; i < 5; i++) {
            const graphics = this.make.graphics({x:0, y:0, add: false});
            graphics.fillStyle(colors[i], 1);
            graphics.fillCircle(50, 50, 50); // diameter 100
            
            // Add a highlight for volume
            graphics.fillStyle(0xffffff, 0.4);
            graphics.fillCircle(35, 35, 15);
            
            graphics.generateTexture(`gem_${i+1}`, 100, 100);
        }
    }
    create() {
        this.scene.start('GameScene');
    }
}

// Scene: Game
class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
    }
    create() {
        this.score = 0;
        this.timeLeft = 60;
        this.isPaused = false;
        
        // Walls
        this.matter.add.rectangle(540, 1970, 1080, 100, { isStatic: true }); // Bottom
        this.matter.add.rectangle(-50, 960, 100, 4000, { isStatic: true }); // Left
        this.matter.add.rectangle(1130, 960, 100, 4000, { isStatic: true }); // Right

        // UI
        this.scoreText = this.add.text(40, 40, 'Score: 0', { fontSize: '48px', fill: '#fff', fontStyle: 'bold' });
        this.timeText = this.add.text(1040, 40, 'Time: 60', { fontSize: '48px', fill: '#fff', fontStyle: 'bold' }).setOrigin(1, 0);
        
        const pauseBtn = this.add.text(540, 40, 'PAUSE', { fontSize: '40px', fill: '#fff', backgroundColor: '#334155', padding: { x: 20, y: 10 } }).setOrigin(0.5, 0).setInteractive();
        pauseBtn.on('pointerdown', () => {
            this.pauseGame();
        });

        // Timer Event
        this.timerEvent = this.time.addEvent({ delay: 1000, callback: this.tick, callbackScope: this, loop: true });

        // Spawn initial gems
        this.gems = [];
        this.spawnGems(50);
        
        // Interaction Logic setup
        this.selectedGems = [];
        this.isDrawing = false;
        this.graphics = this.add.graphics();
        this.graphics.setDepth(10);
        
        this.input.on('pointerdown', this.handlePointerDown, this);
        this.input.on('pointermove', this.handlePointerMove, this);
        this.input.on('pointerup', this.handlePointerUp, this);
        
        // Anti-stacking interval
        this.time.addEvent({ delay: 1000, callback: this.checkStacking, callbackScope: this, loop: true });
    }

    spawnGems(count) {
        for (let i = 0; i < count; i++) {
            const x = Phaser.Math.Between(100, 980);
            const y = Phaser.Math.Between(-1500, -100);
            const type = Phaser.Math.Between(1, 5);
            const gem = this.matter.add.image(x, y, `gem_${type}`, null, {
                shape: 'circle',
                restitution: 0.2,
                friction: 0.05,
                frictionAir: 0.01,
                density: 0.001
            });
            gem.gemType = type;
            gem.spawnTime = this.time.now;
            gem.setInteractive();
            this.gems.push(gem);
        }
    }

    handlePointerDown(pointer) {
        if (this.isPaused || this.timeLeft <= 0) return;
        const clickedBody = this.matter.intersectPoint(pointer.x, pointer.y);
        if (clickedBody.length > 0) {
            const gem = clickedBody[0].gameObject;
            if (gem && this.gems.includes(gem)) {
                this.isDrawing = true;
                this.selectedGems.push(gem);
                gem.setTint(0x888888);
            }
        }
    }

    handlePointerMove(pointer) {
        if (!this.isDrawing || this.isPaused || this.timeLeft <= 0) return;
        
        const hoveredBody = this.matter.intersectPoint(pointer.x, pointer.y);
        if (hoveredBody.length > 0) {
            const gem = hoveredBody[0].gameObject;
            if (gem && this.gems.includes(gem)) {
                // Check if rollback
                if (this.selectedGems.length >= 2 && gem === this.selectedGems[this.selectedGems.length - 2]) {
                    const removed = this.selectedGems.pop();
                    removed.clearTint();
                } 
                // Check addition rules
                else if (!this.selectedGems.includes(gem)) {
                    const lastGem = this.selectedGems[this.selectedGems.length - 1];
                    const distance = Phaser.Math.Distance.Between(lastGem.x, lastGem.y, gem.x, gem.y);
                    if (gem.gemType === lastGem.gemType && distance <= 120) {
                        this.selectedGems.push(gem);
                        gem.setTint(0x888888);
                    }
                }
            }
        }
    }

    handlePointerUp(pointer) {
        if (!this.isDrawing || this.isPaused) return;
        this.isDrawing = false;
        
        if (this.selectedGems.length >= 3) {
            this.processChain();
        } else {
            this.selectedGems.forEach(g => g.clearTint());
            this.selectedGems = [];
        }
        this.graphics.clear();
    }

    processChain() {
        const n = this.selectedGems.length;
        const addScore = Math.floor(n * 100 * (1 + (n - 3) * 0.1));
        this.score += addScore;
        this.scoreText.setText(`Score: ${this.score}`);

        this.selectedGems.forEach(gem => {
            const idx = this.gems.indexOf(gem);
            if (idx > -1) this.gems.splice(idx, 1);
            gem.destroy();
        });

        // Effect
        this.cameras.main.flash(200, 255, 255, 255);
        
        const needed = 50 - this.gems.length;
        if (needed > 0) {
            this.spawnGems(needed);
        }
        this.selectedGems = [];
    }

    checkStacking() {
        if (this.isPaused || this.timeLeft <= 0) return;
        const now = this.time.now;
        this.gems.forEach(gem => {
            if (now - gem.spawnTime > 3000) {
                if (Math.abs(gem.body.velocity.x) < 0.1 && Math.abs(gem.body.velocity.y) < 0.1) {
                    if (gem.y < 1800) { // Not at the bottom
                        this.matter.body.applyForce(gem.body, gem.body.position, { x: (Math.random()-0.5) * 0.005, y: 0 });
                    }
                }
            }
        });
    }

    tick() {
        if (this.isPaused) return;
        this.timeLeft--;
        this.timeText.setText(`Time: ${this.timeLeft}`);
        if (this.timeLeft <= 0) {
            this.endGame();
        }
    }

    update() {
        this.graphics.clear();
        if (this.isDrawing && this.selectedGems.length > 0) {
            this.graphics.lineStyle(8, 0xffffff, 0.8);
            this.graphics.beginPath();
            this.graphics.moveTo(this.selectedGems[0].x, this.selectedGems[0].y);
            for (let i = 1; i < this.selectedGems.length; i++) {
                this.graphics.lineTo(this.selectedGems[i].x, this.selectedGems[i].y);
            }
            const p = this.input.activePointer;
            this.graphics.lineTo(p.x, p.y);
            this.graphics.strokePath();
        }
    }

    pauseGame() {
        this.isPaused = true;
        this.matter.world.pause();
        this.selectedGems.forEach(g => g.clearTint());
        this.selectedGems = [];
        this.isDrawing = false;
        this.graphics.clear();
        
        pauseScreen.classList.add('active');
    }

    resumeGame() {
        this.isPaused = false;
        this.matter.world.resume();
        pauseScreen.classList.remove('active');
    }

    endGame() {
        this.timerEvent.remove();
        this.input.enabled = false;
        
        // Wait for objects to settle
        this.time.delayedCall(2000, () => {
            this.scene.pause();
            showResultScreen(this.score);
        });
    }
}

// UI Flow Management

function switchScreen(screen) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
}

async function fetchRanking(listEl) {
    listEl.innerHTML = '<li>Loading...</li>';
    try {
        const res = await fetch('http://localhost:25563/api/ranking');
        const data = await res.json();
        if (data.status === 'success') {
            listEl.innerHTML = '';
            if (data.ranking.length === 0) {
                listEl.innerHTML = '<li>No records yet.</li>';
            } else {
                data.ranking.forEach(r => {
                    listEl.innerHTML += `<li><span>${r.rank}. ${r.username}</span><span>${r.score}</span></li>`;
                });
            }
        }
    } catch (e) {
        listEl.innerHTML = '<li>Error loading rankings</li>';
    }
}

async function postScore(score) {
    loadingSpinner.classList.remove('hidden');
    errorMsg.classList.add('hidden');
    retrySendBtn.classList.add('hidden');

    try {
        const res = await fetch('http://localhost:25563/api/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUsername, score: score })
        });
        const data = await res.json();
        
        loadingSpinner.classList.add('hidden');
        if (data.status === 'success') {
            yourRankDisplay.textContent = data.your_rank > 0 ? data.your_rank : 'Outside Top 10';
            switchScreen(rankingScreen);
            fetchRanking(finalRankingList);
        } else {
            errorMsg.textContent = data.message;
            errorMsg.classList.remove('hidden');
            retrySendBtn.classList.remove('hidden');
        }
    } catch (e) {
        loadingSpinner.classList.add('hidden');
        errorMsg.textContent = "Network error. Failed to send score.";
        errorMsg.classList.remove('hidden');
        retrySendBtn.classList.remove('hidden');
    }
}

// Events
startBtn.addEventListener('click', () => {
    const val = usernameInput.value.trim();
    if (val.length === 0 || val.length > 15 || /<|>/g.test(val)) {
        alert("Invalid username. 1-15 chars, no HTML tags.");
        return;
    }
    currentUsername = val;
    switchScreen(document.createElement('div')); // Hide all
    initGame();
});

resumeBtn.addEventListener('click', () => {
    if (gameInstance) {
        gameInstance.scene.getScene('GameScene').resumeGame();
    }
});

backTitleBtn.addEventListener('click', () => {
    if (gameInstance) {
        gameInstance.destroy(true);
        gameInstance = null;
    }
    showTitleScreen();
});

retrySendBtn.addEventListener('click', () => {
    postScore(parseInt(finalScoreDisplay.textContent));
});

function showTitleScreen() {
    switchScreen(titleScreen);
    fetchRanking(titleRankingList);
}

function showResultScreen(score) {
    switchScreen(resultScreen);
    finalScoreDisplay.textContent = score;
    postScore(score);
}

// Initial Boot
showTitleScreen();
