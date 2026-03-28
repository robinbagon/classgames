const socket = io('/spelling');
let playerName = ""; 
let roomCode = "";
let isActive = true;

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
    if (timerFill) {
        const totalTime = 8; // Matches the server's starting time
        const width = (timeLeft / totalTime) * 100;
        timerFill.style.width = width + "%";
        
        // Visual warning: turn the bar red when 2 seconds remain
        timerFill.style.background = timeLeft <= 2 ? "#e74c3c" : "#f1c40f";
    }
});

socket.on('new-question', (data) => {
    showScreen('game-screen');
    const container = document.getElementById('options-container');
    const feedback = document.getElementById('feedback-area');
    
    container.innerHTML = '';
    feedback.innerText = ''; // Clear feedback from last round
    
    // Create buttons
    data.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerText = opt;
        btn.onclick = () => {
            // Only allow selection if the round is still active
            document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            
            socket.emit('submit-answer', { 
                roomCode, 
                answer: opt, 
                timestamp: Date.now() 
            });
        };
        container.appendChild(btn);
    });

    // NOTICE: We removed the setInterval from here. 
    // The bar is now controlled entirely by the 'timer-tick' event above.
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

