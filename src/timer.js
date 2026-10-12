export class Timer {
  constructor() {
    this.reset();
  }

  reset() {
    this.startedAt = null;
    this.stoppedAt = null;
  }

  start() {
    this.startedAt = performance.now();
    this.stoppedAt = null;
  }

  stop() {
    this.stoppedAt = performance.now();
    return this.elapsed();
  }

  get running() {
    return this.startedAt !== null && this.stoppedAt === null;
  }

  elapsed() {
    if (this.startedAt === null) return 0;
    return (this.stoppedAt ?? performance.now()) - this.startedAt;
  }
}

/** 12.34 or 1:02.34 */
export function formatTime(ms) {
  if (ms == null) return '—';
  const cs = Math.floor(ms / 10);
  const minutes = Math.floor(cs / 6000);
  const seconds = Math.floor((cs % 6000) / 100);
  const hundredths = String(cs % 100).padStart(2, '0');
  if (minutes === 0) return `${seconds}.${hundredths}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${hundredths}`;
}
