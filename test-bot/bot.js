const iframe = document.getElementById('game-iframe');
const logBox = document.getElementById('log-box');

function log(msg, type = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logBox.prepend(entry);
}

function getIframeDoc() {
    return iframe.contentDocument || iframe.contentWindow.document;
}

// Simulate Mouse/Touch Events on Canvas
function simulatePointerEvent(game, type, x, y) {
    const canvas = game.canvas;
    if (!canvas) {
        log('Canvas not found!', 'error');
        return;
    }
    const rect = canvas.getBoundingClientRect();
    
    // Account for CSS object-fit: contain
    const gameRatio = game.config.width / game.config.height;
    const rectRatio = rect.width / rect.height;
    
    let renderedWidth = rect.width;
    let renderedHeight = rect.height;
    let offsetX = 0;
    let offsetY = 0;
    
    if (rectRatio > gameRatio) {
        // Canvas DOM is wider than game aspect ratio -> pillarboxed (bars on left/right)
        renderedWidth = rect.height * gameRatio;
        offsetX = (rect.width - renderedWidth) / 2;
    } else {
        // Canvas DOM is taller than game aspect ratio -> letterboxed (bars on top/bottom)
        renderedHeight = rect.width / gameRatio;
        offsetY = (rect.height - renderedHeight) / 2;
    }
    
    const finalScaleX = renderedWidth / game.config.width;
    const finalScaleY = renderedHeight / game.config.height;
    
    const clientX = rect.left + offsetX + (x * finalScaleX);
    const clientY = rect.top + offsetY + (y * finalScaleY);
    
    const event = new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerType: 'mouse',
        clientX: clientX,
        clientY: clientY,
        button: type === 'pointerup' ? -1 : 0,
        buttons: type === 'pointerup' ? 0 : 1,
        pointerId: 1,
        isPrimary: true
    });
    canvas.dispatchEvent(event);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function disableButtons(disabled) {
    document.querySelectorAll('button').forEach(btn => btn.disabled = disabled);
}

document.getElementById('btn-login').addEventListener('click', async () => {
    log('Starting Auto Login...');
    const doc = getIframeDoc();
    const input = doc.getElementById('username-input');
    const startBtn = doc.getElementById('start-btn');
    
    if (input && startBtn) {
        input.value = 'TestBot';
        startBtn.click();
        log('Login successful. Waiting for gems to fall...', 'success');
    } else {
        log('Login elements not found. Are you on the title screen?', 'error');
    }
});

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

// TC-SC-02 (3-Chain)
document.getElementById('btn-test-tc-sc-02').addEventListener('click', async () => {
    disableButtons(true);
    try {
        log('Running TC-SC-02: 3-Chain Score Test...');
        const win = iframe.contentWindow;
        
        const game = win.gameInstance;
        if (!game) {
            log('Game instance not running!', 'error');
            return;
        }
        
        const scene = game.scene.getScene('GameScene');
        const initialScore = scene.score;
        log(`Initial Score: ${initialScore}`);
        
        // Find 3 validly connected gems
        const targetGems = findValidChain(scene.gems, 3);
        
        if (!targetGems) {
            log('Could not find 3 adjacent gems of the same type. Wait or retry.', 'error');
            return;
        }
        
        log(`Found 3 gems. Attempting chain trace...`);
        
        // Simulate Drag via direct game engine method calls (Gray-box testing)
        // This bypasses browser-specific DOM event scaling issues.
        scene.handlePointerDown({ x: targetGems[0].x, y: targetGems[0].y });
        await sleep(100);
        scene.handlePointerMove({ x: targetGems[1].x, y: targetGems[1].y });
        await sleep(100);
        scene.handlePointerMove({ x: targetGems[2].x, y: targetGems[2].y });
        await sleep(100);
        scene.handlePointerUp({ x: targetGems[2].x, y: targetGems[2].y });
        
        await sleep(500); // Wait for score calculation
        
        const finalScore = scene.score;
        const expectedAdd = 300; // 3-chain is 300 points
        
        if (finalScore === initialScore + expectedAdd) {
            log(`TC-SC-02 Passed: Score increased by ${expectedAdd} (Now: ${finalScore})`, 'success');
        } else {
            log(`TC-SC-02 Failed: Expected +${expectedAdd}, got +${finalScore - initialScore}`, 'error');
        }
    } finally {
        disableButtons(false);
    }
});

document.getElementById('btn-test-tc-pz-01').addEventListener('click', async () => {
    disableButtons(true);
    try {
        log('Running TC-PZ-01: Pause State Test...');
        const win = iframe.contentWindow;
        const game = win.gameInstance;
        if (!game) return log('Game not running!', 'error');
        const scene = game.scene.getScene('GameScene');
        
        const timeBefore = scene.timeLeft;
        scene.pauseGame();
        log('Game Paused. Waiting 3 seconds...');
        
        await sleep(3000);
        
        const timeAfter = scene.timeLeft;
        if (timeBefore === timeAfter && scene.isPaused) {
            log(`TC-PZ-01 Passed: Timer did not decrease (${timeBefore} === ${timeAfter})`, 'success');
        } else {
            log(`TC-PZ-01 Failed: Timer changed from ${timeBefore} to ${timeAfter}`, 'error');
        }
        
        scene.resumeGame();
        log('Game Resumed.');
    } finally {
        disableButtons(false);
    }
});

// TC-SC-01 (2-Chain Score Test)
document.getElementById('btn-test-tc-sc-01').addEventListener('click', async () => {
    disableButtons(true);
    try {
        log('Running TC-SC-01: 2-Chain Score Test...');
        const win = iframe.contentWindow;
        const game = win.gameInstance;
        if (!game) {
            log('Game instance not running!', 'error');
            return;
        }
        
        const scene = game.scene.getScene('GameScene');
        const initialScore = scene.score;
        log(`Initial Score: ${initialScore}`);
        
        // Find 2 validly connected gems
        const targetGems = findValidChain(scene.gems, 2);
        
        if (!targetGems) {
            log('Could not find 2 adjacent gems of the same type. Wait or retry.', 'error');
            return;
        }
        
        log(`Found 2 gems. Attempting chain trace...`);
        
        // Simulate Drag via direct game engine method calls
        scene.handlePointerDown({ x: targetGems[0].x, y: targetGems[0].y });
        await sleep(100);
        scene.handlePointerMove({ x: targetGems[1].x, y: targetGems[1].y });
        await sleep(100);
        scene.handlePointerUp({ x: targetGems[1].x, y: targetGems[1].y });
        
        await sleep(500); // Wait for potential score calculation
        
        const finalScore = scene.score;
        
        if (finalScore === initialScore) {
            log(`TC-SC-01 Passed: Score did not change (Still: ${finalScore})`, 'success');
        } else {
            log(`TC-SC-01 Failed: Expected score to remain ${initialScore}, but it became ${finalScore}`, 'error');
        }
    } finally {
        disableButtons(false);
    }
});

// TC-PZ-03 (Pause Cancel Test)
document.getElementById('btn-test-tc-pz-03').addEventListener('click', async () => {
    disableButtons(true);
    try {
        log('Running TC-PZ-03: Pause Interruption Test...');
        const win = iframe.contentWindow;
        const game = win.gameInstance;
        if (!game) {
            log('Game instance not running!', 'error');
            return;
        }
        
        const scene = game.scene.getScene('GameScene');
        
        // Find 3 validly connected gems
        const targetGems = findValidChain(scene.gems, 3);
        
        if (!targetGems) {
            log('Could not find 3 adjacent gems of the same type. Wait or retry.', 'error');
            return;
        }
        
        log(`Found 3 gems. Simulating partial drag (2 gems)...`);
        
        // Drag 2 gems
        scene.handlePointerDown({ x: targetGems[0].x, y: targetGems[0].y });
        await sleep(100);
        scene.handlePointerMove({ x: targetGems[1].x, y: targetGems[1].y });
        await sleep(100);
        
        const initialSelectedCount = scene.selectedGems.length;
        const initialDrawingState = scene.isDrawing;
        log(`Selected gems before pause: ${initialSelectedCount}, Drawing: ${initialDrawingState}`);
        
        // Trigger pause
        log('Pausing game during drag...');
        scene.pauseGame();
        
        const afterSelectedCount = scene.selectedGems.length;
        const afterDrawingState = scene.isDrawing;
        log(`Selected gems after pause: ${afterSelectedCount}, Drawing: ${afterDrawingState}`);
        
        // Resume game
        scene.resumeGame();
        log('Game Resumed.');
        
        if (initialSelectedCount > 0 && afterSelectedCount === 0 && !afterDrawingState) {
            log('TC-PZ-03 Passed: Selected gems were cleared and drawing state was reset on pause.', 'success');
        } else {
            log('TC-PZ-03 Failed: State was not correctly reset on pause.', 'error');
        }
    } finally {
        disableButtons(false);
    }
});

// TC-PH-04 (Shuffle Test)
document.getElementById('btn-test-tc-ph-04').addEventListener('click', async () => {
    disableButtons(true);
    try {
        log('Running TC-PH-04: Shuffle Test...');
        const win = iframe.contentWindow;
        const game = win.gameInstance;
        if (!game) {
            log('Game instance not running!', 'error');
            return;
        }
        
        const scene = game.scene.getScene('GameScene');
        if (scene.isPaused) {
            log('Game is paused! Please resume it first.', 'error');
            return;
        }
        
        // Record velocities before shuffle
        const activeGems = scene.gems.filter(gem => gem && gem.body);
        if (activeGems.length === 0) {
            log('No active gems found in the scene.', 'error');
            return;
        }
        
        log(`Recording velocities of ${activeGems.length} gems before shuffle...`);
        
        // Call shuffle function
        log('Triggering Shuffle...');
        scene.shuffleGems();
        
        // Wait a tiny bit for physics update to apply velocity
        await sleep(50);
        
        // Check if velocities changed significantly
        // The shuffle function applies vy = -(Math.random() * 30 + 20) (which is upward, negative)
        // and vx = (Math.random() - 0.5) * 40.
        // Let's check how many gems have velocity.y < -15.
        const upwardGemsCount = activeGems.filter(gem => gem.body.velocity.y < -15).length;
        
        log(`Found ${upwardGemsCount} / ${activeGems.length} gems with high upward velocity.`);
        
        // At least 80% of the gems should be flying up immediately
        const ratio = upwardGemsCount / activeGems.length;
        if (ratio >= 0.8) {
            log(`TC-PH-04 Passed: ${Math.round(ratio * 100)}% of gems are moving upward (Expected >= 80%).`, 'success');
        } else {
            log(`TC-PH-04 Failed: Only ${Math.round(ratio * 100)}% of gems are moving upward.`, 'error');
        }
    } finally {
        disableButtons(false);
    }
});
