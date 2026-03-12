const { USERS, generateToken } = require('./_shared');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password } = req.body;
  const user = USERS[email];

  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'メールアドレスまたはパスワードが正しくありません。' });
  }

  const token = generateToken(email);
  res.json({ token, name: user.name });
};
