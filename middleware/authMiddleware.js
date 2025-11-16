export function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).send('관리자만 접근 가능합니다.');
  }
  next();
}
