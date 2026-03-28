const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

// 9Letters specific imports (Ensure these files are in your root)
const gameManager = require("./gameManager");
const validateWord = require("./wordValidator");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Serve all static files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// --- ROUTES ---
// Main Landing Page (Selection Hub)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------------------------------------------------------
// 1. PREFIX GAME LOGIC (Namespace: /prefix)
// ---------------------------------------------------------
const prefixNamespace = io.of('/prefix');
const prefixRoomStates = {};

prefixNamespace.on('connection', (socket) => {
    
    // Helper function to update everyone in the room on the current count
    const updateCount = (roomCode) => {
        const clients = prefixNamespace.adapter.rooms.get(roomCode);
        const numClients = clients ? clients.size : 0;
        // We subtract 1 to exclude the Host from the player count
        const playerCount = Math.max(0, numClients - 1); 
        prefixNamespace.to(roomCode).emit('updatePlayerCount', playerCount);
    };

    socket.on('joinRoom', (roomCode) => {
        socket.join(roomCode);
        
        // NEW: Update count when someone joins
        updateCount(roomCode);

        if (prefixRoomStates[roomCode] === 'playing') {
            socket.emit('gameAlreadyInProgress');
        }
    });

    // NEW: Update count when someone leaves/disconnects
    socket.on('disconnecting', () => {
        socket.rooms.forEach(roomCode => {
            // We use a small timeout because the socket hasn't fully left the room yet
            setTimeout(() => updateCount(roomCode), 100);
        });
    });

    socket.on('submitWord', (data) => {
        socket.to(data.roomCode).emit('wordAddedToWaterfall', data);
    });

    socket.on('startTimer', (roomCode) => {
        prefixRoomStates[roomCode] = 'playing';
        prefixNamespace.in(roomCode).emit('beginGame');
    });

    socket.on('broadcastTimer', (data) => {
        prefixNamespace.to(data.roomCode).emit('broadcastTimer', { timeRemaining: data.timeRemaining });
    });

    socket.on('gameFinished', (roomCode) => {
        prefixRoomStates[roomCode] = 'lobby';
        socket.to(roomCode).emit('endGame');
    });

    socket.on('requestReset', (roomCode) => {
        prefixRoomStates[roomCode] = 'playing';
        prefixNamespace.to(roomCode).emit('resetClient');
    });
});
// ---------------------------------------------------------
// 2. 9LETTERS GAME LOGIC (Namespace: /9letters)
// ---------------------------------------------------------
const nlNamespace = io.of('/9letters');

// Helper functions (Moved inside or kept global for 9letters)
function getAllPossibleWords(game) {
    const dictionaryPath = path.join(__dirname, "master-dictionary.txt");
    if (!fs.existsSync(dictionaryPath)) return [];
    
    const WORDS = fs.readFileSync(dictionaryPath, "utf-8")
                    .split("\n")
                    .map(w => w.trim().toLowerCase());

    const letters = game.letters.map(l => l.toLowerCase());
    function canBuildWord(word) {
        const pool = [...letters];
        for (const char of word) {
            const index = pool.indexOf(char);
            if (index === -1) return false;
            pool.splice(index, 1);
        }
        return true;
    }
    return WORDS.filter(w => w.length >= 3 && canBuildWord(w));
}

function end9LettersGame(code) {
    const game = gameManager.getGame(code);
    if (!game) return;

    const foundWordsSet = new Set();
    for (const playerId in game.players) {
        const p = game.players[playerId];
        // SAFETY CHECK: Ensure player and their words array exist
        if (p && p.words) {
            p.words.forEach(w => foundWordsSet.add(w.toLowerCase()));
        }
    }
    
    const foundWords = Array.from(foundWordsSet).sort((a,b) => b.length - a.length || a.localeCompare(b));
    const allWords = getAllPossibleWords(game).sort((a,b) => b.length - a.length || a.localeCompare(b));

    nlNamespace.to(code).emit("game-ended", {
        words: foundWords,
        allWords: allWords,
        solution: game.solution,
        classScore: game.classScore
    });
    nlNamespace.to(code).emit("lock-input");
}

nlNamespace.on("connection", socket => {
    socket.on("host-create", () => {
        const code = gameManager.createGame(socket.id);
        socket.join(code);
        socket.emit("game-created", code);
    });

    socket.on("start-game", ({ code, duration = 90 }) => {
        const game = gameManager.getGame(code);
        if (!game) return;
        gameManager.startGame(code);
        game.started = true;
        game.endTime = Date.now() + duration * 1000;
        nlNamespace.to(code).emit("game-started", {
            letters: game.letters,
            endTime: game.endTime
        });
        setTimeout(() => end9LettersGame(code), duration * 1000);
    });

    socket.on("player-join", ({ code, name }) => {
        const game = gameManager.getGame(code);
        if (!game) return socket.emit("error-msg", "Game not found");
        socket.join(code);
        game.players[socket.id] = { name, score: 0, words: [] };
        nlNamespace.to(code).emit("player-count", Object.keys(game.players).length);

        if (game.started && Date.now() < game.endTime) {
            socket.emit("game-started", { letters: game.letters, endTime: game.endTime });
            socket.emit("class-score", game.classScore);
        }
    });

socket.on("submit-word", ({ code, word }) => {
    const game = gameManager.getGame(code);
    
    if (!game || !game.started || Date.now() > game.endTime) return;

    const player = game.players[socket.id];
    if (!player) {
        console.warn(`Submission rejected: Socket ${socket.id} not found in game ${code}`);
        socket.emit("word-result", { valid: false, reason: "session-lost" });
        return;
    }

    const result = validateWord(word, game, player);

    if (!result.valid) {
        socket.emit("word-result", result);
        if (player.words) socket.emit("player-words", player.words);
        return;
    }

    const points = Math.pow(word.length, 2); 
    player.score += points;
    player.words.push(word);
    game.classScore += points;

    socket.emit("word-result", { valid: true, points, total: player.score });
    socket.emit("player-words", player.words);
    nlNamespace.to(code).emit("class-score", game.classScore);
});

    socket.on("host-restart", ({ code }) => {
        const game = gameManager.getGame(code);
        if (!game) return;
        gameManager.startGame(code); 
        game.classScore = 0;
        game.usedWords = new Set(); 
        game.endTime = Date.now() + 90 * 1000; 
        for (const pid in game.players) {
            game.players[pid].score = 0;
            game.players[pid].words = [];
        }
        nlNamespace.to(code).emit("game-restart", { letters: game.letters, endTime: game.endTime });
        setTimeout(() => end9LettersGame(code), 90 * 1000);
    });

    socket.on("disconnect", () => {
        const codes = gameManager.getAllCodes?.() || [];
        for (const code of codes) {
            const game = gameManager.getGame(code);
            if (!game) continue;
            if (game.host === socket.id) {
                end9LettersGame(code);
                return;
            }
            if (game.players[socket.id]) {
                delete game.players[socket.id];
                nlNamespace.to(code).emit("player-count", Object.keys(game.players).length);
            }
        }
    });
});

// ---------------------------------------------------------
// 3. SPELLING KNOCKOUT LOGIC (Namespace: /spelling)
// ---------------------------------------------------------
const spellingNamespace = io.of('/spelling');
const spellingGames = {}; // Stores state for each room
let countdownInterval;

// Load words from your JSON file
const spellingWords = JSON.parse(fs.readFileSync(path.join(__dirname, 'spelling-words.json'), 'utf-8'));

// Fisher-Yates Shuffle Algorithm
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

spellingNamespace.on('connection', (socket) => {
    socket.on('host-create', (roomCode) => {
        socket.join(roomCode);
        spellingGames[roomCode] = {
            players: {},
            currentWord: null,
            round: 1,
            status: 'lobby',
            responses: {},
            timer: null
        };
    });

    socket.on('player-join', ({ roomCode, name }, callback) => {
    const game = spellingGames[roomCode];

    // Check if game exists
    if (!game) {
        return callback({ success: false, message: "Game code not found!" });
    }

    // Optional: Check if game is already playing
    if (game.status !== 'lobby') {
        return callback({ success: false, message: "Game already in progress!" });
    }

    // If valid, join the room and save player
    socket.join(roomCode);
    game.players[socket.id] = {
        name: name,
        active: true,
        socketId: socket.id
    };

    // Tell the client it was successful
    callback({ success: true });

    // Update the host's player list
    spellingNamespace.to(roomCode).emit('update-players', Object.values(game.players));
    });

    socket.on('start-game', (roomCode) => {
        const game = spellingGames[roomCode];
        if (!game) return;
        game.status = 'playing';
        sendNextQuestion(roomCode);
    });

    socket.on('host-restart', (roomCode) => {
        const game = spellingGames[roomCode];
        if (!game) return;

        // 1. Reset Game State
        game.status = 'playing';
        game.round = 1;
        game.responses = {};

        // 2. Revive all players who are still connected
        Object.keys(game.players).forEach(id => {
            game.players[id].active = true;
        });

        // 3. Tell all clients to reset their UI (clear "Game Over" and "Out" badges)
        spellingNamespace.to(roomCode).emit('reset-client');

        // 4. UPDATE THE HOST PILLS (Turn them all green/active again)
    spellingNamespace.to(roomCode).emit('update-players', Object.values(game.players));

        // 5. Start the first round
        sendNextQuestion(roomCode);
    });

    socket.on('submit-answer', (msg) => { 
    const game = spellingGames[msg.roomCode];
    if (!game || game.status !== 'playing') return;

    // Record the response for EVERYONE (Active + Ghosts)
    game.responses[socket.id] = {
        answer: msg.answer, // Now 'msg' is defined, so this won't crash
        time: Date.now()
    };

    // Calculate live counts for the graph
    const counts = [0, 0, 0];
    Object.values(game.responses).forEach(resp => {
        const idx = game.currentWord.options.indexOf(resp.answer);
        if (idx !== -1) {
            counts[idx]++;
        }
    });

    // Send the update to the Host
    spellingNamespace.to(msg.roomCode).emit('live-votes', counts);
});
});

function sendNextQuestion(roomCode) {
    const game = spellingGames[roomCode];
    if (!game) return;

    // 1. Difficulty & Word Selection
    const difficulty = game.round <= 3 ? 1 : (game.round <= 6 ? 2 : 3);
    const possibleWords = spellingWords.filter(w => w.difficulty === difficulty);
    const selectedData = possibleWords[Math.floor(Math.random() * possibleWords.length)];
    
    // 2. Setup Word & Clear old responses
    game.currentWord = {
        word: selectedData.word,
        options: shuffleArray([...selectedData.options]) 
    };
    game.responses = {};

    // 3. TIMER MANAGEMENT
    let timeLeft = 8;
    
    // Clear any existing timer for THIS specific game/room
    if (game.timer) {
        clearInterval(game.timer);
    }

    // 4. Notify Players
    spellingNamespace.to(roomCode).emit('new-question', {
        options: game.currentWord.options,
        timer: timeLeft
    });

    // 5. Start the interval and store it INSIDE the game object
    game.timer = setInterval(() => {
        timeLeft -= 1;
        spellingNamespace.to(roomCode).emit('timer-tick', timeLeft);
        
        if (timeLeft <= 0) {
            clearInterval(game.timer);
            game.timer = null; // Clean up the reference
            setTimeout(() => {
                processRound(roomCode);
            }, 500);
        }
    }, 1000);
}

function processRound(roomCode) {
    const game = spellingGames[roomCode];
    if (!game) return;

    const correctWord = game.currentWord.word;
    console.log(`Processing Round ${game.round} for Room ${roomCode}. Correct: ${correctWord}`);

    // 1. Update Active Status
    Object.keys(game.players).forEach(id => {
        const player = game.players[id];
        if (player.active) {
            const resp = game.responses[id];
            // If they didn't answer OR got it wrong, they become a Ghost
            if (!resp || resp.answer !== correctWord) {
                player.active = false;
                console.log(`Knocked out: ${player.name}`);
            }
        }
    });

    // 2. Tell the Host who is now a Ghost
    spellingNamespace.to(roomCode).emit('update-players', Object.values(game.players));

    // 3. Count the remaining Survivors
    const activePlayers = Object.values(game.players).filter(p => p.active);
    console.log(`Survivors left: ${activePlayers.length}`);

    // 4. Determine Game State
    if (activePlayers.length === 1) {
    // One clear winner!
    const winnerName = activePlayers[0].name;
    spellingNamespace.to(roomCode).emit('game-over', { winner: winnerName });
    game.status = 'finished';
    console.log(`Game Over in ${roomCode}. Winner: ${winnerName}`);

} else if (activePlayers.length === 0) {
    // SUDDEN DEATH: Everyone got it wrong at once.
    // Let's find the person who submitted the fastest this round.
    const roundSubmissions = Object.keys(game.responses);
    
    if (roundSubmissions.length > 0) {
        // Sort by the 'time' property we saved in submit-answer
        roundSubmissions.sort((a, b) => game.responses[a].time - game.responses[b].time);
        
        const tieBreakerWinner = game.players[roundSubmissions[0]].name;
        spellingNamespace.to(roomCode).emit('game-over', { 
            winner: `${tieBreakerWinner} (Tie-Breaker!)` 
        });
    } else {
        // Truly no one answered
        spellingNamespace.to(roomCode).emit('game-over', { winner: "No one!" });
    }
    game.status = 'finished';

} else {
    // Game continues - move to next round
    spellingNamespace.to(roomCode).emit('round-results', { correct: correctWord });
    
    // 1. Reset responses for the fresh round
    game.responses = {}; 
    
    // 2. Increment round counter
    game.round++;
    
    // 3. Pause for 3 seconds so they can see the "Correct/Wrong" feedback
    setTimeout(() => {
        // Only send next question if the game wasn't stopped/reset during the timeout
        if (game.status === 'playing') {
            sendNextQuestion(roomCode);
        }
    }, 3000);
}
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Master Server running on port ${PORT}`));