const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic.default({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { formData } = req.body;

  const prompt = `あなたは就職・転職活動の応募書類を作成する専門家です。
以下の申込者情報をもとに、応募書類のドラフトを作成してください。

【申込者が入力した情報】
${JSON.stringify(formData, null, 2)}

以下のJSON形式で出力してください。必ず \`\`\`json で開始し \`\`\` で閉じてください。

\`\`\`json
{
  "fullname": "氏名",
  "furigana": "ふりがな",
  "birthDate": "生年月日",
  "age": "年齢（数値）",
  "postalCode": "郵便番号",
  "address": "住所",
  "phone": "電話番号",
  "contactEmail": "メールアドレス",
  "education": [
    {"school": "学校名", "period": "在籍期間", "status": "卒業/修了等"}
  ],
  "qualifications": [
    {"name": "資格名", "date": "取得年月", "status": "取得/見込み等"}
  ],
  "careers": [
    {
      "company": "会社名",
      "industry": "業種",
      "position": "職種",
      "type": "雇用形態",
      "period": "在籍期間",
      "detail": "経験業務の内容"
    }
  ],
  "motivation": "志望の動機（完成された文章）",
  "selfPR": "自己PR（完成された文章）",
  "hobbies": "趣味・特技",
  "personality": "自覚している性格",
  "strengths": "強み・アピールポイント",
  "requests": "本人希望記入欄",
  "additionalContent": "追加の書類内容（作文等があれば）"
}
\`\`\`

重要：
- 申込者の実際の経験を尊重し、虚偽の情報は追加しない
- 応募先に合わせた効果的な表現を使用する
- 未入力項目は「【要記入】」と表示`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content[0].text;
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        const structured = JSON.parse(jsonMatch[1]);
        res.json({ draft: text, structured });
      } catch {
        res.json({ draft: text, structured: null });
      }
    } else {
      res.json({ draft: text, structured: null });
    }
  } catch (error) {
    console.error('Generate draft error:', error);
    res.status(500).json({ error: 'ドラフト生成エラー: ' + error.message });
  }
};
