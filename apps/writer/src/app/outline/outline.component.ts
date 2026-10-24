import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { DropDownListModule } from '@syncfusion/ej2-angular-dropdowns';
import { TextBoxModule } from '@syncfusion/ej2-angular-inputs';
import {
  ToolbarModule,
  TreeViewModule,
  type ClickEventArgs,
  type NodeSelectEventArgs,
} from '@syncfusion/ej2-angular-navigations';
import { DialogModule, type DialogComponent } from '@syncfusion/ej2-angular-popups';

import type { WorkDto } from '../catalog/catalog';
import { confirmDialog } from '../services/confirm';
import { Notices } from '../services/notices';
import { WriterApi } from '../services/writer-api';
import { toTreeNodes, type TreeRow } from './outline-tree';

const KINDS = ['part', 'chapter', 'scene', 'section'];

@Component({
  selector: 'iw-outline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TreeViewModule, ToolbarModule, DialogModule, TextBoxModule, DropDownListModule],
  template: `
    <section class="iw-pane" data-testid="outline" aria-label="Manuscript outline">
      <ejs-toolbar (clicked)="onToolbar($event)" aria-label="Outline actions">
        <e-items>
          <e-item id="add-section" text="Add section" prefixIcon="e-icons e-plus"></e-item>
          <e-item id="remove-section" text="Remove section" prefixIcon="e-icons e-trash"></e-item>
        </e-items>
      </ejs-toolbar>
      @if (work() === undefined) {
        <div class="iw-empty" data-testid="outline-empty">
          <p>Choose a Work to see its manuscript outline.</p>
        </div>
      } @else if (fields().dataSource.length === 0) {
        <div class="iw-empty" data-testid="outline-empty">
          <p>This manuscript has no sections yet. Add a chapter to begin.</p>
        </div>
      } @else {
        <!-- The tree is made afresh for each outline: changing the fields of a built tree does not redraw it. -->
        @for (generation of [generation()]; track generation) {
          <ejs-treeview [fields]="fields()" (nodeSelected)="onSelect($event)">
            <ng-template #nodeTemplate let-data>
              <span class="iw-node">
                <span data-testid="node-title">{{ data.title }}</span>
                <span class="e-badge e-badge-pill iw-status" data-testid="node-kind">{{
                  data.kind
                }}</span>
                <span class="iw-muted"
                  ><span data-testid="node-words">{{ data.words }}</span> words</span
                >
              </span>
            </ng-template>
          </ejs-treeview>
        }
      }
    </section>

    <ejs-dialog
      #dialog
      header="Add section"
      [visible]="false"
      [isModal]="true"
      [showCloseIcon]="true"
      width="440px"
      [buttons]="buttons"
    >
      <ng-template #content>
        @if (parentTitle(); as parent) {
          <p class="iw-muted">Inside “{{ parent }}”.</p>
        }
        <div class="iw-field">
          <ejs-dropdownlist
            [dataSource]="kinds"
            placeholder="Kind"
            floatLabelType="Auto"
            [value]="kind()"
            [htmlAttributes]="{ 'aria-label': 'Kind' }"
            (change)="kind.set($event.value)"
          ></ejs-dropdownlist>
        </div>
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
      </ng-template>
    </ejs-dialog>
  `,
})
export class OutlineComponent {
  private readonly api = inject(WriterApi);
  private readonly notices = inject(Notices);

  /** The Work whose manuscript outline is shown. */
  readonly work = input<WorkDto | undefined>(undefined);

  protected readonly kinds = KINDS;
  private readonly rows = signal<TreeRow[]>([]);
  protected readonly generation = signal(0);
  protected readonly chosen = signal<string | undefined>(undefined);
  protected readonly kind = signal('chapter');
  protected readonly title = signal('');
  protected readonly parentTitle = computed(
    () => this.rows().find((row) => row.id === this.chosen())?.title,
  );
  protected readonly fields = computed(() => ({
    dataSource: this.rows().map((row, _at, all) => ({
      ...row,
      parentId: row.parentId ?? null,
      hasChildren: all.some((other) => other.parentId === row.id),
      expanded: true,
    })) as unknown as Record<string, unknown>[],
    hasChildren: 'hasChildren',
    id: 'id',
    parentID: 'parentId',
    text: 'title',
    expanded: 'expanded',
  }));

  private readonly dialog = viewChild.required<DialogComponent>('dialog');
  protected readonly buttons = [
    { buttonModel: { content: 'Save', isPrimary: true }, click: () => void this.add() },
    { buttonModel: { content: 'Cancel' }, click: () => this.dialog().hide() },
  ];

  constructor() {
    effect(() => {
      const work = this.work();
      this.chosen.set(undefined);
      if (work === undefined) this.rows.set([]);
      else void this.load(work.id);
    });
  }

  private async load(workId: string): Promise<void> {
    try {
      this.rows.set(toTreeNodes(await this.api.outline(workId)));
      this.generation.update((n) => n + 1);
      this.chosen.set(undefined);
    } catch (error) {
      this.notices.failure(error);
    }
  }

  protected onSelect(args: NodeSelectEventArgs): void {
    this.chosen.set(args.nodeData['id'] as string);
  }

  protected onToolbar(args: ClickEventArgs): void {
    if (this.work() === undefined) return this.notices.tell('Choose a Work first.');
    if (args.item.id === 'add-section') {
      this.title.set('');
      this.kind.set(this.chosen() === undefined ? 'chapter' : 'scene');
      this.dialog().show();
    } else if (args.item.id === 'remove-section') {
      void this.remove();
    }
  }

  private async add(): Promise<void> {
    const work = this.work();
    if (work === undefined) return;
    try {
      const parentId = this.chosen();
      await this.api.addNode(work.id, {
        kind: this.kind(),
        title: this.title(),
        ...(parentId === undefined ? {} : { parentId }),
      });
      this.dialog().hide();
      await this.load(work.id);
    } catch (error) {
      this.notices.failure(error);
    }
  }

  private async remove(): Promise<void> {
    const work = this.work();
    const id = this.chosen();
    if (work === undefined) return;
    if (id === undefined) return this.notices.tell('Choose a section to remove.');
    const section = this.rows().find((row) => row.id === id);
    const confirmed = await confirmDialog(
      'Remove section',
      `Remove “${section?.title ?? 'this section'}” and everything beneath it?`,
      'Remove',
    );
    if (!confirmed) return;
    try {
      await this.api.removeNode(work.id, id);
      await this.load(work.id);
    } catch (error) {
      this.notices.failure(error);
    }
  }
}
