export type WorkStatus = 'draft' | 'in-progress' | 'complete';
export const WORK_STATUSES: readonly WorkStatus[] = ['draft', 'in-progress', 'complete'];

export interface EditionDto {
  number: number;
  label: string;
  status: 'draft' | 'published' | 'superseded';
  publishedOn?: string;
  notes?: string;
}

/** A Work as the app answers it. */
export interface WorkDto {
  id: string;
  title: string;
  subtitle?: string;
  synopsis?: string;
  status: WorkStatus;
  editions: EditionDto[];
  createdAt: string;
  updatedAt: string;
}

/** A Work as the catalog grid shows it. */
export interface WorkRow {
  id: string;
  title: string;
  subtitle: string;
  status: WorkStatus;
  editionCount: number;
  updatedAt: string;
}

export const toWorkRows = (works: readonly WorkDto[]): WorkRow[] =>
  works.map((work) => ({
    id: work.id,
    title: work.title,
    subtitle: work.subtitle ?? '',
    status: work.status,
    editionCount: work.editions.length,
    updatedAt: work.updatedAt,
  }));

/** The drop-down that narrows the catalog; an empty value is every status. */
export const STATUS_FILTER: readonly { text: string; value: string }[] = [
  { text: 'All', value: '' },
  ...WORK_STATUSES.map((status) => ({ text: status, value: status })),
];
