// Sound system using Web Audio API (Zero dependencies, lightweight, runs offline)
class SoundManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.bgmPlaying = false;
    this.bgmInterval = null;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playTone(freq, type = 'sine', duration = 0.2, gainVal = 0.1) {
    if (this.muted) return;
    this.init();
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      console.warn(e);
    }
  }

  playLove() {
    if (this.muted) return;
    this.init();
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      setTimeout(() => this.playTone(freq, 'triangle', 0.25, 0.15), idx * 75);
    });
  }

  playKiss() {
    if (this.muted) return;
    this.init();
    this.playTone(800, 'sine', 0.1, 0.12);
    setTimeout(() => this.playTone(1200, 'sine', 0.15, 0.15), 90);
  }

  playCoin() {
    if (this.muted) return;
    this.init();
    this.playTone(987.77, 'sine', 0.1, 0.12); // B5
    setTimeout(() => this.playTone(1318.51, 'sine', 0.25, 0.15), 100); // E6
  }

  playPlant() {
    if (this.muted) return;
    this.init();
    this.playTone(220, 'triangle', 0.15, 0.1);
    setTimeout(() => this.playTone(330, 'triangle', 0.15, 0.1), 80);
  }

  playWater() {
    if (this.muted) return;
    this.init();
    this.playTone(600, 'sine', 0.08, 0.08);
    setTimeout(() => this.playTone(500, 'sine', 0.12, 0.08), 70);
  }

  playHarvest() {
    if (this.muted) return;
    this.init();
    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((f, i) => setTimeout(() => this.playTone(f, 'sine', 0.2, 0.12), i * 60));
  }

  playSplash() {
    if (this.muted) return;
    this.init();
    this.playTone(300, 'sine', 0.2, 0.15);
  }

  playCook() {
    if (this.muted) return;
    this.init();
    this.playTone(400, 'sawtooth', 0.1, 0.05);
    setTimeout(() => this.playTone(450, 'sawtooth', 0.15, 0.05), 100);
  }

  startBGM() {
    if (this.bgmPlaying) return;
    this.init();
    this.bgmPlaying = true;

    // Gentle cozy chiptune lullaby chord progression
    const chords = [
      [261.63, 329.63, 392.00], // C
      [220.00, 261.63, 329.63], // Am
      [174.61, 220.00, 261.63], // F
      [196.00, 246.94, 293.66]  // G
    ];

    let chordIdx = 0;
    this.bgmInterval = setInterval(() => {
      if (this.muted || !this.bgmPlaying) return;
      const curChord = chords[chordIdx];
      curChord.forEach(f => this.playTone(f, 'sine', 1.8, 0.025));
      chordIdx = (chordIdx + 1) % chords.length;
    }, 2000);
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }
}

window.soundManager = new SoundManager();

