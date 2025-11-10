/* <html>, <body>, <div>, <button> 같은 태그들을
자바스크립트가 코드로 접근할 수 있도록 만든 대표 객체가 document. 
--document.querySelector()--
  “CSS 선택자(selector) 를 이용해서 HTML 요소 1개를 찾아오는 함수.”
  --html--
  <body>
    <h1 id="title">오징어 게임</h1>
    <p class="desc">가위바위보 대전</p>
    <button>시작</button>
  </body>
  --js--
    // id로 찾기
    const titleEl = document.querySelector('#title');
    console.log(titleEl.textContent); // "오징어 게임"

    // class로 찾기   
    const descEl = document.querySelector('.desc');
    console.log(descEl.textContent); // "가위바위보 대전"

    // 태그로 찾기
    const buttonEl = document.querySelector('button');
    console.log(buttonEl.textContent); // "

--document.querySelectorAll()--
  --html--
    <button>가위</button>
    <button>바위</button>
    <button>보</button>
  --js--
    const btns = document.querySelectorAll('button'); // 모든 버튼을 가져옴
    console.log(btns.length); // 3
*/
const socket = io();// 서버의 socket.io와 실시간 연결을 맺는 명령

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const nickInput = $('#nick');  //닉네임 입력칸
const btnNick = $('#btnNick');  //닉네임 저장 버튼
const btnQueue = $('#btnQueue'); //매칭 시작 버튼
const statusEl = $('#status');  //현재 상태 텍스트 표시
const battle = $('#battle');    //게임 구간 전체 박스
const resultEl = $('#result');  //게임 결과 텍스트

const meName = $('#meName');     //내 이름
const oppName = $('#oppName');   //상대 이름
const mePick = $('#mePick');    //내가 낸 손 표시
const oppPick = $('#oppPick');  // 상대가 낸 손 표시

const chatList  = $('#chatList');
const chatInput = $('#chatInput');
const chatSend  = $('#chatSend');
const roulPanel = $('#roulette');   // 룰렛 표시 영역
const roulInfo  = $('#rouletteInfo'); // 상태 문구
const  btnExit =  $('#btnExit');
//  승리/패배 배지 이미지
const meBadge  = $('#meBadge');
const oppBadge = $('#oppBadge');

// addEventListener()는
// 브라우저에서 특정 행동(이벤트) 이 일어났을 때 실행할 코드를 등록하는 함수
//emit(이벤트명, 데이터) → on(이벤트명, (데이터)=>{...}) , emit = 보내기 (Send) ,on = 받기 (Listen)
btnNick.addEventListener('click', () => {
  socket.emit('set_nick', nickInput.value.trim());
  statusEl.textContent = '닉네임 설정 완료.';
});
//textContent — “태그 안의 글자 바꾸기”
btnQueue.addEventListener('click', () => {
  resultEl.classList.add('hidden'); //CSS 클래스를 추가하기 히든으로 만들기 
  resultEl.textContent = '';  
  mePick.textContent = '?';
  oppPick.textContent = '?';
  //  배지 초기화
  meBadge?.classList.add('hidden'); meBadge && (meBadge.src = '');
  oppBadge?.classList.add('hidden'); oppBadge && (oppBadge.src = '');
  statusEl.textContent = '매칭 대기 중...';
  socket.emit('join_queue');
});

socket.on('queue:joined', () => {
  statusEl.textContent = '대기열에 들어갔습니다. 상대를 기다리는 중...';
});

socket.on('match:ready', ({ roomId, players }) => {
  statusEl.textContent = `매칭 완료! 방: ${roomId}`;
  battle.classList.remove('hidden');// 배틀창 히든을 지워줌

  // 배열.find(요소 => 조건식);
  // socket.id는 내가 처음 io()했을때 가지는 id이고 player배열에서 p.id
  //에 접근했을때 이 두개가 같으면 "나" 이고 아니면 "상대"임
  const me = players.find(p => p.id === socket.id); 
  const opp = players.find(p => p.id !== socket.id);
  meName.textContent = me?.nick || 'Me';
  oppName.textContent = opp?.nick || 'Opponent';
});

//  총알 계획 알림(정보는 숨김 — 단지 "언제든 터질 수 있음" 안내)
socket.on('roulette:plan', ({ total }) => {
  roulPanel.classList.remove('hidden');
  roulInfo.textContent = `러시안 룰렛 준비 완료 (총 ${total}판 중 어딘가에서 터진다)`;
});

//  라운드 시작: 3초 카운트다운(상태 표시)
let roundTimerId = null;
socket.on('round:start', ({ round, deadline }) => {
  resultEl.classList.add('hidden'); // 이전 라운드 결과는 잠깐 숨김
  mePick.textContent = '?';
  oppPick.textContent = '?';
  battle.classList.remove('hidden');

  const endAt = deadline || (Date.now() + 3000);
  const tick = () => {
    const remainMs = Math.max(0, endAt - Date.now());
    const sec = Math.ceil(remainMs / 1000);
    statusEl.textContent = `Round ${round} — ${sec}초 내에 선택하세요 (3·2·1)`;
    if (remainMs <= 0) { clearInterval(roundTimerId); roundTimerId = null; }
  };
  clearInterval(roundTimerId);
  tick();
  roundTimerId = setInterval(tick, 100);
});

//요소.addEventListener('이벤트이름', 실행할함수); 즉 click은 이벤트이름
$$('.controls button').forEach(btn => {
  btn.addEventListener('click', () => {
    const hand = btn.dataset.hand;//<button data-hand="rock">묵(바위)</button> 
    // 를 읽을때 사용 "rock" 임
    mePick.textContent = toKorean(hand);
    statusEl.textContent = '선택 완료. 상대를 기다리는 중...';
    socket.emit('pick', hand);
  });
});

socket.on('opponent:picked', () => {
  oppPick.textContent = '선택 완료';
});

socket.on('match:reveal', ({ picks, winner, round, score }) => {
  const my = toKorean(picks[socket.id]);//map형태여서 예) id : 1 => rock 이여서 반환함
  const oppId = Object.keys(picks).find(id => id !== socket.id);
  //Object.keys(picks) 키만 뽑기 id가 1,2 라면[1,2]그걸 배열을 순회하면서 true 첫요소 반환
  const op = toKorean(picks[oppId]);// 상대의 선택지 가져옴

  mePick.textContent = my; //나의픽을
  oppPick.textContent = op; //상대의 픽을

  resultEl.classList.remove('hidden');//결과창 히든 지우기
  if (!winner) resultEl.textContent = `라운드 ${round} 결과: 무승부`;
  else if (winner === socket.id) resultEl.textContent = `라운드 ${round} 결과: 승리! 🏆`;
  else resultEl.textContent = `라운드 ${round} 결과: 패배...`;
});

//  BANG! 이 라운드에서 최종 승부 확정
socket.on('roulette:bang', ({ round, bulletRound, winner, loser }) => {
  const iAmWinner = (winner === socket.id);
  resultEl.classList.remove('hidden');
  resultEl.textContent = `💥 BANG! (총알 라운드: ${bulletRound}) — 라운드 ${round}에서 최종 결정`;

  statusEl.textContent = iAmWinner ? '최종 승리! 🎉' : '최종 패배...';

  // 🎞️ 오버레이 GIF 표시
  const overlay = document.getElementById('resultOverlay');
  const gif = document.getElementById('resultGif');
  gif.src = iAmWinner ? '/win.gif' : '/lose.gif';

  overlay.classList.add('show');

  // “나가기” 버튼으로 닫기
  document.getElementById('closeOverlay').onclick = () => {
  overlay.classList.remove('show');

  // 🎯 오버레이 닫을 때 게임 전체 초기화
  battle.classList.add('hidden');
  resultEl.classList.add('hidden');
  roulPanel.classList.add('hidden');

  statusEl.textContent = '대기 중...';
  mePick.textContent = '?';
  oppPick.textContent = '?';
  meBadge?.classList.add('hidden');
  oppBadge?.classList.add('hidden');

  socket.emit('leave_game'); // 서버에 종료 알림
  socket.data = {};          // 클라이언트 room 데이터 제거
};

});



// new — 나가기 버튼 동작(새로고침으로 초기화)
// btnExit.addEventListener('click', () => {
//   const overlay = document.getElementById('loseOverlay');
//   if (overlay) overlay.classList.remove('show');

//   // 게임 화면 숨기기
//   battle.classList.add('hidden');
//   resultEl.classList.add('hidden');
//   roulPanel.classList.add('hidden');

//   // 텍스트 초기화
//   statusEl.textContent = '대기 중...';
//   mePick.textContent = '?';
//   oppPick.textContent = '?';
//   meBadge?.classList.add('hidden');
//   oppBadge?.classList.add('hidden');

//   // 소켓 정리 및 초기화
//   socket.emit('leave_game'); // new: 서버로 종료 알림 (옵션)
//   socket.data = {};          // new: 남은 room 정보 제거

//   // 완전 초기화하려면 아래도 가능 (리로딩)
//   // location.reload();  
// });

// (예외) 5판이 모두 끝났는데도 못 터진 경우(거의 없음)
socket.on('match:end', ({ score, winner }) => {
  resultEl.classList.remove('hidden');
  resultEl.textContent = '경기 종료';
  statusEl.textContent   = '게임 종료';
});

socket.on('match:abort', () => {
  statusEl.textContent = '상대가 나갔습니다. 게임이 중단되었습니다.';
  battle.classList.add('hidden');
});

socket.on('system:info', (msg) => {
  statusEl.textContent = msg;
});

function toKorean(hand) {
  switch (hand) {
    case 'rock': return '묵(바위)';
    case 'paper': return '빠(보)';
    case 'scissors': return '찌(가위)';
    case 'none': return '미제출';
    default: return '?';
  }
}

/*챗 전송 */

chatSend?.addEventListener('click', () => {
  const txt = chatInput.value.trim();
  if (!txt) return;
  socket.emit('chat:send', txt);
  chatInput.value = '';
  chatInput.focus();
});
// 엔터 전송
chatInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); chatSend?.click(); }
});

// 자동 스크롤
const nearBottom = el => el.scrollTop + el.clientHeight >= el.scrollHeight - 6;
const scrollBottom = el => { el.scrollTop = el.scrollHeight; };

// XSS 방지용
function esc(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

socket.on('chat:message', ({ id, nick, msg, ts }) => {
  if (!chatList) return;
  const atBottom = nearBottom(chatList);
  const mine = (id === socket.id);

  const li = document.createElement('li');
  li.className = 'chat-item ' + (mine ? 'mine' : 'other');
  const time = new Date(ts || Date.now()).toLocaleTimeString();
  const label = mine ? '(나)' : '(상대)';

  li.innerHTML = `
    <div class="meta">${label} ${esc(nick)} · <span class="time">${time}</span></div>
    <div class="bubble">${esc(msg)}</div>
  `;
  chatList.appendChild(li);

  const MAX = 200;
  while (chatList.children.length > MAX) chatList.removeChild(chatList.firstChild);
  if (atBottom) scrollBottom(chatList);
});

socket.on('system:info', (text) => {
  if (!chatList) return;
  const atBottom = nearBottom(chatList);
  const li = document.createElement('li');
  li.className = 'chat-item system';
  li.innerHTML = `<div class="meta">시스템</div><div class="bubble">${esc(text)}</div>`;
  chatList.appendChild(li);
  if (atBottom) scrollBottom(chatList);
});
