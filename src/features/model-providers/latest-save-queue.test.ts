import { describe, expect, it, vi } from "vitest";
import {
  createDebouncedSaveQueue,
  createLatestSaveQueue,
} from "./latest-save-queue";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("latest save queue", () => {
  it("serializes saves and coalesces pending values to the latest snapshot", async () => {
    const first = deferred();
    const latest = deferred();
    const started: string[] = [];
    const saved: string[] = [];
    const savingChanges: boolean[] = [];
    const queue = createLatestSaveQueue<string>({
      save: (value) => {
        started.push(value);
        return value === "first" ? first.promise : latest.promise;
      },
      onError: vi.fn(),
      onSaved: (value) => saved.push(value),
      onSavingChange: (saving) => savingChanges.push(saving),
    });

    queue.enqueue("first");
    queue.enqueue("second");
    queue.enqueue("latest");

    expect(started).toEqual(["first"]);
    first.resolve();
    await vi.waitFor(() => expect(started).toEqual(["first", "latest"]));
    expect(saved).toEqual(["first"]);

    latest.resolve();
    await vi.waitFor(() => expect(saved).toEqual(["first", "latest"]));
    expect(savingChanges).toEqual([true, false]);
  });

  it("reports a failed save and continues with a newer pending value", async () => {
    const first = deferred();
    const errors: unknown[] = [];
    const saved: string[] = [];
    const queue = createLatestSaveQueue<string>({
      save: async (value) => {
        if (value === "first") {
          await first.promise;
          throw new Error("offline");
        }
      },
      onError: (error) => errors.push(error),
      onSaved: (value) => saved.push(value),
      onSavingChange: vi.fn(),
    });

    queue.enqueue("first");
    queue.enqueue("latest");
    first.resolve();

    await vi.waitFor(() => expect(saved).toEqual(["latest"]));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual(new Error("offline"));
  });

  it("aborts an in-flight save when disposed", () => {
    const activeSignals: AbortSignal[] = [];
    const queue = createLatestSaveQueue<string>({
      save: (_value, signal) => {
        activeSignals.push(signal);
        return new Promise((_, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        });
      },
      onError: vi.fn(),
      onSaved: vi.fn(),
      onSavingChange: vi.fn(),
    });

    queue.enqueue("active");
    expect(activeSignals[0]?.aborted).toBe(false);
    queue.dispose();
    expect(activeSignals[0]?.aborted).toBe(true);
  });
});

describe("debounced save queue", () => {
  it("waits for the delay and saves only the latest scheduled snapshot", async () => {
    vi.useFakeTimers();
    try {
      const save = vi.fn(async () => undefined);
      const queue = createDebouncedSaveQueue<string>({
        delayMs: 600,
        save,
        onError: vi.fn(),
        onSaved: vi.fn(),
        onSavingChange: vi.fn(),
      });

      queue.schedule("first");
      await vi.advanceTimersByTimeAsync(300);
      queue.schedule("latest");
      await vi.advanceTimersByTimeAsync(599);
      expect(save).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(save).toHaveBeenCalledOnce();
      expect(save).toHaveBeenCalledWith("latest", expect.any(AbortSignal));
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels a pending save when disposed", async () => {
    vi.useFakeTimers();
    try {
      const save = vi.fn(async () => undefined);
      const queue = createDebouncedSaveQueue<string>({
        delayMs: 600,
        save,
        onError: vi.fn(),
        onSaved: vi.fn(),
        onSavingChange: vi.fn(),
      });

      queue.schedule("pending");
      queue.dispose();
      await vi.advanceTimersByTimeAsync(600);

      expect(save).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
