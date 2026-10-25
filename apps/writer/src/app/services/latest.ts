/** Tells an async load whether a newer one has begun since, so a slow answer cannot overwrite a fresher one. */
export class Latest {
  private count = 0;

  begin(): () => boolean {
    const mine = ++this.count;
    return () => mine === this.count;
  }
}
