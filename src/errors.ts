/** A problem the user can fix; printed as one message, exit code 1 (64 for usage). */
export class RoleError extends Error {
  constructor(
    message: string,
    readonly hint?: string,
  ) {
    super(message);
  }
}

export class UsageError extends Error {}
