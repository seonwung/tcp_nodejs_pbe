// === 채팅창 드래그 리사이즈 ===
if (chatDock && resizeBar) {
  let isDragging = false;
  let startY = 0;
  let startHeight = 0;

  const MIN_HEIGHT = 140;                    // 너무 작아지지 않게 최소 높이
  let MAX_HEIGHT = window.innerHeight * 0.7; // 화면의 70% 까지만

  // 창 크기 바뀌면 최대 높이 다시 계산
  window.addEventListener('resize', () => {
    MAX_HEIGHT = window.innerHeight * 0.7;
  });//addEventListener ('이벤트종류',실행함수)

  // 마우스 누른 시점
  resizeBar.addEventListener('mousedown', (e) => {
    isDragging = true;
    startY = e.clientY;
    startHeight = chatDock.getBoundingClientRect().height; 
    //getBoundingClientRect()
    //이건 현재 요소의 위치/크기를 픽셀 단위로 알려주는 브라우저 내장 함수.
// {
//   x: 16,
//   y: 560,
//   width: 320,
//   height: 200,   <--이걸 가져옴
//   top: 560,
//   left: 16,
//   bottom: 760,
//   right: 336 이런식으로
// }
    // JS가 높이 컨트롤하게 max-height 잠깐 제거
    chatDock.style.maxHeight = 'none';

    // 드래그 중에 텍스트 선택 안 되게
    document.body.style.userSelect = 'none';
  });

  // 마우스 이동하면서 높이 변경
  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const dy = startY - e.clientY; // 위로 올리면(+), 아래로 내리면(-)
    let newHeight = startHeight + dy;

    if (newHeight < MIN_HEIGHT) newHeight = MIN_HEIGHT;
    if (newHeight > MAX_HEIGHT) newHeight = MAX_HEIGHT;

    chatDock.style.height = `${newHeight}px`;
  });

  // 마우스 뗐을 때 종료
  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    document.body.style.userSelect = '';
  });
}
// === /채팅창 드래그 리사이즈 끝 ===


// 채팅 전송 버튼
chatSend?.addEventListener('click', () => {
  const txt = chatInput.value.trim();
  if (!txt) return;

  socket.emit('chat:send', txt);
  chatInput.value = '';
  chatInput.focus();
});

// 엔터로 전송 (Shift+Enter는 줄바꿈 용도로 비워둠)
chatInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatSend?.click();
  }
});

// 스크롤 관련 헬퍼
const nearBottom = (el) =>
  el.scrollTop + el.clientHeight >= el.scrollHeight - 6;

const scrollBottom = (el) => {
  el.scrollTop = el.scrollHeight;
};

// XSS 방지용 escape 함수
function esc(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}

// 실제 채팅 메시지 수신
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

  // 로그 최대 길이 제한
  const MAX = 200;
  while (chatList.children.length > MAX) {
    chatList.removeChild(chatList.firstChild);
  }

  if (atBottom) scrollBottom(chatList);
});

// 시스템 메시지도 채팅 창에 표시 (게임 쪽 system:info와는 별개로 동작)
socket.on('system:info', (text) => {
  if (!chatList) return;

  const atBottom = nearBottom(chatList);

  const li = document.createElement('li');
  li.className = 'chat-item system';
  li.innerHTML = `
    <div class="meta">시스템</div>
    <div class="bubble">${esc(text)}</div>
  `;

  chatList.appendChild(li);
  if (atBottom) scrollBottom(chatList);
});
