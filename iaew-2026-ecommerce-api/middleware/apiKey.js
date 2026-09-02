function requireApiKey(req, res, next) {
  const apiKey = req.header('x-api-key');
  const expectedApiKey = process.env.INTERNAL_API_KEY;

  if (!expectedApiKey) {
    return res.status(500).json({ error: 'API key interna no configurada' });
  }

  if (!apiKey || apiKey !== expectedApiKey) {
    return res.status(401).json({ error: 'API key inválida o ausente' });
  }

  next();
}

module.exports = { requireApiKey };