/** Everything the player can do with a button. */
export type Action = 'left' | 'right' | 'up' | 'down' | 'jump' | 'shoot' | 'select' | 'dash' | 'aim' | 'pause';

export const ACTIONS: { action: Action; label: string }[] = [
  { action: 'left', label: 'Left' },
  { action: 'right', label: 'Right' },
  { action: 'up', label: 'Up / aim up' },
  { action: 'down', label: 'Down / crouch / roll' },
  { action: 'jump', label: 'Jump' },
  { action: 'shoot', label: 'Shoot (hold to charge)' },
  { action: 'select', label: 'Switch weapon' },
  { action: 'dash', label: 'Dash' },
  { action: 'aim', label: 'Aim diagonally (hold)' },
  { action: 'pause', label: 'Pause / map' },
];

export type Bindings = Record<Action, string[]>;

export const DEFAULT_BINDINGS: Bindings = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  jump: ['Space', 'KeyZ'],
  shoot: ['KeyX', 'KeyJ'],
  select: ['KeyC', 'KeyL'],
  dash: ['ShiftLeft', 'ShiftRight', 'KeyK'],
  aim: ['KeyQ', 'KeyI'],
  pause: ['Enter', 'Tab'],
};

/** Standard-mapping gamepad buttons per action. */
const PAD: Partial<Record<Action, number[]>> = {
  jump: [0],
  dash: [1],
  shoot: [2],
  select: [3],
  aim: [4, 5],
  pause: [9],
  up: [12],
  down: [13],
  left: [14],
  right: [15],
};

/** What the game reads each step: buttons held, and buttons newly pressed since the last step. */
export interface Controls {
  held(a: Action): boolean;
  pressed(a: Action): boolean;
}

/** A frozen set of buttons, for tests and replays. */
export class ControlFrame implements Controls {
  constructor(
    readonly down: ReadonlySet<Action> = new Set(),
    readonly fresh: ReadonlySet<Action> = new Set(),
  ) {}
  held(a: Action) {
    return this.down.has(a);
  }
  pressed(a: Action) {
    return this.fresh.has(a);
  }
}

/** Keyboard and gamepad input, turned into per-step `ControlFrame`s. */
export class Input {
  private keys = new Set<string>();
  private freshKeys = new Set<string>();
  private padPrev = new Set<Action>();
  bindings: Bindings;

  constructor(bindings: Bindings = DEFAULT_BINDINGS) {
    this.bindings = bindings;
  }

  /** Feed a key event; returns true when the key is bound (so the page shouldn't scroll). */
  key(code: string, down: boolean, repeat = false): boolean {
    if (down) {
      if (!repeat && !this.keys.has(code)) this.freshKeys.add(code);
      this.keys.add(code);
    } else this.keys.delete(code);
    return Object.values(this.bindings).some((codes) => codes.includes(code));
  }

  clear() {
    this.keys.clear();
    this.freshKeys.clear();
  }

  private padActions(): Set<Action> {
    const out = new Set<Action>();
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      (Object.keys(PAD) as Action[]).forEach((a) => PAD[a]!.forEach((b) => p.buttons[b]?.pressed && out.add(a)));
      const [ax = 0, ay = 0] = p.axes;
      if (ax < -0.5) out.add('left');
      if (ax > 0.5) out.add('right');
      if (ay < -0.5) out.add('up');
      if (ay > 0.5) out.add('down');
    }
    return out;
  }

  /** Buttons for the next game step; newly pressed buttons are reported once. */
  frame(): ControlFrame {
    const down = new Set<Action>();
    const fresh = new Set<Action>();
    (Object.keys(this.bindings) as Action[]).forEach((a) => {
      const codes = this.bindings[a];
      if (codes.some((c) => this.keys.has(c))) down.add(a);
      if (codes.some((c) => this.freshKeys.has(c))) fresh.add(a);
    });
    const pad = this.padActions();
    pad.forEach((a) => {
      down.add(a);
      if (!this.padPrev.has(a)) fresh.add(a);
    });
    this.padPrev = pad;
    this.freshKeys.clear();
    return new ControlFrame(down, fresh);
  }
}

const ARROWS: Record<string, string> = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' };

/** Human-readable key name, e.g. "KeyX" → "X", "ShiftLeft" → "Shift". */
export const keyLabel = (code: string) =>
  ARROWS[code] ?? code.replace(/^Key|^Digit/, '').replace(/(Left|Right)$/, '').replace(/^$/, code);
