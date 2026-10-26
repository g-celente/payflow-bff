// Passed to every outgoing call so the services log the same X-Correlation-Id.
export interface CallContext {
  readonly correlationId: string;
}

// What a downstream service answered, handed back to the frontend by the proxy routes
// (status and body as they came, plus the headers the frontend needs).
export interface ServiceReply {
  readonly status: number;
  readonly body: unknown;
  readonly headers: Readonly<Record<string, string>>;
}

// The services answer Location: /v1/payments/{id}; the frontend only knows the BFF path /payments/{id}.
export function withBffLocation(reply: ServiceReply, servicePrefix: string, bffPrefix: string): ServiceReply {
  const location = reply.headers['location'];
  if (location === undefined || !location.startsWith(servicePrefix)) {
    return reply;
  }
  return { ...reply, headers: { ...reply.headers, location: bffPrefix + location.slice(servicePrefix.length) } };
}
