export interface UnexpectedErrorLogInput {
  requestId: string;
  error: unknown;
}

export interface UnexpectedErrorLogger {
  log(input: UnexpectedErrorLogInput): Promise<void> | void;
}
