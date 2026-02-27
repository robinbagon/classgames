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
    socket.on('joinRoom', (roomCode) => {
        socket.join(roomCode);
        if (prefixRoomStates[roomCode] === 'playing') {
            socket.emit('gameAlreadyInProgress');
        }
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Master Server running on port ${PORT}`));