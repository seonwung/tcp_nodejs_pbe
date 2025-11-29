import pool from '../db.js';

// 관리자 메인 페이지: 유저 목록 + 레이팅 규칙
export async function getAdminPage(req, res) {
  try {
    // 유저 + 티어 조인
    const [users] = await pool.query(
      `
      SELECT 
        u.id,
        u.username,
        u.nickname,
        u.role,
        u.mmr,
        u.created_at,
        t.name       AS tier_name,
        t.image_path AS tier_image
      FROM users u
      LEFT JOIN tiers t
        ON u.mmr >= t.min_rating
       AND (t.max_rating IS NULL OR u.mmr <= t.max_rating)
      ORDER BY u.mmr DESC, u.id ASC
      `
    );

    // 레이팅 규칙 (없으면 기본값)
    const [ruleRows] = await pool.query(
      'SELECT win_points, lose_points, draw_points FROM rating_rules WHERE id = 1'
    );
    const rules = ruleRows[0] || {
      win_points: 100,
      lose_points: -50,
      draw_points: 0
    };

    res.render('admin', {
      title: '관리자 페이지',
      users,
      rules
    });
  } catch (err) {
    console.error('admin page error:', err);
    res.status(500).send('관리자 페이지 로딩 중 오류가 발생했습니다.');
  }
}

// 승/패 점수폭 수정
export async function postUpdateRatingRules(req, res) {
  try {
    let { win_points, lose_points, draw_points } = req.body;

    win_points  = Number(win_points);
    lose_points = Number(lose_points);
    draw_points = Number(draw_points ?? 0);

    if (Number.isNaN(win_points) || Number.isNaN(lose_points) || Number.isNaN(draw_points)) {
      return res.status(400).send('숫자를 입력해야 합니다.');
    }

    await pool.query(
      `
      INSERT INTO rating_rules (id, win_points, lose_points, draw_points)
      VALUES (1, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        win_points  = VALUES(win_points),
        lose_points = VALUES(lose_points),
        draw_points = VALUES(draw_points)
      `,
      [win_points, lose_points, draw_points]
    );

    res.redirect('/admin');
  } catch (err) {
    console.error('update rating rules error:', err);
    res.status(500).send('레이팅 규칙 저장 중 오류가 발생했습니다.');
  }
}
