// Game Client Engine for Desa Cinta Berdua
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Socket setup
const socket = io();

// Game State
let myId = null;
let mySlot = 0;
let myPlayerName = 'Zahy';
let myGender = 'boy';
let myColor = '#4A90E2';
let roomCode = 'AUREL-KITA';

let players = {};
let sharedState = {
  coins: 100,
  lovePoints: 10,
  fridge: [],
  loveNotes: [],
  cafeStand: { stockedItems: [], totalSold: 0 },
  timeOfDay: 7.0,
  dayCount: 1
};
let farmingPlots = [];
let floatingTexts = [];
let particles = [];

// Local player movement
const keys = {};
let nearbyTarget = null;
let targetMovePos = null; // for tap-to-move on mobile/mouse

// Fullscreen toggle
document.getElementById('btn-fullscreen').addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => console.log(err));
  } else {
    document.exitFullscreen().catch(err => console.log(err));
  }
});

// Canvas Click / Tap to Move
canvas.addEventListener('pointerdown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const clickX = (e.clientX - rect.left) * scaleX;
  const clickY = (e.clientY - rect.top) * scaleY;

  // Set destination
  targetMovePos = { x: clickX, y: clickY };
});

// Fireflies for evening / night
for (let i = 0; i < 30; i++) {
  particles.push({
    x: Math.random() * 960,
    y: Math.random() * 720,
    vx: (Math.random() - 0.5) * 0.4,
    vy: (Math.random() - 0.5) * 0.4,
    radius: 1.5 + Math.random() * 2,
    alpha: Math.random()
  });
}

// ================= LOBBY & SETUP =================
// Check room code in URL query (?room=XXX)
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('room')) {
  document.getElementById('input-room-code').value = urlParams.get('room').toUpperCase();
}

// Avatar selection
document.querySelectorAll('.avatar-option').forEach(opt => {
  opt.addEventListener('click', () => {
    document.querySelectorAll('.avatar-option').forEach(o => o.classList.remove('active'));
    opt.classList.add('active');
    myGender = opt.dataset.gender;
    myColor = opt.dataset.color;
  });
});

document.getElementById('btn-join-game').addEventListener('click', () => {
  const nameInput = document.getElementById('input-player-name').value.trim();
  const roomInput = document.getElementById('input-room-code').value.trim();
  if (nameInput) myPlayerName = nameInput;
  if (roomInput) roomCode = roomInput.toUpperCase();

  // Hide lobby
  document.getElementById('lobby-screen').style.display = 'none';
  document.getElementById('hud-player-name').innerText = myPlayerName;
  document.getElementById('hud-room-code').innerText = roomCode;

  // Initialize Audio
  window.soundManager.startBGM();

  // Join Room
  socket.emit('join_room', {
    roomCode,
    playerName: myPlayerName,
    avatarGender: myGender,
    avatarColor: myColor
  });
});

// Copy Room Link
document.getElementById('btn-copy-link').addEventListener('click', () => {
  const shareUrl = `${window.location.origin}?room=${roomCode}`;
  navigator.clipboard.writeText(shareUrl).then(() => {
    addFloatingText(canvas.width / 2, 80, 'Link kamar disalin! Kirimkan ke pacarmu ❤️', '#ff477e');
  }).catch(() => {
    prompt('Salin link ini untuk pacarmu:', shareUrl);
  });
});

// Music toggle
document.getElementById('btn-music').addEventListener('click', () => {
  const muted = window.soundManager.toggleMute();
  document.getElementById('btn-music').innerText = muted ? '🔇' : '🎵';
});

// ================= NETWORK EVENTS =================
socket.on('init_room_state', (data) => {
  myId = data.yourId;
  mySlot = data.slot;
  players = data.players;
  sharedState = data.sharedState;
  farmingPlots = data.farmingPlots;

  updateHUD();
  updateFridgeUI();
  updateLoveNotesUI();
  updateShopSellUI();
  updateCafeUI();

  // Render chat messages
  if (data.chatMessages) {
    data.chatMessages.forEach(msg => appendChatMessage(msg));
  }
});

socket.on('player_joined', (player) => {
  players[player.id] = player;
  window.soundManager.playLove();
  addFloatingText(player.x, player.y - 40, `${player.name} masuk! ❤️`, '#ff477e');
});

socket.on('player_moved', ({ id, x, y, dir, anim }) => {
  if (players[id]) {
    players[id].x = x;
    players[id].y = y;
    players[id].dir = dir;
    players[id].anim = anim;
  }
});

socket.on('player_emoted', ({ id, emote }) => {
  if (players[id]) {
    players[id].emote = emote;
    addFloatingText(players[id].x, players[id].y - 30, emote, '#ff477e');
  }
});

socket.on('couple_action_performed', ({ actionType, from, lovePoints, x, y }) => {
  sharedState.lovePoints = lovePoints;
  updateHUD();
  if (actionType === 'hug') {
    window.soundManager.playLove();
    addFloatingText(x, y - 30, `🤗 ${from} memeluk dengan hangat! ❤️`, '#ff477e');
  } else if (actionType === 'kiss') {
    window.soundManager.playKiss();
    addFloatingText(x, y - 30, `😘 Muachhh! Kiss dari ${from}! 💖`, '#ff1493');
  }
});

socket.on('hands_held', ({ id1, id2 }) => {
  if (players[id1]) players[id1].holdingHandsWith = id2;
  if (players[id2]) players[id2].holdingHandsWith = id1;
  window.soundManager.playLove();
  addFloatingText(canvas.width / 2, canvas.height / 2 - 80, 'Kalian bergandengan tangan! 🤝❤️', '#ff6584');
});

socket.on('hands_released', ({ id1 }) => {
  if (players[id1]) {
    const partnerId = players[id1].holdingHandsWith;
    if (players[partnerId]) players[partnerId].holdingHandsWith = null;
    players[id1].holdingHandsWith = null;
  }
});

socket.on('world_tick', (data) => {
  sharedState.timeOfDay = data.timeOfDay;
  sharedState.dayCount = data.dayCount;
  if (data.farmingPlots) {
    farmingPlots = data.farmingPlots;
  }
  updateHUD();
});

socket.on('farming_updated', (data) => {
  const idx = farmingPlots.findIndex(p => p.id === data.plot.id);
  if (idx !== -1) farmingPlots[idx] = data.plot;
  sharedState.fridge = data.fridge;
  sharedState.lovePoints = data.lovePoints;

  if (players[myId]) {
    players[myId].energy = data.playerEnergy;
  }

  updateHUD();
  updateFridgeUI();
  updateShopSellUI();
  updateCafeUI();
});

socket.on('fish_result', (data) => {
  sharedState.fridge = data.fridge;
  sharedState.lovePoints = data.lovePoints;
  window.soundManager.playSplash();
  addFloatingText(canvas.width / 2, 200, `🎣 ${data.playerName} menangkap ${data.fishName}!`, '#3182ce');
  updateHUD();
  updateFridgeUI();
  updateShopSellUI();
});

socket.on('cooking_success', (data) => {
  sharedState.fridge = data.fridge;
  sharedState.lovePoints = data.lovePoints;
  window.soundManager.playCook();
  addFloatingText(canvas.width / 2, 200, `🍳 Masakan selesai: ${data.recipe}!`, '#d69e2e');
  updateHUD();
  updateFridgeUI();
  updateCafeUI();
});

socket.on('player_ate', (data) => {
  sharedState.fridge = data.fridge;
  if (players[data.id]) {
    players[data.id].hunger = data.hunger;
    players[data.id].energy = data.energy;
  }
  window.soundManager.playTone(500, 'triangle', 0.2, 0.1);
  addFloatingText(players[data.id]?.x || 400, players[data.id]?.y || 300, `Yummy! ${data.name} makan ${data.itemName}!`, '#38a169');
  updateHUD();
  updateFridgeUI();
});

socket.on('morning_arrived', (data) => {
  sharedState.dayCount = data.dayCount;
  sharedState.lovePoints = data.lovePoints;
  players = data.players;
  window.soundManager.playLove();
  addFloatingText(canvas.width / 2, canvas.height / 2, 'Selamat Pagi! Energi kalian berdua terisi penuh 🌅❤️', '#f6ad55');
  updateHUD();
});

socket.on('player_sleep_state', (data) => {
  if (players[data.id]) {
    players[data.id].isSleeping = data.isSleeping;
  }
});

socket.on('love_notes_updated', (data) => {
  sharedState.loveNotes = data.notes;
  sharedState.lovePoints = data.lovePoints;
  window.soundManager.playLove();
  updateLoveNotesUI();
  updateHUD();
});

socket.on('trade_completed', (data) => {
  sharedState.coins = data.coins;
  sharedState.fridge = data.fridge;
  window.soundManager.playCoin();
  addFloatingText(canvas.width / 2, 220, data.message, '#ecc94b');
  updateHUD();
  updateFridgeUI();
  updateShopSellUI();
  updateCafeUI();
});

socket.on('cafe_sale', (data) => {
  sharedState.coins = data.coins;
  sharedState.lovePoints = data.lovePoints;
  window.soundManager.playCoin();
  addFloatingText(780, 480, `☕ Warung laku! 1x ${data.item} terjual (+🪙${data.price})`, '#38a169');
  updateHUD();
  updateCafeUI();
});

socket.on('cafe_updated', (data) => {
  sharedState.cafeStand = data.cafeStand;
  sharedState.fridge = data.fridge;
  updateCafeUI();
  updateFridgeUI();
});

socket.on('chat_message', (msg) => {
  appendChatMessage(msg);
});

socket.on('player_left', ({ id, name }) => {
  delete players[id];
  addFloatingText(canvas.width / 2, 100, `${name} telah keluar dari rumah`, '#e53e3e');
});

// ================= USER INPUTS =================
window.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
  if (e.key === 'e' || e.key === 'E') {
    handleInteraction();
  }
});

window.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

// Mobile Dpad Touch Controls
function bindTouchButton(elemId, keyName) {
  const el = document.getElementById(elemId);
  if (!el) return;
  const start = (e) => { e.preventDefault(); keys[keyName] = true; };
  const end = (e) => { e.preventDefault(); keys[keyName] = false; };
  el.addEventListener('touchstart', start);
  el.addEventListener('touchend', end);
  el.addEventListener('mousedown', start);
  el.addEventListener('mouseup', end);
}

bindTouchButton('dpad-up', 'arrowup');
bindTouchButton('dpad-down', 'arrowdown');
bindTouchButton('dpad-left', 'arrowleft');
bindTouchButton('dpad-right', 'arrowright');

// Couple Action Buttons
document.getElementById('btn-hug').addEventListener('click', () => {
  socket.emit('couple_action', { actionType: 'hug' });
});

document.getElementById('btn-kiss').addEventListener('click', () => {
  socket.emit('couple_action', { actionType: 'kiss' });
});

document.getElementById('btn-hold-hands').addEventListener('click', () => {
  socket.emit('couple_action', { actionType: 'hold_hands' });
});

// Polaroid Snapshot Feature
document.getElementById('btn-photo').addEventListener('click', () => {
  window.soundManager.playLove();
  addFloatingText(canvas.width / 2, canvas.height / 2 - 40, '📸 Cekrek! Mengabadikan momen manis... ❤️', '#ff477e');

  setTimeout(() => {
    // Create polaroid frame
    const pCanvas = document.createElement('canvas');
    pCanvas.width = canvas.width + 40;
    pCanvas.height = canvas.height + 90;
    const pCtx = pCanvas.getContext('2d');

    // Polaroid white frame with subtle gradient & shadow
    pCtx.fillStyle = '#ffffff';
    pCtx.fillRect(0, 0, pCanvas.width, pCanvas.height);

    // Inner photo
    pCtx.drawImage(canvas, 20, 20);

    // Polaroid caption text
    pCtx.font = 'bold 22px "Segoe UI", sans-serif';
    pCtx.fillStyle = '#ff477e';
    pCtx.textAlign = 'center';
    pCtx.fillText(`🌸 Zahy & Aurel di Desa Cinta • Hari ke-${sharedState.dayCount} ❤️`, pCanvas.width / 2, pCanvas.height - 35);

    // Trigger download
    const link = document.createElement('a');
    link.download = `Kenangan-Zahy-Aurel-Hari-${sharedState.dayCount}.png`;
    link.href = pCanvas.toDataURL('image/png');
    link.click();
  }, 300);
});

// Modal Toggles
document.getElementById('btn-open-fridge').addEventListener('click', () => openModal('modal-fridge'));
document.getElementById('btn-open-notes').addEventListener('click', () => openModal('modal-notes'));
document.getElementById('btn-open-chat').addEventListener('click', () => {
  const chatBox = document.getElementById('chat-box');
  chatBox.style.display = chatBox.style.display === 'flex' ? 'none' : 'flex';
});
document.getElementById('btn-close-chat').addEventListener('click', () => {
  document.getElementById('chat-box').style.display = 'none';
});

// Chat Send
document.getElementById('chat-send-btn').addEventListener('click', sendChat);
document.getElementById('chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChat();
});

function sendChat() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (text) {
    socket.emit('send_chat', { text });
    input.value = '';
  }
}

function appendChatMessage(msg) {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  const isMine = msg.sender === myPlayerName;
  div.className = `chat-bubble ${isMine ? 'mine' : ''}`;
  div.innerHTML = `<div class="sender">${msg.sender} • ${msg.time}</div><div>${escapeHtml(msg.text)}</div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// Love Note Submit
document.getElementById('btn-submit-note').addEventListener('click', () => {
  const input = document.getElementById('input-love-note');
  const text = input.value.trim();
  if (text) {
    socket.emit('add_love_note', { text });
    input.value = '';
  }
});

// Interaction Prompt Click / Tap
document.getElementById('interaction-prompt').addEventListener('click', handleInteraction);

// ================= MODAL MANAGERS =================
function openModal(id) {
  closeAllModals();
  const el = document.getElementById(id);
  if (el) el.style.display = 'flex';
}

function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
}
window.closeAllModals = closeAllModals;

function updateHUD() {
  document.getElementById('hud-coins').innerText = sharedState.coins;
  document.getElementById('hud-love').innerText = sharedState.lovePoints;

  // Format Clock (timeOfDay is decimal, e.g. 7.5 = 07:30)
  const hour = Math.floor(sharedState.timeOfDay);
  const min = Math.floor((sharedState.timeOfDay % 1) * 60);
  const hourStr = hour < 10 ? '0' + hour : '' + hour;
  const minStr = min < 10 ? '0' + min : '' + min;
  document.getElementById('hud-clock').innerText = `${hourStr}:${minStr}`;
  document.getElementById('hud-day').innerText = sharedState.dayCount;

  // Time Icon
  const timeIcon = document.getElementById('hud-time-icon');
  if (hour >= 5 && hour < 11) timeIcon.innerText = '🌅';
  else if (hour >= 11 && hour < 17) timeIcon.innerText = '☀️';
  else if (hour >= 17 && hour < 19) timeIcon.innerText = '🌇';
  else timeIcon.innerText = '🌙';

  // Player Energy & Hunger
  if (myId && players[myId]) {
    const p = players[myId];
    document.getElementById('label-energy').innerText = `${Math.round(p.energy)}%`;
    document.getElementById('bar-energy').style.width = `${Math.max(0, p.energy)}%`;

    document.getElementById('label-hunger').innerText = `${Math.round(p.hunger)}%`;
    document.getElementById('bar-hunger').style.width = `${Math.max(0, p.hunger)}%`;
  }
}

function updateFridgeUI() {
  const list = document.getElementById('fridge-items-list');
  if (!list) return;
  list.innerHTML = '';

  if (sharedState.fridge.length === 0) {
    list.innerHTML = '<p style="font-size:12px; color:#a0aec0;">Kulkas masih kosong.</p>';
    return;
  }

  sharedState.fridge.forEach(item => {
    if (item.count <= 0) return;
    const card = document.createElement('div');
    card.className = 'item-card';
    const isEdible = item.id.includes('bread') || item.id.includes('salad') || item.id.includes('grilled') || item.id.includes('water');
    
    card.innerHTML = `
      <span class="item-icon">${item.icon || '📦'}</span>
      <div class="item-name">${item.name}</div>
      <div class="item-count">Jumlah: ${item.count}</div>
      ${isEdible ? `<button class="btn-item-action" onclick="eatItem('${item.id}')">Makan 🍴</button>` : ''}
    `;
    list.appendChild(card);
  });
}

function eatItem(itemId) {
  socket.emit('eat_item', { itemId });
}
window.eatItem = eatItem;

function cookRecipe(recipeId) {
  socket.emit('cook_recipe', { recipeId });
}
window.cookRecipe = cookRecipe;

function buyItem(itemObj, cost) {
  if (sharedState.coins < cost) {
    alert('Koin keluarga tidak cukup!');
    return;
  }
  socket.emit('shop_transaction', { action: 'buy', itemType: itemObj, cost });
}
window.buyItem = buyItem;

function sellItem(itemId, price) {
  const item = sharedState.fridge.find(i => i.id === itemId && i.count > 0);
  if (!item) return;
  socket.emit('shop_transaction', { action: 'sell', itemType: item, price });
}
window.sellItem = sellItem;

function updateShopSellUI() {
  const grid = document.getElementById('shop-sell-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const sellables = sharedState.fridge.filter(i => (i.id.startsWith('crop_') || i.id === 'fresh_fish') && i.count > 0);
  if (sellables.length === 0) {
    grid.innerHTML = '<p style="font-size:12px; color:#a0aec0;">Belum ada hasil panen atau ikan untuk dijual.</p>';
    return;
  }

  sellables.forEach(item => {
    const price = item.id === 'crop_strawberry' ? 25 : item.id === 'crop_carrot' ? 20 : 35;
    const card = document.createElement('div');
    card.className = 'item-card';
    card.innerHTML = `
      <span class="item-icon">${item.icon}</span>
      <div class="item-name">${item.name}</div>
      <div class="item-count">Ada: ${item.count} | Harga: 🪙${price}</div>
      <button class="btn-item-action" style="background:#48bb78;" onclick="sellItem('${item.id}', ${price})">Jual 1x</button>
    `;
    grid.appendChild(card);
  });
}

function updateCafeUI() {
  const countEl = document.getElementById('cafe-sold-count');
  if (countEl) countEl.innerText = sharedState.cafeStand.totalSold;

  const stockGrid = document.getElementById('cafe-stock-grid');
  if (!stockGrid) return;
  stockGrid.innerHTML = '';

  const readyItems = sharedState.fridge.filter(i => (i.id.includes('salad') || i.id.includes('grilled') || i.id.startsWith('crop_')) && i.count > 0);
  if (readyItems.length === 0) {
    stockGrid.innerHTML = '<p style="font-size:12px; color:#a0aec0;">Masak makanan atau panen sayur dulu untuk dipajang di kedai.</p>';
    return;
  }

  readyItems.forEach(item => {
    const card = document.createElement('div');
    card.className = 'item-card';
    card.innerHTML = `
      <span class="item-icon">${item.icon}</span>
      <div class="item-name">${item.name}</div>
      <div class="item-count">Tersedia: ${item.count}</div>
      <button class="btn-item-action" style="background:#dd6b20;" onclick="stockCafeItem('${item.id}')">Pajang di Kedai ☕</button>
    `;
    stockGrid.appendChild(card);
  });
}

function stockCafeItem(itemId) {
  socket.emit('stock_cafe', { itemId });
}
window.stockCafeItem = stockCafeItem;

function updateLoveNotesUI() {
  const list = document.getElementById('love-notes-list');
  if (!list) return;
  list.innerHTML = '';

  if (sharedState.loveNotes.length === 0) {
    list.innerHTML = '<p style="font-size:12px; color:#a0aec0;">Belum ada pesan cinta.</p>';
    return;
  }

  sharedState.loveNotes.forEach(note => {
    const div = document.createElement('div');
    div.style.cssText = 'background:#fff5f7; border-left:4px solid #ff6584; padding:8px 12px; border-radius:8px;';
    div.innerHTML = `
      <div style="font-size:11px; font-weight:bold; color:#ff477e; display:flex; justify-content:space-between;">
        <span>Dari: ${escapeHtml(note.from)}</span>
        <span>${note.time}</span>
      </div>
      <div style="font-size:13px; color:#2d3748; margin-top:4px;">"${escapeHtml(note.text)}"</div>
    `;
    list.appendChild(div);
  });
}

function addFloatingText(x, y, text, color = '#ffffff') {
  floatingTexts.push({ x, y, text, color, alpha: 1.0, dy: -0.6 });
}

function escapeHtml(string) {
  return String(string).replace(/[&<>"'`=\/]/g, function (s) {
    return {
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '/': '&#x2F;', '`': '&#x60;', '=': '&#x3D;'
    }[s];
  });
}

// ================= GAME LOGIC & INTERACTION =================
function handleInteraction() {
  if (!nearbyTarget) return;

  if (nearbyTarget.type === 'bed') {
    const p = players[myId];
    if (p) {
      const sleeping = !p.isSleeping;
      socket.emit('toggle_sleep', { isSleeping: sleeping });
      addFloatingText(p.x, p.y - 40, sleeping ? 'Tidur di kasur... Zzz 😴' : 'Bangun dari kasur! ☀️', '#9f7aea');
    }
  } else if (nearbyTarget.type === 'kitchen') {
    openModal('modal-kitchen');
  } else if (nearbyTarget.type === 'fridge') {
    openModal('modal-fridge');
  } else if (nearbyTarget.type === 'love_notes') {
    openModal('modal-notes');
  } else if (nearbyTarget.type === 'shop_npc') {
    openModal('modal-shop');
  } else if (nearbyTarget.type === 'cafe_stand') {
    openModal('modal-cafe');
  } else if (nearbyTarget.type === 'pond') {
    // Fishing mini-action
    const p = players[myId];
    if (p.energy < 5) {
      addFloatingText(p.x, p.y - 30, 'Kamu terlalu lelah untuk mancing! Istirahat dulu 💤', '#e53e3e');
      return;
    }
    window.soundManager.playSplash();
    addFloatingText(p.x, p.y - 30, 'Melempar kail ke danau... 🎣', '#3182ce');
    setTimeout(() => {
      socket.emit('fish_caught', { fishType: 'Ikan Mas Danau Cantik', size: 1 });
    }, 1200);
  } else if (nearbyTarget.type === 'farming_plot') {
    const plot = nearbyTarget.plot;
    const p = players[myId];

    if (plot.state === 'empty') {
      window.soundManager.playPlant();
      socket.emit('farming_action', { plotId: plot.id, action: 'till' });
      addFloatingText(plot.x, plot.y - 10, 'Mencangkul tanah! 🌱', '#d69e2e');
    } else if (plot.state === 'tilled') {
      // Plant carrot or strawberry if available
      const hasBerry = sharedState.fridge.some(i => i.id === 'seed_strawberry' && i.count > 0);
      const hasCarrot = sharedState.fridge.some(i => i.id === 'seed_carrot' && i.count > 0);
      const crop = hasBerry ? 'strawberry' : hasCarrot ? 'carrot' : null;
      if (crop) {
        window.soundManager.playPlant();
        socket.emit('farming_action', { plotId: plot.id, action: 'plant', cropType: crop });
        addFloatingText(plot.x, plot.y - 10, `Menanam ${crop === 'strawberry' ? 'Stroberi 🍓' : 'Wortel 🥕'}!`, '#38a169');
      } else {
        addFloatingText(plot.x, plot.y - 10, 'Beli bibit dulu di Toko Pak Joko! 🛒', '#e53e3e');
      }
    } else if (plot.state === 'planted') {
      window.soundManager.playWater();
      socket.emit('farming_action', { plotId: plot.id, action: 'water' });
      addFloatingText(plot.x, plot.y - 10, 'Menyiram tanaman dengan cinta! 💧✨', '#3182ce');
    } else if (plot.state === 'ready') {
      window.soundManager.playHarvest();
      socket.emit('farming_action', { plotId: plot.id, action: 'harvest' });
      addFloatingText(plot.x, plot.y - 10, 'Panen berhasil! (+Hasil masuk kulkas) 🎉', '#38a169');
    }
  }
}

// ================= MAIN LOOP & RENDER =================
let lastTime = Date.now();

function update(dt) {
  if (!myId || !players[myId]) return;
  const p = players[myId];

  // If player is sleeping, restrict manual movement until woke
  if (!p.isSleeping) {
    let dx = 0;
    let dy = 0;
    const speed = 2.8;

    if (keys['w'] || keys['arrowup']) { dy -= 1; p.dir = 'up'; targetMovePos = null; }
    if (keys['s'] || keys['arrowdown']) { dy += 1; p.dir = 'down'; targetMovePos = null; }
    if (keys['a'] || keys['arrowleft']) { dx -= 1; p.dir = 'left'; targetMovePos = null; }
    if (keys['d'] || keys['arrowright']) { dx += 1; p.dir = 'right'; targetMovePos = null; }

    // Tap-to-move interpolation
    if (targetMovePos && dx === 0 && dy === 0) {
      const dist = Math.hypot(targetMovePos.x - p.x, targetMovePos.y - p.y);
      if (dist > 8) {
        dx = (targetMovePos.x - p.x) / dist;
        dy = (targetMovePos.y - p.y) / dist;
        if (Math.abs(dx) > Math.abs(dy)) {
          p.dir = dx > 0 ? 'right' : 'left';
        } else {
          p.dir = dy > 0 ? 'down' : 'up';
        }
      } else {
        targetMovePos = null;
        // If near target upon arrival, automatically trigger interaction
        if (nearbyTarget) handleInteraction();
      }
    }

    if (dx !== 0 && dy !== 0) {
      dx *= 0.7071;
      dy *= 0.7071;
    }

    if (dx !== 0 || dy !== 0) {
      p.x = Math.max(30, Math.min(930, p.x + dx * speed));
      p.y = Math.max(30, Math.min(690, p.y + dy * speed));
      p.anim = 'walk';

      // Send to server
      socket.emit('player_move', {
        x: Math.round(p.x),
        y: Math.round(p.y),
        dir: p.dir,
        anim: p.anim
      });
    } else {
      p.anim = 'idle';
    }
  }

  // Check proximity for interactive zones
  checkProximity(p);

  // Update floating texts
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i];
    ft.y += ft.dy;
    ft.alpha -= 0.015;
    if (ft.alpha <= 0) floatingTexts.splice(i, 1);
  }

  // Update firefly particles
  particles.forEach(pt => {
    pt.x = (pt.x + pt.vx + 960) % 960;
    pt.y = (pt.y + pt.vy + 720) % 720;
    pt.alpha = 0.3 + 0.7 * Math.sin(Date.now() * 0.003 + pt.x);
  });
}

function checkProximity(p) {
  const promptEl = document.getElementById('interaction-prompt');
  nearbyTarget = null;

  // 1. Bed (inside house, around x: 380-450, y: 150-200)
  if (Math.hypot(p.x - 410, p.y - 180) < 55) {
    nearbyTarget = { type: 'bed', text: 'Tekan [E] untuk Tidur di Ranjang Berdua 🛌' };
  }
  // 2. Stove / Kitchen (x: 480, y: 180)
  else if (Math.hypot(p.x - 490, p.y - 180) < 50) {
    nearbyTarget = { type: 'kitchen', text: 'Tekan [E] untuk Memasak di Dapur 🍳' };
  }
  // 3. Fridge (x: 540, y: 180)
  else if (Math.hypot(p.x - 540, p.y - 180) < 50) {
    nearbyTarget = { type: 'fridge', text: 'Tekan [E] untuk Buka Kulkas & Tas 🎒' };
  }
  // 4. Love Notes Board (x: 320, y: 175)
  else if (Math.hypot(p.x - 330, p.y - 180) < 50) {
    nearbyTarget = { type: 'love_notes', text: 'Tekan [E] untuk Papan Surat Cinta 💌' };
  }
  // 5. Cafe / Business Stand (x: 640, y: 350)
  else if (Math.hypot(p.x - 640, p.y - 350) < 55) {
    nearbyTarget = { type: 'cafe_stand', text: 'Tekan [E] untuk Kelola Kedai Berdua ☕' };
  }
  // 6. Shop NPC Pak Joko (x: 780, y: 160)
  else if (Math.hypot(p.x - 780, p.y - 160) < 60) {
    nearbyTarget = { type: 'shop_npc', text: 'Tekan [E] untuk Toko & Pasar Pak Joko 🏪' };
  }
  // 7. Pond / Lake (around x: 740, y: 580)
  else if (Math.hypot(p.x - 740, p.y - 580) < 70) {
    nearbyTarget = { type: 'pond', text: 'Tekan [E] untuk Memancing di Danau 🎣' };
  }
  // 8. Farm Plots
  else {
    for (const plot of farmingPlots) {
      if (Math.hypot(p.x - (plot.x + 20), p.y - (plot.y + 20)) < 36) {
        let actionStr = 'Cangkul Tanah 🌱';
        if (plot.state === 'tilled') actionStr = 'Tanam Bibit 🌾';
        else if (plot.state === 'planted') actionStr = 'Siram Air 💧';
        else if (plot.state === 'watered') actionStr = `Sedang Tumbuh (${plot.growthProgress}%) 🌿`;
        else if (plot.state === 'ready') actionStr = 'Panen Sayur! 🎉';

        nearbyTarget = { type: 'farming_plot', plot, text: `Tekan [E] untuk ${actionStr}` };
        break;
      }
    }
  }

  if (nearbyTarget) {
    promptEl.innerText = nearbyTarget.text;
    promptEl.style.display = 'block';
  } else {
    promptEl.style.display = 'none';
  }
}

// ================= CANVAS DRAWING =================
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. Draw Outdoor Grass & Paths
  drawEnvironment();

  // 2. Draw House
  drawHouse();

  // 3. Draw Farm Plots
  drawFarmingPlots();

  // 4. Draw Lake / Pond
  drawPond();

  // 5. Draw Cafe Stand & NPCs
  drawCafeStand();
  drawNPCs();

  // 6. Draw Hand-holding Link if lovers are holding hands
  drawHandHoldingLink();

  // 7. Draw Players
  const sortedPlayers = Object.values(players).sort((a, b) => a.y - b.y);
  sortedPlayers.forEach(p => drawPlayer(p));

  // 8. Ambient Day/Night Lighting Overlay & Fireflies
  drawAmbientLighting();

  // 9. Floating Texts
  floatingTexts.forEach(ft => {
    ctx.save();
    ctx.fillStyle = ft.color;
    ctx.globalAlpha = Math.max(0, ft.alpha);
    ctx.font = 'bold 14px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 4;
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  });

  requestAnimationFrame(loop);
}

function loop() {
  const now = Date.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  update(dt);
  render();
}
requestAnimationFrame(loop);

// ================= ENVIRONMENT DETAILS =================
function drawEnvironment() {
  // Vibrant grass background
  ctx.fillStyle = '#659b5e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Cobblestone / Dirt Path connecting house, garden, pond, and shop
  ctx.fillStyle = '#d4b28c';
  // Path from house door down
  ctx.fillRect(415, 290, 40, 260);
  // Path branching to farm
  ctx.fillRect(360, 520, 190, 30);
  // Path branching to cafe & pond
  ctx.fillRect(455, 340, 200, 30);
  ctx.fillRect(630, 340, 30, 200);
  ctx.fillRect(630, 520, 100, 30);
  // Path to shop
  ctx.fillRect(455, 210, 300, 26);

  // Decorative Little Flowers & Bushes
  const flowerPositions = [
    { x: 120, y: 380, color: '#ff6584' },
    { x: 150, y: 410, color: '#ffbe76' },
    { x: 190, y: 360, color: '#f8a5c2' },
    { x: 280, y: 580, color: '#ff6584' },
    { x: 570, y: 640, color: '#f8a5c2' },
    { x: 880, y: 380, color: '#ffbe76' }
  ];
  flowerPositions.forEach(f => {
    ctx.fillStyle = f.color;
    ctx.beginPath();
    ctx.arc(f.x, f.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(f.x, f.y, 1.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // Trees
  drawTree(80, 200);
  drawTree(120, 600);
  drawTree(220, 650);
  drawTree(880, 260);
}

function drawTree(x, y) {
  // Trunk
  ctx.fillStyle = '#795548';
  ctx.fillRect(x - 8, y, 16, 30);
  // Leaves
  ctx.fillStyle = '#2e7d32';
  ctx.beginPath();
  ctx.arc(x, y - 8, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#388e3c';
  ctx.beginPath();
  ctx.arc(x - 6, y - 14, 20, 0, Math.PI * 2);
  ctx.fill();
}

function drawHouse() {
  const hx = 280;
  const hy = 80;
  const hw = 310;
  const hh = 210;

  // Outdoor house shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(hx - 5, hy + hh - 5, hw + 10, 15);

  // House Floor (Wood planks)
  ctx.fillStyle = '#e0a96d';
  ctx.fillRect(hx, hy, hw, hh);

  // Floor plank lines
  ctx.strokeStyle = '#c48b53';
  ctx.lineWidth = 1;
  for (let y = hy + 20; y < hy + hh; y += 20) {
    ctx.beginPath();
    ctx.moveTo(hx, y);
    ctx.lineTo(hx + hw, y);
    ctx.stroke();
  }

  // House Walls (North, West, East)
  ctx.fillStyle = '#8d5b4c';
  ctx.fillRect(hx, hy, hw, 26); // North wall
  ctx.fillRect(hx, hy, 16, hh); // West wall
  ctx.fillRect(hx + hw - 16, hy, 16, hh); // East wall
  // South walls leaving door open in middle
  ctx.fillRect(hx, hy + hh - 16, 120, 16);
  ctx.fillRect(hx + hw - 150, hy + hh - 16, 150, 16);

  // Door welcome mat (with sweet heart)
  ctx.fillStyle = '#ff7597';
  ctx.fillRect(415, hy + hh - 12, 40, 16);
  ctx.font = '10px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.fillText('❤️', 429, hy + hh);

  // Roof aesthetic ridge at top
  ctx.fillStyle = '#a64d3d';
  ctx.fillRect(hx - 10, hy - 14, hw + 20, 18);

  // ============ FURNITURE INSIDE ============
  // 1. Double Couple Bed (x: 375, y: 110)
  ctx.fillStyle = '#d4a373';
  ctx.fillRect(375, 110, 75, 65); // Bed frame
  ctx.fillStyle = '#fff0f3';
  ctx.fillRect(380, 130, 65, 42); // Blanket
  // Two cozy pillows
  ctx.fillStyle = '#ffb3c1';
  ctx.fillRect(384, 114, 26, 14);
  ctx.fillRect(414, 114, 26, 14);
  // Bed heart tag
  ctx.font = '12px sans-serif';
  ctx.fillText('❤️', 407, 155);

  // 2. Kitchen Stove (x: 475, y: 110)
  ctx.fillStyle = '#4a5568';
  ctx.fillRect(475, 110, 40, 45);
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(478, 113, 34, 16); // Stove top
  ctx.fillStyle = '#ff4757';
  ctx.beginPath();
  ctx.arc(487, 121, 4, 0, Math.PI * 2);
  ctx.arc(503, 121, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = '12px sans-serif';
  ctx.fillText('🍳', 488, 145);

  // 3. Fridge (x: 525, y: 110)
  ctx.fillStyle = '#cbd5e0';
  ctx.fillRect(525, 108, 34, 50);
  ctx.fillStyle = '#718096';
  ctx.fillRect(529, 124, 4, 16); // Handle
  ctx.font = '12px sans-serif';
  ctx.fillText('🧊', 533, 145);

  // 4. Love Board on Wall (x: 310, y: 110)
  ctx.fillStyle = '#ffeaa7';
  ctx.fillRect(310, 110, 48, 36);
  ctx.strokeStyle = '#d63031';
  ctx.strokeRect(310, 110, 48, 36);
  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#d63031';
  ctx.fillText('💌 PESAN', 314, 125);
  ctx.fillText('CINTA', 320, 138);

  // 5. Dining Table & 2 Chairs
  ctx.fillStyle = '#8d5b4c';
  ctx.fillRect(320, 185, 45, 30);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(342, 200, 6, 0, Math.PI * 2); // Tea cup
  ctx.fill();
}

function drawFarmingPlots() {
  farmingPlots.forEach(plot => {
    // Soil
    if (plot.state === 'empty') {
      ctx.fillStyle = '#8c6239';
    } else if (plot.state === 'tilled') {
      ctx.fillStyle = '#5c3d1e';
    } else if (plot.state === 'watered' || plot.state === 'ready') {
      ctx.fillStyle = '#3d2511'; // Wet dark soil
    } else {
      ctx.fillStyle = '#6e4722';
    }

    ctx.fillRect(plot.x, plot.y, 42, 42);
    ctx.strokeStyle = '#4a2f15';
    ctx.strokeRect(plot.x, plot.y, 42, 42);

    // Crops
    if (plot.cropType) {
      if (plot.state === 'ready') {
        ctx.font = '24px sans-serif';
        const icon = plot.cropType === 'strawberry' ? '🍓' : '🥕';
        ctx.fillText(icon, plot.x + 8, plot.y + 30);
      } else {
        // Growing sprout
        ctx.fillStyle = '#48bb78';
        const h = Math.max(6, (plot.growthProgress / 100) * 22);
        ctx.fillRect(plot.x + 19, plot.y + 36 - h, 4, h);
        ctx.beginPath();
        ctx.arc(plot.x + 21, plot.y + 34 - h, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });

  // Garden sign
  ctx.fillStyle = '#8d5b4c';
  ctx.fillRect(330, 560, 6, 24);
  ctx.fillStyle = '#ffbe76';
  ctx.fillRect(315, 546, 38, 16);
  ctx.font = 'bold 9px sans-serif';
  ctx.fillStyle = '#333';
  ctx.fillText('KEBUN', 319, 558);
}

function drawPond() {
  const px = 730;
  const py = 570;
  const pw = 160;
  const ph = 100;

  // Pond water
  ctx.fillStyle = '#4299e1';
  ctx.beginPath();
  ctx.ellipse(px + pw / 2, py + ph / 2, pw / 2, ph / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Water shine / ripples
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(px + 60, py + 40, 20, 0, Math.PI * 0.8);
  ctx.stroke();

  // Wooden dock / pier
  ctx.fillStyle = '#a0522d';
  ctx.fillRect(px - 15, py + 35, 45, 30);
  ctx.fillStyle = '#8b4513';
  ctx.fillRect(px - 15, py + 35, 6, 30);
  ctx.fillRect(px + 24, py + 35, 6, 30);

  // Fishing rod sign
  ctx.font = '16px sans-serif';
  ctx.fillText('🎣', px + 5, py + 56);
}

function drawCafeStand() {
  const sx = 620;
  const sy = 320;

  // Wooden stall
  ctx.fillStyle = '#a67c52';
  ctx.fillRect(sx, sy, 70, 45);

  // Striped awning (Pink & White)
  ctx.fillStyle = '#ff6584';
  ctx.fillRect(sx - 4, sy - 14, 78, 14);
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(sx - 4 + i * 20, sy - 14, 10, 14);
  }

  // Stand counter items
  ctx.font = '14px sans-serif';
  ctx.fillText('☕🍰', sx + 16, sy + 25);
  ctx.font = 'bold 10px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.fillText('KEDAI KITA', sx + 6, sy + 40);
}

function drawNPCs() {
  // 1. Pak Joko (Shop Owner, x: 770, y: 140)
  drawSimpleCharacter(770, 140, '#2b6cb0', '#2d3748', 'Pak Joko (Toko)', '👨‍🌾');

  // Shop building
  ctx.fillStyle = '#b7791f';
  ctx.fillRect(730, 80, 85, 45);
  ctx.fillStyle = '#d69e2e';
  ctx.fillRect(725, 68, 95, 14); // Awning
  ctx.font = 'bold 10px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.fillText('TOKO TANI', 742, 105);
}

function drawSimpleCharacter(x, y, shirtColor, hairColor, label, emoji) {
  ctx.save();
  ctx.font = '26px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(emoji, x, y + 20);

  // Label tag
  ctx.font = 'bold 11px "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x - 45, y - 16, 90, 16);
  ctx.fillStyle = '#fff';
  ctx.fillText(label, x, y - 4);
  ctx.restore();
}

function drawHandHoldingLink() {
  const p1 = players[myId];
  if (p1 && p1.holdingHandsWith && players[p1.holdingHandsWith]) {
    const p2 = players[p1.holdingHandsWith];
    ctx.save();
    ctx.strokeStyle = '#ff6584';
    ctx.lineWidth = 3;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    // Floating little heart between them
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2 - 12;
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('❤️', midX, midY);
    ctx.restore();
  }
}

function drawPlayer(p) {
  ctx.save();
  ctx.translate(p.x, p.y);

  // If player is sleeping, show them resting on bed
  if (p.isSleeping) {
    ctx.font = '18px sans-serif';
    ctx.fillText('💤', -8, -25);
    ctx.font = '12px "Segoe UI", sans-serif';
    ctx.fillStyle = '#718096';
    ctx.fillText(`${p.name} (Tidur)`, -20, 0);
    ctx.restore();
    return;
  }

  // Bobbing animation when walking
  const bob = p.anim === 'walk' ? Math.sin(Date.now() * 0.015) * 2.5 : 0;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(0, 18, 12, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs
  ctx.fillStyle = '#2d3748';
  ctx.fillRect(-6, 8 + bob, 4, 10);
  ctx.fillRect(2, 8 - bob, 4, 10);

  // Body / Outfit
  ctx.fillStyle = p.color || (p.gender === 'boy' ? '#4a90e2' : '#ff6584');
  ctx.fillRect(-10, -8 + bob, 20, 16);

  // Head & Skin
  ctx.fillStyle = '#ffe0bd';
  ctx.beginPath();
  ctx.arc(0, -16 + bob, 12, 0, Math.PI * 2);
  ctx.fill();

  // Cheerful Blush cheeks
  ctx.fillStyle = 'rgba(255, 105, 132, 0.45)';
  ctx.beginPath();
  ctx.arc(-7, -13 + bob, 2.5, 0, Math.PI * 2);
  ctx.arc(7, -13 + bob, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#2d3748';
  ctx.fillRect(-5, -17 + bob, 2, 4);
  ctx.fillRect(3, -17 + bob, 2, 4);

  // Hair Style (Boy vs Girl)
  ctx.fillStyle = p.gender === 'boy' ? '#4a3728' : '#6b4226';
  if (p.gender === 'boy') {
    ctx.beginPath();
    ctx.arc(0, -22 + bob, 12, Math.PI, Math.PI * 2);
    ctx.fill();
  } else {
    // Girl hair with cute side bangs
    ctx.beginPath();
    ctx.arc(0, -22 + bob, 13, Math.PI, Math.PI * 2);
    ctx.fill();
    // Pigtails / hair strands
    ctx.fillRect(-14, -20 + bob, 4, 14);
    ctx.fillRect(10, -20 + bob, 4, 14);
    // Flower hair accessory
    ctx.fillStyle = '#ff6584';
    ctx.beginPath();
    ctx.arc(9, -23 + bob, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Name Tag
  ctx.font = 'bold 11px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  const nameWidth = ctx.measureText(p.name).width;
  ctx.fillRect(-nameWidth / 2 - 4, -44 + bob, nameWidth + 8, 16);
  ctx.fillStyle = p.id === myId ? '#68d391' : '#fff';
  ctx.fillText(p.name, 0, -32 + bob);

  // Emote Balloon
  if (p.emote) {
    ctx.font = '20px sans-serif';
    ctx.fillText(p.emote, 0, -50 + bob);
  }

  ctx.restore();
}

function drawAmbientLighting() {
  const hour = sharedState.timeOfDay;
  let overlayColor = 'rgba(0,0,0,0)';

  // Morning dawn (05:00 - 08:00): Soft peach/rose
  if (hour >= 5 && hour < 8) {
    const t = (hour - 5) / 3;
    overlayColor = `rgba(255, 180, 120, ${0.2 * (1 - t)})`;
  }
  // Sunset (16:30 - 19:30): Warm romantic golden orange
  else if (hour >= 16.5 && hour < 19.5) {
    overlayColor = 'rgba(255, 100, 50, 0.22)';
  }
  // Twilight / Night (19:30 - 05:00): Cozy dark blue
  else if (hour >= 19.5 || hour < 5) {
    overlayColor = 'rgba(15, 23, 42, 0.45)';

    // Fireflies come alive at night
    particles.forEach(pt => {
      ctx.save();
      ctx.fillStyle = '#ecc94b';
      ctx.globalAlpha = pt.alpha;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  if (overlayColor !== 'rgba(0,0,0,0)') {
    ctx.fillStyle = overlayColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

