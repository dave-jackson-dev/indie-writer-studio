import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DatePickerModule, type DatePickerComponent } from '@syncfusion/ej2-angular-calendars';
import { GridModule } from '@syncfusion/ej2-angular-grids';
import { TextBoxModule } from '@syncfusion/ej2-angular-inputs';
import { ToolbarModule, type ClickEventArgs } from '@syncfusion/ej2-angular-navigations';
import { DialogModule, type DialogComponent } from '@syncfusion/ej2-angular-popups';

import type { EditionDto, WorkDto } from '../catalog/catalog';
import { Latest } from '../services/latest';
import { Notices } from '../services/notices';
import { WriterApi } from '../services/writer-api';

@Component({
  selector: 'iw-editions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GridModule, ToolbarModule, DialogModule, TextBoxModule, DatePickerModule],
  template: `
    <section class="iw-pane" data-testid="editions" aria-label="Editions">
      <ejs-toolbar (clicked)="onToolbar($event)" aria-label="Edition actions">
        <e-items>
          <e-item id="add-edition" text="Add edition" prefixIcon="e-icons e-plus"></e-item>
          <e-item id="publish-edition" text="Publish" prefixIcon="e-icons e-check"></e-item>
        </e-items>
      </ejs-toolbar>
      @if (work(); as current) {
        <ejs-grid
          [dataSource]="editions()"
          [selectionSettings]="{ type: 'Single' }"
          height="100%"
          (rowSelected)="chosen.set($event.data)"
        >
          <e-columns>
            <e-column field="number" headerText="No." width="70">
              <ng-template #template let-data>
                <span data-testid="edition-number">{{ data.number }}</span>
              </ng-template>
            </e-column>
            <e-column field="label" headerText="Label" width="180">
              <ng-template #template let-data>
                <span data-testid="edition-label">{{ data.label }}</span>
              </ng-template>
            </e-column>
            <e-column field="status" headerText="Status" width="120">
              <ng-template #template let-data>
                <span
                  data-testid="edition-status"
                  class="e-badge e-badge-pill iw-status iw-status-{{ data.status }}"
                  >{{ data.status }}</span
                >
              </ng-template>
            </e-column>
            <e-column field="publishedOn" headerText="Published on" width="130"></e-column>
          </e-columns>
          <ng-template #emptyRecordTemplate>
            <div class="iw-empty" data-testid="editions-empty">
              <p>“{{ current.title }}” has no editions yet.</p>
            </div>
          </ng-template>
        </ejs-grid>
      } @else {
        <div class="iw-empty" data-testid="editions-empty">
          <p>Choose a Work to see its editions.</p>
        </div>
      }
    </section>

    <ejs-dialog
      #addDialog
      header="Add edition"
      [visible]="false"
      [isModal]="true"
      [showCloseIcon]="true"
      width="420px"
      [buttons]="addButtons"
    >
      <ng-template #content>
        <div class="iw-field">
          <ejs-textbox
            placeholder="Label"
            floatLabelType="Auto"
            [value]="label()"
            [htmlAttributes]="{ 'aria-label': 'Label' }"
            (input)="label.set($event.value ?? '')"
            (change)="label.set($event.value ?? '')"
          ></ejs-textbox>
        </div>
      </ng-template>
    </ejs-dialog>

    <ejs-dialog
      #publishDialog
      header="Publish edition"
      [visible]="false"
      [isModal]="true"
      [showCloseIcon]="true"
      width="420px"
      [buttons]="publishButtons"
    >
      <ng-template #content>
        <div class="iw-field">
          <ejs-datepicker
            #picker
            placeholder="Published on"
            floatLabelType="Auto"
            format="yyyy-MM-dd"
            [strictMode]="false"
            [htmlAttributes]="{ 'aria-label': 'Published on' }"
          ></ejs-datepicker>
          <small class="iw-muted">Leave empty to publish today.</small>
        </div>
      </ng-template>
    </ejs-dialog>
  `,
})
export class EditionsComponent {
  private readonly api = inject(WriterApi);
  private readonly notices = inject(Notices);

  /** The Work whose Editions are shown. */
  readonly work = input<WorkDto | undefined>(undefined);

  /** Raised when an Edition was added or published, so the catalog can show the new count. */
  readonly changed = output<void>();

  private readonly latest = new Latest();
  protected readonly editions = signal<EditionDto[]>([]);
  protected readonly chosen = signal<EditionDto | undefined>(undefined);
  protected readonly label = signal('');

  private readonly addDialog = viewChild.required<DialogComponent>('addDialog');
  private readonly publishDialog = viewChild.required<DialogComponent>('publishDialog');
  private readonly picker = viewChild<DatePickerComponent>('picker');

  protected readonly addButtons = [
    { buttonModel: { content: 'Save', isPrimary: true }, click: () => void this.add() },
    { buttonModel: { content: 'Cancel' }, click: () => this.addDialog().hide() },
  ];
  protected readonly publishButtons = [
    { buttonModel: { content: 'Publish', isPrimary: true }, click: () => void this.publish() },
    { buttonModel: { content: 'Cancel' }, click: () => this.publishDialog().hide() },
  ];

  constructor() {
    effect(() => {
      const work = this.work();
      this.chosen.set(undefined);
      if (work === undefined) {
        this.latest.begin();
        this.editions.set([]);
      } else void this.load(work.id);
    });
  }

  private async load(workId: string): Promise<void> {
    const current = this.latest.begin();
    try {
      const editions = await this.api.listEditions(workId);
      if (current()) this.editions.set(editions);
    } catch (error) {
      this.notices.failure(error);
    }
  }

  protected onToolbar(args: ClickEventArgs): void {
    const work = this.work();
    if (work === undefined) return this.notices.tell('Choose a Work first.');
    if (args.item.id === 'add-edition') {
      this.label.set('');
      this.addDialog().show();
    } else if (args.item.id === 'publish-edition') {
      if (this.chosen() === undefined) return this.notices.tell('Choose an edition to publish.');
      this.clearPicker();
      this.publishDialog().show();
    }
  }

  /** The dialog is hidden, not destroyed, so it would otherwise offer the last date again. */
  private clearPicker(): void {
    const picker = this.picker();
    if (picker === undefined) return;
    // Syncfusion clears a picker by setting null, though its typings say Date.
    picker.value = null as unknown as Date;
    const input = picker.element.querySelector('input');
    if (input !== null) input.value = '';
  }

  private async add(): Promise<void> {
    const work = this.work();
    if (work === undefined) return;
    try {
      await this.api.addEdition(work.id, this.label());
      this.addDialog().hide();
      await this.load(work.id);
      this.changed.emit();
    } catch (error) {
      this.notices.failure(error);
    }
  }

  private async publish(): Promise<void> {
    const work = this.work();
    const edition = this.chosen();
    if (work === undefined || edition === undefined) return;
    try {
      // The typed text, not the parsed date: an impossible date must reach the app, which refuses it by name.
      const typed = this.picker()?.element.querySelector('input')?.value.trim() ?? '';
      await this.api.publishEdition(work.id, edition.number, typed || undefined);
      this.publishDialog().hide();
      await this.load(work.id);
      this.changed.emit();
    } catch (error) {
      this.notices.failure(error);
    }
  }
}
