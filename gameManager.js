const fs = require("fs");
const path = require("path");

// Use path.join to ensure Render finds the file regardless of the working directory
const filePath = path.join(__dirname, "nine-letter-words.txt");

const NINE_LETTER_WORDS = fs
    .readFileSync(filePath, "utf-8")
    .split("\n")
    .map(w => w.trim().toLowerCase()) // Added .toLowerCase() for safety
    .filter(Boolean);

const games = {};

function generateCode(length = 5){
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    let code;

    do{
        code = Array.from({length}, () =>
            chars[Math.floor(Math.random()*chars.length)]
        ).join("");
    }while(games[code]);

    return code;
}

function shuffle(word){

    const arr = word.split("");

    // Fisher-Yates shuffle (correct way)
    for(let i = arr.length-1; i>0; i--){
        const j = Math.floor(Math.random()*(i+1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }

    return arr;
}

function pickNineLetterWord(){

    return NINE_LETTER_WORDS[
        Math.floor(Math.random()*NINE_LETTER_WORDS.length)
    ];
}

function createGame(hostSocketId){

    const code = generateCode();

    games[code] = {
        host: hostSocketId,
        letters: [],
        solution: null, // ⭐ store it!
        players: {},
        usedWords: new Set(),
        classScore: 0,
        started:false,
        endTime:null
    };

    return code;
}

function startGame(code){
    const game = games[code];
    const solution = pickNineLetterWord();

    game.solution = solution;
    game.letters = shuffle(solution);
    game.started = true;
    
    // Optional: Reset round-specific data here 
    // so "Play Again" actually feels like a new game
    game.classScore = 0;
    game.usedWords = new Set();
}

function getGame(code){
    return games[code];
}

function deleteGame(code){
    delete games[code];
}

module.exports = {
    createGame,
    startGame,
    getGame,
    deleteGame
};


