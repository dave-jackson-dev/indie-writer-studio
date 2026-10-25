export type Matter = 'front' | 'main' | 'back';

export interface OutlineNodeDto {
  id: string;
  kind: string;
  title: string;
  words: number;
  totalWords: number;
  children: OutlineNodeDto[];
}

/** The manuscript's structure as the app answers it, without the text. */
export interface OutlineDto {
  front: OutlineNodeDto[];
  main: OutlineNodeDto[];
  back: OutlineNodeDto[];
  totalWords: number;
}

/** A section as the tree view takes it: a flat row that names its parent. */
export interface TreeRow {
  id: string;
  parentId: string | undefined;
  title: string;
  kind: string;
  words: number;
  matter: Matter;
}

export function toTreeNodes(outline: OutlineDto): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (nodes: readonly OutlineNodeDto[], parentId: string | undefined, matter: Matter) => {
    for (const node of nodes) {
      rows.push({
        id: node.id,
        parentId,
        title: node.title,
        kind: node.kind,
        words: node.words,
        matter,
      });
      walk(node.children, node.id, matter);
    }
  };
  walk(outline.front, undefined, 'front');
  walk(outline.main, undefined, 'main');
  walk(outline.back, undefined, 'back');
  return rows;
}
