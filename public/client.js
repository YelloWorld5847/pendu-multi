
document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

  const menu = document.getElementById('menu');
  const menuError = document.getElementById('menuError');
  const createBtn = document.getElementById('createBtn');
  const joinBtn = document.getElementById('joinBtn');

  const createName = document.getElementById('createName');
  const createMaxWrong = document.getElementById('createMaxWrong');
  const createTurnTime = document.getElementById('createTurnTime');

  const joinName = document.getElementById('joinName');
  const joinCode = document.getElementById('joinCode');

  const gameSection = document.getElementById('game');
  const gameIdEl = document.getElementById('gameId');
  const wordEl = document.getElementById('word');
  const wrongEl = document.getElementById('wrong');
  const maxWrongEl = document.getElementById('maxWrong');
  const lettersEl = document.getElementById('letters');
  const playersEl = document.getElementById('players');
  const statusEl = document.getElementById('gameStatus');
  const newGameBtn = document.getElementById('newGameBtn');
  const timerEl = document.getElementById('timeLeft');

  let myId = null;
  let gameId = null;
  let turnTimeRemaining = 0;
  let turnInterval = null;

  const ALPHABET = Array.from({length:26}, (_,i) => String.fromCharCode(65+i));

  // --- MENU EVENTS ---
  createBtn.onclick = () => {
    const name = createName.value.trim() || 'Hôte';
    const maxWrong = parseInt(createMaxWrong.value) || 6;
    const turnTime = parseInt(createTurnTime.value) || 20;
    socket.emit('create', {name, maxWrong, turnTime});
  };

  joinBtn.onclick = () => {
    const name = joinName.value.trim() || 'Joueur';
    const code = joinCode.value.trim().toUpperCase();
    socket.emit('join', {name, gameId: code});
  };

  const startBtn = document.createElement('button');
  startBtn.textContent = 'Commencer la partie';
  startBtn.style.marginTop = '10px';
  startBtn.onclick = () => {
    socket.emit('startGame', { gameId });
  };


  // --- SOCKET EVENTS ---
  socket.on('connect', () => { myId = socket.id; });

  socket.on('error', msg => {
    menuError.textContent = msg;
  });

  socket.on('gameCreated', id => {
    gameId = id;
    showGame();
  });

  socket.on('state', state => {
    gameId = state.id;
    showGame();
    renderState(state);
  });

  // --- RENDER ---
  function showGame() {
    menu.style.display = 'none';
    gameSection.style.display = 'block';
    gameIdEl.textContent = gameId;
  }

  function renderState(state) {
    wordEl.textContent = state.word;
    wrongEl.textContent = state.wrong;
    maxWrongEl.textContent = state.maxWrong;
    statusEl.textContent = state.status === 'playing' || state.status === 'waiting' ? '' : (state.status==='won'?'GAGNÉ':'PERDU');

    renderPlayers(state);
    renderLetters(state,state.currentPlayerId===myId);

    if(state.status === 'waiting' && myId === state.players.find(p=>p.id===state.host)?.id){
      if(!document.getElementById('startBtn')){
        startBtn.id = 'startBtn';
        gameSection.appendChild(startBtn);
      }
    } else {
      const btn = document.getElementById('startBtn');
      if(btn) btn.remove();
    }


    // Timer
    if (state.status !== 'waiting') {
      turnTimeRemaining = state.turnTime;
      if(turnInterval) clearInterval(turnInterval);
      turnInterval = setInterval(()=>{
        turnTimeRemaining--;
        timerEl.textContent = turnTimeRemaining;
        if(turnTimeRemaining<=0) clearInterval(turnInterval);
      },1000);
    }
  }

  function renderPlayers(state) {
    playersEl.innerHTML = '';
    state.players.forEach(p=>{
      const div = document.createElement('div');
      div.className = 'player' + (p.isCurrent?' current':'');
      div.textContent = p.name + (p.isCurrent?' • joue':'');
      playersEl.appendChild(div);
    });
  }

  function renderLetters(state,myTurn) {
    lettersEl.innerHTML='';
    ALPHABET.forEach(letter=>{
      const btn = document.createElement('button');
      btn.textContent = letter;
      btn.disabled = state.guessed.includes(letter) || !myTurn || state.status!=='playing';
      btn.onclick = ()=>{ socket.emit('guess',{gameId,letter}); };
      lettersEl.appendChild(btn);
    });
  }

  // --- Nouvelle partie ---
  newGameBtn.onclick = ()=>{
    location.reload();
  }
});