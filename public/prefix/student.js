const socket = io('/prefix');

let personalCount = 0;
let sortableInstance;
let puzzleLibrary = [];
let currentWordObj = null;
let userRoomCode = "";
let score = 0;
let solvedWordsList = [];
let gameTotalTime = 90;

window.onload = () => {
    // 1. Grab the parameters from the URL
    const urlParams = new URLSearchParams(window.location.search);
    const codeFromURL = urlParams.get('code'); // Looks for 'code' in the link

    // 2. If a code exists, find the input field and fill it
    if (codeFromURL) {
        const joinInput = document.getElementById('join-code-input'); // Make sure this ID matches your HTML!
        if (joinInput) {
            joinInput.value = codeFromURL.toUpperCase();
            
            // 3. OPTIONAL: Automatically trigger the join button if you want
            // const joinButton = document.getElementById('join-btn');
            // if (joinButton) joinButton.click();
        }
    }
};

window.onload = async () => {
    await initGame();

    const urlParams = new URLSearchParams(window.location.search);
    const codeFromURL = urlParams.get('code');

    if (codeFromURL) {
        const inputField = document.getElementById('join-code-input');
        if (inputField) {
            inputField.value = codeFromURL.toUpperCase();
        }
    }
};

async function initGame() {
    try {
        const response = await fetch('puzzles.json');
        if (!response.ok) throw new Error("JSON file not found");

        puzzleLibrary = await response.json();
    } catch (err) {
        console.error("Critical Error: Could not load puzzles.json", err);
    }
}

function attemptJoin() {
    const input = document.getElementById('join-code-input');
    userRoomCode = input.value.toUpperCase();

    if (userRoomCode.length === 4) {
        socket.emit('joinRoom', userRoomCode);

        document.querySelector('.input-group').classList.add('hidden');
        document.getElementById('waiting-message').classList.remove('hidden');

        const roomDisp = document.getElementById('room-display');
        if (roomDisp) {
            roomDisp.textContent = `Room: ${userRoomCode}`;
        }
    } else {
        alert("Please enter a valid 4-letter code.");
    }
}

socket.on('beginGame', () => {
    forceStartGame();
});

function initSortable() {
    const el = document.getElementById('root-tiles');
    if (!el) return;

    if (sortableInstance) {
        sortableInstance.destroy();
    }

    sortableInstance = Sortable.create(el, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        
        // MOBILE OPTIMIZATION
        delay: 0,             // How long to press before dragging starts (0 is instant)
        delayOnTouchOnly: true,
        touchStartThreshold: 3, // How many pixels the finger moves before dragging starts
        
        onEnd: () => {
            checkSolution();
        }
    });
}

function loadNextPuzzle() {
    if (puzzleLibrary.length === 0) return;

    currentWordObj = puzzleLibrary[Math.floor(Math.random() * puzzleLibrary.length)];

    const prefixEl = document.getElementById('static-prefix');
    if (prefixEl) {
        prefixEl.textContent = currentWordObj.prefix;
    }

    const rootContainer = document.getElementById('root-tiles');
    if (!rootContainer) return;

    rootContainer.innerHTML = ''; // This destroys the old tiles

    const scrambledRoot = scrambleString(currentWordObj.root);
    scrambledRoot.split('').forEach(char => {
        const tile = document.createElement('div');
        tile.classList.add('tile');
        tile.textContent = char;
        rootContainer.appendChild(tile);
    });

    // CRITICAL: Re-initialize sortable so the NEW tiles are draggable
    initSortable(); 
}

function checkSolution() {
    const tiles = document.querySelectorAll('.tile');
    const userString = Array.from(tiles)
        .map(t => t.textContent)
        .join('');

    if (userString === currentWordObj.root) {
        handleSuccess();
    }
}

function handleSuccess() {
    if (navigator.vibrate) navigator.vibrate(50);

    // Calculate points based on the L^2 rule
    const rootLength = currentWordObj.root.length;
    const pointsEarned = rootLength * rootLength;

    // 1. Send data to Host
    socket.emit('submitWord', {
        roomCode: userRoomCode,
        prefix: currentWordObj.prefix,
        root: currentWordObj.root,
        points: pointsEarned
    });

    // 2. Update Local Stats
    score += pointsEarned;
    personalCount += 1;
    solvedWordsList.push(`${currentWordObj.prefix}${currentWordObj.root}`);

    // 3. Update the Tally with the "Bump" Animation
    const tally = document.getElementById('personal-tally');
    if (tally) {
        tally.textContent = score; // Just the number for the capsule look
        tally.classList.remove('score-bump');
        void tally.offsetWidth; // Trigger reflow to restart animation
        tally.classList.add('score-bump');
    }
    
    // 4. Visual Feedback (Floating +Points)
    const flash = document.getElementById('success-flash');
    if (flash) {
        flash.classList.remove('reveal-mode'); // Clear any skip styling
        flash.style.color = "";
        flash.textContent = `+${pointsEarned}`;
        flash.classList.remove('hidden', 'float-up');
        void flash.offsetWidth; // Trigger reflow
        flash.classList.add('float-up');
    }

    // 5. Cleanup and Next Puzzle
    setTimeout(() => {
        if (flash) flash.classList.add('hidden');
        loadNextPuzzle();
    }, 600);
}

function scrambleString(str) {
    let arr = str.split('');

    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }

    const scrambled = arr.join('');

    return (scrambled === str && str.length > 1)
        ? scrambleString(str)
        : scrambled;
}

socket.on('broadcastTimer', (data) => {
    // 1. Update the bar and colors
    updateTimerUI(data.timeRemaining, gameTotalTime);

    // 2. LATECOMER SAFETY NET
    const lobby = document.getElementById('lobby-screen');
    if (data.timeRemaining > 0 && lobby && !lobby.classList.contains('hidden')) {
        forceStartGame();
    }
});

// Listen for the end signal from the host/server
socket.on('endGame', () => {
    // 1. Hide the game area
    document.querySelector('.game-area').style.display = 'none';
    
    // 2. Stop any further tile dragging
    if(sortableInstance) sortableInstance.option("disabled", true);

    // 3. Show the results screen
    const results = document.getElementById('results-screen');
    results.classList.remove('hidden');

    // 4. Fill in the final stats
    document.getElementById('final-score-display').textContent = score;
    document.getElementById('final-words-display').textContent = personalCount;

    // 5. Optional: Add a little celebration haptic
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

    const listContainer = document.getElementById('words-found-list');
    if (listContainer) {
    listContainer.innerHTML = ''; // Clear existing
    solvedWordsList.forEach(word => {
        const chip = document.createElement('span');
        chip.textContent = word;
        listContainer.appendChild(chip);
    });
}
});

function skipWord() {
    if (!currentWordObj) return;

    // 1. Calculate penalty & Update Tally
    const penalty = 5;
    score = Math.max(0, score - penalty);
    
    const tally = document.getElementById('personal-tally');
    if (tally) {
        tally.textContent = score;
        tally.classList.remove('score-shake');
        void tally.offsetWidth; 
        tally.classList.add('score-shake');
    }

    // 2. Show the "Reveal" Overlay
    const flash = document.getElementById('success-flash');
    if (flash) {
        const fullSolution = currentWordObj.prefix + currentWordObj.root;
        
        // Switch from "float" to "reveal" mode
        flash.classList.remove('float-up', 'hidden');
        flash.classList.add('reveal-mode');
        
        flash.innerHTML = `
            <span>THE SOLUTION WAS:</span>
            <div style="font-family: 'Courier New', monospace; letter-spacing: 4px;">
                ${currentWordObj.prefix.toUpperCase()}${currentWordObj.root.toUpperCase()}
            </div>
        `;
    }

    // 3. Notify server
    socket.emit('wordSkipped', {
        roomCode: userRoomCode,
        fullWord: currentWordObj.prefix + currentWordObj.root
    });

    // 4. Pause the game for 2 seconds so they can learn the word
    setTimeout(() => {
        if (flash) {
            flash.classList.add('hidden');
            flash.classList.remove('reveal-mode');
        }
        loadNextPuzzle();
    }, 2000); // 2 seconds of visibility
}

socket.on('resetClient', () => {
    // 1. Reset personal stats
    score = 0;
    personalCount = 0;
    solvedWordsList = [];

    // 2. Reset UI
    document.getElementById('personal-tally').textContent = "Points: 0";
    document.getElementById('results-screen').classList.add('hidden');
    document.querySelector('.game-area').style.display = 'block';

    // 3. Load a fresh word so they aren't looking at the last one
    loadNextPuzzle();
});

socket.on('gameAlreadyInProgress', () => {
    console.log("Mid-game join detected.");
    forceStartGame();
});

socket.on('beginGame', () => {
    forceStartGame(); // Hides the lobby
    loadNextPuzzle(); // Creates the new tiles AND calls initSortable()
});



// HELPER FUNCTION: Transitions from Lobby/Results to Active Game
function forceStartGame() {
    const lobby = document.getElementById('lobby-screen');
    const results = document.getElementById('results-screen');
    const gameArea = document.querySelector('.game-area');

    if (lobby) lobby.classList.add('hidden'); // Use class instead of style
    if (results) results.classList.add('hidden');
    if (gameArea) gameArea.style.display = 'block';

    // Only load if a word isn't already active 
    if (!currentWordObj) {
        loadNextPuzzle();
        initSortable(); // Ensure tiles can be dragged
    }
}

function updateTimerUI(secondsRemaining, totalTime) {
    const timerBar = document.getElementById('timer-bar');
    const timerText = document.getElementById('game-timer');
    if (!timerBar) return;

    // Ensure we don't divide by zero or go negative
    const safeTotal = totalTime || 90; 
    const percentage = Math.max(0, (secondsRemaining / safeTotal) * 100);
    
    // Update width - the CSS transition handles the smoothness
    timerBar.style.width = `${percentage}%`;
    
    // Logic for color shifts
    timerBar.classList.toggle('critical', percentage <= 20);
    timerBar.classList.toggle('warning', percentage <= 50 && percentage > 20);

    // Update Text (format as M:SS)
    if (timerText) {
        const mins = Math.floor(secondsRemaining / 60);
        const secs = secondsRemaining % 60;
        timerText.textContent = `Time: ${mins}:${secs.toString().padStart(2, '0')}`;
    }
}



