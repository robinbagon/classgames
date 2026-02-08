let classSolvedWords = [];

// 1. Initialize Socket.io
const socket = io('/prefix'); 

// 2. Define the missing function first
function generateJoinCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No confusing 1, I, 0, or O
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// 3. Now it is safe to generate the code and join the room
const myRoomCode = generateJoinCode();
document.getElementById('room-code-display').innerText = myRoomCode;

// Tell the server we are the host
socket.emit('joinRoom', myRoomCode);

// 4. Update the UI with the Join URL (using current site origin)
const hostURL = window.location.origin;
document.getElementById('host-url-display').innerText = hostURL.replace('https://', '').replace('http://', '');

// 1. Detect the current folder (9letters or prefix) automatically
const currentPath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/'));

// 2. Build the URL dynamically
// window.location.origin will be 'http://localhost:3000' or 'https://classgames.onrender.com'
const joinURL = `${window.location.origin}${currentPath}/join.html?code=${myRoomCode}`;

// 3. Generate the QR Code using the external API
const qrSource = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(joinURL)}`;

// 4. Update the image on your page
const qrElement = document.getElementById('qr-code');
if (qrElement) {
    qrElement.src = qrSource;
}

// --- GAME LOGIC ---

let classScore = 0;
let timeRemaining = 90;
let timerInterval;

let startTime;
let gameDuration = 90 * 1000; // 90 seconds in milliseconds

function startGame() {
    // 1. Safety: Clear any existing timer
    if (timerInterval) clearInterval(timerInterval);

    // 2. Reset and Setup Time
    timeRemaining = 90; 
    const gameDurationMs = timeRemaining * 1000;
    const now = Date.now();
    const endTime = now + gameDurationMs;

    // 3. UI Cleanup
    document.getElementById('start-btn').classList.add('hidden');
    document.getElementById('summary-screen').classList.add('hidden'); // Hide summary if coming from a reset
    document.getElementById('word-stream').innerHTML = ""; // Clear the waterfall for the new round
    
    // 4. Network: Tell server and students to start
    socket.emit('startTimer', myRoomCode);
    
    updateTimerDisplay();

    // 5. Start Interval
    timerInterval = setInterval(() => {
        const currentTime = Date.now();
        const remainingMs = endTime - currentTime;
        timeRemaining = Math.max(0, Math.ceil(remainingMs / 1000));
        
        updateTimerDisplay();
        
        socket.emit('broadcastTimer', { 
            roomCode: myRoomCode, 
            timeRemaining: timeRemaining 
        });

        if (timeRemaining <= 0) {
            clearInterval(timerInterval);
            endGame();
        }
    }, 1000);
}

function updateTimerDisplay() {
    let mins = Math.floor(timeRemaining / 60);
    let secs = timeRemaining % 60;
    document.getElementById('timer').textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Listen for words from students
socket.on('wordAddedToWaterfall', (data) => {
    classScore += data.points;
    document.getElementById('class-score').textContent = classScore;

    // Save for the final summary list
    classSolvedWords.push({
        prefix: data.prefix,
        root: data.root
    });

    const stream = document.getElementById('word-stream');
    const li = document.createElement('li');
    
    li.innerHTML = `
        <div class="waterfall-word">
            <span class="pfx">${data.prefix}</span><span class="rt">${data.root}</span>
        </div>
    `;
    
    stream.prepend(li);

    // Keep the waterfall from getting too long
    if (stream.children.length > 15) stream.removeChild(stream.lastChild);
});

function endGame() {
    clearInterval(timerInterval);
    
    // 1. Notify Server
    socket.emit('gameFinished', myRoomCode);

    // 2. Show UI
    const summary = document.getElementById('summary-screen');
    summary.classList.remove('hidden');
    document.getElementById('final-word-count').textContent = classScore;

    const classListContainer = document.getElementById('class-word-log');
    if (!classListContainer) return;

    // 3. Group words by prefix 
    // (Assumes classSolvedWords is an array of objects: {prefix: "un", root: "happy"})
    const groups = classSolvedWords.reduce((acc, wordObj) => {
        const pfx = wordObj.prefix.toUpperCase();
        if (!acc[pfx]) acc[pfx] = new Set(); // Use Set to auto-handle duplicates
        acc[pfx].add(wordObj.root.toUpperCase());
        return acc;
    }, {});

    // 4. Build the HTML
    classListContainer.innerHTML = ''; // Clear the old list

    Object.keys(groups).sort().forEach(pfx => {
        const groupWrapper = document.createElement('div');
        groupWrapper.className = 'prefix-group';

        const rootsArray = Array.from(groups[pfx]);
        const wordsHTML = rootsArray.map(root => `
            <div class="analyzed-word">
                <span class="word-pfx">${pfx}</span><span class="word-root">${root}</span>
            </div>
        `).join('');

        groupWrapper.innerHTML = `
            <span class="prefix-header">${pfx}</span>
            <div class="word-list">
                ${wordsHTML}
            </div>
        `;
        
        classListContainer.appendChild(groupWrapper);
    });
}

function resetGame() {
    // 1. Clear the interval first thing!
    if (timerInterval) clearInterval(timerInterval);

    // 2. Reset Host variables
    classScore = 0;
    timeRemaining = 90;
    classSolvedWords = [];

    // 3. Update Host UI
    document.getElementById('class-score').textContent = "0";
    document.getElementById('timer').textContent = "01:30";
    document.getElementById('word-stream').innerHTML = ""; 
    document.getElementById('summary-screen').classList.add('hidden');
    document.getElementById('start-btn').classList.remove('hidden');
    document.getElementById('class-word-log').innerHTML = ""; // Clear the summary grid
    document.getElementById('start-btn').classList.remove('hidden');

    // 4. Tell all students to reset their screens
    socket.emit('requestReset', myRoomCode);
}

function playAgain() {
    // 1. Reset all data (Score, arrays, etc.)
    classScore = 0;
    classSolvedWords = [];
    document.getElementById('class-score').textContent = "0";
    document.getElementById('class-word-log').innerHTML = "";
    
    // 2. Clear the UI from the previous game
    document.getElementById('summary-screen').classList.add('hidden');
    
    // 3. Trigger the actual start logic
    // This handles the timer, hides the button, and emits 'startTimer' to students
    startGame(); 
}

function handleFullRestart() {
    // 1. Data Reset (The stuff from resetGame)
    classScore = 0;
    classSolvedWords = [];
    document.getElementById('class-score').textContent = "0";
    document.getElementById('class-word-log').innerHTML = "";

    // 2. UI Reset (The stuff from startGame)
    document.getElementById('summary-screen').classList.add('hidden');
    document.getElementById('start-btn').classList.add('hidden');
    document.getElementById('word-stream').innerHTML = ""; 

    // 3. Network Ignition
    // This sends the signal that the student side uses to hide the lobby and init tiles
    socket.emit('startTimer', myRoomCode); 
    socket.emit('beginGame', myRoomCode);       

    // 4. Local Timer Ignition
    // Calling your existing startGame function here ensures the timer runs
    startGame(); 
}