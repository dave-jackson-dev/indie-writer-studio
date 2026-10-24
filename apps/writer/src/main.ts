import { bootstrapApplication } from '@angular/platform-browser';
import { registerLicense } from '@syncfusion/ej2-base';

import { App } from './app/app';
import { appConfig } from './app/app.config';
import { SYNCFUSION_LICENSE_KEY } from './generated/license';

// Registered once, before any component renders (ADR-005). An empty key leaves Syncfusion's own banner in place.
if (SYNCFUSION_LICENSE_KEY !== '') registerLicense(SYNCFUSION_LICENSE_KEY);

bootstrapApplication(App, appConfig).catch((error: unknown) => console.error(error));
