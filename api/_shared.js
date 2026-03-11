// ユーザーデータ（Vercel Serverless用のインメモリストア）
// 注意: Serverless環境ではリクエスト間で状態が保持されない場合がある
// 本番ではDB（PlanetScale, Supabase等）を使用すべき

// 簡易的にcookieベースのトークンで認証する
const crypto = require('crypto');

const USERS = {
  'lj1000170@gmail.com': {
    password: 'kb19911226',
    name: '坂野 広平',
    passwordChanged: false,
  },
  'admin': {
    password: 'k93145313',
    name: 'Admin',
    passwordChanged: true,
  },
};

// 簡易トークン管理（本番ではJWT等を使用）
const tokens = {};

function generateToken(email) {
  const token = crypto.randomBytes(32).toString('hex');
  tokens[token] = { email, created: Date.now() };
  return token;
}

function validateToken(token) {
  const session = tokens[token];
  if (!session) return null;
  if (Date.now() - session.created > 24 * 60 * 60 * 1000) {
    delete tokens[token];
    return null;
  }
  return session;
}

function getTokenFromReq(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7);
  }
  return null;
}

// 申込書の参考情報
const GUIDE_CONTEXT = `
【応募先情報】
- 社会福祉法人 小平市社会福祉協議会
- 嘱託職員（障がい者・児の相談業務及び一般事務）
- 勤務先：小平市障がい者地域自立生活支援センターひびき
- 採用予定日：令和8年5月以降

【組織の基本理念】
- 基本理念：地域で支えあう福祉のまち・こだいら
- 第四次地域福祉活動計画（2019〜2027年度）の4つの基本目標：
  ①誰もが参加できる地域づくり ②地域福祉を担うひとづくり
  ③地域を支える仕組みづくり ④地域福祉を進めるための環境づくり

【ひびきの3事業】
1. 指定特定相談支援事業・障害児相談支援事業（サービス等利用計画の作成）
2. 指定一般相談支援事業（地域生活への移行・定着支援）
3. 地域生活支援拠点等登録事業所（緊急時の受け入れ・対応）

【志望動機のポイント】
- なぜ民間事業所ではなく社協を選ぶのか
- 社会福祉士として何をしたいか
- 自分の経験・強みをどう活かすか

【重要キーワード】
地域共生社会、制度の狭間、ネットワーク、寄り添い、住み慣れた地域で、その人らしく、
関係機関との連携、コーディネート、多機関連携、権利擁護、サービス等利用計画、
地域自立支援協議会、チームアプローチ、複合的な課題

【課題式作文】
題目：「障がい者・児の相談業務及び一般事務」に対する基本的な姿勢について
750字以上1,200字以内
推奨構成：導入(〜150字) → 経験からの学び(〜350字) → 社協・ひびきへの考え方(〜500字) → まとめ(〜200字)

【申込書の各欄の書き方ポイント】
- 資格欄：社会福祉士を最上段に
- 志望の動機：①なぜ社協か ②何をしたいか ③経験・強みの活用 を各1〜2文
- 自覚している性格：相談職にふさわしい特性を具体的に
- 職務経歴書：対象者の種別、活用制度、多機関連携実績、特に力を入れた支援を具体的に
`;

module.exports = { USERS, tokens, generateToken, validateToken, getTokenFromReq, GUIDE_CONTEXT };
