import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DropDownListModule } from '@syncfusion/ej2-angular-dropdowns';
import { GridModule, SortService, type GridComponent } from '@syncfusion/ej2-angular-grids';
import { TextAreaModule, TextBoxModule } from '@syncfusion/ej2-angular-inputs';
import { DialogModule, type DialogComponent } from '@syncfusion/ej2-angular-popups';
import { ToolbarModule, type ClickEventArgs } from '@syncfusion/ej2-angular-navigations';

import { Notices } from '../services/notices';
import { confirmDialog } from '../services/confirm';
import { WriterApi } from '../services/writer-api';
import { STATUS_FILTER, WORK_STATUSES, toWorkRows, type WorkDto, type WorkRow } from './catalog';

@Component({
  selector: 'iw-catalog',
  providers: [SortService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GridModule,
    ToolbarModule,
    DropDownListModule,
    DialogModule,
    TextBoxModule,
    TextAreaModule,
  ],
  template: `
    <section class="iw-pane" data-testid="catalog" aria-label="Works catalog">
      <ejs-toolbar (clicked)="onToolbar($event)" aria-label="Catalog actions">
        <e-items>
          <e-item id="add-work" text="Add work" prefixIcon="e-icons e-plus"></e-item>
          <e-item id="edit-work" text="Edit" prefixIcon="e-icons e-edit"></e-item>
          <e-item id="remove-work" text="Remove" prefixIcon="e-icons e-trash"></e-item>
          <e-item type="Separator"></e-item>
          <e-item type="Input" align="Right">
            <ng-template #template>
              <div data-testid="status-filter">
                <ejs-dropdownlist
                  [dataSource]="statusFilter"
                  [fields]="{ text: 'text', value: 'value' }"
                  [value]="filter()"
                  [htmlAttributes]="{ 'aria-label': 'Status filter' }"
                  width="160px"
                  (change)="onFilter($event.value)"
                ></ejs-dropdownlist>
              </div>
            </ng-template>
          </e-item>
        </e-items>
      </ejs-toolbar>

      <ejs-grid
        #grid
        [dataSource]="rows()"
        [selectionSettings]="{ type: 'Single' }"
        [allowSorting]="true"
        height="100%"
        (rowSelected)="onRowSelected($event.data)"
        (dataBound)="reselect()"
      >
        <e-columns>
          <e-column field="title" headerText="Title" width="200">
            <ng-template #template let-data>
              <strong data-testid="work-title">{{ data.title }}</strong>
            </ng-template>
          </e-column>
          <e-column field="subtitle" headerText="Subtitle" width="160">
            <ng-template #template let-data>
              <span data-testid="work-subtitle" class="iw-muted">{{ data.subtitle }}</span>
            </ng-template>
          </e-column>
          <e-column field="status" headerText="Status" width="120">
            <ng-template #template let-data>
              <span
                data-testid="work-status"
                class="e-badge e-badge-pill iw-status iw-status-{{ data.status }}"
                >{{ data.status }}</span
              >
            </ng-template>
          </e-column>
          <e-column
            field="editionCount"
            headerText="Editions"
            width="90"
            textAlign="Right"
          ></e-column>
        </e-columns>
        <ng-template #emptyRecordTemplate>
          <div class="iw-empty" data-testid="catalog-empty">
            @if (filter() === '') {
              <p>Add your first Work to start your catalog.</p>
            } @else {
              <p>No Work is {{ filter() }} yet.</p>
            }
          </div>
        </ng-template>
      </ejs-grid>
    </section>

    <ejs-dialog
      #dialog
      [header]="editing() ? 'Edit work' : 'Add work'"
      [visible]="false"
      [isModal]="true"
      [showCloseIcon]="true"
      width="480px"
      [buttons]="buttons"
    >
      <ng-template #content>
        <div class="iw-field">
          <ejs-textbox
            placeholder="Title"
            floatLabelType="Auto"
            [value]="title()"
            [htmlAttributes]="{ 'aria-label': 'Title' }"
            (input)="title.set($event.value ?? '')"
            (change)="title.set($event.value ?? '')"
          ></ejs-textbox>
        </div>
        <div class="iw-field">
          <ejs-textbox
            placeholder="Subtitle"
            floatLabelType="Auto"
            [value]="subtitle()"
            [htmlAttributes]="{ 'aria-label': 'Subtitle' }"
            (input)="subtitle.set($event.value ?? '')"
            (change)="subtitle.set($event.value ?? '')"
          ></ejs-textbox>
        </div>
        <div class="iw-field">
          <ejs-textarea
            placeholder="Synopsis"
            floatLabelType="Auto"
            [rows]="4"
            [value]="synopsis()"
            [htmlAttributes]="{ 'aria-label': 'Synopsis' }"
            (input)="synopsis.set($event.value ?? '')"
            (change)="synopsis.set($event.value ?? '')"
          ></ejs-textarea>
        </div>
        @if (editing()) {
          <div class="iw-field">
            <ejs-dropdownlist
              [dataSource]="statuses"
              placeholder="Status"
              floatLabelType="Auto"
              [value]="status()"
              [htmlAttributes]="{ 'aria-label': 'Status' }"
              (change)="status.set($event.value)"
            ></ejs-dropdownlist>
          </div>
        }
      </ng-template>
    </ejs-dialog>
  `,
})
export class CatalogComponent {
  private readonly api = inject(WriterApi);
  private readonly notices = inject(Notices);

  /** The Work the author has chosen, for the panels that depend on it. */
  readonly selected = output<WorkDto | undefined>();

  protected readonly statusFilter = STATUS_FILTER;
  protected readonly statuses = [...WORK_STATUSES];
  protected readonly filter = signal('');
  private readonly works = signal<WorkDto[]>([]);
  protected readonly rows = computed<WorkRow[]>(() => toWorkRows(this.works()));
  private readonly selectedId = signal<string | undefined>(undefined);
  protected readonly editing = signal(false);
  protected readonly title = signal('');
  protected readonly subtitle = signal('');
  protected readonly synopsis = signal('');
  protected readonly status = signal('draft');

  private readonly grid = viewChild.required<GridComponent>('grid');
  private readonly dialog = viewChild.required<DialogComponent>('dialog');

  protected readonly buttons = [
    { buttonModel: { content: 'Save', isPrimary: true }, click: () => void this.save() },
    { buttonModel: { content: 'Cancel' }, click: () => this.dialog().hide() },
  ];

  constructor() {
    void this.reload();
  }

  /** Brings the rows up to date without changing the selection, for changes made in another panel. */
  async refresh(): Promise<void> {
    try {
      this.works.set(await this.api.listWorks(this.filter() || undefined));
    } catch (error) {
      this.notices.failure(error);
    }
  }

  private async reload(): Promise<void> {
    try {
      this.works.set(await this.api.listWorks(this.filter() || undefined));
      const chosen = this.works().find((work) => work.id === this.selectedId());
      if (chosen === undefined) this.selectedId.set(undefined);
      this.selected.emit(chosen);
    } catch (error) {
      this.notices.failure(error);
    }
  }

  protected reselect(): void {
    const at = this.rows().findIndex((row) => row.id === this.selectedId());
    if (at >= 0) this.grid().selectRow(at);
  }

  protected onRowSelected(row: WorkRow): void {
    this.selectedId.set(row.id);
    this.selected.emit(this.works().find((work) => work.id === row.id));
  }

  protected onFilter(value: string | null): void {
    this.filter.set(value ?? '');
    void this.reload();
  }

  protected onToolbar(args: ClickEventArgs): void {
    switch (args.item.id) {
      case 'add-work':
        return this.open(undefined);
      case 'edit-work':
        return this.needsWork((work) => this.open(work));
      case 'remove-work':
        return this.needsWork((work) => void this.remove(work));
    }
  }

  private needsWork(then: (work: WorkDto) => void): void {
    const work = this.works().find((candidate) => candidate.id === this.selectedId());
    if (work === undefined) this.notices.tell('Choose a Work in the catalog first.');
    else then(work);
  }

  private open(work: WorkDto | undefined): void {
    this.editing.set(work !== undefined);
    this.title.set(work?.title ?? '');
    this.subtitle.set(work?.subtitle ?? '');
    this.synopsis.set(work?.synopsis ?? '');
    this.status.set(work?.status ?? 'draft');
    this.dialog().show();
  }

  private async save(): Promise<void> {
    try {
      const id = this.editing() ? this.selectedId() : undefined;
      if (id === undefined) {
        await this.api.addWork({
          title: this.title(),
          ...(this.subtitle() ? { subtitle: this.subtitle() } : {}),
          ...(this.synopsis() ? { synopsis: this.synopsis() } : {}),
        });
      } else {
        await this.api.updateWork(id, {
          title: this.title(),
          subtitle: this.subtitle(),
          synopsis: this.synopsis(),
          status: this.status(),
        });
      }
      this.dialog().hide();
      await this.reload();
    } catch (error) {
      this.notices.failure(error);
    }
  }

  private async remove(work: WorkDto): Promise<void> {
    const confirmed = await confirmDialog(
      'Remove work',
      `Remove “${work.title}” and all of its Editions and manuscript? This cannot be undone.`,
      'Remove',
    );
    if (!confirmed) return;
    try {
      await this.api.removeWork(work.id);
      this.selectedId.set(undefined);
      await this.reload();
    } catch (error) {
      this.notices.failure(error);
    }
  }
}
