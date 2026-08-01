export class PostIdentityConflictError extends Error {
  readonly code = "post_identity_conflict"

  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "PostIdentityConflictError"
  }
}
