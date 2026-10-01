# Vaultwright

A metroidvania level editor: sketch a map of rooms, wire up a lock & key graph
(abilities that open gates), check that the result can be finished, then
play it in the browser or export it as a standalone HTML game.

## Getting started

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (solver, runtime, showcase game)
npm run build      # typecheck + production build
```

## What's in it

- **Projects**: work autosaves in the browser (IndexedDB). The **Project** menu
  starts a new project, opens a sample, opens or saves a `.vwm.json` file
  (`Ctrl/⌘ S`), and exports a playable single-file HTML game. Every edit can be
  undone (`Ctrl/⌘ Z`) and redone (`Ctrl/⌘ Shift Z`).
- **Samples**: *Hollow Depths*, a small map to learn on, and *Vault of the
  Hollow King*, the full showcase game: six areas, fifteen items, four bosses,
  timed escapes and a temple that strips your powers. Its layout lives in
  `src/model/homage/` and a test keeps it beatable.
- **Map**: draw rooms (`B`), select (`V`), erase (`E`), zoom with `Ctrl` +
  wheel. Rooms that touch get a doorway; click a doorway marker to cycle its
  hatch (blue, red missile, green super, yellow nova, grey flag). Areas give
  rooms a map colour, palette and music theme.
- **Room painter**: double-click a room to paint tiles (solid, platforms,
  spikes, water, lava, breakable blocks for each weapon, crumble) and place
  entities (save, recharge and map stations, hint statues, expansions,
  enemies, bosses, triggers, the exit). Templates rough a room in; the entity
  inspector edits each one's settings.
- **Items and rules**: abilities are keys. Each item grants an ability from
  the rulebook (or a custom one) and can lie dormant until a world flag is
  set. The Rules tab tunes jump physics and which tricks count.
- **Validate**: a tile-level solver walks the actual rooms with the moves each
  item gives, in a background worker. It reports what can't be reached,
  softlocks, sequence breaks, and the route stage by stage, and can shade the
  reachable tiles on the map.
- **Animation**: characters use a built-in animated rig until you give them
  a sprite sheet; the Sprites tab cuts clips per state or imports Aseprite
  JSON.
- **Playtest**: the full game at a fixed 60 Hz: shooting, charge, missiles,
  bombs, rolling, wall and bomb jumps, speed running, enemies, bosses,
  escapes, saves, rebindable keys, gamepads, Assist and Calm effects modes,
  synthesized music and sound.

## Layout

```
src/
  model/    rooms, lock & key graph, solver, auto-placement and the project
            file format (pure, tested)
  game/     runtime: physics, player, enemies, bosses, rendering, audio
  player/   standalone player used by exported HTML games
  editor/   React UI: Editor.tsx owns state; components/ are the panels
```

`<Editor>` takes one optional prop, `hatchUnreachable` (default true, hatches
rooms the solver can't reach). Jump physics live in each project's Rules tab.
