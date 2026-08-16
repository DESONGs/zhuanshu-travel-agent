export function httpError(code, status = 400, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  error.details = details;
  return error;
}

export function sendError(response, error) {
  response.status(error?.status ?? 500).json({
    status: "error",
    code: error?.code ?? "internal_error",
    details: error?.details ?? null,
  });
}
