declare module "@mercuryworkshop/wisp-js/server" {
  export const logging: {
    WARN: unknown;
    set_level(level: unknown): void;
  };
  export const server: {
    options: Record<string, unknown>;
    routeRequest(request: unknown, socket: unknown, head: Buffer): void;
  };
}
