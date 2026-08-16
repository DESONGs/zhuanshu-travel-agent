export const PLATFORM_HOSTS: Readonly<Record<string, readonly string[]>>;
export const SOCIAL_READ_OPERATIONS: readonly string[];
export const SOCIAL_WORKER_POLICY: Readonly<Record<string, unknown>>;

export function validateSocialWorkerRequest(request: Record<string, unknown>): Record<string, unknown>;
export function sanitizeSocialWorkerResponse(response: Record<string, unknown>): Record<string, unknown>;
