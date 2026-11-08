const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Health check / ping endpoint
app.get('/ping', (req, res) => {
  res.send('pong ❤️');
});

// In-memory room storage
const rooms = new Map();

function createInitialRoomState(roomCode) {
  // Farming plots (in front of the house)
  const farmingPlots = [];
  const startX = 360;
  const startY = 560;
  let id = 1;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      farmingPlots.push({
        id: id++,
        x: startX + c * 48,
        y: startY + r * 48,
        state: 'empty', // 'empty' | 'tilled' | 'planted' | 'watered' | 'ready'
        cropType: null,
        growthProgress: 0,
        maxGrowth: 100,
        plantedAt: null,
        wateredAt: null
      });
    }
  }

  return {
    code: roomCode,
    players: {},
    playerSlots: [null, null], // Max 2 primary couple players, extra can be guest/friend
    sharedState: {
      coins: 100,
      lovePoints: 10,
      fridge: [
        { id: 'water', name: 'Air Segar', count: 4, icon: '💧' },
        { id: 'bread', name: 'Roti Hangat', count: 2, icon: '🍞' },
        { id: 'seed_strawberry', name: 'Bibit Stroberi', count: 4, icon: '🍓' },
        { id: 'seed_carrot', name: 'Bibit Wortel', count: 4, icon: '🥕' }
      ],
      loveNotes: [
        { from: 'Developer Cinta', text: 'Selamat datang di rumah impian kita! Mari saling menjaga dan merawat tempat ini bersama ❤️', time: 'Hari ini' }
      ],
      cafeStand: {
        stockedItems: [],
        level: 1,
        totalSold: 0
      },
      timeOfDay: 7.0, // 07:00 AM (ranges from 0.00 to 24.00)
      dayCount: 1
    },
    farmingPlots,
    chatMessages: []
  };
}

// Tick loop to grow crops and advance day/night cycle
setInterval(() => {
  const now = Date.now();
  rooms.forEach((room) => {
    // Advance time: 1 in-game hour = 20 real seconds (1 full day = 8 minutes)
    room.sharedState.timeOfDay = (room.sharedState.timeOfDay + 0.05) % 24;
    if (room.sharedState.timeOfDay < 0.05) {
      room.sharedState.dayCount++;
    }

    // Grow crops
    let plotChanged = false;
    room.farmingPlots.forEach((plot) => {
      if (plot.state === 'watered' && plot.cropType) {
        plot.growthProgress += 4;
        if (plot.growthProgress >= plot.maxGrowth) {
          plot.state = 'ready';
          plot.growthProgress = plot.maxGrowth;
          plotChanged = true;
        }
      }
    });

    // Random customer NPC visit cafe stand if stocked
    if (room.sharedState.cafeStand.stockedItems.length > 0 && Math.random() < 0.15) {
      const sold = room.sharedState.cafeStand.stockedItems.pop();
      const earned = sold.price || 25;
      room.sharedState.coins += earned;
      room.sharedState.lovePoints += 2;
      room.sharedState.cafeStand.totalSold++;
      io.to(room.code).emit('cafe_sale', {
        item: sold.name,
        price: earned,
        coins: room.sharedState.coins,
        lovePoints: room.sharedState.lovePoints
      });
    }

    // Emit light tick to keep clocks in sync
    io.to(room.code).emit('world_tick', {
      timeOfDay: room.sharedState.timeOfDay,
      dayCount: room.sharedState.dayCount,
      farmingPlots: plotChanged ? room.farmingPlots : undefined
    });
  });
}, 2000);

io.on('connection', (socket) => {
  let currentRoom = null;
  let playerId = socket.id;

  socket.on('join_room', ({ roomCode, playerName, avatarGender, avatarColor }) => {
    const code = (roomCode || 'CINTA').toUpperCase().trim();
    if (!rooms.has(code)) {
      rooms.set(code, createInitialRoomState(code));
    }

    const room = rooms.get(code);
    currentRoom = room;
    socket.join(code);

    // Determine slot (Player 1 / 2)
    let slot = 0;
    if (room.playerSlots[0] === null) {
      room.playerSlots[0] = playerId;
      slot = 0;
    } else if (room.playerSlots[1] === null) {
      room.playerSlots[1] = playerId;
      slot = 1;
    } else {
      slot = 2; // Guest
    }

    // Starting positions: Player 1 near bed left, Player 2 near bed right
    const defaultPositions = [
      { x: 380, y: 320 },
      { x: 440, y: 320 },
      { x: 410, y: 360 }
    ];

    const playerObj = {
      id: playerId,
      name: playerName || (slot === 0 ? 'Sayang 1' : 'Sayang 2'),
      gender: avatarGender || (slot === 0 ? 'boy' : 'girl'),
      color: avatarColor || (slot === 0 ? '#4A90E2' : '#FF6584'),
      x: defaultPositions[slot].x,
      y: defaultPositions[slot].y,
      dir: 'down',
      anim: 'idle',
      holdingHandsWith: null,
      energy: 100,
      hunger: 100,
      isSleeping: false,
      emote: null
    };

    room.players[playerId] = playerObj;

    // Send complete init state to joining player
    socket.emit('init_room_state', {
      yourId: playerId,
      slot,
      players: room.players,
      sharedState: room.sharedState,
      farmingPlots: room.farmingPlots,
      chatMessages: room.chatMessages.slice(-20)
    });

    // Notify other player in room
    socket.to(code).emit('player_joined', playerObj);

    // System chat broadcast
    const sysMsg = {
      sender: 'Sistem',
      text: `${playerObj.name} telah bergabung ke rumah! ❤️`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    room.chatMessages.push(sysMsg);
    io.to(code).emit('chat_message', sysMsg);
  });

  // Movement & Animation Sync
  socket.on('player_move', ({ x, y, dir, anim }) => {
    if (!currentRoom || !currentRoom.players[playerId]) return;
    const p = currentRoom.players[playerId];
    p.x = x;
    p.y = y;
    p.dir = dir;
    p.anim = anim;

    // If holding hands, sync the partner position closely behind
    if (p.holdingHandsWith && currentRoom.players[p.holdingHandsWith]) {
      const partner = currentRoom.players[p.holdingHandsWith];
      const offsetX = dir === 'left' ? 32 : dir === 'right' ? -32 : 0;
      const offsetY = dir === 'up' ? 32 : dir === 'down' ? -32 : 0;
      partner.x = x + offsetX;
      partner.y = y + offsetY;
      partner.dir = dir;
      partner.anim = anim;
      io.to(currentRoom.code).emit('player_moved', {
        id: partner.id,
        x: partner.x,
        y: partner.y,
        dir: partner.dir,
        anim: partner.anim
      });
    }

    socket.to(currentRoom.code).emit('player_moved', {
      id: playerId,
      x,
      y,
      dir,
      anim
    });
  });

  // Emote Broadcast (Heart, Kiss, Smile, Cry, Tired)
  socket.on('send_emote', ({ emote }) => {
    if (!currentRoom || !currentRoom.players[playerId]) return;
    const p = currentRoom.players[playerId];
    p.emote = emote;
    io.to(currentRoom.code).emit('player_emoted', { id: playerId, emote });
    setTimeout(() => {
      if (p.emote === emote) p.emote = null;
    }, 3500);
  });

  // Couple Actions: Hug, Kiss, Hold Hands
  socket.on('couple_action', ({ actionType, targetPlayerId }) => {
    if (!currentRoom) return;
    const p1 = currentRoom.players[playerId];
    if (!p1) return;

    if (actionType === 'hug') {
      currentRoom.sharedState.lovePoints += 5;
      p1.energy = Math.min(100, p1.energy + 10);
      io.to(currentRoom.code).emit('couple_action_performed', {
        actionType: 'hug',
        from: p1.name,
        lovePoints: currentRoom.sharedState.lovePoints,
        x: p1.x,
        y: p1.y
      });
    } else if (actionType === 'kiss') {
      currentRoom.sharedState.lovePoints += 10;
      p1.energy = Math.min(100, p1.energy + 15);
      io.to(currentRoom.code).emit('couple_action_performed', {
        actionType: 'kiss',
        from: p1.name,
        lovePoints: currentRoom.sharedState.lovePoints,
        x: p1.x,
        y: p1.y
      });
    } else if (actionType === 'hold_hands') {
      if (p1.holdingHandsWith) {
        const partner = currentRoom.players[p1.holdingHandsWith];
        if (partner) partner.holdingHandsWith = null;
        p1.holdingHandsWith = null;
        io.to(currentRoom.code).emit('hands_released', { id1: playerId });
      } else {
        const otherId = Object.keys(currentRoom.players).find(id => id !== playerId);
        if (otherId) {
          p1.holdingHandsWith = otherId;
          currentRoom.players[otherId].holdingHandsWith = playerId;
          io.to(currentRoom.code).emit('hands_held', { id1: playerId, id2: otherId });
        }
      }
    }
  });

  // Farming action: till, plant, water, harvest
  socket.on('farming_action', ({ plotId, action, cropType }) => {
    if (!currentRoom) return;
    const plot = currentRoom.farmingPlots.find(p => p.id === plotId);
    const p = currentRoom.players[playerId];
    if (!plot || !p) return;

    if (action === 'till' && plot.state === 'empty') {
      plot.state = 'tilled';
      p.energy = Math.max(0, p.energy - 3);
    } else if (action === 'plant' && plot.state === 'tilled') {
      // Check seeds in fridge or inventory
      const seedName = `seed_${cropType}`;
      const seedIndex = currentRoom.sharedState.fridge.findIndex(i => i.id === seedName && i.count > 0);
      if (seedIndex !== -1) {
        currentRoom.sharedState.fridge[seedIndex].count--;
        plot.state = 'planted';
        plot.cropType = cropType;
        plot.growthProgress = 0;
        plot.plantedAt = Date.now();
        p.energy = Math.max(0, p.energy - 2);
      }
    } else if (action === 'water' && (plot.state === 'planted' || plot.state === 'tilled')) {
      plot.state = 'watered';
      plot.wateredAt = Date.now();
      p.energy = Math.max(0, p.energy - 2);
    } else if (action === 'harvest' && plot.state === 'ready') {
      // Add harvested item to fridge
      const cropId = `crop_${plot.cropType}`;
      const cropName = plot.cropType === 'strawberry' ? 'Stroberi Segar' : 'Wortel Manis';
      const cropIcon = plot.cropType === 'strawberry' ? '🍓' : '🥕';
      const existing = currentRoom.sharedState.fridge.find(i => i.id === cropId);
      if (existing) {
        existing.count += 2; // Yields 2
      } else {
        currentRoom.sharedState.fridge.push({ id: cropId, name: cropName, count: 2, icon: cropIcon });
      }

      plot.state = 'empty';
      plot.cropType = null;
      plot.growthProgress = 0;
      currentRoom.sharedState.lovePoints += 3;
    }

    io.to(currentRoom.code).emit('farming_updated', {
      plot,
      fridge: currentRoom.sharedState.fridge,
      lovePoints: currentRoom.sharedState.lovePoints,
      playerEnergy: p.energy
    });
  });

  // Fishing Mini-Action
  socket.on('fish_caught', ({ fishType, size }) => {
    if (!currentRoom) return;
    const p = currentRoom.players[playerId];
    if (!p) return;

    p.energy = Math.max(0, p.energy - 5);
    const fishItem = currentRoom.sharedState.fridge.find(i => i.id === 'fresh_fish');
    if (fishItem) {
      fishItem.count++;
    } else {
      currentRoom.sharedState.fridge.push({ id: 'fresh_fish', name: 'Ikan Danau Segar', count: 1, icon: '🐟' });
    }
    currentRoom.sharedState.lovePoints += 2;

    io.to(currentRoom.code).emit('fish_result', {
      playerName: p.name,
      fishName: fishType || 'Ikan Mas Cantik',
      fridge: currentRoom.sharedState.fridge,
      lovePoints: currentRoom.sharedState.lovePoints
    });
  });

  // Cooking Action (Stove)
  socket.on('cook_recipe', ({ recipeId }) => {
    if (!currentRoom) return;
    const fridge = currentRoom.sharedState.fridge;
    let cooked = null;

    if (recipeId === 'salad') {
      const carrot = fridge.find(i => i.id === 'crop_carrot');
      const berry = fridge.find(i => i.id === 'crop_strawberry');
      if (carrot && carrot.count >= 1 && berry && berry.count >= 1) {
        carrot.count -= 1;
        berry.count -= 1;
        cooked = { id: 'salad', name: 'Salad Cinta Segar', count: 1, icon: '🥗', hungerRestore: 40 };
      }
    } else if (recipeId === 'grilled_fish') {
      const fish = fridge.find(i => i.id === 'fresh_fish');
      if (fish && fish.count >= 1) {
        fish.count -= 1;
        cooked = { id: 'grilled_fish', name: 'Ikan Bakar Spesial', count: 1, icon: '🍱', hungerRestore: 60 };
      }
    }

    if (cooked) {
      const existing = fridge.find(i => i.id === cooked.id);
      if (existing) existing.count += 1;
      else fridge.push(cooked);

      currentRoom.sharedState.lovePoints += 5;
      io.to(currentRoom.code).emit('cooking_success', {
        recipe: cooked.name,
        fridge: currentRoom.sharedState.fridge,
        lovePoints: currentRoom.sharedState.lovePoints
      });
    }
  });

  // Eating item from Fridge / Inventory
  socket.on('eat_item', ({ itemId }) => {
    if (!currentRoom) return;
    const p = currentRoom.players[playerId];
    const item = currentRoom.sharedState.fridge.find(i => i.id === itemId && i.count > 0);
    if (!p || !item) return;

    item.count--;
    const hungerGain = itemId.includes('salad') ? 40 : itemId.includes('grilled') ? 60 : 25;
    p.hunger = Math.min(100, p.hunger + hungerGain);
    p.energy = Math.min(100, p.energy + 20);

    io.to(currentRoom.code).emit('player_ate', {
      id: playerId,
      name: p.name,
      itemName: item.name,
      hunger: p.hunger,
      energy: p.energy,
      fridge: currentRoom.sharedState.fridge
    });
  });

  // Sleeping in bed
  socket.on('toggle_sleep', ({ isSleeping }) => {
    if (!currentRoom) return;
    const p = currentRoom.players[playerId];
    if (!p) return;
    p.isSleeping = isSleeping;

    // If both players are in bed, fast-forward to morning (06:00 AM) and full restore!
    const activePlayers = Object.values(currentRoom.players);
    const allSleeping = activePlayers.length >= 2 && activePlayers.every(pl => pl.isSleeping);

    if (allSleeping) {
      currentRoom.sharedState.timeOfDay = 6.0; // 06:00 AM
      currentRoom.sharedState.dayCount++;
      activePlayers.forEach(pl => {
        pl.energy = 100;
        pl.hunger = Math.max(30, pl.hunger - 10);
        pl.isSleeping = false;
      });
      currentRoom.sharedState.lovePoints += 20;

      io.to(currentRoom.code).emit('morning_arrived', {
        dayCount: currentRoom.sharedState.dayCount,
        lovePoints: currentRoom.sharedState.lovePoints,
        players: currentRoom.players
      });
    } else {
      io.to(currentRoom.code).emit('player_sleep_state', {
        id: playerId,
        isSleeping
      });
    }
  });

  // Love Notes Board
  socket.on('add_love_note', ({ text }) => {
    if (!currentRoom) return;
    const p = currentRoom.players[playerId];
    if (!p || !text || text.trim() === '') return;

    const newNote = {
      from: p.name,
      text: text.trim().slice(0, 140),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    currentRoom.sharedState.loveNotes.unshift(newNote);
    if (currentRoom.sharedState.loveNotes.length > 20) currentRoom.sharedState.loveNotes.pop();

    currentRoom.sharedState.lovePoints += 5;
    io.to(currentRoom.code).emit('love_notes_updated', {
      notes: currentRoom.sharedState.loveNotes,
      lovePoints: currentRoom.sharedState.lovePoints
    });
  });

  // Store & Trade with NPC
  socket.on('shop_transaction', ({ action, itemType, cost, price }) => {
    if (!currentRoom) return;
    const state = currentRoom.sharedState;

    if (action === 'buy') {
      if (state.coins >= cost) {
        state.coins -= cost;
        const existing = state.fridge.find(i => i.id === itemType.id);
        if (existing) existing.count += 1;
        else state.fridge.push({ ...itemType, count: 1 });

        io.to(currentRoom.code).emit('trade_completed', {
          coins: state.coins,
          fridge: state.fridge,
          message: `Membeli 1x ${itemType.name}!`
        });
      }
    } else if (action === 'sell') {
      const item = state.fridge.find(i => i.id === itemType.id && i.count > 0);
      if (item) {
        item.count--;
        state.coins += price;
        state.lovePoints += 2;

        io.to(currentRoom.code).emit('trade_completed', {
          coins: state.coins,
          fridge: state.fridge,
          message: `Berhasil menjual 1x ${itemType.name} seharga 🪙${price}!`
        });
      }
    }
  });

  // Cafe Business: Put items on stand for sale
  socket.on('stock_cafe', ({ itemId }) => {
    if (!currentRoom) return;
    const item = currentRoom.sharedState.fridge.find(i => i.id === itemId && i.count > 0);
    if (!item) return;

    item.count--;
    const price = itemId.includes('salad') ? 60 : itemId.includes('grilled') ? 80 : 30;
    currentRoom.sharedState.cafeStand.stockedItems.push({
      id: item.id,
      name: item.name,
      price
    });

    io.to(currentRoom.code).emit('cafe_updated', {
      cafeStand: currentRoom.sharedState.cafeStand,
      fridge: currentRoom.sharedState.fridge
    });
  });

  // Chat message
  socket.on('send_chat', ({ text }) => {
    if (!currentRoom || !text || text.trim() === '') return;
    const p = currentRoom.players[playerId];
    const msgObj = {
      sender: p ? p.name : 'Tamu',
      color: p ? p.color : '#333',
      text: text.trim().slice(0, 180),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    currentRoom.chatMessages.push(msgObj);
    if (currentRoom.chatMessages.length > 50) currentRoom.chatMessages.shift();

    io.to(currentRoom.code).emit('chat_message', msgObj);
  });

  // Disconnect
  socket.on('disconnect', () => {
    if (currentRoom && currentRoom.players[playerId]) {
      const departingName = currentRoom.players[playerId].name;
      delete currentRoom.players[playerId];

      if (currentRoom.playerSlots[0] === playerId) currentRoom.playerSlots[0] = null;
      if (currentRoom.playerSlots[1] === playerId) currentRoom.playerSlots[1] = null;

      io.to(currentRoom.code).emit('player_left', { id: playerId, name: departingName });

      // Clean up empty rooms after 10 minutes
      if (Object.keys(currentRoom.players).length === 0) {
        setTimeout(() => {
          if (rooms.has(currentRoom.code) && Object.keys(rooms.get(currentRoom.code).players).length === 0) {
            rooms.delete(currentRoom.code);
          }
        }, 10 * 60 * 1000);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`🌸 Game Server Berdua berjalan di http://localhost:${PORT}`);
});

