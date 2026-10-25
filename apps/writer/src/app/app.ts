import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  type OnChanges,
  viewChild,
} from '@angular/core';
import { AppBarModule } from '@syncfusion/ej2-angular-navigations';
import { SplitterModule } from '@syncfusion/ej2-angular-layouts';
import { ToastModule, type ToastComponent } from '@syncfusion/ej2-angular-notifications';

import { CatalogComponent } from './catalog/catalog.component';
import type { WorkDto } from './catalog/catalog';
import { EditionsComponent } from './editions/editions.component';
import { OutlineComponent } from './outline/outline.component';
import { Notices } from './services/notices';

@Component({
  selector: 'iw-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppBarModule,
    SplitterModule,
    ToastModule,
    CatalogComponent,
    EditionsComponent,
    OutlineComponent,
  ],
  template: `
    <div class="iw-shell">
      <ejs-appbar colorMode="Primary" aria-label="IndieWriter Studio">
        <span class="e-appbar-spacer"></span>
        <h1 class="iw-title" data-testid="app-title">IndieWriter Studio</h1>
        <span class="e-appbar-spacer"></span>
      </ejs-appbar>

      <main class="iw-main">
        <ejs-splitter height="100%" width="100%">
          <e-panes>
            <e-pane size="45%" min="360px">
              <ng-template #content>
                <iw-catalog (selected)="work.set($event)" />
              </ng-template>
            </e-pane>
            <e-pane min="360px">
              <ng-template #content>
                <ejs-splitter orientation="Vertical" height="100%" width="100%">
                  <e-panes>
                    <e-pane size="60%" min="160px">
                      <ng-template #content>
                        <iw-outline [work]="work()" />
                      </ng-template>
                    </e-pane>
                    <e-pane min="140px">
                      <ng-template #content>
                        <iw-editions [work]="work()" (changed)="catalog().refresh()" />
                      </ng-template>
                    </e-pane>
                  </e-panes>
                </ejs-splitter>
              </ng-template>
            </e-pane>
          </e-panes>
        </ejs-splitter>
      </main>
    </div>

    <ejs-toast
      #toast
      [position]="{ X: 'Right', Y: 'Bottom' }"
      [timeOut]="8000"
      [showCloseButton]="true"
      title="Notice"
    ></ejs-toast>
  `,
  styles: `
    .iw-shell {
      display: grid;
      grid-template-rows: auto 1fr;
      height: 100%;
    }
    .iw-title {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }
    .iw-main {
      min-height: 0;
    }
  `,
})
export class App implements OnChanges {
  private readonly notices = inject(Notices);
  protected readonly work = signal<WorkDto | undefined>(undefined);
  private readonly toast = viewChild.required<ToastComponent>('toast');
  protected readonly catalog = viewChild.required(CatalogComponent);

  /**
   * Syncfusion's Angular wrappers extend a base class that has an `ngOnChanges` hook but no Angular
   * definition of its own. Angular installs the code that calls such a hook only when some component
   * of the application declares `ngOnChanges`; the optimised build otherwise leaves it out and every
   * Syncfusion component fails to start ("... is not a function"). This declaration keeps it in.
   */
  ngOnChanges(): void {
    // intentionally empty
  }

  constructor() {
    effect(() => {
      const notice = this.notices.latest();
      if (notice !== undefined) this.toast().show({ content: notice.text });
    });
  }
}
