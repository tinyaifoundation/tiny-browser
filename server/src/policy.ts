import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

export interface RelayLimits {
  maxConcurrent: number;
  maxConcurrentPerUser: number;
  maxRequestsPerMinute: number;
  maxBytesPerMinute: number;
}

export const defaultLimits: RelayLimits = {
  maxConcurrent: 16,
  maxConcurrentPerUser: 4,
  maxRequestsPerMinute: 120,
  maxBytesPerMinute: 50_000_000,
};

export function authenticatedUser(
  request: IncomingMessage,
  secret: string,
): string | undefined {
  const supplied = request.headers["x-tinybrowser-proxy-secret"];
  const user = request.headers["x-tinybrowser-user"];
  if (typeof supplied !== "string" || typeof user !== "string") return;
  if (!/^[a-zA-Z0-9._:@-]{1,128}$/.test(user)) return;
  const expectedBytes = Buffer.from(secret);
  const suppliedBytes = Buffer.from(supplied);
  if (
    expectedBytes.length !== suppliedBytes.length ||
    !timingSafeEqual(expectedBytes, suppliedBytes)
  )
    return;
  return user;
}

interface Usage {
  windowStart: number;
  requests: number;
  bytes: number;
  active: number;
}

export class RelayQuota {
  private active = 0;
  private readonly users = new Map<string, Usage>();

  constructor(
    private readonly limits: RelayLimits = defaultLimits,
    private readonly now: () => number = Date.now,
  ) {}

  acquire(user: string): (() => void) | undefined {
    const time = this.now();
    if (this.users.size > 10_000) {
      for (const [key, old] of this.users) {
        if (old.active === 0 && time - old.windowStart >= 60_000)
          this.users.delete(key);
      }
    }
    let usage = this.users.get(user);
    if (!usage || time - usage.windowStart >= 60_000) {
      usage = {
        windowStart: time,
        requests: 0,
        bytes: 0,
        active: usage?.active ?? 0,
      };
      this.users.set(user, usage);
    }
    if (
      this.active >= this.limits.maxConcurrent ||
      usage.active >= this.limits.maxConcurrentPerUser ||
      usage.requests >= this.limits.maxRequestsPerMinute ||
      usage.bytes >= this.limits.maxBytesPerMinute
    )
      return;
    this.active++;
    usage.active++;
    usage.requests++;
    return () => {
      this.active--;
      const current = this.users.get(user);
      if (current) current.active--;
    };
  }

  charge(user: string, bytes: number): boolean {
    const usage = this.users.get(user);
    if (!usage || usage.bytes + bytes > this.limits.maxBytesPerMinute)
      return false;
    usage.bytes += bytes;
    return true;
  }
}
