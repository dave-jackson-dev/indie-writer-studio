import { describe, expect, it } from 'vitest';

import {
  addNode,
  emptyManuscript,
  findNode,
  ManuscriptDomainError,
  moveNode,
  outlineOf,
  parseWorkId,
  removeNode,
  updateNode,
  wordCount,
  type Manuscript,
  type ManuscriptNode,
} from './manuscript.js';

const NOW = '2026-11-01T10:00:00.000Z';
const LATER = '2026-11-02T10:00:00.000Z';

const fail = (run: () => unknown): ManuscriptDomainError => {
  try {
    run();
  } catch (error) {
    return error as ManuscriptDomainError;
  }
  throw new Error('expected a ManuscriptDomainError');
};

let counter = 0;
const add = (
  manuscript: Manuscript,
  kind: string,
  title: string,
  where: { parentId?: string; matter?: string; position?: number; body?: string } = {},
): Manuscript => addNode(manuscript, { id: `n${++counter}`, kind, title, ...where }, LATER);

/** Ids of titles, in reading order, to let tests refer to nodes by name. */
const idOf = (manuscript: Manuscript, title: string): string => {
  const walk = (nodes: readonly ManuscriptNode[]): string | undefined => {
    for (const node of nodes) {
      if (node.title === title) return node.id;
      const inner = walk(node.children);
      if (inner) return inner;
    }
    return undefined;
  };
  const id = walk([...manuscript.front, ...manuscript.main, ...manuscript.back]);
  if (!id) throw new Error(`no node titled ${title}`);
  return id;
};

const titles = (nodes: readonly ManuscriptNode[]): string[] => nodes.map((n) => n.title);

describe('parseWorkId', () => {
  it.each(['w1', 'abc-DEF_123', '0f8fad5b-d9cb-469f-a165-70867728950e', 'x'.repeat(100)])(
    'accepts %s',
    (id) => expect(parseWorkId(id)).toBe(id),
  );

  it.each(['', '../x', 'a/b', 'a\\b', '..', 'has space', 'x'.repeat(101), 'a.json', 'é'])(
    'refuses %j as INVALID_WORK_ID',
    (id) => expect(fail(() => parseWorkId(id)).code).toBe('INVALID_WORK_ID'),
  );
});

describe('emptyManuscript', () => {
  it('has three empty matters', () => {
    expect(emptyManuscript('w1', NOW)).toEqual({
      workId: 'w1',
      front: [],
      main: [],
      back: [],
      updatedAt: NOW,
    });
  });

  it('refuses an unsafe work id', () => {
    expect(fail(() => emptyManuscript('../x', NOW)).code).toBe('INVALID_WORK_ID');
  });
});

describe('wordCount', () => {
  it.each([
    ['', 0],
    ['   \n\t ', 0],
    ['one', 1],
    ['one two  three', 3],
    ['# Salt\n\nThe *first* line.\n  Indented.', 7],
    ['tab\tseparated\nlines', 3],
  ])('counts %j as %i', (text, count) => expect(wordCount(text)).toBe(count));
});

describe('addNode', () => {
  const base = emptyManuscript('w1', NOW);

  it('adds a node with a trimmed title and an empty body to the main matter by default', () => {
    const m = add(base, 'chapter', '  One  ');
    expect(m.main).toEqual([
      { id: expect.any(String), kind: 'chapter', title: 'One', body: '', children: [] },
    ]);
    expect(m.updatedAt).toBe(LATER);
  });

  it('keeps the body exactly as written', () => {
    const body = '  # Salt\n\nA *line*.  \n';
    expect(add(base, 'chapter', 'One', { body }).main[0]?.body).toBe(body);
  });

  it('does not change the manuscript it was given', () => {
    add(base, 'chapter', 'One');
    expect(base.main).toEqual([]);
  });

  it.each([
    ['front', 'chapter'],
    ['front', 'section'],
    ['back', 'chapter'],
    ['back', 'section'],
    ['main', 'part'],
    ['main', 'chapter'],
    ['main', 'section'],
  ])('allows a %s-matter %s at the top level', (matter, kind) => {
    const m = add(base, kind, 'Item', { matter });
    expect(m[matter as 'front' | 'main' | 'back']).toHaveLength(1);
  });

  it.each([
    ['front', 'part'],
    ['back', 'part'],
    ['front', 'scene'],
    ['back', 'scene'],
    ['main', 'scene'],
  ])('refuses a %s-matter %s at the top level', (matter, kind) => {
    expect(fail(() => add(base, kind, 'Item', { matter })).code).toBe('INVALID_PLACEMENT');
  });

  it.each([
    ['part', 'chapter', true],
    ['part', 'section', true],
    ['part', 'scene', false],
    ['part', 'part', false],
    ['chapter', 'scene', true],
    ['chapter', 'section', true],
    ['chapter', 'part', false],
    ['chapter', 'chapter', false],
    ['scene', 'scene', false],
    ['scene', 'section', false],
    ['scene', 'chapter', false],
    ['section', 'section', true],
    ['section', 'scene', false],
    ['section', 'chapter', false],
  ])('a %s holding a %s is allowed: %s', (parentKind, childKind, allowed) => {
    // A scene cannot stand alone in the main matter, so it gets a chapter above it.
    const seeded =
      parentKind === 'scene' ? sceneUnderChapter(base) : add(base, parentKind, 'Parent');
    const parentId = idOf(seeded, 'Parent');
    const attempt = () => add(seeded, childKind, 'Child', { parentId });
    if (allowed) expect(findNode(attempt(), idOf(attempt(), 'Parent'))?.children).toHaveLength(1);
    else expect(fail(attempt).code).toBe('INVALID_PLACEMENT');
  });

  it('inserts at a position, and appends when none is given', () => {
    let m = add(base, 'chapter', 'Two');
    m = add(m, 'chapter', 'One', { position: 0 });
    m = add(m, 'chapter', 'Three');
    expect(titles(m.main)).toEqual(['One', 'Two', 'Three']);
  });

  it('accepts a position equal to the number of siblings and refuses beyond it or below zero', () => {
    const m = add(base, 'chapter', 'One');
    expect(titles(add(m, 'chapter', 'Two', { position: 1 }).main)).toEqual(['One', 'Two']);
    expect(fail(() => add(m, 'chapter', 'Far', { position: 2 })).code).toBe('INVALID_PLACEMENT');
    expect(fail(() => add(m, 'chapter', 'Neg', { position: -1 })).code).toBe('INVALID_PLACEMENT');
    expect(fail(() => add(m, 'chapter', 'Frac', { position: 0.5 })).code).toBe('INVALID_PLACEMENT');
  });

  it('refuses a parent that does not exist', () => {
    expect(fail(() => add(base, 'chapter', 'Orphan', { parentId: 'nope' })).code).toBe(
      'NODE_NOT_FOUND',
    );
  });

  it('refuses a matter together with a parent', () => {
    const m = add(base, 'part', 'P');
    expect(
      fail(() => add(m, 'chapter', 'C', { parentId: idOf(m, 'P'), matter: 'main' })).code,
    ).toBe('INVALID_PLACEMENT');
  });

  it('refuses a matter that does not exist', () => {
    expect(fail(() => add(base, 'chapter', 'C', { matter: 'middle' })).code).toBe(
      'INVALID_PLACEMENT',
    );
  });

  it.each(['', '   ', 'x'.repeat(201)])('refuses the title %j', (title) => {
    expect(fail(() => add(base, 'chapter', title)).code).toBe('INVALID_NODE');
  });

  it('accepts a title of exactly 200 characters', () => {
    expect(add(base, 'chapter', 'x'.repeat(200)).main[0]?.title).toHaveLength(200);
  });

  it.each(['act', '', 'Chapter', 'beat'])('refuses the kind %j', (kind) => {
    expect(fail(() => add(base, kind, 'T')).code).toBe('INVALID_NODE');
  });

  it('limits a body to two million characters', () => {
    expect(add(base, 'chapter', 'T', { body: 'x'.repeat(2_000_000) }).main[0]?.body).toHaveLength(
      2_000_000,
    );
    expect(fail(() => add(base, 'chapter', 'T', { body: 'x'.repeat(2_000_001) })).code).toBe(
      'INVALID_NODE',
    );
  });

  it('refuses a duplicate id', () => {
    const m = addNode(base, { id: 'same', kind: 'chapter', title: 'A' }, NOW);
    expect(fail(() => addNode(m, { id: 'same', kind: 'chapter', title: 'B' }, NOW)).code).toBe(
      'INVALID_NODE',
    );
  });

  it('refuses nesting deeper than six levels', () => {
    let m = add(base, 'chapter', 'L1');
    let parent = idOf(m, 'L1');
    m = add(m, 'section', 'L2', { parentId: parent });
    for (const level of [3, 4, 5, 6]) {
      parent = idOf(m, `L${level - 1}`);
      m = add(m, 'section', `L${level}`, { parentId: parent });
    }
    expect(fail(() => add(m, 'section', 'L7', { parentId: idOf(m, 'L6') })).code).toBe(
      'INVALID_PLACEMENT',
    );
  });
});

const sceneUnderChapter = (base: Manuscript): Manuscript => {
  const withChapter = add(base, 'chapter', 'C');
  return add(withChapter, 'scene', 'Parent', { parentId: idOf(withChapter, 'C') });
};

describe('updateNode', () => {
  const base = ((): Manuscript => {
    const withChapter = add(emptyManuscript('w1', NOW), 'chapter', 'One');
    return add(withChapter, 'scene', 'Dawn', { parentId: idOf(withChapter, 'One') });
  })();

  it('changes only what is given and stamps the manuscript', () => {
    const id = idOf(base, 'One');
    const next = updateNode(base, id, { body: 'some words' }, NOW);
    expect(findNode(next, id)).toMatchObject({ title: 'One', body: 'some words' });
    expect(findNode(next, id)?.children).toHaveLength(1);
    expect(next.updatedAt).toBe(NOW);
  });

  it('renames with the same validation as adding', () => {
    const id = idOf(base, 'One');
    expect(findNode(updateNode(base, id, { title: ' Prologue ' }, NOW), id)?.title).toBe(
      'Prologue',
    );
    expect(fail(() => updateNode(base, id, { title: '  ' }, NOW)).code).toBe('INVALID_NODE');
  });

  it('can clear a body', () => {
    const id = idOf(base, 'One');
    const written = updateNode(base, id, { body: 'x' }, NOW);
    expect(findNode(updateNode(written, id, { body: '' }, NOW), id)?.body).toBe('');
  });

  it('refuses an unknown node', () => {
    expect(fail(() => updateNode(base, 'nope', { title: 'x' }, NOW)).code).toBe('NODE_NOT_FOUND');
  });

  it('does not change the manuscript it was given', () => {
    updateNode(base, idOf(base, 'One'), { title: 'Other' }, NOW);
    expect(base.main[0]?.title).toBe('One');
  });
});

describe('removeNode', () => {
  it('removes a node and everything beneath it', () => {
    let m = add(emptyManuscript('w1', NOW), 'chapter', 'One');
    m = add(m, 'scene', 'Dawn', { parentId: idOf(m, 'One') });
    m = add(m, 'chapter', 'Two');
    const next = removeNode(m, idOf(m, 'One'), NOW);
    expect(titles(next.main)).toEqual(['Two']);
    expect(findNode(next, idOf(m, 'Dawn'))).toBeUndefined();
  });

  it('refuses an unknown node', () => {
    expect(fail(() => removeNode(emptyManuscript('w1', NOW), 'nope', NOW)).code).toBe(
      'NODE_NOT_FOUND',
    );
  });
});

describe('moveNode', () => {
  const build = (): Manuscript => {
    let m = emptyManuscript('w1', NOW);
    m = add(m, 'part', 'Part One');
    m = add(m, 'part', 'Part Two');
    m = add(m, 'chapter', 'Wanderer', { parentId: idOf(m, 'Part One') });
    m = add(m, 'scene', 'Dawn', { parentId: idOf(m, 'Wanderer') });
    m = add(m, 'chapter', 'Epilogue');
    return m;
  };

  it('moves a node under another parent, with its subtree', () => {
    const m = build();
    const next = moveNode(m, idOf(m, 'Wanderer'), { parentId: idOf(m, 'Part Two') }, NOW);
    expect(findNode(next, idOf(m, 'Part One'))?.children).toEqual([]);
    const moved = findNode(next, idOf(m, 'Part Two'))?.children[0];
    expect(moved?.title).toBe('Wanderer');
    expect(titles(moved?.children ?? [])).toEqual(['Dawn']);
  });

  it('moves a node to another matter', () => {
    const m = build();
    const next = moveNode(m, idOf(m, 'Epilogue'), { matter: 'back' }, NOW);
    expect(titles(next.back)).toEqual(['Epilogue']);
    expect(titles(next.main)).toEqual(['Part One', 'Part Two']);
  });

  it('reads the position as an index among the destination siblings after the node has left', () => {
    let m = emptyManuscript('w1', NOW);
    for (const t of ['A', 'B', 'C']) m = add(m, 'chapter', t);
    expect(titles(moveNode(m, idOf(m, 'A'), { matter: 'main', position: 2 }, NOW).main)).toEqual([
      'B',
      'C',
      'A',
    ]);
    expect(titles(moveNode(m, idOf(m, 'C'), { matter: 'main', position: 0 }, NOW).main)).toEqual([
      'C',
      'A',
      'B',
    ]);
    expect(titles(moveNode(m, idOf(m, 'B'), { matter: 'main' }, NOW).main)).toEqual([
      'A',
      'C',
      'B',
    ]);
    expect(fail(() => moveNode(m, idOf(m, 'A'), { matter: 'main', position: 3 }, NOW)).code).toBe(
      'INVALID_PLACEMENT',
    );
  });

  it('refuses a move into itself or beneath itself', () => {
    const m = build();
    expect(
      fail(() => moveNode(m, idOf(m, 'Part One'), { parentId: idOf(m, 'Part One') }, NOW)).code,
    ).toBe('INVALID_PLACEMENT');
    expect(
      fail(() => moveNode(m, idOf(m, 'Part One'), { parentId: idOf(m, 'Dawn') }, NOW)).code,
    ).toBe('INVALID_PLACEMENT');
  });

  it('refuses a move that breaks the nesting rules', () => {
    const m = build();
    expect(fail(() => moveNode(m, idOf(m, 'Dawn'), { matter: 'main' }, NOW)).code).toBe(
      'INVALID_PLACEMENT',
    );
    expect(fail(() => moveNode(m, idOf(m, 'Part Two'), { matter: 'front' }, NOW)).code).toBe(
      'INVALID_PLACEMENT',
    );
  });

  it('refuses a move that would make the subtree deeper than six levels', () => {
    let m = add(emptyManuscript('w1', NOW), 'chapter', 'L1');
    for (const level of [2, 3, 4, 5, 6])
      m = add(m, 'section', `L${level}`, { parentId: idOf(m, `L${level - 1}`) });
    m = add(m, 'chapter', 'Other');
    m = add(m, 'section', 'Branch', { parentId: idOf(m, 'Other') });
    m = add(m, 'section', 'Twig', { parentId: idOf(m, 'Branch') });
    expect(fail(() => moveNode(m, idOf(m, 'Branch'), { parentId: idOf(m, 'L5') }, NOW)).code).toBe(
      'INVALID_PLACEMENT',
    );
  });

  it('refuses an unknown node or destination', () => {
    const m = build();
    expect(fail(() => moveNode(m, 'nope', { matter: 'back' }, NOW)).code).toBe('NODE_NOT_FOUND');
    expect(fail(() => moveNode(m, idOf(m, 'Epilogue'), { parentId: 'nope' }, NOW)).code).toBe(
      'NODE_NOT_FOUND',
    );
  });

  it('leaves the manuscript it was given unchanged, also when it refuses', () => {
    const m = build();
    const before = structuredClone(m);
    moveNode(m, idOf(m, 'Epilogue'), { matter: 'back' }, NOW);
    expect(() => moveNode(m, idOf(m, 'Dawn'), { matter: 'main' }, NOW)).toThrow();
    expect(m).toEqual(before);
  });
});

describe('outlineOf', () => {
  it('lists the matters with words per node and in all, and leaves out the text itself', () => {
    let m = emptyManuscript('w1', NOW);
    m = add(m, 'chapter', 'One', { body: 'one two three' });
    m = add(m, 'scene', 'Dawn', { parentId: idOf(m, 'One'), body: 'four five' });
    m = add(m, 'chapter', 'Dedication', { matter: 'front', body: 'for you' });
    const outline = outlineOf(m);
    expect(outline.totalWords).toBe(7);
    expect(outline.main[0]).toMatchObject({ title: 'One', words: 3, totalWords: 5 });
    expect(outline.main[0]?.children[0]).toMatchObject({ title: 'Dawn', words: 2, totalWords: 2 });
    expect(outline.front[0]).toMatchObject({ title: 'Dedication', words: 2, totalWords: 2 });
    expect(outline.back).toEqual([]);
    expect(JSON.stringify(outline)).not.toContain('four five');
  });

  it('is empty for a new manuscript', () => {
    expect(outlineOf(emptyManuscript('w1', NOW))).toEqual({
      front: [],
      main: [],
      back: [],
      totalWords: 0,
    });
  });
});
