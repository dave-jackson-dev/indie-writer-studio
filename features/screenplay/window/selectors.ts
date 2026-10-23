/**
 * Where the Writer window keeps what the Author looks at. These are the window's contract with its
 * acceptance suite: the renderer puts a `data-testid` on each, and a scenario never says "div".
 */
export const ui = {
  appBarTitle: '[data-testid="app-title"]',
  catalog: '[data-testid="catalog"]',
  catalogRow: '[data-testid="catalog"] .e-row',
  catalogEmpty: '[data-testid="catalog-empty"]',
  workTitle: '[data-testid="work-title"]',
  workSubtitle: '[data-testid="work-subtitle"]',
  workStatus: '[data-testid="work-status"]',
  statusFilter: '[data-testid="status-filter"]',
  notice: '.e-toast-container .e-toast-message',
  dialog: '.e-dialog.e-popup-open',
  editions: '[data-testid="editions"]',
  editionRow: '[data-testid="editions"] .e-row',
  editionsEmpty: '[data-testid="editions-empty"]',
  editionNumber: '[data-testid="edition-number"]',
  editionLabel: '[data-testid="edition-label"]',
  editionStatus: '[data-testid="edition-status"]',
  outline: '[data-testid="outline"]',
  outlineNode: '[data-testid="outline"] li.e-list-item',
  outlineEmpty: '[data-testid="outline-empty"]',
  nodeTitle: '[data-testid="node-title"]',
  nodeKind: '[data-testid="node-kind"]',
  nodeWords: '[data-testid="node-words"]',
} as const;
