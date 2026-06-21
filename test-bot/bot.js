const iframe = document.getElementById('game-iframe');
const logBox = document.getElementById('log-box');
const testContainer = document.getElementById('test-case-container');

// Log output helper
function log(msg, type = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry`;
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'log-time';
    timeSpan.textContent = `[${new Date().toLocaleTimeString()}]`;
    
    const contentSpan = document.createElement('span');
    contentSpan.className = `log-${type}`;
    contentSpan.textContent = msg;
    
    entry.appendChild(timeSpan);
    entry.appendChild(contentSpan);
    
    logBox.prepend(entry);
}

function getIframeDoc() {
    return iframe.contentDocument || iframe.contentWindow.document;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function disableControls(disabled) {
    document.getElementById('btn-run-all').disabled = disabled;
    document.getElementById('btn-reset-app').disabled = disabled;
    document.querySelectorAll('.btn-run-single').forEach(btn => btn.disabled = disabled);
}

// Reset Game App to Title Screen
async function resetApp() {
    log('Resetting application to Title Screen...', 'warning');
    const doc = getIframeDoc();
    const win = iframe.contentWindow;
    
    if (win.gameInstance) {
        win.gameInstance.destroy(true);
        win.gameInstance = null;
    }
    
    // Trigger the backBtn if on result/ranking screen
    const backBtn = doc.getElementById('back-title-btn');
    if (backBtn) backBtn.click();
    
    // Clear overlay
    const pauseScreen = doc.getElementById('pause-screen');
    if (pauseScreen) pauseScreen.classList.remove('active');
    
    // Show title screen
    if (win.showTitleScreen) {
        win.showTitleScreen();
    }
    
    // Reset username inputs
    const usernameInput = doc.getElementById('username-input');
    if (usernameInput) {
        usernameInput.value = '';
    }
    
    await sleep(500);
    log('Game successfully reset.', 'info');
}

// Search adjacent gems chain
function findValidChain(gems, minLength) {
    const adj = new Map();
    gems.forEach(g1 => {
        adj.set(g1, []);
        gems.forEach(g2 => {
            if (g1 !== g2 && g1.gemType === g2.gemType) {
                const dist = Math.hypot(g1.x - g2.x, g1.y - g2.y);
                const avgDiameter = (g1.displayWidth + g2.displayWidth) / 2;
                if (dist <= avgDiameter * 1.2) {
                    adj.get(g1).push(g2);
                }
            }
        });
    });

    for (const start of gems) {
        const path = [start];
        const visited = new Set([start]);
        
        function dfs(current) {
            if (path.length === minLength) return true;
            for (const neighbor of adj.get(current)) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    path.push(neighbor);
                    if (dfs(neighbor)) return true;
                    path.pop();
                    visited.delete(neighbor);
                }
            }
            return false;
        }
        
        if (dfs(start)) return path;
    }
    return null;
}

// Set up a custom horizontal chain of gems for easy reliable chain testing
function setupCustomGemsChain(scene, count, type = 1, isStatic = false) {
    scene.gems.forEach(g => {
        if (g && g.destroy) g.destroy();
    });
    scene.gems = [];
    
    const startX = 200;
    const startY = 800;
    const r = scene.registry.get('typesConfig')[type - 1].radius;
    
    for (let i = 0; i < count; i++) {
        const x = startX + (i * r * 1.5);
        const y = startY; 
        const imgKey = `gem_img_${type}`;
        const fallbackKey = `gem_fallback_${type}`;
        const finalKey = scene.textures.exists(imgKey) ? imgKey : fallbackKey;
        
        const gem = scene.matter.add.image(x, y, finalKey, null, {
            shape: 'circle',
            restitution: 0.1,
            friction: 0.1,
            frictionAir: 0.05,
            density: 0.001
        });
        gem.setDisplaySize(r * 2, r * 2);
        gem.gemType = type;
        gem.spawnTime = scene.time.now;
        gem.setInteractive();
        if (isStatic) {
            gem.setStatic(true);
        }
        scene.gems.push(gem);
    }
}

// Ensure the game is running and return scene
function getActiveScene() {
    const win = iframe.contentWindow;
    if (!win || !win.gameInstance) return null;
    return win.gameInstance.scene.getScene('GameScene');
}

// Define all test cases with their metadata and runners
const testCases = [
    // --- API & Username Validation ---
    {
        id: 'TC-API-01',
        category: 'API & Validation',
        name: 'Empty Username Validation',
        run: async () => {
            await resetApp();
            const doc = getIframeDoc();
            const input = doc.getElementById('username-input');
            const startBtn = doc.getElementById('start-btn');
            if (!input || !startBtn) return { success: false, message: 'Title screen elements missing.' };
            
            const win = iframe.contentWindow;
            let alertMsg = '';
            const originalAlert = win.alert;
            win.alert = (msg) => { alertMsg = msg; };
            
            input.value = '';
            startBtn.click();
            await sleep(150);
            
            win.alert = originalAlert;
            
            const activeScreen = doc.querySelector('.screen.active');
            if (activeScreen && activeScreen.id === 'title-screen' && alertMsg.length > 0) {
                return { success: true, message: `Prevented login with alert: "${alertMsg}"` };
            }
            return { success: false, message: 'Allowed login or did not display alert.' };
        }
    },
    {
        id: 'TC-API-03',
        category: 'API & Validation',
        name: 'Username Characters Upper Limit',
        run: async () => {
            const doc = getIframeDoc();
            const input = doc.getElementById('username-input');
            if (!input) return { success: false, message: 'Username input missing.' };
            
            const maxLen = input.getAttribute('maxlength');
            if (maxLen === '15') {
                return { success: true, message: 'Maxlength attribute is strictly set to 15.' };
            }
            return { success: false, message: `Maxlength is ${maxLen}, expected 15.` };
        }
    },
    {
        id: 'TC-API-04',
        category: 'API & Validation',
        name: 'XSS / SQLi Safety Login',
        run: async () => {
            const doc = getIframeDoc();
            const input = doc.getElementById('username-input');
            const startBtn = doc.getElementById('start-btn');
            if (!input || !startBtn) return { success: false, message: 'Title screen elements missing.' };
            
            const win = iframe.contentWindow;
            let alertMsg = '';
            const originalAlert = win.alert;
            win.alert = (msg) => { alertMsg = msg; };
            
            // Enter malicious string
            input.value = 'User<script>alert(1)</script>';
            startBtn.click();
            await sleep(200);
            
            win.alert = originalAlert;
            
            const activeScreen = doc.querySelector('.screen.active');
            if (activeScreen && activeScreen.id === 'title-screen' && alertMsg.length > 0) {
                return { success: true, message: `Blocked HTML script input with alert: "${alertMsg}"` };
            }
            return { success: false, message: 'Allowed login or did not display alert.' };
        }
    },
    {
        id: 'TC-API-02',
        category: 'API & Validation',
        name: 'Username Limit (15 chars) Login',
        run: async () => {
            await resetApp();
            const doc = getIframeDoc();
            const input = doc.getElementById('username-input');
            const startBtn = doc.getElementById('start-btn');
            
            input.value = 'TestBot15CharsL';
            startBtn.click();
            await sleep(1000);
            
            const scene = getActiveScene();
            if (scene) {
                return { success: true, message: 'Game started with exactly 15 chars username.' };
            }
            return { success: false, message: 'Failed to login with 15 chars.' };
        }
    },
    // --- Physics & World Setup ---
    {
        id: 'TC-PH-01',
        category: 'Physics & World',
        name: 'Anti Auto-Elimination on Start',
        run: async () => {
            const scene = getActiveScene();
            if (!scene) return { success: false, message: 'Game not running.' };
            
            const initialScore = scene.score;
            await sleep(2000);
            const finalScore = scene.score;
            
            if (initialScore === 0 && finalScore === 0) {
                return { success: true, message: 'No automatic match消滅 or score additions occurred during idle state.' };
            }
            return { success: false, message: `Score automatically modified from ${initialScore} to ${finalScore}.` };
        }
    },
    // --- Scores & Chains ---
    {
        id: 'TC-SC-01',
        category: 'Scores & Chains',
        name: 'Below Minimum Chain (2-Chain)',
        run: async () => {
            const scene = getActiveScene();
            if (!scene) return { success: false, message: 'Game not running.' };
            
            const initialScore = scene.score;
            const targetGems = findValidChain(scene.gems, 2);
            if (!targetGems) return { success: false, message: 'Unable to find 2 adjacent gems.' };
            
            scene.handlePointerDown({ x: targetGems[0].x, y: targetGems[0].y });
            await sleep(100);
            scene.handlePointerMove({ x: targetGems[1].x, y: targetGems[1].y });
            await sleep(100);
            scene.handlePointerUp({ x: targetGems[1].x, y: targetGems[1].y });
            
            await sleep(500);
            const finalScore = scene.score;
            if (finalScore === initialScore) {
                return { success: true, message: `2-chain did not score. Score remains ${finalScore}.` };
            }
            return { success: false, message: `Expected score ${initialScore}, got ${finalScore}.` };
        }
    },
    {
        id: 'TC-SC-02',
        category: 'Scores & Chains',
        name: 'Minimum Boundary Chain (3-Chain)',
        run: async () => {
            const scene = getActiveScene();
            if (!scene) return { success: false, message: 'Game not running.' };
            
            const initialScore = scene.score;
            const targetGems = findValidChain(scene.gems, 3);
            if (!targetGems) return { success: false, message: 'Unable to find 3 adjacent gems.' };
            
            scene.handlePointerDown({ x: targetGems[0].x, y: targetGems[0].y });
            await sleep(100);
            scene.handlePointerMove({ x: targetGems[1].x, y: targetGems[1].y });
            await sleep(100);
            scene.handlePointerMove({ x: targetGems[2].x, y: targetGems[2].y });
            await sleep(100);
            scene.handlePointerUp({ x: targetGems[2].x, y: targetGems[2].y });
            
            await sleep(500);
            const finalScore = scene.score;
            if (finalScore === initialScore + 300) {
                return { success: true, message: `3-chain scored successfully: +300 points (Now: ${finalScore}).` };
            }
            return { success: false, message: `Expected +300 points, got +${finalScore - initialScore}.` };
        }
    },
    {
        id: 'TC-SC-03',
        category: 'Scores & Chains',
        name: 'Standard Chain (4-Chain)',
        run: async () => {
            const scene = getActiveScene();
            if (!scene) return { success: false, message: 'Game not running.' };
            
            const initialScore = scene.score;
            const targetGems = findValidChain(scene.gems, 4);
            if (!targetGems) return { success: false, message: 'Unable to find 4 adjacent gems.' };
            
            scene.handlePointerDown({ x: targetGems[0].x, y: targetGems[0].y });
            for (let i = 1; i < 4; i++) {
                await sleep(100);
                scene.handlePointerMove({ x: targetGems[i].x, y: targetGems[i].y });
            }
            await sleep(100);
            scene.handlePointerUp({ x: targetGems[3].x, y: targetGems[3].y });
            
            await sleep(500);
            const finalScore = scene.score;
            if (finalScore === initialScore + 440) {
                return { success: true, message: `4-chain scored successfully: +440 points (Now: ${finalScore}).` };
            }
            return { success: false, message: `Expected +440 points, got +${finalScore - initialScore}.` };
        }
    },
    {
        id: 'TC-SC-04',
        category: 'Scores & Chains',
        name: 'Long Chain (10-Chain)',
        run: async () => {
            const scene = getActiveScene();
            if (!scene) return { success: false, message: 'Game not running.' };
            
            // Generate clean linear layout of 10 static gems
            setupCustomGemsChain(scene, 10, 1, true);
            await sleep(500);
            
            const initialScore = scene.score;
            const targetGems = scene.gems;
            
            scene.handlePointerDown({ x: targetGems[0].x, y: targetGems[0].y });
            for (let i = 1; i < 10; i++) {
                await sleep(50);
                scene.handlePointerMove({ x: targetGems[i].x, y: targetGems[i].y });
            }
            await sleep(50);
            
            // Make them dynamic before pointerUp so Matter engine processes destruction correctly
            targetGems.forEach(g => g.setStatic(false));
            
            scene.handlePointerUp({ x: targetGems[9].x, y: targetGems[9].y });
            
            await sleep(600);
            const finalScore = scene.score;
            const expectedAdd = 1700; // 10 * 100 * (1 + 7*0.1) = 10 * 100 * 1.7 = 1700
            
            if (finalScore === initialScore + expectedAdd) {
                return { success: true, message: `10-chain scored successfully: +${expectedAdd} points (Now: ${finalScore}).` };
            }
            return { success: false, message: `Expected +${expectedAdd} points, got +${finalScore - initialScore}.` };
        }
    },
    {
        id: 'TC-SC-05',
        category: 'Scores & Chains',
        name: 'Traced Chain Rollback',
        run: async () => {
            const scene = getActiveScene();
            if (!scene) return { success: false, message: 'Game not running.' };
            
            setupCustomGemsChain(scene, 4, 2);
            await sleep(800);
            
            const initialScore = scene.score;
            const targetGems = scene.gems;
            
            // Drag 0 -> 1 -> 2 -> 3
            scene.handlePointerDown({ x: targetGems[0].x, y: targetGems[0].y });
            for (let i = 1; i < 4; i++) {
                await sleep(100);
                scene.handlePointerMove({ x: targetGems[i].x, y: targetGems[i].y });
            }
            
            // Rollback 3 -> 2 -> 1
            await sleep(100);
            scene.handlePointerMove({ x: targetGems[2].x, y: targetGems[2].y });
            await sleep(100);
            scene.handlePointerMove({ x: targetGems[1].x, y: targetGems[1].y });
            await sleep(100);
            scene.handlePointerUp({ x: targetGems[1].x, y: targetGems[1].y });
            
            await sleep(500);
            const finalScore = scene.score;
            if (finalScore === initialScore) {
                return { success: true, message: 'Rollback successfully cancelled elimination & score.' };
            }
            return { success: false, message: `Expected score to remain ${initialScore}, but it became ${finalScore}.` };
        }
    },
    {
        id: 'TC-SC-06',
        category: 'Scores & Chains',
        name: 'Non-Adjacent Object Connection Block',
        run: async () => {
            const scene = getActiveScene();
            if (!scene) return { success: false, message: 'Game not running.' };
            
            // Create 2 static gems explicitly separated by 300px
            scene.gems.forEach(g => { if (g && g.destroy) g.destroy(); });
            scene.gems = [];
            
            const r = scene.registry.get('typesConfig')[0].radius;
            const fallbackKey = scene.textures.exists('gem_img_1') ? 'gem_img_1' : 'gem_fallback_1';
            
            const g1 = scene.matter.add.image(200, 800, fallbackKey, null, { shape: 'circle' });
            g1.setDisplaySize(r * 2, r * 2).setStatic(true);
            g1.gemType = 1;
            g1.spawnTime = scene.time.now;
            g1.setInteractive();
            scene.gems.push(g1);
            
            const g2 = scene.matter.add.image(500, 800, fallbackKey, null, { shape: 'circle' });
            g2.setDisplaySize(r * 2, r * 2).setStatic(true);
            g2.gemType = 1;
            g2.spawnTime = scene.time.now;
            g2.setInteractive();
            scene.gems.push(g2);
            
            scene.handlePointerDown({ x: g1.x, y: g1.y });
            await sleep(100);
            scene.handlePointerMove({ x: g2.x, y: g2.y });
            await sleep(100);
            
            const selectedCount = scene.selectedGems.length;
            scene.handlePointerUp({ x: g2.x, y: g2.y });
            
            if (selectedCount === 1) {
                return { success: true, message: 'Successfully blocked non-adjacent connection.' };
            }
            return { success: false, message: `Adjacent check failed: connected distant gems (selected count: ${selectedCount}).` };
        }
    },
    // --- Pause & Lifecycle ---
    {
        id: 'TC-PZ-01',
        category: 'Pause & Lifecycle',
        name: 'Timer & Physics Freeze on Pause',
        run: async () => {
            const scene = getActiveScene();
            if (!scene) return { success: false, message: 'Game not running.' };
            
            const timeBefore = scene.timeLeft;
            scene.pauseGame();
            log('Paused game. Monitoring state...');
            await sleep(2500);
            
            const timeAfter = scene.timeLeft;
            const isPaused = scene.isPaused;
            
            scene.resumeGame();
            
            if (timeBefore === timeAfter && isPaused) {
                return { success: true, message: `Timer successfully frozen at ${timeBefore}s.` };
            }
            return { success: false, message: `Failed. Timer decreased: ${timeBefore} to ${timeAfter}, pause state: ${isPaused}.` };
        }
    },
    {
        id: 'TC-PZ-02',
        category: 'Pause & Lifecycle',
        name: 'Anti-Cheat Cover Overlay Mask',
        run: async () => {
            const scene = getActiveScene();
            if (!scene) return { success: false, message: 'Game not running.' };
            
            scene.pauseGame();
            await sleep(400); // Wait for fade-in animation to complete
            
            const doc = getIframeDoc();
            const win = iframe.contentWindow;
            const overlay = doc.getElementById('pause-screen');
            
            const hasClass = overlay.classList.contains('active');
            const style = win.getComputedStyle(overlay);
            const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
            
            scene.resumeGame();
            
            if (hasClass && isVisible) {
                return { success: true, message: 'Overlay screen cover is successfully active and blocking view.' };
            }
            return { success: false, message: `Overlay missing active state or invisible: active=${hasClass}, visible=${isVisible}, opacity=${style.opacity}` };
        }
    },
    {
        id: 'TC-PZ-03',
        category: 'Pause & Lifecycle',
        name: 'Reset Active Trace on Pause',
        run: async () => {
            const scene = getActiveScene();
            if (!scene) return { success: false, message: 'Game not running.' };
            
            // Set up a static chain to guarantee 3 adjacent gems
            setupCustomGemsChain(scene, 3, 1, true);
            await sleep(500);
            
            const targetGems = scene.gems;
            
            scene.handlePointerDown({ x: targetGems[0].x, y: targetGems[0].y });
            await sleep(100);
            scene.handlePointerMove({ x: targetGems[1].x, y: targetGems[1].y });
            await sleep(100);
            
            const dragGemsCount = scene.selectedGems.length;
            scene.pauseGame();
            
            const countAfterPause = scene.selectedGems.length;
            const isDrawingState = scene.isDrawing;
            
            scene.resumeGame();
            
            if (dragGemsCount > 0 && countAfterPause === 0 && !isDrawingState) {
                return { success: true, message: `Cleared active gems selection (${dragGemsCount} -> ${countAfterPause}) and reset drag status.` };
            }
            return { success: false, message: `Failed reset. Count: ${dragGemsCount} -> ${countAfterPause}, drawing status: ${isDrawingState}` };
        }
    },
    {
        id: 'TC-PZ-04',
        category: 'Pause & Lifecycle',
        name: 'Resume Timer & Physics',
        run: async () => {
            const scene = getActiveScene();
            if (!scene) return { success: false, message: 'Game not running.' };
            
            scene.pauseGame();
            await sleep(500);
            scene.resumeGame();
            
            const timeBefore = scene.timeLeft;
            await sleep(2000);
            const timeAfter = scene.timeLeft;
            
            if (timeAfter < timeBefore && !scene.isPaused) {
                return { success: true, message: `Timer decremented (${timeBefore}s -> ${timeAfter}s) and physics active.` };
            }
            return { success: false, message: `Resume failed: before=${timeBefore}, after=${timeAfter}, isPaused=${scene.isPaused}.` };
        }
    },
    // --- Refill & Physics Systems ---
    {
        id: 'TC-PH-02',
        category: 'Physics & World',
        name: 'Refill Timing (Batch Generation)',
        run: async () => {
            const scene = getActiveScene();
            if (!scene) return { success: false, message: 'Game not running.' };
            
            // Set up a static chain of 3 gems to ensure availability and no movement during drag
            setupCustomGemsChain(scene, 3, 1, true);
            await sleep(500);
            
            const initialCount = scene.gems.length;
            const targetGems = scene.gems;
            
            scene.handlePointerDown({ x: targetGems[0].x, y: targetGems[0].y });
            await sleep(50);
            scene.handlePointerMove({ x: targetGems[1].x, y: targetGems[1].y });
            await sleep(50);
            scene.handlePointerMove({ x: targetGems[2].x, y: targetGems[2].y });
            
            const countDuringDrag = scene.gems.length;
            
            // Make them dynamic before pointerUp so they can be processed and destroyed correctly
            targetGems.forEach(g => g.setStatic(false));
            
            scene.handlePointerUp({ x: targetGems[2].x, y: targetGems[2].y });
            
            await sleep(500); // wait for refill drop
            const countAfterRefill = scene.gems.length;
            
            if (countDuringDrag === initialCount && countAfterRefill === initialCount) {
                return { success: true, message: 'Refills successfully delayed until gesture complete.' };
            }
            return { success: false, message: `Premature refill or drop mismatch. Initial: ${initialCount}, during: ${countDuringDrag}, final: ${countAfterRefill}` };
        }
    },
    {
        id: 'TC-PH-03',
        category: 'Physics & World',
        name: 'Anti-Stacking Idle Force',
        run: async () => {
            const scene = getActiveScene();
            if (!scene) return { success: false, message: 'Game not running.' };
            
            const gem = scene.gems[0];
            if (!gem) return { success: false, message: 'No gems available in world.' };
            
            // Simulate static stacking state without modifying friction which blocks movement
            gem.spawnTime = scene.time.now - 4000; // set spawn older than 3s boundary
            
            scene.matter.body.setVelocity(gem.body, { x: 0, y: 0 });
            
            scene.checkStacking();
            await sleep(100);
            
            const speedX = Math.abs(gem.body.velocity.x);
            
            if (speedX > 0.0001) {
                return { success: true, message: `Successfully triggered idle anti-stack force. Speed X applied: ${speedX.toFixed(6)}` };
            }
            return { success: false, message: `Anti-stack force not applied. Velocity X remains ${gem.body.velocity.x}` };
        }
    },
    {
        id: 'TC-PH-04',
        category: 'Physics & World',
        name: 'Gems Dynamic Shuffle Feature',
        run: async () => {
            const scene = getActiveScene();
            if (!scene) return { success: false, message: 'Game not running.' };
            
            const activeGems = scene.gems.filter(gem => gem && gem.body);
            scene.shuffleGems();
            await sleep(50);
            
            const upwardGemsCount = activeGems.filter(gem => gem.body.velocity.y < -15).length;
            const ratio = upwardGemsCount / activeGems.length;
            
            if (ratio >= 0.8) {
                return { success: true, message: `Shuffle force applied. ${Math.round(ratio * 100)}% of gems flying upward.` };
            }
            return { success: false, message: `Low velocity: Only ${Math.round(ratio * 100)}% of gems propelled upward.` };
        }
    },
    // --- Backend API & Rankings ---
    {
        id: 'TC-API-05',
        category: 'Backend & API',
        name: 'Ranking Deduplication (New High)',
        run: async () => {
            const testUser = `BotUser_${Math.floor(Math.random() * 90000) + 10000}`;
            
            log(`Submitting 10,000 points for ${testUser}...`);
            await fetch('http://localhost:25563/api/score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: testUser, score: 10000 })
            });
            
            log(`Submitting new high score of 15,000 for ${testUser}...`);
            await fetch('http://localhost:25563/api/score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: testUser, score: 15000 })
            });
            
            const rankRes = await fetch('http://localhost:25563/api/ranking');
            const data = await rankRes.json();
            
            const userEntries = data.ranking.filter(r => r.username === testUser);
            if (userEntries.length === 1 && userEntries[0].score === 15000) {
                return { success: true, message: `Verified: Unique record stored with updated high score (15,000).` };
            }
            return { success: false, message: `Duplicate checking failed. Found records: ${userEntries.length}, high score: ${userEntries[0]?.score}` };
        }
    },
    {
        id: 'TC-API-06',
        category: 'Backend & API',
        name: 'Ranking Deduplication (Low Score)',
        run: async () => {
            const testUser = `BotUser_${Math.floor(Math.random() * 90000) + 10000}`;
            
            log(`Submitting 12,000 points for ${testUser}...`);
            await fetch('http://localhost:25563/api/score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: testUser, score: 12000 })
            });
            
            log(`Submitting lower score of 4,000 for ${testUser}...`);
            await fetch('http://localhost:25563/api/score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: testUser, score: 4000 })
            });
            
            const rankRes = await fetch('http://localhost:25563/api/ranking');
            const data = await rankRes.json();
            
            const userEntries = data.ranking.filter(r => r.username === testUser);
            if (userEntries.length === 1 && userEntries[0].score === 12000) {
                return { success: true, message: `Verified: Lower score ignored. Ranking retained 12,000.` };
            }
            return { success: false, message: `Lower score check failed. Found records: ${userEntries.length}, score: ${userEntries[0]?.score}` };
        }
    },
    {
        id: 'TC-API-07',
        category: 'Backend & API',
        name: 'FIFO Tie-Breaker Sorting',
        run: async () => {
            const tieScore = 8800;
            const userA = `TieA_${Math.floor(Math.random() * 90000) + 10000}`;
            const userB = `TieB_${Math.floor(Math.random() * 90000) + 10000}`;
            
            log(`First submit: ${userA} scores ${tieScore}...`);
            await fetch('http://localhost:25563/api/score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: userA, score: tieScore })
            });
            
            await sleep(200); // time buffer
            
            log(`Second submit: ${userB} scores ${tieScore}...`);
            await fetch('http://localhost:25563/api/score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: userB, score: tieScore })
            });
            
            const rankRes = await fetch('http://localhost:25563/api/ranking');
            const data = await rankRes.json();
            
            const idxA = data.ranking.findIndex(r => r.username === userA);
            const idxB = data.ranking.findIndex(r => r.username === userB);
            
            if (idxA !== -1 && idxB !== -1 && idxA < idxB) {
                return { success: true, message: `FIFO verified: Achiever A (rank ${idxA+1}) sorted ahead of Achiever B (rank ${idxB+1}).` };
            }
            return { success: false, message: `Sorting mismatch. Achiever A index: ${idxA}, Achiever B index: ${idxB}` };
        }
    },
    {
        id: 'TC-API-08',
        category: 'Backend & API',
        name: 'HTTP Timeout (5s) & Retry UI',
        run: async () => {
            const win = iframe.contentWindow;
            const doc = getIframeDoc();
            
            // Monkeypatch window fetch to inject artificial 5.5s delay to trigger timeout Abort
            const originalFetch = win.fetch;
            win.fetch = async (...args) => {
                if (args[0].includes('/api/score')) {
                    log('Score POST intercepted. Injecting 5.5 seconds delay...', 'warning');
                    await sleep(5500);
                }
                return originalFetch(...args);
            };
            
            log('Triggering artificial game end to submit score...');
            win.showResultScreen(2500);
            
            // Wait for timeout to fire (5s cutoff)
            await sleep(5300);
            
            const errorMsgEl = doc.getElementById('error-message');
            const retryBtnEl = doc.getElementById('retry-send-btn');
            
            const isErrorDisplayed = !errorMsgEl.classList.contains('hidden');
            const isRetryDisplayed = !retryBtnEl.classList.contains('hidden');
            
            // Revert Fetch monkeypatch
            win.fetch = originalFetch;
            
            // Clean up result screen, return back to title
            const backTitleBtn = doc.getElementById('back-title-btn');
            if (backTitleBtn) backTitleBtn.click();
            
            if (isErrorDisplayed && isRetryDisplayed && errorMsgEl.textContent.includes('timeout')) {
                return { success: true, message: 'Verified: 5s timeout aborted request. Timeout error text and Retry button displayed.' };
            }
            return { success: false, message: `Fail. UI status - Error text visible: ${isErrorDisplayed}, Retry btn visible: ${isRetryDisplayed}` };
        }
    },
    // --- Lifecycle Terminating ---
    {
        id: 'TC-PZ-05',
        category: 'Pause & Lifecycle',
        name: 'Timeup Interruption & Finish',
        run: async () => {
            // Restore session
            await resetApp();
            const doc = getIframeDoc();
            const input = doc.getElementById('username-input');
            const startBtn = doc.getElementById('start-btn');
            input.value = 'TimeupTester';
            startBtn.click();
            await sleep(1000);
            
            const scene = getActiveScene();
            if (!scene) return { success: false, message: 'Game failed to start.' };
            
            log('Force setting timeLeft to 1 second...');
            scene.timeLeft = 1;
            await sleep(2500); // Wait for transition with safety buffer
            
            const resultScreen = doc.getElementById('result-screen');
            const isResultActive = resultScreen.classList.contains('active');
            const isInputBlocked = !scene.input.enabled;
            
            if (isResultActive && isInputBlocked) {
                return { success: true, message: 'Verified: System successfully blocked input on timeup and transitioned to Result Screen.' };
            }
            return { success: false, message: `Transition failure. Result panel active: ${isResultActive}, Game input blocked: ${isInputBlocked}` };
        }
    }
];

// Dynamically generate the categories and test case list UI
function renderTestCases() {
    testContainer.innerHTML = '';
    
    // Group test cases by category
    const groups = {};
    testCases.forEach(tc => {
        if (!groups[tc.category]) groups[tc.category] = [];
        groups[tc.category].push(tc);
    });
    
    for (const [category, cases] of Object.entries(groups)) {
        const section = document.createElement('div');
        section.className = 'category-section';
        
        const title = document.createElement('div');
        title.className = 'category-title';
        title.innerHTML = `⚙️ ${category}`;
        section.appendChild(title);
        
        cases.forEach(tc => {
            const row = document.createElement('div');
            row.className = 'test-case-row';
            row.id = `row-${tc.id}`;
            
            const info = document.createElement('div');
            info.className = 'test-case-info';
            
            const meta = document.createElement('div');
            meta.className = 'test-case-meta';
            
            const idBadge = document.createElement('span');
            idBadge.className = 'test-case-id';
            idBadge.textContent = tc.id;
            
            const statusBadge = document.createElement('span');
            statusBadge.className = 'status-badge status-pending';
            statusBadge.id = `status-${tc.id}`;
            statusBadge.textContent = 'Pending';
            
            meta.appendChild(idBadge);
            meta.appendChild(statusBadge);
            
            const name = document.createElement('div');
            name.className = 'test-case-name';
            name.textContent = tc.name;
            
            info.appendChild(meta);
            info.appendChild(name);
            
            const actions = document.createElement('div');
            actions.className = 'test-case-actions';
            
            const runBtn = document.createElement('button');
            runBtn.className = 'btn-run-single';
            runBtn.textContent = 'Run';
            runBtn.addEventListener('click', () => runSingleTestCase(tc));
            
            actions.appendChild(runBtn);
            
            row.appendChild(info);
            row.appendChild(actions);
            section.appendChild(row);
        });
        
        testContainer.appendChild(section);
    }
}

// Set status UI for a test case
function setTestStatus(id, status, text = null) {
    const badge = document.getElementById(`status-${id}`);
    if (!badge) return;
    
    badge.className = `status-badge status-${status}`;
    badge.textContent = text || status;
}

// Run a single test case
async function runSingleTestCase(tc) {
    disableControls(true);
    setTestStatus(tc.id, 'running', 'Running');
    log(`Running single test: ${tc.id} - ${tc.name}...`, 'info');
    
    try {
        const result = await tc.run();
        if (result.success) {
            setTestStatus(tc.id, 'passed', 'Passed');
            log(`${tc.id} Passed: ${result.message}`, 'success');
        } else {
            setTestStatus(tc.id, 'failed', 'Failed');
            log(`${tc.id} Failed: ${result.message}`, 'error');
        }
    } catch (err) {
        setTestStatus(tc.id, 'failed', 'Error');
        log(`${tc.id} Exception: ${err.message}`, 'error');
        console.error(err);
    } finally {
        disableControls(false);
    }
}

// Run all test cases in logical sequence
async function runAllTests() {
    disableControls(true);
    log('=== Starting All Automated Black Box Tests ===', 'info');
    
    // Clear statuses back to pending
    testCases.forEach(tc => setTestStatus(tc.id, 'pending', 'Pending'));
    
    let passedCount = 0;
    
    for (const tc of testCases) {
        setTestStatus(tc.id, 'running', 'Running');
        log(`Executing ${tc.id} : ${tc.name}...`, 'info');
        
        try {
            const result = await tc.run();
            if (result.success) {
                setTestStatus(tc.id, 'passed', 'Passed');
                log(`Result: ${tc.id} Passed - ${result.message}`, 'success');
                passedCount++;
            } else {
                setTestStatus(tc.id, 'failed', 'Failed');
                log(`Result: ${tc.id} Failed - ${result.message}`, 'error');
            }
        } catch (err) {
            setTestStatus(tc.id, 'failed', 'Error');
            log(`Result: ${tc.id} Exception: ${err.message}`, 'error');
            console.error(err);
        }
        
        // Wait 1 second between cases for transition stability
        await sleep(1000);
    }
    
    log(`=== Test Run Finished: ${passedCount} / ${testCases.length} Passed ===`, passedCount === testCases.length ? 'success' : 'warning');
    disableControls(false);
}

// Page boot setup
document.getElementById('btn-run-all').addEventListener('click', runAllTests);
document.getElementById('btn-reset-app').addEventListener('click', resetApp);
document.getElementById('btn-clear-log').addEventListener('click', () => {
    logBox.innerHTML = '';
});

// Render list immediately on script load
renderTestCases();
log('Black Box Test Console Initialized.', 'info');
