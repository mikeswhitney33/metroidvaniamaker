import { useEffect, useRef, useState } from 'react';
import { Sound } from '../game/audio';
import { Game, STEP } from '../game/Game';
import { DEFAULT_BINDINGS, Input, keyLabel, type Bindings } from '../game/input';
import { loadRun, saveKey } from '../game/run';
import { parseProject, type ProjectContent } from '../model/project';

const FONT = 'ui-monospace, SFMono-Regular, Menlo, monospace';

/** The exported game: a title screen, then the game full-window. */
export function Player({ project, bindings = DEFAULT_BINDINGS }: { project: unknown; bindings?: Bindings }) {
  const [content] = useState<ProjectContent | string>(() => {
    try {
      return parseProject(JSON.stringify(project));
    } catch (e) {
      return e instanceof Error ? e.message : 'This game file is damaged.';
    }
  });
  const canvas = useRef<HTMLCanvasElement>(null);
  const [started, setStarted] = useState(false);
  const [opts, setOpts] = useState({ assist: false, calm: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches });
  const key = typeof content === 'string' ? '' : saveKey(content);
  const [hasSave] = useState(() => !!key && !!loadRun(key));
  const game = useRef<Game | null>(null);
  const input = useRef(new Input(bindings));

  const start = (resume: boolean) => {
    if (typeof content === 'string') return;
    const sound = new Sound();
    sound.resume();
    const images: Record<string, HTMLImageElement> = {};
    Object.values(content.sprites).forEach((sh) => {
      const src = content.images[sh.image];
      if (!src) return;
      images[sh.image] = Object.assign(new Image(), { src });
    });
    game.current = new Game(content, {}, { saveKey: key, run: resume ? (loadRun(key) ?? undefined) : undefined, damageScale: opts.assist ? 0.5 : 1, reducedFlash: opts.calm, images, sound });
    setStarted(true);
  };

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (input.current.key(e.code, true, e.repeat)) e.preventDefault();
    };
    const ku = (e: KeyboardEvent) => input.current.key(e.code, false);
    const blur = () => input.current.clear();
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('blur', blur);
    };
  }, []);

  useEffect(() => {
    if (!started) return;
    let raf = 0;
    let last = 0;
    let acc = 0;
    const loop = (t: number) => {
      const g = game.current;
      if (g) {
        acc += last ? Math.min(0.1, (t - last) / 1000) : STEP;
        while (acc >= STEP) {
          g.update(input.current.frame());
          acc -= STEP;
        }
        if (canvas.current) g.draw(canvas.current);
      }
      last = t;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [started]);

  const page = { position: 'fixed', inset: 0, background: '#0b0c0f', color: '#f0e6d2', font: `500 14px ${FONT}` } as const;
  if (typeof content === 'string') return <div style={{ ...page, display: 'grid', placeItems: 'center' }}>{content}</div>;
  if (started) return <canvas ref={canvas} aria-label={content.name} style={{ ...page, width: '100%', height: '100%', display: 'block' }} />;
  const button = { font: `700 15px ${FONT}`, padding: '10px 22px', borderRadius: 6, border: '1px solid #f0b44c', background: 'transparent', color: '#f0b44c', cursor: 'pointer' } as const;
  return (
    <div style={{ ...page, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, padding: 20, textAlign: 'center' }}>
      <h1 style={{ font: `700 34px ${FONT}`, margin: 0, letterSpacing: '.04em' }}>{content.name}</h1>
      <div style={{ display: 'flex', gap: 12 }}>
        <button style={button} onClick={() => start(false)} autoFocus>
          New game
        </button>
        {hasSave && (
          <button style={button} onClick={() => start(true)}>
            Continue
          </button>
        )}
      </div>
      <div style={{ display: 'flex', gap: 18, color: '#9aa1ad', fontSize: 13 }}>
        <label>
          <input type="checkbox" checked={opts.assist} onChange={(e) => setOpts({ ...opts, assist: e.target.checked })} /> Assist (half damage)
        </label>
        <label>
          <input type="checkbox" checked={opts.calm} onChange={(e) => setOpts({ ...opts, calm: e.target.checked })} /> Calm effects
        </label>
      </div>
      <div style={{ color: '#6f7682', fontSize: 12, lineHeight: 1.7, maxWidth: 560 }}>
        {(['left', 'right', 'jump', 'shoot', 'down', 'select', 'aim', 'dash', 'pause'] as const).map((a) => `${a} ${bindings[a].map(keyLabel).join('/')}`).join(' · ')}
        <br />
        Made with Vaultwright
      </div>
    </div>
  );
}
