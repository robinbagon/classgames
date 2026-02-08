const socket = io('/9letters');

// -----------------
// DOM ELEMENTS
// -----------------
const joinScreen = document.getElementById("joinScreen");
const gameScreen = document.getElementById("gameScreen");

const codeInput = document.getElementById("codeInput");
const nameInput = document.getElementById("nameInput");
const joinBtn = document.getElementById("joinBtn");
const joinError = document.getElementById("joinError");
const joinStatus = document.getElementById("joinStatus");

const lettersEl = document.getElementById("letters");
const wordInput = document.getElementById("wordInput");
const submitBtn = document.getElementById("submitBtn");
const clearBtn = document.getElementById("clearBtn");

const feedbackEl = document.getElementById("feedback");
const scoreEl = document.getElementById("score");
const playerWordsEl = document.getElementById("playerWords");
const timerEl = document.getElementById("timer");

// Check if there is a code in the URL
const urlParams = new URLSearchParams(window.location.search);
const codeFromUrl = urlParams.get('code');

if (codeFromUrl) {
    codeInput.value = codeFromUrl; // Use the 'codeInput' variable you defined above
}


// -----------------
// STATE VARIABLES
// -----------------
let gameCode = null;
let gameActive = false;
let endTime = null;
let timerInterval = null;
let currentWord = "";

// =================
// JOIN GAME
// =================
joinBtn.onclick = () => {
    const code = codeInput.value.trim().toUpperCase();
    const name = nameInput.value.trim();

    if (!code || !name) {
        joinError.textContent = "Enter code and name";
        return;
    }

    socket.emit("player-join", { code, name });
    gameCode = code;

    joinStatus.textContent = `Joined game ${gameCode} as ${name}. Waiting for your teacher to start...`;
    joinError.textContent = "";
};

// =================
// SOCKET EVENTS
// =================
socket.on("error-msg", msg => {
    joinError.textContent = msg;
});

// GAME STARTED
socket.on("game-started", data => {
    joinScreen.hidden = true;
    gameScreen.hidden = false;
    gameActive = true;
    wordInput.readOnly = true;

    joinStatus.textContent = "";

    currentWord = "";
    wordInput.value = "";
    scoreEl.textContent = "0";
    playerWordsEl.innerHTML = "";
    feedbackEl.textContent = "";

    clearInterval(timerInterval);

    // Render letters as 3×3 grid buttons
    lettersEl.innerHTML = "";
    data.letters.forEach(letter => {
        const btn = document.createElement("button");
        btn.textContent = letter.toUpperCase();
        btn.className = "letter-btn";
        btn.onclick = () => {
            currentWord += letter;
            wordInput.value = currentWord;
            btn.disabled = true;
            btn.style.opacity = 0.4;
        };
        lettersEl.appendChild(btn);
    });

    // Start timer
    endTime = data.endTime;
    startTimer();
});

// GAME RESTARTED
socket.on("game-restart", data => {
    gameActive = true;
    wordInput.disabled = false;
    submitBtn.disabled = false;
    wordInput.readOnly = true;

    clearInterval(timerInterval);

    currentWord = "";
    wordInput.value = "";
    playerWordsEl.innerHTML = "";
    scoreEl.textContent = "0";
    feedbackEl.textContent = "";
    feedbackEl.style.color = "black";

    // Render new letters
    lettersEl.innerHTML = "";
    data.letters.forEach(letter => {
        const btn = document.createElement("button");
        btn.textContent = letter.toUpperCase();
        btn.className = "letter-btn";
        btn.onclick = () => {
            currentWord += letter;
            wordInput.value = currentWord;
            btn.disabled = true;
            btn.style.opacity = 0.4;
        };
        lettersEl.appendChild(btn);
    });

    // Reset timer
    endTime = data.endTime;
    startTimer();

    wordInput.value = "";
    wordInput.focus();
});

// WORD SUBMISSION RESULT
// SINGLE WORD RESULT LISTENER
socket.on("word-result", result => {
    const inputContainer = document.getElementById("wordInput");
    
    // 1. Update the Score (Always do this first)
    if (result.total !== undefined) {
        scoreEl.textContent = result.total;
        
        // Trigger "Pop" animation
        scoreEl.classList.remove("score-bump");
        void scoreEl.offsetWidth; // Force reflow
        scoreEl.classList.add("score-bump");
    }

    if (!result.valid) {
        // ERROR HANDLING
        feedbackEl.textContent = feedbackMessage(result.reason);
        feedbackEl.style.color = "crimson";
        
        inputContainer.classList.add("input-error");
        setTimeout(() => inputContainer.classList.remove("input-error"), 400);
    } else {
        // SUCCESS HANDLING
        feedbackEl.textContent = `+${result.points} points!`;
        feedbackEl.style.color = "green";

        inputContainer.classList.add("input-success");
        setTimeout(() => {
            inputContainer.classList.remove("input-success");
            feedbackEl.textContent = "";
        }, 1500);
    }

    // 2. Always reset letters regardless of valid/invalid
    resetLetters();
});

// UPDATE PERSONAL WORD LIST
socket.on("player-words", words => {
    playerWordsEl.innerHTML = "";
    
    // Update the counter
    const wordCountEl = document.getElementById("wordCount");
    if (wordCountEl) wordCountEl.textContent = words.length;

    // We reverse the array so the most recent word is always at the top/front
    const reversedWords = [...words].reverse();

    reversedWords.forEach(word => {
        const li = document.createElement("li");
        li.textContent = word.toUpperCase();
        playerWordsEl.appendChild(li);
    });
});

// LOCK INPUT WHEN GAME ENDS
socket.on("lock-input", () => {
    gameActive = false;
    wordInput.disabled = true;
    submitBtn.disabled = true;
    
    // Stop the timer loop immediately
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    timerEl.textContent = "0"; // Just the number!
    feedbackEl.textContent = "Game over!";
    feedbackEl.style.color = "black";
});

// Helper to keep code clean
function resetLetters() {
    currentWord = "";
    wordInput.value = "";
    document.querySelectorAll(".letter-btn").forEach(btn => {
        btn.disabled = false;
        btn.style.opacity = 1;
        btn.classList.remove("btn-active"); // If you add active states
    });
}

// =================
// SUBMIT WORD
// =================
submitBtn.onclick = submitWord;
wordInput.addEventListener("keydown", e => {
    if (e.key === "Enter") submitWord();
});

function submitWord() {
    if (!gameActive || !currentWord) return;

    socket.emit("submit-word", {
        code: gameCode,
        word: currentWord
    });
}

// =================
// CLEAR BUTTON
// =================
clearBtn.onclick = () => {
    currentWord = "";
    wordInput.value = "";
    document.querySelectorAll(".letter-btn").forEach(btn => {
        btn.disabled = false;
        btn.style.opacity = 1;
    });
};

// =================
// TIMER FUNCTION
// =================
function startTimer() {
    // 1. CRITICAL: Clear any existing timer to prevent overlapping (fixes the "0SS" glitch)
    if (timerInterval) {
        clearInterval(timerInterval);
    }

    const totalDuration = endTime - Date.now();
    const fill = document.getElementById("progressFill");
    const container = document.getElementById("timerContainer");

    timerInterval = setInterval(() => {
        const now = Date.now();
        const remaining = Math.max(0, endTime - now);
        const seconds = Math.ceil(remaining / 1000);
        
        // Calculate percentage based on the original total duration
        const percentage = totalDuration > 0 ? (remaining / totalDuration) * 100 : 0;

        // 2. Update ONLY the number (fixes the "TIME LEFT: TIME LEFT" glitch)
        timerEl.textContent = seconds;
        
        if (fill) {
            fill.style.width = `${percentage}%`;
        }

        // 3. Logic for "Stimulation" levels
        if (container) {
            if (seconds <= 10) {
                container.className = "timer-danger";
            } else if (seconds <= 30) {
                container.className = "timer-warning";
            } else {
                container.className = "";
            }
        }

        // 4. Handle End of Timer
        if (remaining <= 0) {
            clearInterval(timerInterval);
            timerInterval = null; // Reset variable
            if (container) container.classList.remove("timer-danger");
            if (fill) fill.style.width = "0%";
            timerEl.textContent = "0"; // Hard set to 0 at the end
        }
    }, 250);
}

// =================
// FEEDBACK MESSAGES
// =================
function feedbackMessage(reason) {
    switch (reason) {
        case "too-short": return "Too short";
        case "duplicate": return "Already used";
        case "not-in-dictionary": return "Not a valid word";
        case "invalid-letters": return "Letters don’t fit";
        default: return "Invalid";
    }
}
