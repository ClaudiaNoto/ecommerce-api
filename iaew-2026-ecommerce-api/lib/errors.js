function sendError(res, status, error, code, retryable, action, details) {
  const body = { error, code, retryable, action };
  if (details) body.details = details;
  return res.status(status).json(body);
}

module.exports = { sendError };