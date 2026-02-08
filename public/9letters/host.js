const socket = io('/9letters');

const createBtn = document.getElementById("createBtn");
const startBtn = document.getElementById("startBtn");
const codeEl = document.getElementById("code");
const playerCountEl = document.getElementById("playerCount");

const setupEl = document.getElementById("setup");
const gameEl = document.getElementById("game");
const endScreen = document.getElementById("endScreen");
const lettersEl = document.getElementById("letters");
const scoreEl = document.getElementById("score");
const timerEl = document.getElementById("timer");
const wordListEl = document.getElementById("wordList");
const finalClassScoreEl = document.getElementById("finalClassScore");
const playAgainBtn = document.getElementById("playAgainBtn");


let gameCode = null;
let endTime = null;
let timerInterval = null;

// =================
// CREATE GAME
// =================
function showQRCode(code) {
    // We point specifically to the 9letters subfolder and join.html
    const url = `${window.location.origin}/9letters/join.html?code=${code}`; 

    const qrContainer = document.getElementById("qrCode");
    qrContainer.innerHTML = ""; 

    new QRCode(qrContainer, {
        text: url,
        width: 260,
        height: 260,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });

    console.log("QR Code generated for:", url);
}



// =================
// SOCKET EVENTS
// =================
socket.emit("host-create");

// Combined and fixed "game-created"
socket.on("game-created", code => {
    gameCode = code;
    codeEl.textContent = code;
    startBtn.disabled = false;
    showQRCode(code); 
    // Removed the "qr.set" line as it was causing an error
});

socket.on("player-count", count => {
    playerCountEl.textContent = count;

    // Quick jiggle animation
    playerCountEl.style.transform = "scale(1.3)";
    setTimeout(() => {
        playerCountEl.style.transform = "scale(1)";
    }, 200);
});

socket.on("game-started", data => {
    setupEl.hidden = true;
    gameEl.hidden = false;
    endScreen.hidden = true;

    lettersEl.innerHTML = "";
    data.letters.forEach(letter => {
        const cell = document.createElement("div");
        cell.className = "letter-cell";
        cell.textContent = letter;
        lettersEl.appendChild(cell);
    });

    endTime = data.endTime;
    startTimer();
});

socket.on("class-score", score => {
    scoreEl.textContent = `Class score: ${score}`;

    // Trigger the pop animation
    scoreEl.classList.remove("score-bump"); // Reset if already there
    void scoreEl.offsetWidth;               // Magic trick to restart CSS animation
    scoreEl.classList.add("score-bump");
    
    // Remove the bump after the transition ends
    setTimeout(() => {
        scoreEl.classList.remove("score-bump");
    }, 200);
});

// -----------------
// GAME ENDED
// -----------------
socket.on("game-ended", data => {
    clearInterval(timerInterval);
    timerEl.textContent = "Time left: 0s";

    gameEl.hidden = true;
    endScreen.hidden = false;

    // Show the Play Again button
    playAgainBtn.style.display = "block";

    const foundListEl = document.getElementById("foundWordList");
    const allListEl = document.getElementById("allWordList");
    
    foundListEl.innerHTML = "";
    allListEl.innerHTML = "";

    // Helper function to render grouped lists
    const renderGrouped = (wordsArray, container, isAllWordsList) => {
    if (!wordsArray || wordsArray.length === 0) return;

    // 1. Group words by length
    const groups = {};
    wordsArray.forEach(word => {
        const len = word.length;
        if (!groups[len]) groups[len] = [];
        groups[len].push(word.toUpperCase());
    });

    // 2. Sort lengths in REVERSE (9, 8, 7...)
    Object.keys(groups)
        .sort((a, b) => b - a) // This is the magic flip!
        .forEach(len => {
            // Add a category header
            const header = document.createElement("div");
            header.className = "word-category-title";
            header.textContent = `${len} Letter Words`;
            container.appendChild(header);

            // Sort words alphabetically within the group
            groups[len].sort().forEach(word => {
                const li = document.createElement("li");
                li.textContent = word;
                
                if (isAllWordsList) {
                    const wasFound = data.words.some(w => w.toUpperCase() === word);
                    li.className = wasFound ? "word-found" : "word-missed";
                } else {
                    li.className = "word-found";
                }
                container.appendChild(li);
            });
        });
};

    renderGrouped(data.words, foundListEl, false);
    renderGrouped(data.allWords, allListEl, true);

    finalClassScoreEl.textContent = data.classScore;

});


// =================
// START GAME
// =================
startBtn.onclick = () => {
    startBtn.disabled = true; // prevent double-start
    socket.emit("start-game", { code: gameCode, duration: 90 });
};

// =================
// TIMER
// =================
function startTimer() {
    // Clear any existing interval first
    if (timerInterval) clearInterval(timerInterval);

    timerInterval = setInterval(() => {
        const remaining = Math.max(0, endTime - Date.now());
        
        // Calculate seconds and milliseconds
        const totalSeconds = remaining / 1000;
        const seconds = Math.floor(totalSeconds);
        // Get the first two digits of the remainder
        const ms = Math.floor((remaining % 1000) / 10); 

        // Format: "0s:00" (Padding milliseconds with a leading zero if needed)
        timerEl.textContent = `${seconds}.${ms.toString().padStart(2, '0')}s`;

        // Add excitement: Turn red and shake under 10 seconds
        if (seconds < 10) {
            timerEl.classList.add("low-time");
        } else {
            timerEl.classList.remove("low-time");
        }

        if (remaining <= 0) {
            clearInterval(timerInterval);
            timerEl.textContent = "0.00s";
            timerEl.classList.remove("low-time");
        }
    }, 50); // Fast interval for smooth milliseconds
}

playAgainBtn.onclick = () => {
    socket.emit("host-restart", { code: gameCode });
    playAgainBtn.style.display = "none";
    endScreen.hidden = true;
};

socket.on("game-restart", data => {
    playAgainBtn.style.display = "none";
    clearInterval(timerInterval);
    
    // Switch screens
    endScreen.hidden = true;
    gameEl.hidden = false;

    // Reset UI elements
    lettersEl.innerHTML = "";
    scoreEl.textContent = `Class score: 0`;
    finalClassScoreEl.textContent = "0";
    
    // Clear both result lists
    document.getElementById("foundWordList").innerHTML = "";
    document.getElementById("allWordList").innerHTML = "";

    // Render new letters
    data.letters.forEach(letter => {
        const cell = document.createElement("div");
        cell.className = "letter-cell";
        cell.textContent = letter;
        lettersEl.appendChild(cell);
    });

    // Reset timer
    endTime = data.endTime;
    startTimer();
});




