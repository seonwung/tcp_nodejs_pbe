  import { Router } from 'express';
  import {
    getLogin,
    postLogin,
    postLogout,
    getSignup,
    postSignup,
    getMyPage,
    postUpdateNickname 
  } from '../controllers/authController.js';
  import { 
    getAdminPage,
    postUpdateRatingRules  
  } from '../controllers/adminController.js';

import { requireLogin, requireAdmin } from '../middleware/authMiddleware.js';


  const router = Router();

  // 로그인 / 로그아웃 / 회원가입
  router.get('/login', getLogin);
  router.post('/login', postLogin);
  router.post('/logout', postLogout);
  router.get('/signup', getSignup);
  router.post('/signup', postSignup);

  // 마이페이지
  router.get('/mypage', requireLogin, getMyPage);
  router.post('/mypage/nickname', requireLogin, postUpdateNickname);

  // 관리자 페이지
  router.get('/admin', requireAdmin, getAdminPage);
  router.post('/admin/rating-rules', requireAdmin, postUpdateRatingRules);

  export default router;
