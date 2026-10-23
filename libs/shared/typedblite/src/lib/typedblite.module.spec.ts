import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { CascadeHooks } from './cascade.js';
import { Database } from './database.js';
import { CASCADE_HOOKS, TYPEDBLITE_DATABASE, TypeDBLiteModule } from './typedblite.module.js';

const NOTES = 'define attribute note-id, value string; entity note, owns note-id @key;';

describe('TypeDBLiteModule', () => {
  it('provides one open Database and one CascadeHooks to the whole application, and closes the Database', async () => {
    const database = TypeDBLiteModule.register({ schemas: [NOTES] });
    @Module({ imports: [database] })
    class Root {}
    const context = await NestFactory.createApplicationContext(Root, { logger: false });
    const db = context.get<Database>(TYPEDBLITE_DATABASE);
    expect(db).toBeInstanceOf(Database);
    expect(context.get(CASCADE_HOOKS)).toBeInstanceOf(CascadeHooks);
    await db.write((session) => session.execute('insert $n isa note, has note-id "a";'));
    await context.close();
    await expect(
      db.read((session) => session.query('match $n isa note; select $n;')),
    ).rejects.toThrow(/closed/i);
  });

  it('is shared when two parts import the very same registration', async () => {
    const database = TypeDBLiteModule.register({ schemas: [NOTES] });
    @Module({ imports: [database] })
    class Left {}
    @Module({ imports: [database] })
    class Right {}
    @Module({ imports: [Left, Right] })
    class Root {}
    const context = await NestFactory.createApplicationContext(Root, { logger: false });
    expect(context.get(TYPEDBLITE_DATABASE)).toBe(context.get(TYPEDBLITE_DATABASE));
    await context.close();
  });
});
