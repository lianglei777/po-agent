import type { GenerationRepository } from "@/server/ports/generation-repository";
import { GenerationExecutionService } from "./generation-execution-service";

const DEFAULT_INTERVAL_MS = 1_000;
const DEFAULT_LEASE_MS = 30_000;

export class GenerationWorker {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;

  constructor(
    private readonly repository: GenerationRepository,
    private readonly execution: GenerationExecutionService,
    private readonly owner: string,
    private readonly now: () => Date = () => new Date(),
    private readonly intervalMs = DEFAULT_INTERVAL_MS,
    private readonly leaseMs = DEFAULT_LEASE_MS,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.schedule(0);
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  async runOnce(limit = 5): Promise<number> {
    await this.execution.recoverInterruptedSubmissions();
    const now = this.now();
    const jobs = await this.repository.claimDueJobs({
      owner: this.owner,
      now: now.toISOString(),
      leaseExpiresAt: new Date(now.getTime() + this.leaseMs).toISOString(),
      limit,
    });
    for (const job of jobs) await this.execution.advance(job.id);
    return jobs.length;
  }

  private schedule(delay: number): void {
    this.timer = setTimeout(() => {
      void this.runOnce()
        .catch(() => undefined)
        .finally(() => {
          if (this.running) this.schedule(this.intervalMs);
        });
    }, delay);
  }
}
