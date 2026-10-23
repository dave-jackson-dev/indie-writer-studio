import { describe, expect, it } from 'vitest';

import { toTreeNodes, type OutlineDto } from './outline-tree';

const node = (id: string, kind: string, title: string, words: number, children = []) => ({
  id,
  kind,
  title,
  words,
  totalWords: words,
  children,
});

describe('toTreeNodes', () => {
  it('is empty for an empty outline', () => {
    expect(toTreeNodes({ front: [], main: [], back: [], totalWords: 0 })).toEqual([]);
  });

  it('flattens sections into rows that point at their parents', () => {
    const outline: OutlineDto = {
      front: [],
      main: [
        node('c1', 'chapter', 'The Crossing', 4, [
          node('s1', 'scene', 'Dawn', 2) as never,
        ] as never),
      ],
      back: [],
      totalWords: 6,
    };
    const rows = toTreeNodes(outline);
    expect(rows.map((row) => [row.id, row.parentId, row.title, row.kind, row.words])).toEqual([
      ['c1', undefined, 'The Crossing', 'chapter', 4],
      ['s1', 'c1', 'Dawn', 'scene', 2],
    ]);
  });

  it('keeps front, main and back matter apart when more than one has sections', () => {
    const outline: OutlineDto = {
      front: [node('f1', 'section', 'Dedication', 1)],
      main: [node('c1', 'chapter', 'One', 1)],
      back: [],
      totalWords: 2,
    };
    const rows = toTreeNodes(outline);
    expect(rows.map((row) => row.matter)).toEqual(['front', 'main']);
  });
});
