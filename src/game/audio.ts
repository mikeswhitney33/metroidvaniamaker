/**
 * Synthesised sound: every effect and music theme is generated with WebAudio, so the
 * engine ships no audio files. Nothing plays until the page has had a user gesture.
 */

type Wave = OscillatorType;

interface Note {
  f: number;
  /** Seconds. */
  d: number;
  wave?: Wave;
  /** End frequency, for sweeps. */
  to?: number;
  vol?: number;
  noise?: boolean;
}

const SFX: Record<string, Note[]> = {
  jump: [{ f: 220, to: 440, d: 0.08, wave: 'square', vol: 0.08 }],
  spin: [{ f: 300, to: 700, d: 0.12, wave: 'triangle', vol: 0.1 }],
  land: [{ f: 90, to: 50, d: 0.05, wave: 'square', vol: 0.05 }],
  beam: [{ f: 880, to: 440, d: 0.07, wave: 'square', vol: 0.06 }],
  charged: [{ f: 600, to: 1200, d: 0.15, wave: 'sine', vol: 0.08 }],
  chargeShot: [{ f: 400, to: 120, d: 0.2, wave: 'sawtooth', vol: 0.1 }],
  missile: [{ f: 200, to: 80, d: 0.18, noise: true, vol: 0.15 }],
  explode: [{ f: 120, to: 30, d: 0.3, noise: true, vol: 0.2 }],
  bomb: [{ f: 600, d: 0.04, wave: 'square', vol: 0.05 }],
  nova: [{ f: 60, to: 20, d: 1.0, noise: true, vol: 0.3 }],
  hurt: [{ f: 160, to: 60, d: 0.18, wave: 'sawtooth', vol: 0.12 }],
  tink: [{ f: 1800, d: 0.04, wave: 'square', vol: 0.05 }],
  hit: [{ f: 300, to: 150, d: 0.06, wave: 'square', vol: 0.08 }],
  kill: [{ f: 200, to: 40, d: 0.2, noise: true, vol: 0.12 }],
  door: [{ f: 180, to: 360, d: 0.15, wave: 'triangle', vol: 0.1 }],
  pickup: [
    { f: 523, d: 0.1, wave: 'square', vol: 0.08 },
    { f: 659, d: 0.1, wave: 'square', vol: 0.08 },
    { f: 784, d: 0.1, wave: 'square', vol: 0.08 },
    { f: 1047, d: 0.3, wave: 'square', vol: 0.08 },
  ],
  small: [{ f: 880, to: 1320, d: 0.06, wave: 'triangle', vol: 0.07 }],
  save: [
    { f: 392, d: 0.15, wave: 'triangle', vol: 0.1 },
    { f: 523, d: 0.3, wave: 'triangle', vol: 0.1 },
  ],
  speed: [{ f: 200, to: 800, d: 0.4, wave: 'sawtooth', vol: 0.06 }],
  dash: [{ f: 500, to: 200, d: 0.1, noise: true, vol: 0.08 }],
  bonk: [{ f: 120, d: 0.05, wave: 'square', vol: 0.06 }],
  enemyShot: [{ f: 700, to: 300, d: 0.08, wave: 'triangle', vol: 0.05 }],
  swoop: [{ f: 900, to: 400, d: 0.25, wave: 'sine', vol: 0.05 }],
  rumble: [{ f: 50, to: 30, d: 0.6, noise: true, vol: 0.15 }],
  roar: [{ f: 140, to: 70, d: 0.5, wave: 'sawtooth', vol: 0.12 }],
  mech: [{ f: 100, to: 300, d: 0.2, wave: 'square', vol: 0.08 }],
  laser: [{ f: 1200, to: 900, d: 0.45, wave: 'sawtooth', vol: 0.07 }],
  alarm: [
    { f: 880, d: 0.2, wave: 'square', vol: 0.06 },
    { f: 660, d: 0.2, wave: 'square', vol: 0.06 },
  ],
  select: [{ f: 660, d: 0.04, wave: 'square', vol: 0.05 }],
  crumble: [{ f: 150, to: 80, d: 0.12, noise: true, vol: 0.06 }],
};

/** Built-in music themes: a bass pattern and a sparse melody on a scale. */
export const THEMES: Record<string, { name: string; tempo: number; root: number; scale: number[]; bass: number[]; lead: number[]; wave: Wave }> = {
  surface: { name: 'Surface', tempo: 96, root: 45, scale: [0, 2, 3, 5, 7, 8, 10], bass: [0, 0, 4, 0, 3, 0, 4, 6], lead: [7, -1, 9, -1, 11, 9, 7, -1, 4, -1, 6, -1, 7, -1, -1, -1], wave: 'triangle' },
  caverns: { name: 'Caverns', tempo: 84, root: 40, scale: [0, 2, 3, 5, 7, 8, 11], bass: [0, -1, 0, -1, 5, -1, 4, -1], lead: [-1, 7, -1, 8, -1, 7, 4, -1, -1, 3, -1, 4, -1, -1, 2, -1], wave: 'sine' },
  forge: { name: 'Forge', tempo: 120, root: 38, scale: [0, 1, 4, 5, 7, 8, 10], bass: [0, 0, 1, 0, 0, 0, 5, 4], lead: [7, 8, 7, -1, 5, -1, 4, 5, 7, -1, 8, -1, 9, 8, 7, -1], wave: 'sawtooth' },
  depths: { name: 'Depths', tempo: 72, root: 36, scale: [0, 2, 3, 5, 7, 9, 10], bass: [0, -1, -1, 0, 2, -1, -1, 4], lead: [9, -1, -1, 7, -1, -1, 5, -1, 4, -1, -1, -1, 2, -1, -1, -1], wave: 'sine' },
  hive: { name: 'Hive', tempo: 132, root: 41, scale: [0, 1, 3, 5, 6, 8, 10], bass: [0, 3, 0, 4, 0, 3, 6, 4], lead: [7, -1, 8, 7, 4, -1, 3, -1, 7, -1, 8, 10, 11, -1, 10, -1], wave: 'square' },
  ruins: { name: 'Ruins', tempo: 90, root: 43, scale: [0, 2, 4, 5, 7, 9, 11], bass: [0, -1, 4, -1, 5, -1, 3, -1], lead: [4, 5, 7, -1, 9, -1, 7, 5, 4, -1, 2, -1, 0, -1, -1, -1], wave: 'triangle' },
  boss: { name: 'Boss', tempo: 150, root: 38, scale: [0, 1, 3, 5, 6, 8, 9], bass: [0, 0, 0, 1, 0, 0, 3, 1], lead: [7, 6, 7, 8, 7, -1, 4, -1, 7, 6, 7, 9, 10, -1, 8, -1], wave: 'sawtooth' },
  escape: { name: 'Escape', tempo: 170, root: 40, scale: [0, 1, 3, 5, 7, 8, 10], bass: [0, 0, 7, 0, 0, 0, 6, 5], lead: [7, 7, 8, 7, 10, -1, 7, -1, 7, 7, 8, 7, 11, -1, 10, -1], wave: 'square' },
};

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private theme: string | null = null;
  private nextBeat = 0;
  private beat = 0;
  muted = false;
  musicOn = true;

  /** Must be called from a user gesture before anything is audible. */
  resume() {
    if (typeof window === 'undefined' || !('AudioContext' in window)) return;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.ctx.destination);
      this.music = this.ctx.createGain();
      this.music.gain.value = 0.35;
      this.music.connect(this.master);
      const n = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, n, n);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private tone(n: Note, at: number, out: AudioNode) {
    const c = this.ctx!;
    const g = c.createGain();
    const v = n.vol ?? 0.08;
    g.gain.setValueAtTime(v, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + n.d);
    g.connect(out);
    if (n.noise) {
      const s = c.createBufferSource();
      s.buffer = this.noiseBuf;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(n.f * 8, at);
      if (n.to) f.frequency.exponentialRampToValueAtTime(n.to * 8, at + n.d);
      s.connect(f);
      f.connect(g);
      s.start(at);
      s.stop(at + n.d);
      return;
    }
    const o = c.createOscillator();
    o.type = n.wave ?? 'square';
    o.frequency.setValueAtTime(n.f, at);
    if (n.to) o.frequency.exponentialRampToValueAtTime(n.to, at + n.d);
    o.connect(g);
    o.start(at);
    o.stop(at + n.d + 0.02);
  }

  play(name: string) {
    if (this.muted || !this.ctx || !this.master || this.ctx.state !== 'running') return;
    const notes = SFX[name];
    if (!notes) return;
    let at = this.ctx.currentTime;
    notes.forEach((n) => {
      this.tone(n, at, this.master!);
      at += n.d * 0.8;
    });
  }

  setTheme(id: string | null) {
    if (id === this.theme) return;
    this.theme = id && THEMES[id] ? id : null;
    this.beat = 0;
    if (this.ctx) this.nextBeat = this.ctx.currentTime + 0.1;
  }

  /** Schedules the next bit of music; call every frame. */
  tick() {
    if (!this.ctx || !this.music || !this.theme || this.muted || !this.musicOn || this.ctx.state !== 'running') return;
    const th = THEMES[this.theme];
    const step = 60 / th.tempo / 2;
    const deg = (d: number) => th.root + 12 * Math.floor(d / th.scale.length) + th.scale[((d % th.scale.length) + th.scale.length) % th.scale.length];
    if (this.nextBeat < this.ctx.currentTime) this.nextBeat = this.ctx.currentTime + 0.05;
    while (this.nextBeat < this.ctx.currentTime + 0.2) {
      const b = this.beat++;
      if (b % 2 === 0) {
        const bn = th.bass[(b / 2) % th.bass.length];
        if (bn >= 0) this.tone({ f: midi(deg(bn)), d: step * 1.8, wave: 'triangle', vol: 0.12 }, this.nextBeat, this.music);
      }
      const ln = th.lead[b % th.lead.length];
      if (ln >= 0) this.tone({ f: midi(deg(ln) + 12), d: step * 1.5, wave: th.wave, vol: th.wave === 'sawtooth' || th.wave === 'square' ? 0.035 : 0.06 }, this.nextBeat, this.music);
      this.nextBeat += step;
    }
  }

  close() {
    void this.ctx?.close();
    this.ctx = null;
  }
}
