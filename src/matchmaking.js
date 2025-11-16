import pool from './db.js';   //db가져오기


// 대기열(queue) 에 사람을 넣고,
// 2명이 모이면 방(room) 을 만들고,
// 각자 낸 패(pick)를 받아 승패를 계산해 알리고,
// 방을 정리(endRoom), 접속 종료 시 처리(leave)까지.


export function createMatchMaker(io) { // http위에 소켓io가 올라와있고 그걸 주입받아 게임/매칭 알림 쏘는 모듈
  const queue = [];// 선입 선출 소켓의 id를 넣는곳
  const rooms = new Map(); // 키roomId ->값 { p1, p2, picks: Map<socketId, hand>, round, roundTimer, bullet, detonated } // new: bullet 필드명 통일

  let roomCount = 0;

  function joinQueue(socket) {// 게임하겠다 
    
    if (socket.data.roomId) return; // socket.data.roomId 는  socket.data가 socket.io가 사용자 정의할수있게 만듬 
    if (queue.includes(socket.id)) return;// 대기열에 이미있으면 중복방지?
    const myUid = socket.data.userId ?? null;

      if (myUid != null) {
    const dupExists = queue.some(id => {
      const s = io.sockets.sockets.get(id);
      return s && s.data.userId === myUid;
    });

    if (dupExists) {
      socket.emit('system:info', '같은 계정으로는 두 번 동시에 매칭할 수 없습니다.');
      return;
    }
  }

    queue.push(socket.id); //소켓의 id를 푸쉬하고
    socket.emit('queue:joined');// 클라이언트로 보냄

    if (queue.length >= 2) {
      const s1 = io.sockets.sockets.get(queue.shift());
      const s2 = io.sockets.sockets.get(queue.shift());
      if (!s1 || !s2) return;
      //io.sockets.socket   { socketId → socket객체 } 로 구성된 Map, 그래서 s1 s2는 실제 소켓 객체 
      //이건 Socket.IO 서버(io)가 모든 연결된 클라이언트(socket) 들을 관리하는 Map 구조
//       io.sockets.sockets = Map {
//    '소켓ID1' → socket객체1,
//    '소켓ID2' → socket객체2,
//    '소켓ID3' → socket객체3,
//    ...
//      }

 //  같은 계정이면 매칭 금지
   if (
  s1.data.userId != null &&          // null 또는 undefined 아닌지 체크
  s2.data.userId != null &&
  s1.data.userId === s2.data.userId  // 두 유저의 userId가 같으면 동일 계정
) {
      // 같은 사람 → 큐로 다시 돌려보내기
 s1.emit('system:info', '같은 계정끼리는 서로 매칭할 수 없습니다.');
      s2.emit('system:info', '같은 계정끼리는 서로 매칭할 수 없습니다.');
      return; // 매칭 안 하고 종료
    }

      const roomId =  `room_${++roomCount}`;//대충 두사람의 방이라는거겠지? 나중에 좀더 복잡으로 바꿔볼까?
      s1.join(roomId); // join은 방에 소켓유저를 넣는기능
      s2.join(roomId);
      s1.data.roomId = roomId;
      s2.data.roomId = roomId;// 각각 s1 s2의 의 socket.data에 roomid를 지정한 room id로함

      rooms.set(roomId, { p1: s1.id, p2: s2.id, picks: new Map() }); //rooms에 룸id를 키로 플레이어 1,2를  벨류로

      io.to(roomId).emit('match:ready', {
        roomId,
        players: [
          { id: s1.id, nick: s1.data.nick || 'Guest' },
          { id: s2.id, nick: s2.data.nick || 'Guest' }
        ] //  data.nick이 공백이면  player1 ,2
      });

      // 매칭 완료 즉시 5라운드 자동 시작(3초 템포)
      startMatch(roomId); // new
    }
  }

  function resultOf(a, b) {
    // 미선택('none') 규칙: 제 시간 내에 못내면 자동 패배
    if (a === 'none' && b === 'none') {
      // 둘 다 미제출: 임의 패자 (긴박감 강화)
      return Math.random() < 0.5 ? 1 : -1;
    }
    if (a === 'none') return -1;
    if (b === 'none') return 1;
    // 무승부도 임의 난수로 강제 승패 (요구사항)
    if (a === b) return Math.random() < 0.5 ? 1 : -1; // new
    if ((a==='rock'&&b==='scissors')||(a==='paper'&&b==='rock')||(a==='scissors'&&b==='paper')) return 1;
    return -1;
  }//a가 이기면 1 b가 이기면 -1

  function receivePick(socket, hand) {//플레이어 선택을 저장 , 결과를 내면 승부  소켓= 누가 핸드는 무엇을
    const roomId = socket.data.roomId;//소캣의 방아이디 꺼냄
    if (!roomId || !rooms.has(roomId)) return; 
//     방 ID가 없거나(roomId 없음),
// 서버 메모리(rooms Map)에 그 방이 존재하지 않으면 함수 종료
    if (!['rock', 'paper', 'scissors'].includes(hand)) return;
 //잘못된값 검증용
    const room = rooms.get(roomId);//소켓에서 뽑아온걸 id로 rooms에서 정보가져온게 room
    // 라운드가 진행중일 때만 입력받기
    // if (!room.round || !room.roundTimer) return;
    if (room.roundTimer == null) return; // new: 0라운드도 유효. 타이머 존재만 확인

    room.picks.set(socket.id, hand);//룸의picks에 맵세팅
    const nick = socket.data.nick || 'Guest'; 
console.log(`[PICK] room=${roomId} round=${room.round ?? '?'} nick=${nick} id=${socket.id} hand=${hand}`);
    socket.to(roomId).emit('opponent:picked'); //roomid에있는 나를 제외한 상대에게 이런 이벤트를 보내라 

    const p1Pick = room.picks.get(room.p1); //
    const p2Pick = room.picks.get(room.p2); // 각각  룸에잇는 플레이어의 핸드를 가져옴 picks가 맵이라서 가능
    // 둘 다 제출 완료되면 즉시 판정 (타이머 만료 전 조기 확정)
    if (p1Pick && p2Pick) decideRound(roomId);
  }

  function endRoom(roomId) {
    const room = rooms.get(roomId);// 룸id로 rooms에서 room 추출 
    //rooms ={roomId,{p1,p2 {picks:socketid,hand}} 로 이루어진 맵이기때문에
    if (!room) return;

    // 타이머 안전 정리
    clearTimeout(room.roundTimer); // new

    for (const sid of [room.p1, room.p2]) {
      const s = io.sockets.sockets.get(sid);//각각 p1 p2 아이디를뽑아서 소켓객체로 뽑는다
      if (s) { s.leave(roomId); s.data.roomId = null; }//떠나고 소켓객체의 룸id값을 null로
    }
    rooms.delete(roomId);//그리고 방 배열에서 roomid를 지운다 rooms는 전역변수임
  }

  function leave(socket) {
    const idx = queue.indexOf(socket.id);//소켓아이디의 인덱스번호를 추출함
    if (idx >= 0) queue.splice(idx, 1); //indexOf() 결과가 -1이면 못찾은거임 
    //idx번째 위치의 요소를 배열 queue에서 제거한다

    const roomId = socket.data.roomId;// 가져온 소켓의 roomid를 추출
    if (roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId);
      // 상대 id를 먼저 구해두고
      const oppId = room ? ((room.p1 === socket.id) ? room.p2 : room.p1) : null;

      io.to(roomId).emit('match:abort');
//    io.emit(event, data)	서버에 연결된 모든 클라이언트에게 보냄
//    io.to(roomId).emit(event, data)	특정 방(roomId)에 있는 모든 유저에게 보냄
      endRoom(roomId);

      if (oppId) {
        const opp = io.sockets.sockets.get(oppId);// oppid -> opp소켓 객체 지정
        if (opp) opp.emit('system:info', '상대가 나갔습니다. 다시 매칭하세요.');//opp가 있으면 opp한테 상대방나갔다고 말해주기
      }
    }
  }

  //  반환: 서버에서 쓸 공개 API
  return { joinQueue, receivePick, leave };

  // ======================
  //  자동 라운드 엔진 (5판, 3초 템포) + 라운드형 러시안룰렛(총알 1칸 고정)
  // ======================
  function startMatch(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    room.round = 0;                         // new: 내부 라운드 인덱스 0..4
    room.picks = new Map();
    room.bullet = Math.floor(Math.random() * 5); // new: 총알칸 0..4 고정
    room.detonated = false;                 // 이미 터졌는지 여부

    io.to(roomId).emit('roulette:plan', { total: 5 }); // 정보 비공개 안내
    nextRound(roomId);
  }

  function nextRound(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    if (room.round >= 5) {                 // new: 5판 끝(0..4)
      endRoom(roomId);
      return;
    }

    room.picks = new Map();
    io.to(roomId).emit('round:start', {    // new: 표시용 1..5
      round: room.round + 1,
      deadline: Date.now() + 7000
    });

    clearTimeout(room.roundTimer);
    room.roundTimer = setTimeout(() => decideRound(roomId), 7000); //데드라인 정하고 7초뒤 
  }

  function decideRound(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    clearTimeout(room.roundTimer);

    const p1Pick = room.picks.get(room.p1) ?? 'none';
    const p2Pick = room.picks.get(room.p2) ?? 'none';

    const r = resultOf(p1Pick, p2Pick);
    const winner = (r === 1 ? room.p1 : room.p2);
    const loser  = (r === 1 ? room.p2 : room.p1);

    io.to(roomId).emit('match:reveal', {
      picks: { [room.p1]: p1Pick, [room.p2]: p2Pick },
      winner,
      round: room.round + 1                 // new: 표시용 1..5
    });

    //  총알 판정: 현재 라운드 인덱스(0..4)와 총알칸(0..4) 일치 시 즉시 종료
    if (room.round === room.bullet) {       // new: 인덱스끼리 비교
      io.to(roomId).emit('roulette:bang', {
        roomId,
        round: room.round + 1,              // 몇 번째 승부에서 터졌는지(1..5)
        bulletRound: room.bullet + 1,       // 총알칸 표시(1..5)
        winner,
        loser
      });
      
      applyRatingResult(winner, loser);
      endRoom(roomId);
      return;
    }

    // 생존 → 다음 라운드
    room.round += 1;                        // new: 내부 인덱스 증가(0..4)
    room.picks = new Map();
    setTimeout(() => nextRound(roomId), 800);
  }

    // ============================
  //   MMR 업데이트 헬퍼 함수
  // ============================
  async function applyRatingResult(winnerSid, loserSid) {
    try {
      const winnerSocket = io.sockets.sockets.get(winnerSid);
      const loserSocket  = io.sockets.sockets.get(loserSid);

      // 로그인 안 한 게스트면 MMR 안 건드림
      const winnerUserId = winnerSocket?.data?.userId;
      const loserUserId  = loserSocket?.data?.userId;
      if (!winnerUserId || !loserUserId) {
        console.log('게스트이거나 userId 없음 → MMR 업데이트 스킵');
        return;
      }

      // 점수 규칙 읽기 (없으면 기본값 100 / -50 사용)
      const [rows] = await pool.query(
        'SELECT win_points, lose_points FROM rating_rules WHERE id = 1'
      );
      const rule = rows[0] || { win_points: 100, lose_points: -50 };

      const winDelta  = rule.win_points;
      const loseDelta = rule.lose_points;

      // 승자 MMR 증가
      await pool.query(
        'UPDATE users SET mmr = GREATEST(0, mmr + ?) WHERE id = ?',
        [winDelta, winnerUserId]
      );

      // 패자 MMR 감소
      await pool.query(
        'UPDATE users SET mmr = GREATEST(0, mmr + ?) WHERE id = ?',
        [loseDelta, loserUserId]
      );

      // 선택: 결과를 소켓으로 알려주기 (원하면 UI에서 쓸 수 있음)
      winnerSocket?.emit('rating:update', { delta: winDelta });
      loserSocket?.emit('rating:update',  { delta: loseDelta });

      console.log(
        `MMR 업데이트 완료: winner ${winnerUserId} (${winDelta}), loser ${loserUserId} (${loseDelta})`
      );
    } catch (err) {
      console.error('MMR update error:', err);
    }
  }

}
