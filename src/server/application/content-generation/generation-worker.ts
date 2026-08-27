import type { GenerationRepository } from "@/server/ports/generation-repository";
import { GenerationExecutionService } from "./generation-execution-service";

const DEFAULT_INTERVAL_MS = 1_000;
const DEFAULT_LEASE_MS = 180_000;

export interface GenerationWorkerProviderPolicy {
  maxConcurrent: number;
}

export interface GenerationWorkerMetrics {
  claimedJobs: number;
  completedAdvances: number;
  failedAdvances: number;
  activeByProvider: Record<string, number>;
  maxObservedByProvider: Record<string, number>;
}

export class GenerationWorker {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private readonly metrics:GenerationWorkerMetrics={claimedJobs:0,completedAdvances:0,failedAdvances:0,activeByProvider:{},maxObservedByProvider:{}};

  constructor(
    private readonly repository: GenerationRepository,
    private readonly execution: GenerationExecutionService,
    private readonly owner: string,
    private readonly now: () => Date = () => new Date(),
    private readonly intervalMs = DEFAULT_INTERVAL_MS,
    private readonly leaseMs = DEFAULT_LEASE_MS,
    private readonly providerPolicies:Record<string,GenerationWorkerProviderPolicy> = {},
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
    this.metrics.claimedJobs+=jobs.length;
    const groups=Map.groupBy(jobs,job=>job.providerId);
    await Promise.all([...groups].map(([providerId,providerJobs])=>
      runWithConcurrency(providerJobs,this.providerLimit(providerId),job=>this.advance(providerId,job.id))));
    return jobs.length;
  }

  getMetrics():GenerationWorkerMetrics {
    return {
      ...this.metrics,
      activeByProvider:{...this.metrics.activeByProvider},
      maxObservedByProvider:{...this.metrics.maxObservedByProvider},
    };
  }

  private providerLimit(providerId:string):number {
    return Math.max(1,Math.trunc(this.providerPolicies[providerId]?.maxConcurrent??1));
  }

  private async advance(providerId:string,jobId:string):Promise<void> {
    const active=(this.metrics.activeByProvider[providerId]??0)+1;
    this.metrics.activeByProvider[providerId]=active;
    this.metrics.maxObservedByProvider[providerId]=Math.max(this.metrics.maxObservedByProvider[providerId]??0,active);
    try {
      await this.execution.advance(jobId);
      this.metrics.completedAdvances+=1;
    } catch {
      this.metrics.failedAdvances+=1;
      // 单个 Job 的意外错误不能阻断同批已领取任务；其 lease 到期后可再次恢复。
    } finally {
      this.metrics.activeByProvider[providerId]=Math.max(0,(this.metrics.activeByProvider[providerId]??1)-1);
    }
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

async function runWithConcurrency<T>(items:T[],limit:number,operation:(item:T)=>Promise<void>):Promise<void> {
  let index=0;
  const workers=Array.from({length:Math.min(limit,items.length)},async()=>{
    while(index<items.length){
      const item=items[index++];
      await operation(item);
    }
  });
  await Promise.all(workers);
}
