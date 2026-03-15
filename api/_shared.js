// ユーザーデータ（Vercel Serverless用のインメモリストア）
const crypto = require('crypto');

const USERS = {
  'admin': {
    password: 'k93145313',
    name: 'Admin',
  },
};

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

module.exports = { USERS, tokens, generateToken, validateToken, getTokenFromReq };
