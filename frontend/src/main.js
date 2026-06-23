

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
const renameWarning = document.getElementById('rename-warning');

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
    window.gameInstance = gameInstance; // Expose for testing bot
}

// Scene: Boot
class BootScene extends Phaser.Scene {
    constructor() {
        super('BootScene');
    }
    preload() {
        // Generate gem textures using Canvas API
        const typesConfig = [
            { color: 0xff0044, radius: 90 },
            { color: 0x00ccff, radius: 100 },
            { color: 0x33ff00, radius: 85 },
            { color: 0xffcc00, radius: 110 },
            { color: 0xcc00ff, radius: 80 }
        ];
        
        typesConfig.forEach((cfg, i) => {
            const r = cfg.radius;
            const d = r * 2;
            const graphics = this.make.graphics({x:0, y:0, add: false});
            graphics.fillStyle(cfg.color, 1);
            graphics.fillCircle(r, r, r);
            
            // Add a highlight for volume
            graphics.fillStyle(0xffffff, 0.4);
            graphics.fillCircle(r * 0.7, r * 0.7, r * 0.3);
            
            graphics.generateTexture(`gem_fallback_${i+1}`, d, d);

            // Attempt to load external image (404 will automatically fail gracefully)
            this.load.image(`gem_img_${i+1}`, `./assets/gem_${i+1}.png`);
        });

        // Store config for later use
        this.registry.set('typesConfig', typesConfig);
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
        this.gameEnded = false;
        
        // Walls
        this.matter.add.rectangle(540, 1970, 1080, 100, { isStatic: true }); // Bottom
        this.matter.add.rectangle(-50, 500, 100, 6000, { isStatic: true }); // Left (Extended upwards)
        this.matter.add.rectangle(1130, 500, 100, 6000, { isStatic: true }); // Right (Extended upwards)
        this.matter.add.rectangle(540, -1800, 1080, 100, { isStatic: true }); // Top wall to prevent escape

        // UI
        this.scoreText = this.add.text(40, 40, 'Score: 0', { fontSize: '56px', fill: '#fff', fontStyle: 'bold', fontFamily: 'monospace' });
        this.timeText = this.add.text(1040, 40, 'Time: 60', { fontSize: '56px', fill: '#fff', fontStyle: 'bold', fontFamily: 'monospace' }).setOrigin(1, 0);
        
        // Gauge for Time Bonus
        this.bonusThreshold = 2000;
        this.bonusTime = 5;
        this.add.text(40, 100, 'Next Time Bonus:', { fontSize: '24px', fill: '#cbd5e1' });
        this.gaugeBg = this.add.rectangle(40, 140, 400, 20, 0x334155).setOrigin(0, 0.5);
        this.gaugeFill = this.add.rectangle(40, 140, 0, 20, 0x38bdf8).setOrigin(0, 0.5);

        // Left-bottom button platform (visual + physical)
        this.add.rectangle(60, 1840, 120, 160, 0x0f172a, 0.8).setStrokeStyle(4, 0x334155).setDepth(90);
        this.matter.add.rectangle(60, 1840, 120, 160, { isStatic: true });
        
        const pauseBtn = this.add.text(60, 1840, '⏸', { fontSize: '36px', fill: '#fff', fontStyle: 'bold' }).setOrigin(0.5, 0.5).setInteractive().setDepth(100);
        pauseBtn.on('pointerdown', () => {
            this.pauseGame();
        });

        this.lastShuffleTime = 0;
        this.shuffleCooldown = 3000;

        // Right-bottom button platform (visual + physical)
        this.add.rectangle(1020, 1840, 120, 160, 0x0f172a, 0.8).setStrokeStyle(4, 0x334155).setDepth(90);
        this.matter.add.rectangle(1020, 1840, 120, 160, { isStatic: true });

        this.shuffleBtn = this.add.text(1020, 1840, '↻', { fontSize: '48px', fill: '#fff', fontStyle: 'bold' }).setOrigin(0.5, 0.5).setInteractive().setDepth(100);
        this.shuffleBtn.on('pointerdown', () => {
            this.shuffleGems();
        });

        // Timer Event
        this.timerEvent = this.time.addEvent({ delay: 1000, callback: this.tick, callbackScope: this, loop: true });

        // Spawn initial gems
        this.maxGems = 60;
        this.gems = [];
        this.spawnGems(this.maxGems);
        
        // Interaction Logic setup
        this.selectedGems = [];
        this.isDrawing = false;
        this.graphics = this.add.graphics();
        this.graphics.setDepth(10);
        
        this.input.on('pointerdown', this.handlePointerDown, this);
        this.input.on('pointermove', this.handlePointerMove, this);
        this.input.on('pointerup', this.handlePointerUp, this);
        this.input.on('gameout', this.handleGameOut, this);
        
        // Anti-stacking interval
        this.time.addEvent({ delay: 1000, callback: this.checkStacking, callbackScope: this, loop: true });
    }

    spawnGems(count) {
        const typesConfig = this.registry.get('typesConfig');
        for (let i = 0; i < count; i++) {
            const x = Phaser.Math.Between(100, 980);
            const y = Phaser.Math.Between(-1500, -100);
            const type = Phaser.Math.Between(1, 5);
            const r = typesConfig[type - 1].radius;
            
            const imgKey = `gem_img_${type}`;
            const fallbackKey = `gem_fallback_${type}`;
            // Use loaded image if available, otherwise use canvas generated texture
            const finalKey = this.textures.exists(imgKey) ? imgKey : fallbackKey;

            const gem = this.matter.add.image(x, y, finalKey, null, {
                shape: 'circle',
                restitution: 0.2,
                friction: 0.05,
                frictionAir: 0.01,
                density: 0.001
            });
            
            // Scale the texture to fit the physics body
            gem.setDisplaySize(r * 2, r * 2);

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
                    const avgDiameter = (lastGem.displayWidth + gem.displayWidth) / 2;
                    if (gem.gemType === lastGem.gemType && distance <= avgDiameter * 1.2) {
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

    handleGameOut() {
        if (this.isDrawing) {
            this.handlePointerUp();
        }
    }

    processChain() {
        const n = this.selectedGems.length;
        const addScore = Math.floor(n * 100 * (1 + (n - 3) * 0.1));
        const previousScore = this.score;
        this.score += addScore;
        this.scoreText.setText(`Score: ${this.score.toLocaleString()}`);

        // Time Bonus Logic
        const previousLevel = Math.floor(previousScore / this.bonusThreshold);
        const currentLevel = Math.floor(this.score / this.bonusThreshold);
        
        if (currentLevel > previousLevel) {
            const levelsGained = currentLevel - previousLevel;
            const addedTime = this.bonusTime * levelsGained;
            this.timeLeft += addedTime;
            this.timeText.setText(`Time: ${this.timeLeft}`);
            
            // Visual feedback for added time
            const bonusText = this.add.text(this.timeText.x - 50, this.timeText.y + 60, `+${addedTime}s`, { fontSize: '40px', fill: '#38bdf8', fontStyle: 'bold' }).setOrigin(0.5);
            this.tweens.add({
                targets: bonusText,
                y: bonusText.y - 50,
                alpha: 0,
                duration: 1000,
                onComplete: () => bonusText.destroy()
            });

            // Animate gauge wrap-around
            this.tweens.add({
                targets: this.gaugeFill,
                width: 400,
                duration: 150,
                onComplete: () => {
                    this.gaugeFill.width = 0;
                    this.tweens.add({
                        targets: this.gaugeFill,
                        width: 400 * ((this.score % this.bonusThreshold) / this.bonusThreshold),
                        duration: 150,
                        ease: 'Power2'
                    });
                }
            });
        } else {
            // Normal gauge update
            this.tweens.add({
                targets: this.gaugeFill,
                width: 400 * ((this.score % this.bonusThreshold) / this.bonusThreshold),
                duration: 300,
                ease: 'Power2'
            });
        }

        this.selectedGems.forEach(gem => {
            const idx = this.gems.indexOf(gem);
            if (idx > -1) this.gems.splice(idx, 1);
            gem.destroy();
        });

        // Effect
        this.cameras.main.flash(200, 255, 255, 255);
        
        const needed = this.maxGems - this.gems.length;
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

    shuffleGems() {
        if (this.isPaused || this.timeLeft <= 0) return;
        
        const now = this.time.now;
        if (now - this.lastShuffleTime < this.shuffleCooldown) {
            return;
        }
        this.lastShuffleTime = now;
        
        if (this.shuffleBtn) {
            this.shuffleBtn.setAlpha(0.3);
            this.time.addEvent({
                delay: this.shuffleCooldown,
                callback: () => {
                    if (this.shuffleBtn && !this.gameEnded) {
                        this.shuffleBtn.setAlpha(1.0);
                    }
                }
            });
        }
        
        // Throw all gems up into the air with random velocities to mix them up
        this.gems.forEach(gem => {
            const vx = (Math.random() - 0.5) * 40;
            const vy = -(Math.random() * 30 + 20); // Strong upward velocity
            this.matter.body.setVelocity(gem.body, { x: vx, y: vy });
            // Also spin them
            this.matter.body.setAngularVelocity(gem.body, (Math.random() - 0.5) * 0.5);
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

        // Clean up gems that went out of bounds and refill them
        if (!this.isPaused && !this.gameEnded && this.timeLeft > 0) {
            let lostGemsCount = 0;
            for (let i = this.gems.length - 1; i >= 0; i--) {
                const gem = this.gems[i];
                if (gem) {
                    if (gem.y > 2100 || gem.y < -2200 || gem.x < -400 || gem.x > 1480) {
                        this.gems.splice(i, 1);
                        gem.destroy();
                        lostGemsCount++;
                    }
                } else {
                    this.gems.splice(i, 1);
                    lostGemsCount++;
                }
            }
            if (lostGemsCount > 0) {
                this.spawnGems(lostGemsCount);
            }
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
        if (this.gameEnded) return;
        this.gameEnded = true;
        
        if (this.timerEvent) {
            this.timerEvent.remove();
            this.timerEvent = null;
        }
        this.input.enabled = false;
        
        // Cancel any active drawing
        if (this.isDrawing) {
            this.selectedGems.forEach(g => { if (g && g.clearTint) g.clearTint(); });
            this.selectedGems = [];
            this.isDrawing = false;
            this.graphics.clear();
        }
        
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
        const res = await fetch(window.location.protocol + '//' + window.location.host + '/chain-puzzle-socket/api/ranking');
        const data = await res.json();
        if (data.status === 'success') {
            listEl.innerHTML = '';
            if (data.ranking.length === 0) {
                listEl.innerHTML = '<li>No records yet.</li>';
            } else {
                data.ranking.forEach(r => {
                    listEl.innerHTML += `<li><span>${r.rank}. ${r.username}</span><span>${Number(r.score).toLocaleString()}</span></li>`;
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
        const res = await fetch(window.location.protocol + '//' + window.location.host + '/chain-puzzle-socket/api/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUsername, score: score }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
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
        clearTimeout(timeoutId);
        loadingSpinner.classList.add('hidden');
        if (e.name === 'AbortError') {
            errorMsg.textContent = "Request timeout. Failed to send score.";
        } else {
            errorMsg.textContent = "Network error. Failed to send score.";
        }
        errorMsg.classList.remove('hidden');
        retrySendBtn.classList.remove('hidden');
    }
}

// Monitor username input for rename pattern
usernameInput.addEventListener('input', () => {
    const val = usernameInput.value.trim();
    const renamePattern = /^(.+)==>(.+)$/;
    if (renamePattern.test(val)) {
        renameWarning.classList.remove('hidden');
    } else {
        renameWarning.classList.add('hidden');
    }
});

// Events
startBtn.addEventListener('click', () => {
    const val = usernameInput.value.trim();
    const renamePattern = /^(.+)==>(.+)$/;
    
    if (val.length === 0) {
        alert("Invalid username. 1-15 chars, no HTML tags.");
        return;
    }
    
    // Allow rename pattern, validate as regular username otherwise
    if (!renamePattern.test(val)) {
        if (val.length > 15 || /<|>/g.test(val)) {
            alert("Invalid username. 1-15 chars, no HTML tags.");
            return;
        }
    }
    
    currentUsername = val;
    localStorage.setItem('username', val);
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
        window.gameInstance = null;
    }
    showTitleScreen();
});

retrySendBtn.addEventListener('click', () => {
    postScore(parseInt(finalScoreDisplay.textContent.replace(/,/g, '')));
});

function showTitleScreen() {
    switchScreen(titleScreen);
    fetchRanking(titleRankingList);
}

function showResultScreen(score) {
    switchScreen(resultScreen);
    finalScoreDisplay.textContent = score.toLocaleString();
    postScore(score);
}

// Initial Boot
const savedUsername = localStorage.getItem('username');
if (savedUsername) {
    usernameInput.value = savedUsername;
}
showTitleScreen();

// Expose UI functions for black box testing
window.showResultScreen = showResultScreen;
window.showTitleScreen = showTitleScreen;
window.postScore = postScore;
