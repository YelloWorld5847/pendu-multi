import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { randomUUID } from 'crypto';

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, { cors: { origin: '*' } });

app.use(express.static('public'));

// --- Gestion des parties ---
const MAX_GAMES = 10;
const games = {}; // key = gameId, value = partie

function generateGameId() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function createGame(hostId, options = {}) {
  if (Object.keys(games).length >= MAX_GAMES) return null;
  const gameId = generateGameId();
  const chosenWord = (options.word || 'PROGRAMMATION').toUpperCase();
  const maxWrong = options.maxWrong || 6;
  const turnTime = options.turnTime || 20;
  games[gameId] = {
    id: gameId,
    host: hostId,
    word: chosenWord,
    revealed: Array.from(chosenWord).map(c => (/[A-Z]/.test(c) ? '_' : c)),
    guessed: new Set(),
    wrong: 0,
    maxWrong,
    turnTime,
    players: [],
    currentIndex: 0,
    timer: null,
    status: 'waiting', // waiting | playing | won | lost
  };
  return games[gameId];
}

function deleteGame(gameId) {
  const game = games[gameId];
  if (!game) return;
  clearTimeout(game.timer);
  delete games[gameId];
}

function nextPlayer(game) {
  if (!game.players.length) return;
  game.currentIndex = (game.currentIndex + 1) % game.players.length;
  startTurnTimer(game);
}

function startTurnTimer(game) {
  clearTimeout(game.timer);
  game.timer = setTimeout(() => {
    nextPlayer(game);
    broadcastGame(game);
  }, game.turnTime * 1000);
}

function broadcastGame(game) {
  io.to(game.id).emit('state', {
    id: game.id,
    host: game.host,
    word: game.revealed.join(' '),
    guessed: Array.from(game.guessed),
    wrong: game.wrong,
    maxWrong: game.maxWrong,
    status: game.status,
    players: game.players.map((p, idx) => ({ id: p.id, name: p.name, isCurrent: idx === game.currentIndex })),
    currentPlayerId: game.players[game.currentIndex]?.id || null,
    turnTime: game.turnTime
  });
}

// --- Socket.IO ---
io.on('connection', socket => {
  socket.on('create', ({ name, maxWrong, turnTime }) => {
    const game = createGame(socket.id, { maxWrong, turnTime });
    if (!game) return socket.emit('error', 'Nombre maximum de parties atteint');
    socket.join(game.id);
    game.players.push({ id: socket.id, name: name || 'Hôte' });
    game.status = 'waiting';
    startTurnTimer(game);
    broadcastGame(game);
    socket.emit('gameCreated', game.id);
  });

  socket.on('startGame', ({ gameId }) => {
    const game = games[gameId];
    if (!game) return;
    if (socket.id !== game.host) return;
    if (game.status !== 'waiting') return;

    game.status = 'playing';
    startTurnTimer(game);
    broadcastGame(game);
  });

  socket.on('join', ({ name, gameId }) => {
    const game = games[gameId];
    if (!game) return socket.emit('error', 'Partie inexistante');
    if (game.status !== 'playing' && game.status !== 'waiting') return socket.emit('error', 'Partie déjà terminée');
    socket.join(game.id);
    game.players.push({ id: socket.id, name: name || 'Joueur' });
    broadcastGame(game);
  });

  socket.on('guess', ({ gameId, letter }) => {
    const game = games[gameId];
    if (!game || game.status !== 'playing') return;
    const currentPlayer = game.players[game.currentIndex];
    if (currentPlayer.id !== socket.id) return;
    letter = letter.toUpperCase();
    if (game.guessed.has(letter)) {
      nextPlayer(game);
      broadcastGame(game);
      return;
    }
    game.guessed.add(letter);
    let hit = false;
    for (let i = 0; i < game.word.length; i++) {
      if (game.word[i] === letter) {
        game.revealed[i] = letter;
        hit = true;
      }
    }
    if (!hit) game.wrong++;
    if (game.revealed.every(c => c !== '_')) game.status = 'won';
    if (game.wrong >= game.maxWrong) game.status = 'lost';
    nextPlayer(game);
    broadcastGame(game);
  });

  socket.on('disconnect', () => {
    for (const gameId in games) {
      const game = games[gameId];
      const idx = game.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        game.players.splice(idx, 1);
        if (!game.players.length) deleteGame(gameId);
        else if (idx <= game.currentIndex) game.currentIndex = Math.max(0, game.currentIndex - 1);
        broadcastGame(game);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
  console.log(`Serveur en écoute sur le port ${PORT}`);
});

// Local
// httpServer.listen(PORT, () => console.log(`Serveur sur port ${PORT}`));
