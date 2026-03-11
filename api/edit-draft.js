const Anthropic = require('@anthropic-ai/sdk');
const { GUIDE_CONTEXT } = require('./_shared');

const anthropic = new Anthropic.default({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { currentDraft, editRequest } = req.body;

  const prompt = `あなたは応募書類作成の専門家です。

${GUIDE_CONTEXT}

【現在のドラフト】
${currentDraft}

【修正要望】
${editRequest}

修正後のドラフト全文を、元と同じJSON形式（\`\`\`json で囲む）で出力してください。
変更したフィールドの値には先頭に「★」を付けてください。`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    res.json({ draft: message.content[0].text });
  } catch (error) {
    console.error('Edit draft error:', error);
    res.status(500).json({ error: '修正エラー: ' + error.message });
  }
};
