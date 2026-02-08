const fs = require("fs");
const path = require("path");

// Use path.join to find the file reliably on the server
const dictPath = path.join(__dirname, "master-dictionary.txt");

const WORDS = new Set(
    fs.readFileSync(dictPath, "utf-8")
        .split("\n")
        .map(w => w.trim().toLowerCase())
        .filter(Boolean) // This removes any empty lines at the end of the file
);

// Check if the word can be made from the available letters
function canBuildWord(word, letters) {
    const pool = letters.map(l => l.toLowerCase());

    for (const char of word.toLowerCase()) {
        const index = pool.indexOf(char);
        if (index === -1) return false;
        pool.splice(index, 1);
    }

    return true;
}

// Validate a word for a given game and player
function validateWord(word, game, player) {
    word = word.trim().toLowerCase();

    const letters = game.letters.map(l => l.toLowerCase());

    if (word.length < 3)
        return { valid: false, reason: "too-short" };

    // Check per-player duplicate
    if (player.words.includes(word))
        return { valid: false, reason: "duplicate" };

    if (!WORDS.has(word))
        return { valid: false, reason: "not-in-dictionary" };

    if (!canBuildWord(word, letters))
        return { valid: false, reason: "invalid-letters" };

    return { valid: true };
}

module.exports = validateWord;
