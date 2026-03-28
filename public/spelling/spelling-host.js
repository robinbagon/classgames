const socket = io('/spelling');
let roomCode = ""; // We will set this once the server responds

// 1. INITIALIZATION: Get the room code from the server
// This replaces the "Uncaught ReferenceError: data is not defined"
socket.on('init-host', (data) => {
    roomCode = data.roomCode;
    
    // Update the UI with the real code from the server
    const codeElement = document.getElementById('code');
    if (codeElement) codeElement.innerText = roomCode;

    // Generate the QR code for students to scan
    generateQRCode(roomCode);
});

// If your server doesn't use 'init-host', we'll create the code manually:
if (!roomCode) {
    roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    socket.emit('host-create', roomCode);
    
    // Wait for the DOM to be ready, then update UI
    window.addEventListener('DOMContentLoaded', () => {
        document.getElementById('code').innerText = roomCode;
        generateQRCode(roomCode);
    });
}

// 2. PLAYER UPDATES: Horizontal top bar
socket.on('update-players', (players) => {
    const list = document.getElementById('player-list');
    if (!list) return;

    list.innerHTML = '';

    players.forEach(p => {
        const div = document.createElement('div');
        
        // Logic: If they are out, add the 'out' class and the ghost emoji
        if (!p.active) {
            div.className = 'player-pill out';
            div.innerText = `👻 ${p.name}`;
        } else {
            div.className = 'player-pill';
            div.innerText = p.name;
        }
        
        list.appendChild(div);
    });
});

// 3. GAME FLOW ACTIONS
function startGame() {
    const startBtn = document.getElementById('start-btn');
    if (startBtn) startBtn.classList.add('hidden');
    socket.emit('start-game', roomCode);
}

function requestRestart() {
    document.getElementById('winner-screen').classList.add('hidden');
    socket.emit('host-restart', roomCode);
}

// 4. QUESTION & VOTING LOGIC
socket.on('new-question', (data) => {
    document.getElementById('question-header').innerText = "ROUND STARTING...";
    document.getElementById('graph-zone').classList.remove('hidden');
    
    // Reset bars and update labels with shuffled options
    for(let i=0; i<3; i++) {
        const label = document.getElementById(`label-${i}`);
        const bar = document.getElementById(`bar-${i}`);
        if(label) label.innerText = data.options[i] || "";
        if(bar) bar.style.height = "5%"; // Start with a small visible "nub"
    }
});

socket.on('live-votes', (counts) => {
    const total = counts.reduce((a, b) => a + b, 0);
    counts.forEach((count, i) => {
        const bar = document.getElementById(`bar-${i}`);
        if (bar) {
            const percentage = total > 0 ? (count / total) * 100 : 0;
            // Smoothly animate the height, minimum 5% for visibility
            bar.style.height = Math.max(percentage, 5) + "%"; 
        }
    });
});

socket.on('timer-tick', (timeLeft) => {
    const header = document.getElementById('question-header');
    if (header) {
        header.innerText = timeLeft > 0 ? `VOTING: ${timeLeft}s` : "TIME'S UP!";
    }
});

socket.on('round-results', (data) => {
    document.getElementById('question-header').innerText = `CORRECT WORD: ${data.correct}`;
});

socket.on('game-over', (data) => {
    const screen = document.getElementById('winner-screen');
    if (screen) {
        screen.classList.remove('hidden');
        document.getElementById('winner-name').innerText = data.winner;
    }
});

// 5. QR CODE GENERATOR
function generateQRCode(code) {
    const qrContainer = document.getElementById("qrcode");
    if (!qrContainer) return;

    qrContainer.innerHTML = "";
    const joinURL = `${window.location.origin}/spelling/index.html?room=${code}`;

    new QRCode(qrContainer, {
        text: joinURL,
        width: 230,
        height: 230,
        colorDark: "#333333",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });
}