/** Map upstream failures to stable, non-sensitive client messages. */
export function sendApiError(res, error, { tmdbConfigured = true } = {}) {
  if (error?.code === 'TMDB_NOT_CONFIGURED' || !tmdbConfigured) {
    return res.status(503).json({ error: 'The catalogue service is not configured.' });
  }
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return res.status(504).json({ error: 'The catalogue service timed out. Please try again.' });
  }
  if (Number(error?.status) === 404) return res.status(404).json({ error: 'The requested catalogue item was not found.' });
  if (Number(error?.status) === 429) {
    res.setHeader('Retry-After', '30');
    return res.status(503).json({ error: 'The catalogue service is busy. Please try again shortly.' });
  }
  if (Number(error?.status) === 400) return res.status(400).json({ error: 'The catalogue request was invalid.' });
  return res.status(502).json({ error: 'The catalogue service is temporarily unavailable.' });
}
