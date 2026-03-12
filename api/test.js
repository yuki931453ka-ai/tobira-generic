const Anthropic = require('@anthropic-ai/sdk');

module.exports = async (req, res) => {
  const info = {
    hasKey: !!process.env.ANTHROPIC_API_KEY,
    keyLen: (process.env.ANTHROPIC_API_KEY || '').length,
    keyStart: (process.env.ANTHROPIC_API_KEY || '').slice(0, 15),
    nodeVersion: process.version,
    sdkExports: Object.keys(Anthropic).slice(0, 5),
  };

  try {
    const anthropic = new Anthropic.default({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 20,
      messages: [{ role: 'user', content: 'Say hi' }],
    });
    info.reply = response.content[0].text;
    info.status = 'OK';
  } catch (error) {
    info.status = 'ERROR';
    info.errorMessage = error.message;
    info.errorType = error.constructor.name;
    if (error.cause) info.cause = String(error.cause);
  }
  res.json(info);
};
