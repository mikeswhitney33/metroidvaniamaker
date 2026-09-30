# Vaultwright

A metroidvania level editor: sketch a map of rooms, wire up a lock & key graph
(abilities that open gates), check that the result can be finished, then
playtest a generated build in the browser.

## Getting started

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests for the solver
npm run build      # typecheck + production build
```

## What's in it

- **Author mode**: draw rooms on a 32×18 grid (`B`), select (`V`) or erase
  (`E`) them. Rooms that share an edge get a doorway. Drag keys and gates onto
  rooms, or use **Auto-place keys** to lay them out along the gate order.
- **Lock & key**: the requirement graph, with an inspector for the selected
  node's name, placement and requirements.
- **Art style**: palette presets, reference-art slots (drop or pick an image;
  kept in `localStorage`), a prompt and tile size.
- **Validate**: simulates a player collecting keys to flag softlocks,
  unreachable bosses, unplaced nodes, sequence breaks and isolated rooms, and
  lists the critical path.
- **Playtest**: builds a tile world from the map and runs it on a canvas.
  Arrow keys / `A` `D` move, `Space` jumps, `Shift` dashes once you find the
  Dash Boots, `R` restarts.

## Layout

```
src/
  model/    rooms, lock & key graph, solver and auto-placement (pure, tested)
  game/     tile world builder and the playtest engine
  editor/   React UI: Editor.tsx owns state; components/ are the panels
```

`<Editor>` takes two optional props: `jumpPower` (default 30) and
`hatchUnreachable` (default true, hatches rooms the solver can't reach).
