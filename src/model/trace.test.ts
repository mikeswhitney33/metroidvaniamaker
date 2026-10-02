import { describe, expect, it } from 'vitest';
import { imageToMask, ImportError, mapFileToMask, maskToRects } from './trace';

const m = (rows: string[]) => rows.map((r) => [...r].map((c) => c === '#'));

describe('trace', () => {
  it('covers a mask with rectangles', () => {
    const rects = maskToRects(m(['##..', '##..', '.###']));
    expect(rects).toEqual([
      { x: 0, y: 0, w: 2, h: 2 },
      { x: 1, y: 2, w: 3, h: 1 },
    ]);
  });

  it('finds ink in an image', () => {
    // 4x2 white image with a black left half.
    const px = [0, 0, 255, 255, 0, 0, 255, 255].flatMap((v) => [v, v, v, 255]);
    // Median is the boundary; make the background clearly white by adding white pixels.
    const data = new Uint8ClampedArray([...px, ...Array(16).fill(255)]);
    const mask = imageToMask(data, 4, 3, 2, 1, 55);
    expect(mask).toEqual([[true, false]]);
  });

  it('reads a Tiled tile layer', () => {
    const tmj = JSON.stringify({ layers: [{ type: 'tilelayer', width: 3, height: 1, data: [0, 5, 5] }] });
    expect(mapFileToMask(tmj)).toEqual([[false, true, true]]);
  });

  it('reads an LDtk IntGrid layer', () => {
    const ldtk = JSON.stringify({ levels: [{ layerInstances: [{ __type: 'IntGrid', __cWid: 2, __cHei: 1, intGridCsv: [1, 0] }] }] });
    expect(mapFileToMask(ldtk)).toEqual([[true, false]]);
  });

  it('explains unreadable files', () => {
    expect(() => mapFileToMask('nope')).toThrow(ImportError);
    expect(() => mapFileToMask('{}')).toThrow("This isn't a Tiled or LDtk map.");
  });
});
