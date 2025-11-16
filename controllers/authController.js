import bcrypt from 'bcrypt';
import pool from '../src/db.js';

export async function getLogin(req, res) {
  if (req.session.user) return res.redirect('/');
  res.render('login', { title: '로그인' });
}

export async function postLogin(req, res) {
  const { username, password } = req.body;

  try {
    const [rows] = await pool.query(
      'SELECT id, username, password_hash, role, mmr,nickname FROM users WHERE username = ?',
      [username]
    );
    if (rows.length === 0) {
      return res.send(`<script>alert('아이디 또는 비밀번호가 올바르지 않습니다.');history.back();</script>`);
    }

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.send(`<script>alert('아이디 또는 비밀번호가 올바르지 않습니다.');history.back();</script>`);
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      mmr: user.mmr,
      nickname: user.nickname, 
    };

    if (user.role === 'admin') return res.redirect('/admin');
    return res.redirect('/mypage');
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).send('로그인 중 오류가 발생했습니다.');
  }
}

export async function postLogout(req, res) {
  req.session.destroy(() => {
    res.redirect('/');
  });
}

export async function getSignup(req, res) {
  if (req.session.user) return res.redirect('/');
  res.render('signup', { title: '회원가입' });
}

export async function postSignup(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.send(`<script>alert('아이디와 비밀번호를 입력하세요.');history.back();</script>`);
  }

  try {
    const [dup] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
    if (dup.length > 0) {
      return res.send(`<script>alert('이미 존재하는 아이디입니다.');history.back();</script>`);
    }

    const hash = await bcrypt.hash(password, 10);

    await pool.query(
      'INSERT INTO users (username, password_hash, role, mmr) VALUES (?, ?, ?, ?)',
      [username, hash, 'user', 1000]
    );

    return res.send(
      `<script>alert('회원가입이 완료되었습니다. 로그인 해주세요.');location.href='/login';</script>`
    );
  } catch (err) {
    console.error('signup error:', err);
    return res.status(500).send('회원가입 중 오류가 발생했습니다.');
  }
}
export async function postUpdateNickname(req, res) {
  if (!req.session.user) return res.redirect('/login');

  const userId = req.session.user.id;
  const raw = req.body.nickname ?? '';
  const nickname = String(raw).trim().slice(0, 16); // 16자 제한

  if (!nickname) {
    return res.send(`<script>alert('닉네임을 입력하세요.');history.back();</script>`);
  }

  try {
    await pool.query('UPDATE users SET nickname = ? WHERE id = ?', [nickname, userId]);

    // 세션에도 반영
    req.session.user.nickname = nickname;

    return res.redirect('/mypage');
  } catch (err) {
    console.error('update nickname error:', err);
    return res.status(500).send('닉네임 변경 중 오류가 발생했습니다.');
  }
}

// controllers/authController.js

export async function getMyPage(req, res) {
  try {
    const userId = req.session.user.id; // 로그인한 유저 id (세션에 저장된 값)

    const [rows] = await pool.query(
      `
      SELECT 
        u.id,
        u.username,
        u.nickname,
        u.mmr,
        t.name       AS tier_name,
        t.image_path AS tier_image
      FROM users u
      LEFT JOIN tiers t
        ON u.mmr >= t.min_rating
       AND (t.max_rating IS NULL OR u.mmr <= t.max_rating)
      WHERE u.id = ?
      `,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).send('유저 정보를 찾을 수 없습니다.');
    }

    const user = rows[0];

    res.render('mypage', {
      title: '마이페이지',
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        mmr: user.mmr,
        tierName: user.tier_name,
        tierImage: user.tier_image
      }
    });
  } catch (err) {
    console.error('getMyPage error:', err);
    return res.status(500).send('마이페이지를 불러오는 중 오류가 발생했습니다.');
  }
}
