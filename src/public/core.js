// core.js : 공통 기반 세팅 , 일단 규모가 작아서 넣어둠
//나중에 나눌예정

// 1) 서버와 실시간 연결
const socket = io(); // 딱 1번만 생성! (다른 파일들은 이걸 그대로 사용)

// 2) DOM 헬퍼
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// 3) 자주 쓰는 요소들 캐싱 (게임 + 채팅 공용)


const btnQueue  = $('#btnQueue');
const statusEl  = $('#status');
const battle    = $('#battle');
const resultEl  = $('#result');

const meName  = $('#meName');
const oppName = $('#oppName');
const mePick  = $('#mePick');
const oppPick = $('#oppPick');

const roulPanel = $('#roulette');
const roulInfo  = $('#rouletteInfo');

const meBadge  = $('#meBadge');
const oppBadge = $('#oppBadge');

const chatList  = $('#chatList');
const chatInput = $('#chatInput');
const chatSend  = $('#chatSend');
const chatDock  = $('#chatDock');
const resizeBar = $('#chatResize');
// 4) 손 모양을 한글로 바꾸는 함수 (게임/채팅 양쪽에서 쓸 수도 있어서 여기 둠)
function toKorean(hand) {
  switch (hand) {
    case 'rock':     return '묵(바위)';
    case 'paper':    return '빠(보)';
    case 'scissors': return '찌(가위)';
    case 'none':     return '미제출';
    default:         return '?';
  }
}
