// Game Client Engine for Desa Cinta Berdua
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Socket & PeerJS Network Setup
const socket = window.socket;

// Game State
let myId = null;
let mySlot = 0;
let myPlayerName = 'Zahy';
let myGender = 'boy';
let myColor = '#4A90E2';
let roomCode = 'AUREL-KITA';
let activeTool = 'hoe'; // 'hoe' | 'watering_can' | 'fishing_rod' | 'basket' | 'rose'
let toolSwingAnim = 0; // tool use animation timer

// ================= MASSIVE EXPANDED WORLD & CAMERA =================
const worldWidth = 2400;
const worldHeight = 1600;
const camera = { x: 0, y: 0 };

// ================= 2D KENNEY RETRO PIXEL ART ENGINE =================
ctx.imageSmoothingEnabled = false;

// 2D Pixel Tile Cache from asset2 packs (tiny-town, tiny-farm, tiny-city)
const tileCache = {};
function get2DTile(pack, index) {
  const pad = String(index).padStart(4, '0');
  const key = `${pack}_${pad}`;
  if (!tileCache[key]) {
    const img = new Image();
    img.src = `asset2/${pack}/Tiles/tile_${pad}.png`;
    // Fallback if served under assets2/
    img.onerror = () => {
      if (!img.src.includes('assets2/')) {
        img.src = `assets2/${pack}/Tiles/tile_${pad}.png`;
      }
    };
    tileCache[key] = img;
  }
  return tileCache[key];
}

function drawTile(pack, index, x, y, w = 32, h = 32, flipX = false) {
  const img = get2DTile(pack, index);
  if (img && img.complete && img.naturalWidth > 0) {
    if (flipX) {
      ctx.save();
      ctx.translate(x + w, y);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(img, x, y, w, h);
    }
    return true;
  }
  return false;
}

// Preload essential 2D character, nature, and building tiles
[0, 25, 36, 37, 48, 60, 66, 67, 68, 69, 70, 72, 73, 78, 79, 80, 81, 85, 86, 96, 97, 98, 99, 100, 101, 102, 103, 109, 113].forEach(i => get2DTile('tiny-town', i));
[0, 2, 24, 26, 36, 48, 49, 80, 81, 82, 84, 116, 117].forEach(i => get2DTile('tiny-farm', i));
[12, 13, 24, 36, 38, 40, 42, 48, 72, 84, 85].forEach(i => get2DTile('tiny-city', i));


// Solid World Collision Boxes across 2400x1600
const solidColliders = [
  // 1. Home North, West, East, South Walls
  { x1: 275, y1: 70, x2: 595, y2: 106 },
  { x1: 275, y1: 70, x2: 298, y2: 290 },
  { x1: 572, y1: 70, x2: 595, y2: 290 },
  { x1: 275, y1: 272, x2: 412, y2: 292 },
  { x1: 458, y1: 272, x2: 595, y2: 292 },
  // Home Furniture
  { x1: 375, y1: 108, x2: 450, y2: 155, tag: 'bed' },
  { x1: 472, y1: 108, x2: 518, y2: 152 }, // stove
  { x1: 522, y1: 106, x2: 562, y2: 152 }, // fridge
  { x1: 318, y1: 182, x2: 368, y2: 218 }, // table
  // Pak Joko Shop
  { x1: 722, y1: 65, x2: 825, y2: 128 },
  // Home Cafe Stand
  { x1: 618, y1: 318, x2: 692, y2: 366 },
  // 2. City Buildings in Downtown Plaza
  { x1: 820, y1: 910, x2: 950, y2: 1050 }, // City Hall
  { x1: 1020, y1: 910, x2: 1150, y2: 1050 }, // Bakery
  { x1: 1320, y1: 910, x2: 1450, y2: 1050 }, // Boutique
  { x1: 1520, y1: 910, x2: 1650, y2: 1050 }, // Bank
  // 3. Downtown Fountain
  { x1: 1175, y1: 1215, x2: 1225, y2: 1265, tag: 'fountain' },
  // 4. Forest Rocks & Trees
  { x1: 70, y1: 195, x2: 90, y2: 228 },
  { x1: 110, y1: 595, x2: 130, y2: 628 },
  { x1: 210, y1: 645, x2: 230, y2: 678 },
  { x1: 870, y1: 255, x2: 890, y2: 288 },
  { x1: 1820, y1: 220, x2: 1860, y2: 270 },
  { x1: 2150, y1: 220, x2: 2250, y2: 280 }
];

function isSolid(x, y, isSleeping = false) {
  // 2400 x 1600 World bounds
  if (x < 30 || x > 2370 || y < 40 || y > 1570) return true;

  // Deep Lake collision in Forest (dock at x: 1820..1910, y: 460..510 is walkable!)
  const inForestDock = (x >= 1810 && x <= 1915 && y >= 455 && y <= 515);
  if (!inForestDock) {
    const pDx = (x - 2000) / 180;
    const pDy = (y - 480) / 110;
    if (pDx * pDx + pDy * pDy < 1) return true;
  }

  // Business Store Walls (if built at x: 1020..1300, y: 240..420)
  // Has door opening at x: 1130..1190, y: 400..425
  if (sharedState && sharedState.store && sharedState.store.owned) {
    if (x >= 1020 && x <= 1300 && y >= 240 && y <= 420) {
      const isDoor = (x >= 1130 && x <= 1190 && y >= 390 && y <= 430);
      if (!isDoor) {
        // North wall
        if (y <= 270) return true;
        // West wall
        if (x <= 1040) return true;
        // East wall
        if (x >= 1280) return true;
        // South wall left
        if (x < 1130 && y >= 395) return true;
        // South wall right
        if (x > 1190 && y >= 395) return true;
        // Counter & Cash register collision inside
        if (x >= 1120 && x <= 1200 && y >= 310 && y <= 350) return true;
      }
    }
  }

  // Box colliders
  for (const box of solidColliders) {
    if (box.tag === 'bed' && isSleeping) continue;
    if (x >= box.x1 && x <= box.x2 && y >= box.y1 && y <= box.y2) {
      return true;
    }
  }
  return false;
}

// Living Animated NPCs & Citizens across the Town
const npcs = [
  {
    id: 'joko',
    name: 'Pak Joko',
    role: 'Petani Senior & Toko',
    avatar: '👨‍🌾',
    color: '#2b6cb0',
    x: 770, y: 140,
    targetX: 770, targetY: 140,
    dir: 'down', anim: 'idle',
    wanderTimer: 0,
    dialogues: [
      "Halo Zahy & Aurel! Senang melihat kalian berdua rukun merawat kebun ini.",
      "Tanaman stroberi butuh disiram air dengan penuh cinta agar cepat berbuah lebat lho!",
      "Jika hasil panen kalian melimpah, jual saja padaku, akan kubeli dengan harga terbaik!"
    ],
    actionType: 'shop'
  },
  {
    id: 'sri',
    name: 'Bu Sri',
    role: 'Warga Ramah & Ahli Resep',
    avatar: '👩‍🍳',
    color: '#e53e3e',
    x: 640, y: 400,
    targetX: 640, targetY: 400,
    dir: 'down', anim: 'idle',
    wanderTimer: 0,
    dialogues: [
      "Wah, pasangan serasi sekali kalian berdua! Rumah kalian kelihatan semakin asri dan nyaman.",
      "Tahukah kamu? Ikan bakar dan salad segar buatan tangan sendiri rasanya seribu kali lebih enak kalau dimakan berdua!",
      "Kalian sudah lihat kavling tanah di sebelah timur? Cocok sekali untuk kalian bangun toko impian berdua!"
    ],
    actionType: 'recipe_talk'
  },
  {
    id: 'somad',
    name: 'Kakek Somad',
    role: 'Tetua Desa Bijak',
    avatar: '👴',
    color: '#4a5568',
    x: 680, y: 530,
    targetX: 680, targetY: 530,
    dir: 'down', anim: 'idle',
    wanderTimer: 0,
    dialogues: [
      "Cinta sejati itu seperti menanam pohon. Harus disiram setiap hari dengan kesabaran, pengertian, dan senyuman.",
      "Saling menjaga ya kalian berdua. Kakek doakan hubungan kalian langgeng sampai kakek-nenek!",
      "Di pusat kota ada Air Mancur Harapan. Konon siapa yang melempar koin berdua, cintanya abadi."
    ],
    actionType: 'blessing'
  },
  {
    id: 'mimi',
    name: 'Mimi',
    role: 'Kucing Peliharaan Lucu',
    avatar: '🐱',
    isPet: true,
    x: 430, y: 310,
    targetX: 430, targetY: 310,
    dir: 'down', anim: 'idle',
    wanderTimer: 0
  },
  {
    id: 'mandor',
    name: 'Pak RT / Mandor',
    role: 'Pengelola Kavling Bisnis',
    avatar: '👷‍♂️',
    color: '#d69e2e',
    x: 1040, y: 380,
    targetX: 1040, targetY: 380,
    dir: 'down', anim: 'idle',
    wanderTimer: 0,
    dialogues: [
      "Halo pasangan muda! Kavling tanah bisnis seluas 400m² ini siap kalian beli seharga 120 koin.",
      "Jika sudah kalian beli, kalian bisa membangun toko besar dan menyewa karyawan bot untuk jualan!",
      "Bisnis berdua adalah kunci masa depan yang cerah dan mandiri!"
    ],
    actionType: 'property'
  },
  // City Citizens walking in Town Center
  {
    id: 'andi',
    name: 'Andi (Warga Kota)',
    role: 'Pecinta Kopi & Belanja',
    avatar: '🧑',
    color: '#319795',
    x: 1100, y: 1100,
    targetX: 1100, targetY: 1100,
    dir: 'down', anim: 'walk',
    wanderTimer: 0,
    dialogues: [
      "Pusat kota hari ini ramai sekali ya! Senang rasanya jalan-jalan di alun-alun.",
      "Saya sedang mencari toko baru yang menjual makanan segar buatan lokal."
    ]
  },
  {
    id: 'rina',
    name: 'Rina (Warga Kota)',
    role: 'Penggemar Bunga & Fashion',
    avatar: '👩',
    color: '#9f7aea',
    x: 1350, y: 1200,
    targetX: 1350, targetY: 1200,
    dir: 'down', anim: 'walk',
    wanderTimer: 0,
    dialogues: [
      "Air mancur di tengah alun-alun kota ini sangat romantis di malam hari!",
      "Kalian pasangan pengantin baru ya? Semoga selalu bahagia ya!"
    ]
  },
  {
    id: 'bayu',
    name: 'Bayu (Petualang)',
    role: 'Pecinta Alam & Danau',
    avatar: '🧗‍♂️',
    color: '#38a169',
    x: 1850, y: 460,
    targetX: 1850, targetY: 460,
    dir: 'down', anim: 'walk',
    wanderTimer: 0,
    dialogues: [
      "Danau di hutan mini ini airnya jernih sekali! Ikan mas dan mujair banyak berenang di sini.",
      "Di sebelah timur ada tenda kemping dan api unggun, cocok sekali untuk duduk berdua saat malam hari!"
    ]
  }
];

let players = {};
let sharedState = {
  coins: 100,
  lovePoints: 10,
  fridge: [],
  loveNotes: [],
  cafeStand: { stockedItems: [], totalSold: 0 },
  store: { owned: false, level: 1, hiredEmployees: [], stockedItems: [], dailyRevenue: 0, visitorCount: 0 },
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

// Tool Hotbar Handlers (1-5 keys and click)
function selectTool(toolName) {
  activeTool = toolName;
  document.querySelectorAll('.tool-slot').forEach(slot => {
    if (slot.dataset.tool === toolName) slot.classList.add('active');
    else slot.classList.remove('active');
  });
  window.soundManager?.playTone(600, 'triangle', 0.08, 0.08);

  // Sync tool to partner
  if (myId && players[myId]) {
    players[myId].tool = activeTool;
    socket.emit('player_move', {
      x: Math.round(players[myId].x),
      y: Math.round(players[myId].y),
      dir: players[myId].dir,
      anim: players[myId].anim,
      tool: activeTool
    });
  }
}

document.querySelectorAll('.tool-slot').forEach(slot => {
  slot.addEventListener('click', () => {
    selectTool(slot.dataset.tool);
  });
});

window.addEventListener('keydown', (e) => {
  if (['1', '2', '3', '4', '5'].includes(e.key)) {
    const tools = ['hoe', 'watering_can', 'fishing_rod', 'basket', 'rose'];
    const idx = parseInt(e.key) - 1;
    if (tools[idx]) selectTool(tools[idx]);
  }
});

// NPC Dialogue Modal
let currentDialogueNpc = null;
function openDialogue(npc) {
  currentDialogueNpc = npc;
  const box = document.getElementById('npc-dialogue-box');
  document.getElementById('dialogue-avatar').innerText = npc.avatar;
  document.getElementById('dialogue-name').innerText = npc.name;
  document.getElementById('dialogue-role').innerText = npc.role;

  // Pick random dialogue
  const randomText = npc.dialogues[Math.floor(Math.random() * npc.dialogues.length)];
  document.getElementById('dialogue-text').innerText = `"${randomText}"`;

  const primBtn = document.getElementById('dialogue-primary-btn');
  if (npc.actionType === 'shop') {
    primBtn.innerText = 'Buka Toko 🏪';
    primBtn.style.display = 'block';
    primBtn.onclick = () => { closeDialogue(); openModal('modal-shop'); };
  } else if (npc.actionType === 'blessing') {
    primBtn.innerText = 'Minta Berkah Cinta ❤️';
    primBtn.style.display = 'block';
    primBtn.onclick = () => {
      closeDialogue();
      window.soundManager?.playLove();
      addFloatingText(npc.x, npc.y - 30, '✨ Kakek Somad memberikan restu cinta! (+10 Love Points)', '#ff6584');
      socket.emit('couple_action', { actionType: 'hug' });
    };
  } else if (npc.actionType === 'recipe_talk') {
    primBtn.innerText = 'Lihat Dapur Resep 🍳';
    primBtn.style.display = 'block';
    primBtn.onclick = () => { closeDialogue(); openModal('modal-kitchen'); };
  } else {
    primBtn.style.display = 'none';
  }

  box.style.display = 'flex';
}

function closeDialogue() {
  const box = document.getElementById('npc-dialogue-box');
  if (box) box.style.display = 'none';
  currentDialogueNpc = null;
}
window.closeDialogue = closeDialogue;

// Fullscreen toggle
document.getElementById('btn-fullscreen').addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => console.log(err));
  } else {
    document.exitFullscreen().catch(err => console.log(err));
  }
});

// Canvas Click / Tap to Move (World Coordinate with Camera)
canvas.addEventListener('pointerdown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const clickX = (e.clientX - rect.left) * scaleX + camera.x;
  const clickY = (e.clientY - rect.top) * scaleY + camera.y;

  // Set destination in world coordinates
  targetMovePos = { x: clickX, y: clickY };
});

// Fireflies for evening / night across 2400 x 1600
for (let i = 0; i < 60; i++) {
  particles.push({
    x: Math.random() * worldWidth,
    y: Math.random() * worldHeight,
    vx: (Math.random() - 0.5) * 0.4,
    vy: (Math.random() - 0.5) * 0.4,
    radius: 1.5 + Math.random() * 2,
    alpha: Math.random()
  });
}

// ================= LOBBY & SETUP =================
// Restore previous player name, room, and avatar
const savedName = localStorage.getItem('desa_cinta_my_name');
if (savedName) {
  myPlayerName = savedName;
  document.getElementById('input-player-name').value = savedName;
}

const savedRoom = localStorage.getItem('desa_cinta_room_code');
if (savedRoom) {
  roomCode = savedRoom;
  document.getElementById('input-room-code').value = savedRoom;
}

const savedGender = localStorage.getItem('desa_cinta_my_gender');
if (savedGender) {
  myGender = savedGender;
  document.querySelectorAll('.avatar-option').forEach(o => {
    if (o.dataset.gender === savedGender) {
      document.querySelectorAll('.avatar-option').forEach(el => el.classList.remove('active'));
      o.classList.add('active');
      myColor = o.dataset.color;
    }
  });
}

// Auto-save notification in HUD
window.showSaveIndicator = function() {
  const pill = document.getElementById('save-indicator');
  if (pill) {
    pill.style.opacity = '1';
    setTimeout(() => { pill.style.opacity = '0'; }, 1500);
  }
};

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

  // Save profile to localStorage
  localStorage.setItem('desa_cinta_my_name', myPlayerName);
  localStorage.setItem('desa_cinta_room_code', roomCode);
  localStorage.setItem('desa_cinta_my_gender', myGender);

  // Hide lobby
  document.getElementById('lobby-screen').style.display = 'none';
  document.getElementById('hud-player-name').innerText = myPlayerName;
  document.getElementById('hud-room-code').innerText = roomCode;

  // Initialize Audio
  window.soundManager.startBGM();

  // Join Room (Works on local Socket.io OR Netlify/GitHub Pages P2P)
  socket.init({
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

  if (!sharedState.store) {
    sharedState.store = { owned: false, level: 1, hiredEmployees: [], stockedItems: [], dailyRevenue: 0, visitorCount: 0 };
  }

  updateHUD();
  updateFridgeUI();
  updateLoveNotesUI();
  updateShopSellUI();
  updateCafeUI();
  updateStoreUI();

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

socket.on('player_moved', ({ id, x, y, dir, anim, tool }) => {
  if (players[id]) {
    players[id].x = x;
    players[id].y = y;
    players[id].dir = dir;
    players[id].anim = anim;
    if (tool) players[id].tool = tool;
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

// Store & Business Events
socket.on('land_bought', (data) => {
  sharedState.store = data.store;
  sharedState.coins = data.coins;
  sharedState.lovePoints = data.lovePoints;
  window.soundManager?.playLove();
  addFloatingText(1160, 260, data.message, '#ff6584');
  updateHUD();
  updateStoreUI();
});

socket.on('employee_hired', (data) => {
  sharedState.store = data.store;
  sharedState.coins = data.coins;
  sharedState.lovePoints = data.lovePoints;
  window.soundManager?.playCoin();
  addFloatingText(1160, 260, data.message, '#38a169');
  updateHUD();
  updateStoreUI();
});

socket.on('store_stocked', (data) => {
  sharedState.store = data.store;
  sharedState.fridge = data.fridge;
  updateStoreUI();
  updateFridgeUI();
});

socket.on('store_sale', (data) => {
  sharedState.coins = data.coins;
  sharedState.lovePoints = data.lovePoints;
  sharedState.store = data.store;
  window.soundManager?.playCoin();
  addFloatingText(1160, 260, `🏪 Toko laku! 1x ${data.item} terjual (+🪙${data.price})`, '#38a169');
  updateHUD();
  updateStoreUI();
});

socket.on('fountain_wished', (data) => {
  sharedState.coins = data.coins;
  sharedState.lovePoints = data.lovePoints;
  window.soundManager?.playLove();
  addFloatingText(1200, 1200, data.message, '#ff477e');
  updateHUD();
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

// ================= STORE & BUSINESS MODALS =================
function openBuyLandModal() {
  const coinEl = document.getElementById('buy-land-coins');
  if (coinEl) coinEl.innerText = sharedState.coins;
  openModal('modal-buy-land');
}
window.openBuyLandModal = openBuyLandModal;

function confirmBuyLand() {
  if (sharedState.coins < 120) {
    if (myId && players[myId]) addFloatingText(players[myId].x, players[myId].y - 30, 'Koin belum cukup (Butuh 120)! 🪙', '#e53e3e');
    window.soundManager?.playTone(300, 'sine', 0.1, 0.2);
    return;
  }
  socket.emit('buy_land');
  closeAllModals();
}
window.confirmBuyLand = confirmBuyLand;

function openManageStoreModal() {
  updateStoreUI();
  openModal('modal-manage-store');
}
window.openManageStoreModal = openManageStoreModal;

function updateStoreUI() {
  const store = sharedState.store || { owned: false, level: 1, hiredEmployees: [], stockedItems: [], dailyRevenue: 0, visitorCount: 0 };
  const revEl = document.getElementById('store-daily-revenue');
  if (revEl) revEl.innerText = store.dailyRevenue || 0;
  const visEl = document.getElementById('store-visitor-count');
  if (visEl) visEl.innerText = store.visitorCount || 0;

  // Button Rani
  const raniBtn = document.getElementById('btn-hire-rani');
  if (raniBtn) {
    if (store.hiredEmployees && store.hiredEmployees.includes('rani')) {
      raniBtn.innerText = 'Sudah Bekerja ✅';
      raniBtn.disabled = true;
      raniBtn.style.background = '#a0aec0';
    } else {
      raniBtn.innerText = 'Sewa Rani (🪙 25)';
      raniBtn.disabled = false;
      raniBtn.style.background = '#4a90e2';
    }
  }

  // Button Doni
  const doniBtn = document.getElementById('btn-hire-doni');
  if (doniBtn) {
    if (store.hiredEmployees && store.hiredEmployees.includes('doni')) {
      doniBtn.innerText = 'Sudah Bekerja ✅';
      doniBtn.disabled = true;
      doniBtn.style.background = '#a0aec0';
    } else {
      doniBtn.innerText = 'Sewa Doni (🪙 30)';
      doniBtn.disabled = false;
      doniBtn.style.background = '#4a90e2';
    }
  }

  // Stock Grid
  const stockGrid = document.getElementById('store-stock-grid');
  if (!stockGrid) return;
  stockGrid.innerHTML = '';

  const readyItems = sharedState.fridge.filter(i => (i.id.includes('salad') || i.id.includes('grilled') || i.id.startsWith('crop_') || i.id.startsWith('fish_') || i.id.includes('bread')) && i.count > 0);
  if (readyItems.length === 0) {
    stockGrid.innerHTML = '<p style="font-size:12px; color:#a0aec0;">Kulkas kosong. Panen sayur atau masak makanan dulu untuk dipajang di rak toko!</p>';
    return;
  }

  readyItems.forEach(item => {
    const card = document.createElement('div');
    card.className = 'item-card';
    card.innerHTML = `
      <span class="item-icon">${item.icon || '📦'}</span>
      <div class="item-name">${item.name}</div>
      <div class="item-count">Di Kulkas: ${item.count}</div>
      <button class="btn-item-action" style="background:#38a169;" onclick="stockStoreItem('${item.id}')">Pajang di Rak 📦</button>
    `;
    stockGrid.appendChild(card);
  });
}
window.updateStoreUI = updateStoreUI;

function hireEmployee(employeeId, cost) {
  if (sharedState.coins < cost) {
    if (myId && players[myId]) addFloatingText(players[myId].x, players[myId].y - 30, `Koin tidak cukup (Butuh ${cost})! 🪙`, '#e53e3e');
    window.soundManager?.playTone(300, 'sine', 0.1, 0.2);
    return;
  }
  socket.emit('hire_employee', { employeeId, cost });
}
window.hireEmployee = hireEmployee;

function stockStoreItem(itemId) {
  socket.emit('stock_store', { itemId });
}
window.stockStoreItem = stockStoreItem;

function makeFountainWish() {
  if (sharedState.coins < 1) {
    if (myId && players[myId]) addFloatingText(players[myId].x, players[myId].y - 30, 'Kamu butuh 1 koin untuk melempar harapan! 🪙', '#e53e3e');
    return;
  }
  socket.emit('make_fountain_wish');
  closeAllModals();
}
window.makeFountainWish = makeFountainWish;

// ================= GAME LOGIC & INTERACTION =================
function handleInteraction() {
  if (!nearbyTarget) return;

  const p = players[myId];

  // Tool swing animation
  toolSwingAnim = 1.0;

  if (nearbyTarget.type === 'give_rose') {
    window.soundManager?.playLove();
    addFloatingText(p.x, p.y - 40, '🌹 Hadiah Mawar Merah untuk Pacar Tersayang! 💖', '#ff1493');
    socket.emit('couple_action', { actionType: 'kiss' });
  } else if (nearbyTarget.type === 'buy_land') {
    openBuyLandModal();
  } else if (nearbyTarget.type === 'manage_store') {
    openManageStoreModal();
  } else if (nearbyTarget.type === 'fountain') {
    openModal('modal-fountain');
  } else if (nearbyTarget.type === 'pet') {
    window.soundManager?.playMeow();
    addFloatingText(nearbyTarget.x, nearbyTarget.y - 25, 'Purrr~ Meoww! Mimi senang dielus! 🐱❤️', '#ff6584');
    socket.emit('couple_action', { actionType: 'hug' });
  } else if (nearbyTarget.type === 'npc') {
    openDialogue(nearbyTarget.npc);
  } else if (nearbyTarget.type === 'bed') {
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
  } else if (nearbyTarget.type === 'cafe_stand') {
    openModal('modal-cafe');
  } else if (nearbyTarget.type === 'pond') {
    if (p.energy < 5) {
      addFloatingText(p.x, p.y - 30, 'Kamu terlalu lelah untuk mancing! Istirahat dulu 💤', '#e53e3e');
      return;
    }
    window.soundManager?.playSplash();
    addFloatingText(p.x, p.y - 30, 'Melempar kail ke danau... 🎣', '#3182ce');
    setTimeout(() => {
      socket.emit('fish_caught', { fishType: 'Ikan Mas Danau Cantik', size: 1 });
    }, 1200);
  } else if (nearbyTarget.type === 'farming_plot') {
    const plot = nearbyTarget.plot;

    if (plot.state === 'empty') {
      window.soundManager?.playPlant();
      socket.emit('farming_action', { plotId: plot.id, action: 'till' });
      addFloatingText(plot.x, plot.y - 10, 'Mencangkul tanah subur! 🌱', '#d69e2e');
    } else if (plot.state === 'tilled') {
      const hasBerry = sharedState.fridge.some(i => i.id === 'seed_strawberry' && i.count > 0);
      const hasCarrot = sharedState.fridge.some(i => i.id === 'seed_carrot' && i.count > 0);
      const crop = hasBerry ? 'strawberry' : hasCarrot ? 'carrot' : null;
      if (crop) {
        window.soundManager?.playPlant();
        socket.emit('farming_action', { plotId: plot.id, action: 'plant', cropType: crop });
        addFloatingText(plot.x, plot.y - 10, `Menanam ${crop === 'strawberry' ? 'Stroberi 🍓' : 'Wortel 🥕'}!`, '#38a169');
      } else {
        addFloatingText(plot.x, plot.y - 10, 'Beli bibit dulu di Toko Pak Joko! 🛒', '#e53e3e');
      }
    } else if (plot.state === 'planted') {
      window.soundManager?.playWater();
      socket.emit('farming_action', { plotId: plot.id, action: 'water' });
      addFloatingText(plot.x, plot.y - 10, 'Menyiram tanaman dengan cinta! 💧✨', '#3182ce');
    } else if (plot.state === 'ready') {
      window.soundManager?.playHarvest();
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

  // Tool animation decay
  if (toolSwingAnim > 0) toolSwingAnim = Math.max(0, toolSwingAnim - dt * 3);

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
        p.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      } else {
        targetMovePos = null;
        if (nearbyTarget) handleInteraction();
      }
    }

    if (dx !== 0 && dy !== 0) {
      dx *= 0.7071;
      dy *= 0.7071;
    }

    if (dx !== 0 || dy !== 0) {
      const newX = p.x + dx * speed;
      const newY = p.y + dy * speed;

      // Solid collision resolution (sliding against walls)
      if (!isSolid(newX, p.y, p.isSleeping)) p.x = newX;
      if (!isSolid(p.x, newY, p.isSleeping)) p.y = newY;

      p.anim = 'walk';

      // Send to partner with tool
      socket.emit('player_move', {
        x: Math.round(p.x),
        y: Math.round(p.y),
        dir: p.dir,
        anim: p.anim,
        tool: activeTool
      });
    } else {
      p.anim = 'idle';
    }

    // Camera smooth follow local player across 2400 x 1600
    const targetCamX = Math.max(0, Math.min(worldWidth - canvas.width, p.x - canvas.width / 2));
    const targetCamY = Math.max(0, Math.min(worldHeight - canvas.height, p.y - canvas.height / 2));
    camera.x += (targetCamX - camera.x) * 0.12;
    camera.y += (targetCamY - camera.y) * 0.12;
  }

  // Update NPCs & Pets AI Loop
  npcs.forEach(npc => {
    npc.wanderTimer += dt;
    if (npc.wanderTimer > (npc.isPet ? 2.5 : 4.5)) {
      npc.wanderTimer = 0;
      if (Math.random() < 0.65) {
        let maxRange = npc.isPet ? 45 : 65;
        let base = { x: npc.x, y: npc.y };
        if (npc.id === 'joko') base = { x: 770, y: 140 };
        else if (npc.id === 'sri') base = { x: 640, y: 400 };
        else if (npc.id === 'somad') base = { x: 680, y: 530 };
        else if (npc.id === 'mimi') base = { x: 430, y: 310 };
        else if (npc.id === 'budi') base = { x: 660, y: 345 };

        let candX = base.x + (Math.random() - 0.5) * maxRange * 2;
        let candY = base.y + (Math.random() - 0.5) * maxRange * 2;
        if (!isSolid(candX, candY)) {
          npc.targetX = candX;
          npc.targetY = candY;
        }
      }
    }

    // Move NPC towards target
    const dist = Math.hypot(npc.targetX - npc.x, npc.targetY - npc.y);
    if (dist > 4) {
      const spd = npc.isPet ? 1.4 : 0.8;
      const nx = (npc.targetX - npc.x) / dist;
      const ny = (npc.targetY - npc.y) / dist;
      if (!isSolid(npc.x + nx * spd, npc.y + ny * spd)) {
        npc.x += nx * spd;
        npc.y += ny * spd;
        npc.anim = 'walk';
        npc.dir = Math.abs(nx) > Math.abs(ny) ? (nx > 0 ? 'right' : 'left') : (ny > 0 ? 'down' : 'up');
      } else {
        npc.targetX = npc.x;
        npc.targetY = npc.y;
      }
    } else {
      npc.anim = 'idle';
    }
  });

  // Check proximity for interactive zones & NPCs
  checkProximity(p);

  // Update floating texts
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i];
    ft.y += ft.dy;
    ft.alpha -= 0.015;
    if (ft.alpha <= 0) floatingTexts.splice(i, 1);
  }

  // Update firefly particles across 2400 x 1600
  particles.forEach(pt => {
    pt.x = (pt.x + pt.vx + worldWidth) % worldWidth;
    pt.y = (pt.y + pt.vy + worldHeight) % worldHeight;
    pt.alpha = 0.3 + 0.7 * Math.sin(Date.now() * 0.003 + pt.x);
  });
}

function checkProximity(p) {
  const promptEl = document.getElementById('interaction-prompt');
  nearbyTarget = null;

  // 0. Partner Proximity (Rose gift)
  const partnerId = Object.keys(players).find(id => id !== myId);
  if (partnerId && players[partnerId]) {
    const partner = players[partnerId];
    if (Math.hypot(p.x - partner.x, p.y - partner.y) < 55) {
      if (activeTool === 'rose') {
        nearbyTarget = { type: 'give_rose', text: `Tekan [E] untuk Berikan Mawar Cinta ke ${partner.name}! 🌹❤️` };
      }
    }
  }

  // 1. Check Living NPCs & Pet
  if (!nearbyTarget) {
    for (const npc of npcs) {
      if (Math.hypot(p.x - npc.x, p.y - npc.y) < 48) {
        if (npc.isPet) {
          nearbyTarget = { type: 'pet', x: npc.x, y: npc.y, text: 'Tekan [E] untuk Elus Mimi si Kucing 🐾❤️' };
        } else {
          nearbyTarget = { type: 'npc', npc, text: `Tekan [E] untuk Bicara dengan ${npc.name} (${npc.role}) 💬` };
        }
        break;
      }
    }
  }

  // 2. Bed (inside house, around x: 380-450, y: 150-200)
  if (!nearbyTarget && Math.hypot(p.x - 410, p.y - 150) < 55) {
    nearbyTarget = { type: 'bed', text: 'Tekan [E] untuk Tidur di Ranjang Berdua 🛌' };
  }
  // 3. Stove / Kitchen (x: 490, y: 160)
  else if (!nearbyTarget && Math.hypot(p.x - 495, p.y - 160) < 50) {
    nearbyTarget = { type: 'kitchen', text: 'Tekan [E] untuk Memasak di Dapur 🍳' };
  }
  // 4. Fridge (x: 540, y: 160)
  else if (!nearbyTarget && Math.hypot(p.x - 540, p.y - 160) < 50) {
    nearbyTarget = { type: 'fridge', text: 'Tekan [E] untuk Buka Kulkas & Tas 🎒' };
  }
  // 5. Love Notes Board (x: 320, y: 165)
  else if (!nearbyTarget && Math.hypot(p.x - 330, p.y - 160) < 50) {
    nearbyTarget = { type: 'love_notes', text: 'Tekan [E] untuk Papan Surat Cinta 💌' };
  }
  // 6. Cafe / Business Stand (x: 640, y: 350)
  else if (!nearbyTarget && Math.hypot(p.x - 640, p.y - 350) < 55) {
    nearbyTarget = { type: 'cafe_stand', text: 'Tekan [E] untuk Kelola Kedai Berdua ☕' };
  }
  // 7. Pond / Lake (around dock x: 740, y: 610)
  else if (!nearbyTarget && Math.hypot(p.x - 740, p.y - 610) < 65) {
    nearbyTarget = { type: 'pond', text: 'Tekan [E] untuk Melempar Joran Mancing di Danau 🎣' };
  }
  // 8. Forest Lake Fishing Pier (x: 1860, y: 480)
  else if (!nearbyTarget && Math.hypot(p.x - 1860, p.y - 480) < 70) {
    nearbyTarget = { type: 'pond', text: 'Tekan [E] untuk Mancing Ikan Mas di Danau Hutan 🎣🌊' };
  }
  // 9. Commercial Plot / Toko Zahy & Aurel (x: 1000..1300, y: 220..420)
  else if (!nearbyTarget) {
    const store = sharedState.store || { owned: false };
    if (store.owned) {
      if (p.x >= 1040 && p.x <= 1280 && p.y >= 260 && p.y <= 420) {
        nearbyTarget = { type: 'manage_store', text: 'Tekan [E] untuk Kelola Toko Zahy & Aurel / Sewa Bot 🏪' };
      }
    } else {
      if (Math.hypot(p.x - 1050, p.y - 380) < 70 || (p.x >= 1010 && p.x <= 1300 && p.y >= 230 && p.y <= 420)) {
        nearbyTarget = { type: 'buy_land', text: 'Tekan [E] untuk Beli Kavling Tanah Toko (🪙 120) 🏗️' };
      }
    }
  }
  // 10. City Wishing Fountain (x: 1200, y: 1240)
  if (!nearbyTarget && Math.hypot(p.x - 1200, p.y - 1240) < 75) {
    nearbyTarget = { type: 'fountain', text: 'Tekan [E] untuk Lempar Koin Harapan Cinta ke Air Mancur ⛲🪙' };
  }
  // 11. Farm Plots
  else if (!nearbyTarget) {
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

  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  // 1. Draw Outdoor Grass, Grand Boulevard & Connecting Roads (2400x1600)
  drawEnvironment();

  // 2. Draw House & Indoor Furniture
  drawHouse();

  // 3. Draw Farm Plots & Crops
  drawFarmingPlots();

  // 4. Draw Commercial Plot & Toko Zahy & Aurel (Couple Mart)
  drawBusinessPlotAndStore();

  // 5. Draw Downtown Plaza, City Buildings & Wishing Fountain
  drawCityCenterAndBuildings();

  // 6. Draw Mini Forest, Romantic Lake, Fishing Pier & Campsite
  drawForestAndCampingLake();

  // 7. Draw Cafe Stand & Old Village Pond
  drawCafeStand();
  drawPond();

  // 8. Draw Living NPCs, Citizens & Mimi the Cat
  drawNPCs();

  // 9. Draw Hand-holding Link if lovers are holding hands
  drawHandHoldingLink();

  // 10. Draw Players (Zahy & Aurel)
  const sortedPlayers = Object.values(players).sort((a, b) => a.y - b.y);
  sortedPlayers.forEach(p => drawPlayer(p));

  // 11. Floating Texts
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

  // 12. Ambient Day/Night Lighting Overlay & Fireflies
  drawAmbientLighting();

  ctx.restore();

  // 13. Radar Minimap HUD (Screen space bottom-right)
  drawMinimap();

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
  // Vibrant 2D grass background
  ctx.fillStyle = '#659b5e';
  ctx.fillRect(0, 0, worldWidth, worldHeight);

  // Decorative grass tiles & tufts from Kenney tiny-town
  for (let gx = 0; gx < worldWidth; gx += 32) {
    for (let gy = 0; gy < worldHeight; gy += 32) {
      if ((gx * 7 + gy * 13) % 97 === 0) {
        drawTile('tiny-town', 1, gx, gy, 32, 32);
      } else if ((gx * 3 + gy * 17) % 131 === 0) {
        drawTile('tiny-town', 2, gx, gy, 32, 32);
      }
    }
  }

  // ================= MAIN ROADS & BOULEVARDS =================
  // 1. Grand East-West Boulevard (Connecting Home, Store, Plaza & Forest)
  for (let rx = 200; rx < 2200; rx += 32) {
    drawTile('tiny-town', 25, rx, 680, 32, 32);
    drawTile('tiny-town', 25, rx, 712, 32, 32);
  }

  // 2. Cobblestone / Dirt Path connecting Home, Garden, Pond, and Shop
  for (let py = 280; py < 680; py += 32) {
    drawTile('tiny-town', 25, 416, py, 32, 32);
  }
  for (let px = 352; px < 544; px += 32) {
    drawTile('tiny-town', 25, px, 520, 32, 32);
  }
  for (let px = 448; px < 640; px += 32) {
    drawTile('tiny-town', 25, px, 340, 32, 32);
  }
  for (let py = 340; py < 680; py += 32) {
    drawTile('tiny-town', 25, 630, py, 32, 32);
  }
  for (let px = 630; px < 730; px += 32) {
    drawTile('tiny-town', 25, px, 520, 32, 32);
  }
  for (let px = 448; px < 1030; px += 32) {
    drawTile('tiny-town', 25, px, 210, 32, 32);
  }
  for (let py = 420; py < 680; py += 32) {
    drawTile('tiny-town', 25, 1140, py, 32, 32);
  }

  // 3. Grand Downtown Boulevard from East-West Boulevard down to Downtown Plaza
  for (let py = 732; py < 880; py += 32) {
    for (let px = 1152; px < 1248; px += 32) {
      drawTile('tiny-city', 12, px, py, 32, 32);
    }
  }

  // Decorative Little Flowers
  const flowerPositions = [
    { x: 120, y: 380 }, { x: 150, y: 410 }, { x: 190, y: 360 },
    { x: 280, y: 580 }, { x: 570, y: 640 }, { x: 880, y: 380 },
    { x: 950, y: 240 }, { x: 1330, y: 230 }, { x: 1050, y: 640 },
    { x: 1350, y: 640 }, { x: 1680, y: 620 }, { x: 1720, y: 760 }
  ];
  flowerPositions.forEach(f => {
    drawTile('tiny-town', 1, f.x - 8, f.y - 8, 20, 20);
  });

  // Trees near home and roads
  drawTree(80, 200);
  drawTree(120, 600);
  drawTree(220, 650);
  drawTree(880, 260);
  drawTree(960, 460);
}

function drawTree(x, y) {
  if (!drawTile('tiny-town', 48, x - 18, y - 36, 40, 48)) {
    ctx.fillStyle = '#795548';
    ctx.fillRect(x - 8, y, 16, 30);
    ctx.fillStyle = '#2e7d32';
    ctx.beginPath();
    ctx.arc(x, y - 8, 30, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHouse() {
  const hx = 280;
  const hy = 80;
  const hw = 310;
  const hh = 210;

  // Outdoor shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(hx - 5, hy + hh - 5, hw + 10, 15);

  // House Floor: 2D Wood Floor Tiles (tiny-town tile 72)
  for (let fx = hx; fx < hx + hw; fx += 32) {
    for (let fy = hy + 24; fy < hy + hh; fy += 32) {
      drawTile('tiny-town', 72, fx, fy, 32, 32);
    }
  }

  // House Walls (tiny-town tile 73)
  for (let wx = hx; wx < hx + hw; wx += 32) {
    drawTile('tiny-town', 73, wx, hy, 32, 28);
  }
  for (let wy = hy; wy < hy + hh; wy += 32) {
    drawTile('tiny-town', 73, hx, wy, 20, 32);
    drawTile('tiny-town', 73, hx + hw - 20, wy, 20, 32);
  }
  // South wall leaving doorway at 415..455
  for (let wx = hx; wx < 415; wx += 32) {
    drawTile('tiny-town', 73, wx, hy + hh - 20, 32, 20);
  }
  for (let wx = 455; wx < hx + hw; wx += 32) {
    drawTile('tiny-town', 73, wx, hy + hh - 20, 32, 20);
  }

  // Door tile (tiny-town 85)
  drawTile('tiny-town', 85, 415, hy + hh - 24, 36, 28);

  // Roof ridge (tiny-town tiles 36, 37, 38)
  for (let rx = hx - 16; rx < hx + hw + 16; rx += 32) {
    drawTile('tiny-town', 37, rx, hy - 16, 32, 24);
  }

  // ============ FURNITURE INSIDE (2D TILES) ============
  // 1. Bed (tiny-town tile 66)
  drawTile('tiny-town', 66, 380, 110, 48, 48);
  ctx.font = '12px sans-serif';
  ctx.fillText('❤️', 398, 140);

  // 2. Kitchen Stove (tiny-town tile 70)
  drawTile('tiny-town', 70, 480, 110, 36, 36);

  // 3. Fridge / Cupboard (tiny-town tile 69)
  drawTile('tiny-town', 69, 526, 110, 36, 40);

  // 4. Dining Table & Chairs (tiny-town 67 table, 68 chair)
  drawTile('tiny-town', 68, 305, 185, 24, 28);
  drawTile('tiny-town', 67, 330, 185, 32, 32);
  drawTile('tiny-town', 68, 362, 185, 24, 28, true);

  // 5. Love Board on Wall (x: 310, y: 110)
  ctx.fillStyle = '#ffeaa7';
  ctx.fillRect(310, 110, 48, 34);
  ctx.strokeStyle = '#d63031';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(310, 110, 48, 34);
  ctx.font = 'bold 10px sans-serif';
  ctx.fillStyle = '#d63031';
  ctx.textAlign = 'center';
  ctx.fillText('💌 PESAN', 334, 124);
  ctx.fillText('CINTA', 334, 137);
}

function drawFarmingPlots() {
  farmingPlots.forEach(plot => {
    // Soil Tile: empty = 0, tilled = 2, watered/ready = 26 from tiny-farm
    const soilTile = (plot.state === 'empty') ? 0 : (plot.state === 'tilled' ? 2 : 26);
    drawTile('tiny-farm', soilTile, plot.x, plot.y, 42, 42);

    // Crops
    if (plot.cropType) {
      if (plot.state === 'ready') {
        const cropTile = plot.cropType === 'strawberry' ? 48 : 49;
        drawTile('tiny-farm', cropTile, plot.x + 5, plot.y + 5, 32, 32);
      } else {
        const cropTile = (plot.growthProgress < 50) ? 24 : 36;
        drawTile('tiny-farm', cropTile, plot.x + 5, plot.y + 5, 32, 32);
      }
    }
  });

  // Garden picket fences (tiny-farm 84)
  for (let fx = 180; fx <= 360; fx += 32) {
    drawTile('tiny-farm', 84, fx, 490, 32, 24);
  }

  // Garden sign (tiny-town 83)
  drawTile('tiny-town', 83, 320, 546, 28, 28);
  ctx.font = 'bold 9px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText('KEBUN', 334, 542);
}

function drawPond() {
  const px = 730;
  const py = 570;
  const pw = 160;
  const ph = 100;

  // Pond water tiles from tiny-town 109
  for (let x = px; x < px + pw; x += 32) {
    for (let y = py; y < py + ph; y += 32) {
      drawTile('tiny-town', 109, x, y, 32, 32);
    }
  }

  // Ripples
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(px + 60, py + 40, 20, 0, Math.PI * 0.8);
  ctx.stroke();

  // Wooden dock / pier tiles (tiny-town 78, 79, 80)
  drawTile('tiny-town', 78, px - 15, py + 35, 32, 30);
  drawTile('tiny-town', 79, px + 17, py + 35, 32, 30);

  // Fishing rod sign
  ctx.font = '16px sans-serif';
  ctx.fillText('🎣', px + 5, py + 56);
}

function drawCafeStand() {
  const sx = 620;
  const sy = 320;

  // Wooden stall structure using tiny-town tiles
  drawTile('tiny-town', 72, sx, sy + 15, 36, 30);
  drawTile('tiny-town', 72, sx + 34, sy + 15, 36, 30);

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
  // Draw all living animated NPCs & pets using Kenney 2D tiles
  npcs.forEach(npc => {
    ctx.save();
    ctx.translate(npc.x, npc.y);

    const bob = npc.anim === 'walk' ? Math.sin(Date.now() * 0.015) * 3 : 0;
    const isLeft = npc.dir === 'left';

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(0, 14, npc.isPet ? 10 : 12, npc.isPet ? 5 : 6, 0, 0, Math.PI * 2);
    ctx.fill();

    if (npc.isPet) {
      // ===== DRAW MIMI THE ORANGE CAT (tiny-town 113) =====
      if (!drawTile('tiny-town', 113, -16, -24 + bob, 32, 32, isLeft)) {
        ctx.fillStyle = '#f39c12';
        ctx.beginPath();
        ctx.ellipse(0, 4 + bob, 14, 10, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Pet Name Tag
      ctx.font = 'bold 10px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(-22, -34 + bob, 44, 14);
      ctx.fillStyle = '#fff';
      ctx.fillText('Mimi 🐱', 0, -24 + bob);

    } else {
      // ===== DRAW HUMANOID NPCS WITH KENNEY 2D TILES =====
      let tileIndex = 103; // Default citizen
      if (npc.id === 'joko') tileIndex = 98;        // Farmer
      else if (npc.id === 'sri') tileIndex = 99;    // Chef / Merchant
      else if (npc.id === 'somad') tileIndex = 100; // Elder
      else if (npc.id === 'mandor' || npc.id === 'pak_rt') tileIndex = 101; // Worker/Mandor
      else if (npc.id === 'rani') tileIndex = 102;  // Cashier
      else if (npc.id === 'rina') tileIndex = 97;   // Girl
      else if (npc.id === 'bayu' || npc.id === 'doni') tileIndex = 96; // Boy

      if (!drawTile('tiny-town', tileIndex, -16, -28 + bob, 32, 32, isLeft)) {
        ctx.fillStyle = npc.color || '#4299e1';
        ctx.fillRect(-9, -8 + bob, 18, 16);
        ctx.fillStyle = '#ffe0bd';
        ctx.beginPath();
        ctx.arc(0, -16 + bob, 10, 0, Math.PI * 2);
        ctx.fill();
      }

      // Name & Role Tag
      ctx.font = 'bold 10px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      const tagText = `${npc.name}`;
      const tagWidth = ctx.measureText(tagText).width;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(-tagWidth / 2 - 4, -42 + bob, tagWidth + 8, 15);
      ctx.fillStyle = '#fbd38d';
      ctx.fillText(tagText, 0, -31 + bob);
    }

    ctx.restore();
  });

  // Shop Building Decoration (tiny-town 36 & 85)
  drawTile('tiny-town', 36, 740, 60, 48, 48);
  drawTile('tiny-town', 85, 752, 90, 24, 28);
  ctx.font = 'bold 10px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.fillText('TOKO TANI', 742, 56);
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
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(0, 12, 11, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Draw 2D Kenney Pixel Character from tiny-town
  // Tile 96 = Male Villager (Zahy), Tile 97 = Female Villager (Aurel)
  const charTile = p.gender === 'boy' ? 96 : 97;
  const flip = p.dir === 'left';
  const drawn = drawTile('tiny-town', charTile, -16, -26 + bob, 32, 32, flip);

  if (!drawn) {
    // Fallback while loading
    ctx.fillStyle = p.gender === 'boy' ? '#4a90e2' : '#ff6584';
    ctx.fillRect(-10, -8 + bob, 20, 16);
    ctx.fillStyle = '#ffe0bd';
    ctx.beginPath();
    ctx.arc(0, -16 + bob, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  // ================= VISIBLE TOOLS IN HAND =================
  const toolToDraw = p.id === myId ? activeTool : (p.tool || 'hoe');
  const swingAngle = (p.id === myId && toolSwingAnim > 0) ? Math.sin(toolSwingAnim * Math.PI) * 0.7 : 0;

  ctx.save();
  ctx.translate(10, -2 + bob);
  ctx.rotate(swingAngle);

  if (toolToDraw === 'hoe') {
    // 🪓 Cangkul (Hoe)
    ctx.strokeStyle = '#8d5b4c';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(8, -14);
    ctx.stroke();
    // Iron hoe blade
    ctx.fillStyle = '#718096';
    ctx.fillRect(6, -18, 9, 5);
  } else if (toolToDraw === 'watering_can') {
    // 💧 Penyiram (Watering Can)
    ctx.fillStyle = '#4fd1c5';
    ctx.fillRect(0, -8, 12, 10);
    // Handle & spout
    ctx.strokeStyle = '#319795';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(2, -8);
    ctx.lineTo(2, -12);
    ctx.lineTo(8, -12);
    ctx.lineTo(8, -8);
    ctx.moveTo(12, -2);
    ctx.lineTo(17, -8);
    ctx.stroke();

    // Water droplets spray animation
    if (toolSwingAnim > 0) {
      ctx.fillStyle = '#63b3ed';
      ctx.beginPath();
      ctx.arc(19, -9, 2, 0, Math.PI * 2);
      ctx.arc(23, -6, 2, 0, Math.PI * 2);
      ctx.arc(26, -3, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (toolToDraw === 'fishing_rod') {
    // 🎣 Joran Pancing
    ctx.strokeStyle = '#d69e2e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-2, 4);
    ctx.quadraticCurveTo(8, -18, 22, -22);
    ctx.stroke();
    // Line & Bobber
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(22, -22);
    ctx.lineTo(26, 12);
    ctx.stroke();
    ctx.fillStyle = '#e53e3e';
    ctx.beginPath();
    ctx.arc(26, 12, 2.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (toolToDraw === 'basket') {
    // 🧺 Keranjang Panen
    ctx.fillStyle = '#d4a373';
    ctx.beginPath();
    ctx.arc(4, 2, 7, 0, Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#8d5b4c';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(4, -1, 6, Math.PI, Math.PI * 2);
    ctx.stroke();
    // Fresh crops inside
    ctx.fillStyle = '#48bb78';
    ctx.fillRect(2, -2, 4, 3);
  } else if (toolToDraw === 'rose') {
    // 🌹 Mawar Merah Cinta
    ctx.strokeStyle = '#38a169';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.lineTo(4, -8);
    ctx.stroke();
    // Red Rose Petals
    ctx.fillStyle = '#e53e3e';
    ctx.beginPath();
    ctx.arc(5, -10, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff4757';
    ctx.beginPath();
    ctx.arc(6, -11, 2.5, 0, Math.PI * 2);
    ctx.fill();
    // Sparkle
    ctx.font = '10px sans-serif';
    ctx.fillText('✨', 8, -14);
  }

  ctx.restore();

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
    ctx.fillRect(0, 0, worldWidth, worldHeight);
  }
}

// ================= COMMERCIAL PLOT & STORE (TOKO ZAHY & AUREL) =================
function drawBusinessPlotAndStore() {
  const plotX = 1010;
  const plotY = 220;
  const plotW = 300;
  const plotH = 200;

  const store = sharedState.store || { owned: false, level: 1, hiredEmployees: [], stockedItems: [], dailyRevenue: 0, visitorCount: 0 };

  if (!store.owned) {
    // ===== KAVLING TANAH BELUM DIBELI =====
    // Ground plot patch with 2D dirt tiles (tiny-town 25)
    for (let px = plotX; px < plotX + plotW; px += 32) {
      for (let py = plotY; py < plotY + plotH; py += 32) {
        drawTile('tiny-town', 25, px, py, 32, 32);
      }
    }

    // Boundary Fences (tiny-town 81)
    for (let px = plotX; px < plotX + plotW; px += 32) {
      drawTile('tiny-town', 81, px, plotY, 32, 24);
      drawTile('tiny-town', 81, px, plotY + plotH - 24, 32, 24);
    }
    for (let py = plotY; py < plotY + plotH; py += 32) {
      drawTile('tiny-town', 81, plotX, py, 20, 32);
      drawTile('tiny-town', 81, plotX + plotW - 20, py, 20, 32);
    }

    // Signboard panel with 2D Sign (tiny-town 83)
    drawTile('tiny-town', 83, 1145, 235, 40, 40);

    ctx.fillStyle = '#fffdf7';
    ctx.fillRect(1080, 260, 170, 68);
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 3;
    ctx.strokeRect(1080, 260, 170, 68);

    ctx.font = 'bold 12px "Segoe UI", sans-serif';
    ctx.fillStyle = '#b45309';
    ctx.textAlign = 'center';
    ctx.fillText('🏗️ KAVLING BISNIS', 1165, 276);

    ctx.font = 'bold 10px "Segoe UI", sans-serif';
    ctx.fillStyle = '#1e293b';
    ctx.fillText('Tanah Toko Zahy & Aurel', 1165, 292);
    ctx.font = '10px "Segoe UI", sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('Luas: 400m² • Harga: 🪙 120', 1165, 305);

    ctx.fillStyle = '#e11d48';
    ctx.font = 'bold 10px "Segoe UI", sans-serif';
    ctx.fillText('Tekan [E] untuk Beli Tanah! ✨', 1165, 320);

  } else {
    // ===== TOKO SUDAH DIBANGUN (COUPLE MART) =====
    const bx = plotX + 15;
    const by = plotY + 15;
    const bw = plotW - 30;
    const bh = plotH - 25;

    // Outer shadow
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(bx - 6, by + bh - 6, bw + 12, 16);

    // Commercial Checkered Floor (tiny-city 24 & 25)
    for (let tx = bx; tx < bx + bw; tx += 32) {
      for (let ty = by + 20; ty < by + bh; ty += 32) {
        const tIdx = (((tx - bx) / 32 + (ty - by) / 32) % 2 === 0) ? 24 : 25;
        drawTile('tiny-city', tIdx, tx, ty, 32, 32);
      }
    }

    // Walls (tiny-city 36)
    for (let wx = bx; wx < bx + bw; wx += 32) {
      drawTile('tiny-city', 36, wx, by, 32, 28);
    }
    for (let wy = by; wy < by + bh; wy += 32) {
      drawTile('tiny-city', 36, bx, wy, 20, 32);
      drawTile('tiny-city', 36, bx + bw - 20, wy, 20, 32);
    }
    // South wall leaving door opening at 1130..1190
    for (let wx = bx; wx < 1130; wx += 32) {
      drawTile('tiny-city', 36, wx, by + bh - 20, 32, 20);
    }
    for (let wx = 1190; wx < bx + bw; wx += 32) {
      drawTile('tiny-city', 36, wx, by + bh - 20, 32, 20);
    }

    // Door Welcome Mat
    ctx.fillStyle = '#38a169';
    ctx.fillRect(1135, by + bh - 12, 50, 16);
    ctx.font = 'bold 9px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('WELCOME ❤️', 1160, by + bh);

    // Striped Awning & Roof Signboard
    const roofY = by - 16;
    ctx.fillStyle = '#ff6584';
    ctx.fillRect(bx - 8, roofY, bw + 16, 18);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 11; i++) {
      ctx.fillRect(bx - 8 + i * 26, roofY, 13, 18);
    }

    // 2D Signboard: TOKO ZAHY & AUREL
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(bx + 20, roofY - 22, bw - 40, 24);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(bx + 20, roofY - 22, bw - 40, 24);
    ctx.font = 'bold 12px "Segoe UI", sans-serif';
    ctx.fillStyle = '#fde047';
    ctx.textAlign = 'center';
    ctx.fillText('🏪 TOKO ZAHY & AUREL ❤️', bx + bw / 2, roofY - 6);

    // Interior: 2D Shelves & Counter
    // 1. Fruit Shelf (tiny-farm 82 basket + shelf)
    drawTile('tiny-farm', 82, 1060, 260, 36, 36);
    ctx.font = '10px sans-serif';
    ctx.fillText('🍓🥕', 1078, 270);

    // 2. Bread / Bakery Shelf
    drawTile('tiny-town', 71, 1205, 260, 36, 36);
    ctx.font = '10px sans-serif';
    ctx.fillText('🥖🍰', 1223, 270);

    // 3. Clothing / General Goods
    drawTile('tiny-town', 69, 1240, 315, 32, 38);

    // 4. Checkout Counter & Cash Register (tiny-city 48)
    drawTile('tiny-city', 48, 1135, 315, 45, 36);

    // 5. Stocked Goods Floating Badge
    const stockCount = (store.stockedItems && store.stockedItems.length) || 0;
    ctx.font = 'bold 9px "Segoe UI", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(1130, 355, 55, 13);
    ctx.fillStyle = '#34d399';
    ctx.fillText(`Stok: ${stockCount} brg`, 1157, 365);

    // ================= HIRED BOT EMPLOYEES (2D TILES) =================
    // 1. RANI THE CASHIER (tiny-town 102)
    if (store.hiredEmployees && store.hiredEmployees.includes('rani')) {
      const raniBob = Math.sin(Date.now() * 0.005) * 2;
      drawTile('tiny-town', 102, 1145, 290 + raniBob, 32, 32);
      ctx.font = 'bold 9px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(1120, 275 + raniBob, 56, 13);
      ctx.fillStyle = '#6ee7b7';
      ctx.fillText('Rani (Kasir) 👩‍💼', 1148, 285 + raniBob);
    }

    // 2. DONI THE SHELF STOCKER (tiny-town 96)
    if (store.hiredEmployees && store.hiredEmployees.includes('doni')) {
      const doniBob = Math.sin(Date.now() * 0.006) * 2;
      const doniWalk = Math.sin(Date.now() * 0.002) * 20;
      drawTile('tiny-town', 96, 1080 + doniWalk, 315 + doniBob, 32, 32, doniWalk < 0);
      ctx.font = 'bold 9px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(1060 + doniWalk, 300 + doniBob, 68, 13);
      ctx.fillStyle = '#93c5fd';
      ctx.fillText('Doni (Pegawai) 🧑‍💼', 1094 + doniWalk, 310 + doniBob);
    }

    // Animated Customer visiting Toko (tiny-town 97)
    const custBob = Math.sin(Date.now() * 0.004) * 2;
    drawTile('tiny-town', 97, 1130, 350 + custBob, 30, 30);
    ctx.font = 'bold 8px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText('Pembeli 🛍️', 1145, 345 + custBob);
  }
}

// ================= DOWNTOWN PLAZA & CITY BUILDINGS =================
function drawCityCenterAndBuildings() {
  const plazaX = 780;
  const plazaY = 880;
  const plazaW = 900;
  const plazaH = 620;

  // Plaza Stone Pavement with 2D Paving Tiles (tiny-city 12 & 13)
  for (let px = plazaX; px < plazaX + plazaW; px += 32) {
    for (let py = plazaY; py < plazaY + plazaH; py += 32) {
      const pIdx = (((px - plazaX) / 32 + (py - plazaY) / 32) % 3 === 0) ? 13 : 12;
      drawTile('tiny-city', pIdx, px, py, 32, 32);
    }
  }

  // Decorative Border
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 4;
  ctx.strokeRect(plazaX + 2, plazaY + 2, plazaW - 4, plazaH - 4);

  // ================= 4 DOWNTOWN 2D BUILDINGS =================
  const buildings = [
    { x: 820, y: 910, w: 130, h: 140, name: 'Balai Kota', icon: '🏛️', tile: 36 },
    { x: 1020, y: 910, w: 130, h: 140, name: 'Toko Roti & Kue', icon: '🥖', tile: 38 },
    { x: 1320, y: 910, w: 130, h: 140, name: 'Butik Pasangan', icon: '👗', tile: 40 },
    { x: 1520, y: 910, w: 130, h: 140, name: 'Bank Desa', icon: '🏦', tile: 42 }
  ];

  buildings.forEach(b => {
    // Drop shadow
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(b.x - 4, b.y + b.h - 6, b.w + 8, 14);

    // 2D Building Tiles from tiny-city
    for (let bx = b.x; bx < b.x + b.w; bx += 40) {
      for (let by = b.y; by < b.y + b.h; by += 40) {
        drawTile('tiny-city', b.tile, bx, by, 40, 40);
      }
    }

    // Doorway
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(b.x + b.w / 2 - 14, b.y + b.h - 35, 28, 35);
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(b.x + b.w / 2 + 7, b.y + b.h - 18, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Signboard on Front
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(b.x + 10, b.y + 12, b.w - 20, 20);
    ctx.font = 'bold 10px "Segoe UI", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(`${b.icon} ${b.name}`, b.x + b.w / 2, b.y + 26);
  });

  // ================= AIR MANCUR HARAPAN CINTA (tiny-city 72) =================
  const fx = 1200;
  const fy = 1240;

  // 2D Fountain Base Tile
  if (!drawTile('tiny-city', 72, fx - 40, fy - 40, 80, 80)) {
    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.arc(fx, fy, 44, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(fx, fy, 38, 0, Math.PI * 2);
    ctx.fill();
  }

  // Shimmering Coins in fountain
  const coinCoords = [
    { dx: -14, dy: -8 }, { dx: 12, dy: 10 }, { dx: -8, dy: 16 }, { dx: 18, dy: -12 }
  ];
  coinCoords.forEach(c => {
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(fx + c.dx, fy + c.dy, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  // Water Spray Particles
  const spoutTime = Date.now() * 0.008;
  for (let a = 0; a < 8; a++) {
    const angle = (a / 8) * Math.PI * 2 + spoutTime;
    const dist = 18 + Math.sin(spoutTime * 2 + a) * 8;
    const px = fx + Math.cos(angle) * dist;
    const py = fy + Math.sin(angle) * dist;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.beginPath();
    ctx.arc(px, py, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Heart on Spire
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('💖', fx, fy - 18);

  // Fountain Banner
  ctx.font = 'bold 11px "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(fx - 70, fy + 48, 140, 18);
  ctx.fillStyle = '#f472b6';
  ctx.fillText('⛲ Air Mancur Harapan [E]', fx, fy + 61);

  // 2D Street Lamps (tiny-city 84)
  const lampX = [840, 1080, 1320, 1560];
  lampX.forEach(lx => {
    drawTile('tiny-city', 84, lx - 16, 1140, 32, 40);
    if (sharedState.timeOfDay >= 17.5 || sharedState.timeOfDay < 5.5) {
      ctx.fillStyle = 'rgba(251, 191, 36, 0.22)';
      ctx.beginPath();
      ctx.arc(lx, 1146, 38, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // 2D Couple Park Benches (tiny-city 85)
  drawTile('tiny-city', 85, 940, 1335, 45, 24);
  drawTile('tiny-city', 85, 1415, 1335, 45, 24);
}

// ================= FOREST, CAMPING & LAKE DISTRICT =================
function drawForestAndCampingLake() {
  // Mini Forest Creek Inlet (tiny-town 109)
  for (let cy = 440; cy < 520; cy += 32) {
    drawTile('tiny-town', 109, 1715, cy, 32, 32);
    drawTile('tiny-town', 109, 1740, cy, 32, 32);
  }

  // Wooden Footbridge (tiny-town 78, 79, 80)
  drawTile('tiny-town', 78, 1705, 455, 32, 36);
  drawTile('tiny-town', 79, 1735, 455, 32, 36);

  // ================= GRAND ROMANTIC LAKE =================
  const lakeX = 2000;
  const lakeY = 480;
  const lakeRx = 180;
  const lakeRy = 110;

  // Water background
  const waterGrad = ctx.createRadialGradient(lakeX, lakeY, 30, lakeX, lakeY, lakeRx);
  waterGrad.addColorStop(0, '#1d4ed8');
  waterGrad.addColorStop(1, '#2563eb');
  ctx.fillStyle = waterGrad;
  ctx.beginPath();
  ctx.ellipse(lakeX, lakeY, lakeRx, lakeRy, 0, 0, Math.PI * 2);
  ctx.fill();

  // Lake Shoreline Border
  ctx.strokeStyle = '#1e3a8a';
  ctx.lineWidth = 4;
  ctx.stroke();

  // Water ripples from tiny-town 109
  drawTile('tiny-town', 109, lakeX - 40, lakeY - 30, 32, 32);
  drawTile('tiny-town', 109, lakeX + 30, lakeY + 20, 32, 32);

  // Swimming Fish Shadows
  const fishTime = Date.now() * 0.001;
  for (let f = 0; f < 3; f++) {
    const fx = lakeX + Math.sin(fishTime + f * 2) * (70 + f * 25);
    const fy = lakeY + Math.cos(fishTime * 0.8 + f * 2) * (35 + f * 15);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.beginPath();
    ctx.ellipse(fx, fy, 6, 2.5, fishTime + f, 0, Math.PI * 2);
    ctx.fill();
  }

  // Wooden Fishing Pier at Lake (tiny-town 78, 79, 80)
  for (let px = 1820; px < 1910; px += 30) {
    drawTile('tiny-town', 78, px, 465, 30, 40);
  }
  ctx.font = '16px sans-serif';
  ctx.fillText('🎣', 1885, 492);
  ctx.font = 'bold 9px "Segoe UI", sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText('Dermaga Hutan', 1865, 485);

  // ================= CAMPSITE & ROMANTIC CAMPFIRE =================
  const campX = 2140;
  const campY = 280;

  // 2D Camping Tent (tiny-farm 116)
  if (!drawTile('tiny-farm', 116, campX - 25, campY - 25, 50, 50)) {
    ctx.font = '28px sans-serif';
    ctx.fillText('⛺', campX, campY);
  }

  // Campfire (tiny-farm 117)
  const fireX = 2075;
  const fireY = 300;
  if (!drawTile('tiny-farm', 117, fireX - 20, fireY - 20, 40, 40)) {
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(fireX, fireY, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Dancing Flames & floating embers
  const flameFlicker = Math.sin(Date.now() * 0.02) * 3;
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.arc(fireX, fireY - 10 + flameFlicker, 5, 0, Math.PI * 2);
  ctx.fill();
  const sparkY = (Date.now() * 0.05) % 25;
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.arc(fireX + Math.sin(sparkY) * 6, fireY - 12 - sparkY, 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Dense 2D Trees scattered (tiny-town 48 & tiny-farm 48)
  const pineTrees = [
    { x: 1800, y: 220 }, { x: 1880, y: 160 }, { x: 1960, y: 230 },
    { x: 2230, y: 180 }, { x: 2310, y: 260 }, { x: 2280, y: 440 },
    { x: 2220, y: 560 }, { x: 1950, y: 640 }, { x: 2100, y: 650 },
    { x: 1840, y: 720 }, { x: 2260, y: 740 }
  ];
  pineTrees.forEach(pt => {
    drawTile('tiny-town', 48, pt.x - 20, pt.y - 36, 40, 48);
  });
}

// ================= REAL-TIME RADAR MINIMAP HUD =================
function drawMinimap() {
  const mCanvas = document.getElementById('minimapCanvas');
  if (!mCanvas) return;
  const mctx = mCanvas.getContext('2d');
  const mw = mCanvas.width;
  const mh = mCanvas.height;
  mctx.clearRect(0, 0, mw, mh);

  // Background map
  mctx.fillStyle = '#3d6c37';
  mctx.fillRect(0, 0, mw, mh);

  // Scale factors
  const sx = mw / worldWidth;
  const sy = mh / worldHeight;

  // Roads
  mctx.fillStyle = '#a6825c';
  // Main East-West road
  mctx.fillRect(0, 680 * sy, mw, 52 * sy);
  // North-South boulevard
  mctx.fillRect(1150 * sx, 732 * sy, 100 * sx, 180 * sy);

  // City plaza area
  mctx.fillStyle = '#cbd5e1';
  mctx.fillRect(780 * sx, 880 * sy, 900 * sx, 620 * sy);

  // Lake
  mctx.fillStyle = '#2563eb';
  mctx.beginPath();
  mctx.ellipse(2000 * sx, 480 * sy, 180 * sx, 110 * sy, 0, 0, Math.PI * 2);
  mctx.fill();

  // House
  mctx.fillStyle = '#e11d48';
  mctx.fillRect(280 * sx, 80 * sy, 310 * sx, 210 * sy);

  // Commercial Plot / Store
  const storeOwned = sharedState.store && sharedState.store.owned;
  mctx.fillStyle = storeOwned ? '#10b981' : '#f59e0b';
  mctx.fillRect(1010 * sx, 220 * sy, 300 * sx, 200 * sy);

  // Camera Viewport Box (white border)
  mctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  mctx.lineWidth = 1.5;
  mctx.strokeRect(camera.x * sx, camera.y * sy, canvas.width * sx, canvas.height * sy);

  // Other Player dot (Hot Pink)
  const partnerId = Object.keys(players).find(id => id !== myId);
  if (partnerId && players[partnerId]) {
    mctx.fillStyle = '#ff1493';
    mctx.beginPath();
    mctx.arc(players[partnerId].x * sx, players[partnerId].y * sy, 3.5, 0, Math.PI * 2);
    mctx.fill();
    mctx.strokeStyle = '#fff';
    mctx.lineWidth = 1;
    mctx.stroke();
  }

  // Local Player dot (Bright Cyan)
  const p = players[myId];
  if (p) {
    mctx.fillStyle = '#06b6d4';
    mctx.beginPath();
    mctx.arc(p.x * sx, p.y * sy, 4, 0, Math.PI * 2);
    mctx.fill();
    mctx.strokeStyle = '#fff';
    mctx.lineWidth = 1.2;
    mctx.stroke();
  }
}

