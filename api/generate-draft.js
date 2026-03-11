const Anthropic = require('@anthropic-ai/sdk');
const { GUIDE_CONTEXT } = require('./_shared');

const anthropic = new Anthropic.default({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { formData } = req.body;

  const prompt = `あなたは社会福祉法人の採用担当者が高く評価する応募書類を作成する専門家です。
以下の申込者情報と参考資料をもとに、「社会福祉法人 小平市社会福祉協議会 嘱託職員募集申込書」のドラフトを作成してください。

${GUIDE_CONTEXT}

【申込者が入力した情報】
${JSON.stringify(formData, null, 2)}

以下のJSON形式で出力してください。必ず \`\`\`json で開始し \`\`\` で閉じてください。
JSONの各フィールドに対応する内容を文字列で入れてください。

\`\`\`json
{
  "fullname": "氏名",
  "furigana": "ふりがな",
  "birthDate": "生年月日",
  "age": "年齢（数値）",
  "postalCode": "郵便番号",
  "address": "住所",
  "phone": "電話番号",
  "daytimePhone": "昼間の連絡先",
  "education": [
    {"school": "学校名", "period": "在籍期間", "status": "卒業/修了/中退等"}
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
      "detail": "経験業務の内容（具体的に）"
    }
  ],
  "motivation": "志望の動機（3〜5文の完成された文章）",
  "hobbies": "趣味・特技",
  "volunteer": "スポーツ・文化活動・ボランティア等の経験",
  "interests": "興味関心をもって取り組んでいること",
  "personality": "自覚している性格",
  "requests": "本人希望記入欄",
  "essay": "課題式作文の全文（750〜1200字）"
}
\`\`\`

重要：
- 申込者の実際の経験を尊重し、虚偽の情報は追加しない
- 参考資料のキーワードを自然に織り込む
- 未入力項目は「【要記入】」と表示
- 課題式作文の題目：「障がい者・児の相談業務及び一般事務」に対する基本的な姿勢について
- 課題式作文は推奨構成（導入→経験→社協・ひびきへの考え方→まとめ）に従って作成
- 資格欄は社会福祉士を最上段に
- 志望動機は①なぜ社協か②何をしたいか③経験・強みの活用を含む`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content[0].text;

    // JSONを抽出
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
