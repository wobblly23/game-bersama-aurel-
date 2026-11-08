// Hybrid Network Adapter: Works seamlessly on Socket.io (local/Node) OR PeerJS (Netlify, GitHub Pages, Vercel)
class HybridNetwork {
  constructor() {
    this.mode = 'peer'; // 'socket' or 'peer'
    this.handlers = {};
    this.socket = null;
    this.peer = null;
    this.conn = null;
    this.isHost = false;
    this.myId = null;
    this.roomCode = 'AUREL-KITA';
    this.localState = null;
    this.tickInterval = null;

    // Check if socket.io is available
    if (typeof io !== 'undefined') {
      try {
        this.socket = io({ autoConnect: false, timeout: 2000 });
      } catch (e) {
        this.socket = null;
      }
    }
  }

  on(event, callback) {
    if (!this.handlers[event]) this.handlers[event] = [];
    this.handlers[event].push(callback);

    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  trigger(event, data) {
    if (this.handlers[event]) {
      this.handlers[event].forEach(cb => cb(data));
    }
  }

  emit(event, data) {
    if (this.mode === 'socket' && this.socket && this.socket.connected) {
      this.socket.emit(event, data);
      return;
    }

    // PeerJS P2P Mode
    if (this.mode === 'peer') {
      this.handlePeerEmit(event, data);
    }
  }

  init(joinData) {
    this.roomCode = (joinData.roomCode || 'CINTA').toLowerCase().replace(/[^a-z0-9]/g, '');
    this.joinData = joinData;

    // Test socket connection first
    if (this.socket) {
      this.socket.connect();
      let connected = false;

      this.socket.on('connect', () => {
        connected = true;
        this.mode = 'socket';
        this.socket.emit('join_room', joinData);
      });

      // If socket doesn't connect within 1.5s (e.g. running on Netlify), fallback to PeerJS
      setTimeout(() => {
        if (!connected) {
          if (this.socket) this.socket.disconnect();
          this.initPeerJS();
        }
      }, 1500);
    } else {
      this.initPeerJS();
    }
  }

  initPeerJS() {
    this.mode = 'peer';
    console.log('🌸 Memulai mode Netlify / P2P WebRTC PeerJS...');

    const hostPeerId = `desa-cinta-${this.roomCode}-h`;
    const clientPeerId = `desa-cinta-${this.roomCode}-c`;

    // First, attempt to become the HOST
    this.peer = new Peer(hostPeerId, {
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    });

    this.peer.on('open', (id) => {
      // Successfully registered as Host!
      this.isHost = true;
      this.myId = 'host';
      console.log('Menjadi Host Kamar:', id);
      this.setupHostState();

      // Listen for incoming connection from Player 2 (Client)
      this.peer.on('connection', (conn) => {
        this.conn = conn;
        this.setupConnectionEvents(conn);

        conn.on('open', () => {
          // Send complete world state to Player 2
          conn.send({
            type: 'init_room_state',
            data: {
              yourId: 'client',
              slot: 1,
              players: this.localState.players,
              sharedState: this.localState.sharedState,
              farmingPlots: this.localState.farmingPlots,
              chatMessages: this.localState.chatMessages
            }
          });

          // Announce player 2
          this.trigger('player_joined', this.localState.players['client']);
          window.soundManager?.playLove();
        });
      });
    });

    this.peer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        // Host ID is already taken! That means Player 1 is already in the room!
        // We will join as CLIENT (Player 2)
        console.log('Host terdeteksi! Bergabung sebagai Tamu/Pasangan...');
        this.peer.destroy();
        this.connectAsClient(clientPeerId, hostPeerId);
      } else {
        console.warn('Peer error:', err);
      }
    });
  }

  connectAsClient(clientPeerId, hostPeerId) {
    this.isHost = false;
    this.myId = 'client';

    // Randomize client ID slightly in case of reconnects
    const uniqueClientId = clientPeerId + '-' + Math.floor(Math.random() * 1000);
    this.peer = new Peer(uniqueClientId, {
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    });

    this.peer.on('open', () => {
      this.conn = this.peer.connect(hostPeerId, { reliable: true });
      this.setupConnectionEvents(this.conn);

      this.conn.on('open', () => {
        console.log('Terhubung dengan Host pacarmu! ❤️');
        // Send join info to Host
        this.conn.send({
          type: 'client_join',
          data: this.joinData
        });
      });
    });
  }

  setupConnectionEvents(conn) {
    conn.on('data', (msg) => {
      if (!msg || !msg.type) return;

      if (this.isHost) {
        this.handleHostIncoming(msg);
      } else {
        this.handleClientIncoming(msg);
      }
    });

    conn.on('close', () => {
      this.trigger('player_left', { id: this.isHost ? 'client' : 'host', name: 'Pasanganmu' });
    });
  }

  // ================= HOST LOGIC =================
  setupHostState() {
    // Generate farm plots
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
          state: 'empty',
          cropType: null,
          growthProgress: 0,
          maxGrowth: 100
        });
      }
    }

    this.localState = {
      players: {
        host: {
          id: 'host',
          name: this.joinData.playerName || 'Zahy',
          gender: this.joinData.avatarGender || 'boy',
          color: this.joinData.avatarColor || '#4A90E2',
          x: 380,
          y: 320,
          dir: 'down',
          anim: 'idle',
          holdingHandsWith: null,
          energy: 100,
          hunger: 100,
          isSleeping: false,
          emote: null
        }
      },
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
          { from: 'Cinta Kita', text: 'Selamat datang di rumah impian kita! Mari saling menjaga dan merawat tempat ini bersama ❤️', time: 'Hari ini' }
        ],
        cafeStand: { stockedItems: [], totalSold: 0 },
        timeOfDay: 7.0,
        dayCount: 1
      },
      farmingPlots,
      chatMessages: []
    };

    // Emit init state to local player
    this.trigger('init_room_state', {
      yourId: 'host',
      slot: 0,
      players: this.localState.players,
      sharedState: this.localState.sharedState,
      farmingPlots: this.localState.farmingPlots,
      chatMessages: this.localState.chatMessages
    });

    // Start Host Tick (Time & Crops)
    if (this.tickInterval) clearInterval(this.tickInterval);
    this.tickInterval = setInterval(() => {
      const state = this.localState.sharedState;
      state.timeOfDay = (state.timeOfDay + 0.05) % 24;
      if (state.timeOfDay < 0.05) state.dayCount++;

      let plotChanged = false;
      this.localState.farmingPlots.forEach(plot => {
        if (plot.state === 'watered' && plot.cropType) {
          plot.growthProgress += 4;
          if (plot.growthProgress >= plot.maxGrowth) {
            plot.state = 'ready';
            plot.growthProgress = plot.maxGrowth;
            plotChanged = true;
          }
        }
      });

      // Random cafe sale
      if (state.cafeStand.stockedItems.length > 0 && Math.random() < 0.15) {
        const sold = state.cafeStand.stockedItems.pop();
        const earned = sold.price || 25;
        state.coins += earned;
        state.lovePoints += 2;
        state.cafeStand.totalSold++;

        const saleData = {
          item: sold.name,
          price: earned,
          coins: state.coins,
          lovePoints: state.lovePoints
        };
        this.trigger('cafe_sale', saleData);
        if (this.conn) this.conn.send({ type: 'cafe_sale', data: saleData });
      }

      const tickData = {
        timeOfDay: state.timeOfDay,
        dayCount: state.dayCount,
        farmingPlots: plotChanged ? this.localState.farmingPlots : undefined
      };
      this.trigger('world_tick', tickData);
      if (this.conn) this.conn.send({ type: 'world_tick', data: tickData });
    }, 2000);
  }

  handleHostIncoming(msg) {
    const { type, data } = msg;

    if (type === 'client_join') {
      const pClient = {
        id: 'client',
        name: data.playerName || 'Aurel',
        gender: data.avatarGender || 'girl',
        color: data.avatarColor || '#FF6584',
        x: 440,
        y: 320,
        dir: 'down',
        anim: 'idle',
        holdingHandsWith: null,
        energy: 100,
        hunger: 100,
        isSleeping: false,
        emote: null
      };
      this.localState.players['client'] = pClient;
      this.trigger('player_joined', pClient);

      // Reply with full init state
      this.conn.send({
        type: 'init_room_state',
        data: {
          yourId: 'client',
          slot: 1,
          players: this.localState.players,
          sharedState: this.localState.sharedState,
          farmingPlots: this.localState.farmingPlots,
          chatMessages: this.localState.chatMessages
        }
      });
    } else if (type === 'player_move') {
      if (this.localState.players['client']) {
        Object.assign(this.localState.players['client'], data);
        this.trigger('player_moved', { id: 'client', ...data });
      }
    } else if (type === 'send_emote') {
      this.trigger('player_emoted', { id: 'client', emote: data.emote });
    } else if (type === 'send_chat') {
      const msgObj = {
        sender: this.localState.players['client']?.name || 'Aurel',
        text: data.text,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      this.localState.chatMessages.push(msgObj);
      this.trigger('chat_message', msgObj);
      this.conn.send({ type: 'chat_message', data: msgObj });
    } else if (type === 'couple_action') {
      this.performCoupleAction('client', data.actionType);
    } else if (type === 'farming_action') {
      this.performFarmingAction('client', data);
    } else if (type === 'fish_caught') {
      this.performFishCaught('client', data);
    } else if (type === 'cook_recipe') {
      this.performCookRecipe('client', data);
    } else if (type === 'eat_item') {
      this.performEatItem('client', data);
    } else if (type === 'toggle_sleep') {
      this.performSleep('client', data);
    } else if (type === 'add_love_note') {
      this.performAddNote('client', data);
    } else if (type === 'shop_transaction') {
      this.performShopTransaction('client', data);
    } else if (type === 'stock_cafe') {
      this.performStockCafe('client', data);
    }
  }

  handleClientIncoming(msg) {
    const { type, data } = msg;
    this.trigger(type, data);
  }

  handlePeerEmit(event, data) {
    if (this.isHost) {
      if (event === 'player_move') {
        if (this.localState.players['host']) {
          Object.assign(this.localState.players['host'], data);
          if (this.conn) this.conn.send({ type: 'player_moved', data: { id: 'host', ...data } });
        }
      } else if (event === 'send_emote') {
        if (this.conn) this.conn.send({ type: 'player_emoted', data: { id: 'host', emote: data.emote } });
      } else if (event === 'send_chat') {
        const msgObj = {
          sender: this.localState.players['host']?.name || 'Zahy',
          text: data.text,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        this.localState.chatMessages.push(msgObj);
        this.trigger('chat_message', msgObj);
        if (this.conn) this.conn.send({ type: 'chat_message', data: msgObj });
      } else if (event === 'couple_action') {
        this.performCoupleAction('host', data.actionType);
      } else if (event === 'farming_action') {
        this.performFarmingAction('host', data);
      } else if (event === 'fish_caught') {
        this.performFishCaught('host', data);
      } else if (event === 'cook_recipe') {
        this.performCookRecipe('host', data);
      } else if (event === 'eat_item') {
        this.performEatItem('host', data);
      } else if (event === 'toggle_sleep') {
        this.performSleep('host', data);
      } else if (event === 'add_love_note') {
        this.performAddNote('host', data);
      } else if (event === 'shop_transaction') {
        this.performShopTransaction('host', data);
      } else if (event === 'stock_cafe') {
        this.performStockCafe('host', data);
      }
    } else {
      // Client forwards all actions to Host
      if (this.conn) {
        this.conn.send({ type: event, data });
      }
    }
  }

  // ================= SHARED ACTION HELPERS =================
  performCoupleAction(fromId, actionType) {
    const p = this.localState.players[fromId];
    if (!p) return;

    if (actionType === 'hug') {
      this.localState.sharedState.lovePoints += 5;
      p.energy = Math.min(100, p.energy + 10);
      const res = { actionType: 'hug', from: p.name, lovePoints: this.localState.sharedState.lovePoints, x: p.x, y: p.y };
      this.trigger('couple_action_performed', res);
      if (this.conn) this.conn.send({ type: 'couple_action_performed', data: res });
    } else if (actionType === 'kiss') {
      this.localState.sharedState.lovePoints += 10;
      p.energy = Math.min(100, p.energy + 15);
      const res = { actionType: 'kiss', from: p.name, lovePoints: this.localState.sharedState.lovePoints, x: p.x, y: p.y };
      this.trigger('couple_action_performed', res);
      if (this.conn) this.conn.send({ type: 'couple_action_performed', data: res });
    } else if (actionType === 'hold_hands') {
      const partnerId = fromId === 'host' ? 'client' : 'host';
      if (p.holdingHandsWith) {
        p.holdingHandsWith = null;
        if (this.localState.players[partnerId]) this.localState.players[partnerId].holdingHandsWith = null;
        this.trigger('hands_released', { id1: fromId });
        if (this.conn) this.conn.send({ type: 'hands_released', data: { id1: fromId } });
      } else {
        p.holdingHandsWith = partnerId;
        if (this.localState.players[partnerId]) this.localState.players[partnerId].holdingHandsWith = fromId;
        const res = { id1: fromId, id2: partnerId };
        this.trigger('hands_held', res);
        if (this.conn) this.conn.send({ type: 'hands_held', data: res });
      }
    }
  }

  performFarmingAction(fromId, { plotId, action, cropType }) {
    const plot = this.localState.farmingPlots.find(p => p.id === plotId);
    const p = this.localState.players[fromId];
    if (!plot || !p) return;

    if (action === 'till' && plot.state === 'empty') {
      plot.state = 'tilled';
      p.energy = Math.max(0, p.energy - 3);
    } else if (action === 'plant' && plot.state === 'tilled') {
      const seedName = `seed_${cropType}`;
      const seedIndex = this.localState.sharedState.fridge.findIndex(i => i.id === seedName && i.count > 0);
      if (seedIndex !== -1) {
        this.localState.sharedState.fridge[seedIndex].count--;
        plot.state = 'planted';
        plot.cropType = cropType;
        plot.growthProgress = 0;
        p.energy = Math.max(0, p.energy - 2);
      }
    } else if (action === 'water' && (plot.state === 'planted' || plot.state === 'tilled')) {
      plot.state = 'watered';
      p.energy = Math.max(0, p.energy - 2);
    } else if (action === 'harvest' && plot.state === 'ready') {
      const cropId = `crop_${plot.cropType}`;
      const cropName = plot.cropType === 'strawberry' ? 'Stroberi Segar' : 'Wortel Manis';
      const cropIcon = plot.cropType === 'strawberry' ? '🍓' : '🥕';
      const existing = this.localState.sharedState.fridge.find(i => i.id === cropId);
      if (existing) existing.count += 2;
      else this.localState.sharedState.fridge.push({ id: cropId, name: cropName, count: 2, icon: cropIcon });

      plot.state = 'empty';
      plot.cropType = null;
      plot.growthProgress = 0;
      this.localState.sharedState.lovePoints += 3;
    }

    const res = {
      plot,
      fridge: this.localState.sharedState.fridge,
      lovePoints: this.localState.sharedState.lovePoints,
      playerEnergy: p.energy
    };
    this.trigger('farming_updated', res);
    if (this.conn) this.conn.send({ type: 'farming_updated', data: res });
  }

  performFishCaught(fromId, { fishType }) {
    const p = this.localState.players[fromId];
    if (!p) return;
    p.energy = Math.max(0, p.energy - 5);

    const fishItem = this.localState.sharedState.fridge.find(i => i.id === 'fresh_fish');
    if (fishItem) fishItem.count++;
    else this.localState.sharedState.fridge.push({ id: 'fresh_fish', name: 'Ikan Danau Segar', count: 1, icon: '🐟' });
    this.localState.sharedState.lovePoints += 2;

    const res = {
      playerName: p.name,
      fishName: fishType || 'Ikan Mas Cantik',
      fridge: this.localState.sharedState.fridge,
      lovePoints: this.localState.sharedState.lovePoints
    };
    this.trigger('fish_result', res);
    if (this.conn) this.conn.send({ type: 'fish_result', data: res });
  }

  performCookRecipe(fromId, { recipeId }) {
    const fridge = this.localState.sharedState.fridge;
    let cooked = null;

    if (recipeId === 'salad') {
      const carrot = fridge.find(i => i.id === 'crop_carrot');
      const berry = fridge.find(i => i.id === 'crop_strawberry');
      if (carrot && carrot.count >= 1 && berry && berry.count >= 1) {
        carrot.count--;
        berry.count--;
        cooked = { id: 'salad', name: 'Salad Cinta Segar', count: 1, icon: '🥗' };
      }
    } else if (recipeId === 'grilled_fish') {
      const fish = fridge.find(i => i.id === 'fresh_fish');
      if (fish && fish.count >= 1) {
        fish.count--;
        cooked = { id: 'grilled_fish', name: 'Ikan Bakar Spesial', count: 1, icon: '🍱' };
      }
    }

    if (cooked) {
      const existing = fridge.find(i => i.id === cooked.id);
      if (existing) existing.count++;
      else fridge.push(cooked);
      this.localState.sharedState.lovePoints += 5;

      const res = {
        recipe: cooked.name,
        fridge: this.localState.sharedState.fridge,
        lovePoints: this.localState.sharedState.lovePoints
      };
      this.trigger('cooking_success', res);
      if (this.conn) this.conn.send({ type: 'cooking_success', data: res });
    }
  }

  performEatItem(fromId, { itemId }) {
    const p = this.localState.players[fromId];
    const item = this.localState.sharedState.fridge.find(i => i.id === itemId && i.count > 0);
    if (!p || !item) return;

    item.count--;
    const hungerGain = itemId.includes('salad') ? 40 : itemId.includes('grilled') ? 60 : 25;
    p.hunger = Math.min(100, p.hunger + hungerGain);
    p.energy = Math.min(100, p.energy + 20);

    const res = {
      id: fromId,
      name: p.name,
      itemName: item.name,
      hunger: p.hunger,
      energy: p.energy,
      fridge: this.localState.sharedState.fridge
    };
    this.trigger('player_ate', res);
    if (this.conn) this.conn.send({ type: 'player_ate', data: res });
  }

  performSleep(fromId, { isSleeping }) {
    const p = this.localState.players[fromId];
    if (!p) return;
    p.isSleeping = isSleeping;

    const allPlayers = Object.values(this.localState.players);
    const allAsleep = allPlayers.length >= 2 && allPlayers.every(pl => pl.isSleeping);

    if (allAsleep) {
      this.localState.sharedState.timeOfDay = 6.0;
      this.localState.sharedState.dayCount++;
      allPlayers.forEach(pl => {
        pl.energy = 100;
        pl.hunger = Math.max(30, pl.hunger - 10);
        pl.isSleeping = false;
      });
      this.localState.sharedState.lovePoints += 20;

      const res = {
        dayCount: this.localState.sharedState.dayCount,
        lovePoints: this.localState.sharedState.lovePoints,
        players: this.localState.players
      };
      this.trigger('morning_arrived', res);
      if (this.conn) this.conn.send({ type: 'morning_arrived', data: res });
    } else {
      const res = { id: fromId, isSleeping };
      this.trigger('player_sleep_state', res);
      if (this.conn) this.conn.send({ type: 'player_sleep_state', data: res });
    }
  }

  performAddNote(fromId, { text }) {
    const p = this.localState.players[fromId];
    if (!p || !text) return;

    const newNote = {
      from: p.name,
      text: text.trim().slice(0, 140),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    this.localState.sharedState.loveNotes.unshift(newNote);
    this.localState.sharedState.lovePoints += 5;

    const res = { notes: this.localState.sharedState.loveNotes, lovePoints: this.localState.sharedState.lovePoints };
    this.trigger('love_notes_updated', res);
    if (this.conn) this.conn.send({ type: 'love_notes_updated', data: res });
  }

  performShopTransaction(fromId, { action, itemType, cost, price }) {
    const state = this.localState.sharedState;
    if (action === 'buy') {
      if (state.coins >= cost) {
        state.coins -= cost;
        const existing = state.fridge.find(i => i.id === itemType.id);
        if (existing) existing.count++;
        else state.fridge.push({ ...itemType, count: 1 });

        const res = { coins: state.coins, fridge: state.fridge, message: `Membeli 1x ${itemType.name}!` };
        this.trigger('trade_completed', res);
        if (this.conn) this.conn.send({ type: 'trade_completed', data: res });
      }
    } else if (action === 'sell') {
      const item = state.fridge.find(i => i.id === itemType.id && i.count > 0);
      if (item) {
        item.count--;
        state.coins += price;
        state.lovePoints += 2;

        const res = { coins: state.coins, fridge: state.fridge, message: `Menjual 1x ${itemType.name} (+🪙${price})!` };
        this.trigger('trade_completed', res);
        if (this.conn) this.conn.send({ type: 'trade_completed', data: res });
      }
    }
  }

  performStockCafe(fromId, { itemId }) {
    const item = this.localState.sharedState.fridge.find(i => i.id === itemId && i.count > 0);
    if (!item) return;

    item.count--;
    const price = itemId.includes('salad') ? 60 : itemId.includes('grilled') ? 80 : 30;
    this.localState.sharedState.cafeStand.stockedItems.push({ id: item.id, name: item.name, price });

    const res = { cafeStand: this.localState.sharedState.cafeStand, fridge: this.localState.sharedState.fridge };
    this.trigger('cafe_updated', res);
    if (this.conn) this.conn.send({ type: 'cafe_updated', data: res });
  }
}

window.socket = new HybridNetwork();
