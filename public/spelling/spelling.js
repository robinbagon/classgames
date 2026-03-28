const socket = io('/spelling');
let playerName = ""; 
let roomCode = "";
let isActive = true;

// TOP of spelling.js
window.addEventListener('DOMContentLoaded', () => {
    // 1. Check the URL for "?room=XXXX"
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room');

    // 2. If a room code exists in the URL, find the input and fill it
    if (roomFromUrl) {
        const roomInput = document.getElementById('room-code');
        document.getElementById('player-name').focus();
        if (roomInput) {
            roomInput.value = roomFromUrl.toUpperCase();
            
            // Optional: Visually indicate it's locked in
            roomInput.style.backgroundColor = "#f0fdf4"; // Light green tint
            roomInput.style.borderColor = "#22c55e";
        }
    }
});

function joinGame() {
    playerName = document.getElementById('player-name').value.trim();
    roomCode = document.getElementById('room-code').value.toUpperCase().trim();
    
    if(!playerName || !roomCode) return alert("Please enter both your name and the room code.");

    const joinBtn = document.getElementById('join-btn');
    if (joinBtn) {
        joinBtn.disabled = true;
        joinBtn.innerText = "JOINING...";
    }
    
    // Emitting the join request with a callback
    socket.emit('player-join', { roomCode, name: playerName }, (response) => {
        if (response && response.success) {
            console.log("Joined successfully!");
            showScreen('lobby-screen');
        } else {
            // Re-enable button if it fails
            if (joinBtn) {
                joinBtn.disabled = false;
                joinBtn.innerText = "JOIN";
            }
            alert(response ? response.message : "Room not found or game already started.");
        }
    });
}

function submitAnswer(btn) {
    const answer = btn.innerText;
    
    // Visual feedback
    document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');

    // CRITICAL: Ensure 'roomCode' matches the variable name 
    // you used in joinGame()
    console.log("Submitting to room:", roomCode, "Answer:", answer);
    
    socket.emit('submit-answer', { 
        roomCode: roomCode, 
        answer: answer 
    });
}

// 1. UNIVERSAL TIMER TICK
// The server sends a number (5, 4, 3...) and we just update the bar width
socket.on('timer-tick', (timeLeft) => {
    const timerFill = document.getElementById('timer-fill');
    const header = document.getElementById('question-header');
    
    if (header) {
        header.innerText = timeLeft > 0 ? `⏳ ${timeLeft}s` : "⌛ TIME'S UP!";
    }

    if (timerFill && timeLeft <= 2) {
        timerFill.style.background = "#e74c3c"; // Turn red for the final stretch
    }
});

let localTimer; 

socket.on('new-question', (data) => {
    showScreen('game-screen');
    const container = document.getElementById('options-container');
    const feedback = document.getElementById('feedback-area');
    const timerDisplay = document.getElementById('timer-display');
    const timerFill = document.getElementById('timer-fill'); // The progress bar
    
    container.innerHTML = '';
    feedback.innerText = ''; 

    // 1. RESET TIMER VISUALS IMMEDIATELY
    if (localTimer) clearInterval(localTimer);
    
    if (timerFill) {
        timerFill.style.transition = 'none'; // Snap back to full
        timerFill.style.width = '100%';
        timerFill.style.backgroundColor = '#f1c40f'; // Reset to yellow
        timerFill.offsetHeight; // Force browser to acknowledge the reset
        
        // Start the smooth 8-second slide to 0
        timerFill.style.transition = `width ${data.timer}s linear`;
        timerFill.style.width = '0%';
    }

    // 2. START NUMERICAL COUNTDOWN (Slightly aggressive to beat the server)
    let timeLeft = data.timer - 1; 
    if (timerDisplay) {
        timerDisplay.innerText = Math.max(timeLeft, 0);
        timerDisplay.style.color = "inherit";
    }

    localTimer = setInterval(() => {
        timeLeft--;
        
        if (timerDisplay) {
            timerDisplay.innerText = Math.max(timeLeft, 0);
            if (timeLeft <= 3) {
                timerDisplay.style.color = "#ef4444";
                if (timerFill) timerFill.style.backgroundColor = "#ef4444";
            }
        }

        if (timeLeft <= 0) {
            clearInterval(localTimer);
            // LOCKOUT: Stop them from clicking late
            document.querySelectorAll('.option-btn').forEach(btn => {
                btn.disabled = true;
                btn.style.opacity = "0.5";
            });
            if (feedback) feedback.innerText = "Locked In!";
        }
    }, 1000);
    // ------------------------------

    // Create buttons as usual
    data.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerText = opt;
        
        btn.onclick = () => {
            // Check if time has already run out locally
            if (timeLeft <= 0) return;

            document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            
            // Use 'time' instead of 'timestamp' to match your server-side logic
            socket.emit('submit-answer', { 
                roomCode, 
                answer: opt, 
                time: Date.now() 
            });
        };
        container.appendChild(btn);
    });
});

socket.on('round-results', (data) => {
    const selected = document.querySelector('.option-btn.selected');
    const wasCorrect = selected && selected.innerText === data.correct;
    const statusBar = document.getElementById('player-status-bar');
    const statusText = document.getElementById('status-text');
    const gameScreen = document.getElementById('game-screen');

    // 1. If they were wrong (or didn't answer), they are now out
    if (!wasCorrect && isActive) {
        isActive = false;
        if (statusBar) {
            statusBar.className = "status-bar eliminated-state";
            statusText.innerText = "GHOST MODE - HONE YOUR SKILLS!";
        }
        
    }

    // 2. Show feedback text
    const feedback = document.getElementById('feedback-area');
    if (feedback) {
        feedback.innerText = wasCorrect ? "✨ Correct!" : `❌ Wrong! It was: ${data.correct}`;
        feedback.style.color = wasCorrect ? "#27ae60" : "#e74c3c";
    }
});

socket.on('reset-client', () => {
    // 1. Reset logic variables
    isActive = true;
    isEliminated = false; // Reset the elimination flag

    // 2. Reset the Top Status Bar (The horizontal indicator)
    const statusBar = document.getElementById('player-status-bar');
    const statusText = document.getElementById('status-text');
    const gameScreen = document.getElementById('game-screen');

    if (statusBar) {
        statusBar.className = "status-bar active-state"; // Back to Green
        statusText.innerText = "YOU ARE COMPETING";
    }
    
    // Remove the dimmed/lockout effect from the game screen
    if (gameScreen) gameScreen.classList.remove('player-out');

    // 3. IMPORTANT: Clear the Winner/Trophy UI
    const winBox = document.getElementById('winner-celebration');
    const lossBox = document.getElementById('normal-game-over');
    
    if (winBox) winBox.classList.add('hidden');
    if (lossBox) lossBox.classList.remove('hidden'); // Reset for next game-over

    // 4. Clear old gameplay data
    const feedback = document.getElementById('feedback-area');
    if (feedback) feedback.innerText = "";
    
    const container = document.getElementById('options-container');
    if (container) container.innerHTML = ""; 

    // 5. Send them back to the Lobby
    showScreen('lobby-screen');
});

socket.on('game-over', (data) => {
    showScreen('game-over-screen');
    
    const winBox = document.getElementById('winner-celebration');
    const lossBox = document.getElementById('normal-game-over');
    const winnerAnnounce = document.getElementById('winner-announcement');

    // 'playerName' should be the variable where you stored the user's name at join
    if (data.winner === playerName) {
        winBox.classList.remove('hidden');
        lossBox.classList.add('hidden');
        
        // Haptic feedback (vibration) for the win!
        if (navigator.vibrate) {
            navigator.vibrate([100, 50, 100, 50, 300]);
        }
    } else {
        winBox.classList.add('hidden');
        lossBox.classList.remove('hidden');
        winnerAnnounce.innerText = `${data.winner} is the winner!`;
    }
});

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

