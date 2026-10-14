import { describe, expect, it } from "vitest";
import { createPasswordWorkLimiter, hashPassword, PasswordWorkBusyError, verifyPassword } from "@/lib/auth/password";

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe("password work limiter", () => {
  it("never runs more than the allowed number of tasks at once", async () => {
    const limiter = createPasswordWorkLimiter(3, 100);
    let running = 0;
    let peak = 0;
    const task = async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
    };
    await Promise.all(Array.from({ length: 40 }, () => limiter.run(task)));
    expect(peak).toBe(3);
    expect(limiter.active).toBe(0);
    expect(limiter.waiting).toBe(0);
  });

  it("refuses work at once when the queue is full, and serves the queue in order afterwards", async () => {
    const limiter = createPasswordWorkLimiter(1, 2);
    const gate = deferred();
    const order: number[] = [];
    const first = limiter.run(async () => {
      await gate.promise;
      order.push(0);
    });
    const second = limiter.run(async () => void order.push(1));
    const third = limiter.run(async () => void order.push(2));
    // One running, two waiting: the next caller is turned away without waiting.
    await expect(limiter.run(async () => undefined)).rejects.toBeInstanceOf(PasswordWorkBusyError);
    expect(limiter.waiting).toBe(2);
    gate.release();
    await Promise.all([first, second, third]);
    expect(order).toEqual([0, 1, 2]);
    expect(limiter.active).toBe(0);
  });

  it("frees the slot when a task fails", async () => {
    const limiter = createPasswordWorkLimiter(1, 0);
    await expect(limiter.run(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(limiter.active).toBe(0);
    await expect(limiter.run(async () => "fine")).resolves.toBe("fine");
  });

  it("keeps real hashing correct through the limiter", async () => {
    const stored = await hashPassword("correct horse battery staple");
    await expect(verifyPassword(stored, "correct horse battery staple")).resolves.toBe(true);
    await expect(verifyPassword(stored, "wrong horse battery staple")).resolves.toBe(false);
  });
});
