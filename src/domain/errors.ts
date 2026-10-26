// Why a dependency (microservice or Function) gave no usable answer.
export type DependencyFailure = 'timeout' | 'unreachable' | 'not-configured' | 'bad-response';

// A dependency failed. The panel turns it into a warning; the proxy routes answer 502/504.
export class DependencyUnavailableError extends Error {
  constructor(
    readonly dependency: string,
    readonly reason: DependencyFailure,
    message: string,
  ) {
    super(message);
    this.name = 'DependencyUnavailableError';
  }
}

// The frontend sent something the BFF can tell is wrong before calling anyone (400).
export class InvalidRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRequestError';
  }
}
