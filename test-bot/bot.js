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
function simulatePointerEvent(type, x, y) {
    const doc = getIframeDoc();
    const canvas = doc.querySelector('canvas');
    if (!canvas) {
        log('Canvas not found!', 'error');
        return;
    }
    const rect = canvas.getBoundingClientRect();
    
    // Scale coordinates from game resolution (1080x1920) to actual iframe canvas display size
    const scaleX = rect.width / 1080;
    const scaleY = rect.height / 1920;
    
    const clientX = rect.left + (x * scaleX);
    const clientY = rect.top + (y * scaleY);
    
    const event = new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerType: 'mouse',
        clientX: clientX,
        clientY: clientY
    });
    canvas.dispatchEvent(event);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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

// Example implementation of TC-SC-02 (3-Chain)
// To fully implement Blackbox testing, the bot would ideally read the internal game state 
// to know EXACTLY where the gems are, OR use computer vision. 
// Since it's a DOM iframe, we can peek at the Phaser instance for precise testing.
document.getElementById('btn-test-tc-sc-02').addEventListener('click', async () => {
    log('Running TC-SC-02: 3-Chain Score Test...');
    const win = iframe.contentWindow;
    
    // Peek into Phaser state (Gray-box approach for reliability in testing)
    const game = win.gameInstance;
    if (!game) {
        log('Game instance not running!', 'error');
        return;
    }
    
    const scene = game.scene.getScene('GameScene');
    const initialScore = scene.score;
    log(`Initial Score: ${initialScore}`);
    
    // Find 3 gems of the same type close to each other
    let targetGems = [];
    for (let type = 1; type <= 5; type++) {
        const gemsOfType = scene.gems.filter(g => g.gemType === type);
        if (gemsOfType.length >= 3) {
            targetGems = gemsOfType.slice(0, 3); // Just grab 3, assuming they are close enough
            break;
        }
    }
    
    if (targetGems.length < 3) {
        log('Could not find 3 gems of the same type. Try restarting.', 'error');
        return;
    }
    
    log(`Found 3 gems. Attempting chain trace...`);
    
    // Simulate Drag
    simulatePointerEvent('pointerdown', targetGems[0].x, targetGems[0].y);
    await sleep(200);
    simulatePointerEvent('pointermove', targetGems[1].x, targetGems[1].y);
    await sleep(200);
    simulatePointerEvent('pointermove', targetGems[2].x, targetGems[2].y);
    await sleep(200);
    simulatePointerEvent('pointerup', targetGems[2].x, targetGems[2].y);
    
    await sleep(500); // Wait for score calculation
    
    const finalScore = scene.score;
    const expectedAdd = 300; // 3-chain is 300 points
    
    if (finalScore === initialScore + expectedAdd) {
        log(`TC-SC-02 Passed: Score increased by ${expectedAdd} (Now: ${finalScore})`, 'success');
    } else {
        log(`TC-SC-02 Failed: Expected +${expectedAdd}, got +${finalScore - initialScore}`, 'error');
    }
});

document.getElementById('btn-test-tc-pz-01').addEventListener('click', async () => {
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
});
