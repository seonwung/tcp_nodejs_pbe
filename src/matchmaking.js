import pool from './db.js';   // DB 가져오기

// 대기열(queue)에 사람을 넣고,
// 2명이 모이면 방(room)을 만들고,
// 각자 낸 패(pick)를 받아 승패를 계산해 알리고,
// 방을 정리(endRoom), 접속 종료 시 처리(leave)까지.

export function createMatchMaker(io, pool) { // http 위에 소켓 io가 올라와있고 그걸 주입받아 게임/매칭 알림 쏘는 모듈
    const queue = []; // 선입 선출 소켓의 id를 넣는 곳
    const rooms = new Map(); // 키 roomId -> 값 { p1, p2, picks: Map<socketId, hand>, round, roundTimer, bullet, detonated }

    let roomCount = 0;

    // ======================
    //  큐에 참가
    // ======================
    function joinQueue(socket) {
        if (socket.data.roomId) return; // 이미 방에 있는 경우
        if (queue.includes(socket.id)) return; // 큐 중복 방지
        const myUid = socket.data.userId ?? null;

        if (myUid != null) {
            // 같은 계정이 이미 연결되어 있으면 기존 소켓 제거
            const dupSocket = Array.from(io.sockets.sockets.values()).find(
                s => s.data.userId === myUid && s.id !== socket.id
            );
            if (dupSocket) {
                dupSocket.emit('system:info', '다른 브라우저에서 로그인되어 기존 연결이 종료됩니다.');
                leave(dupSocket);        // 기존 소켓 큐/방에서 제거
                dupSocket.disconnect();   // 소켓 종료
            }

            // 큐 안에서도 중복 체크
            const dupExists = queue.some(id => {
                const s = io.sockets.sockets.get(id);
                return s && s.data.userId === myUid;
            });
            if (dupExists) {
                socket.emit('system:info', '같은 계정으로는 두 번 동시에 매칭할 수 없습니다.');
                return;
            }
        }

        queue.push(socket.id); // 큐에 추가
        socket.emit('queue:joined'); // 클라이언트로 알림

        if (queue.length >= 2) {
            const s1 = io.sockets.sockets.get(queue.shift());
            const s2 = io.sockets.sockets.get(queue.shift());
            if (!s1 || !s2) return;

            // io.sockets.sockets = Map { socketId → socket객체 } 로 구성
            // s1, s2는 실제 소켓 객체

            // 같은 계정이면 매칭 금지
            if (
                s1.data.userId != null &&
                s2.data.userId != null &&
                s1.data.userId === s2.data.userId
            ) {
                s1.emit('system:info', '같은 계정끼리는 서로 매칭할 수 없습니다.');
                s2.emit('system:info', '같은 계정끼리는 서로 매칭할 수 없습니다.');
                return;
            }

            const roomId = `room_${++roomCount}`; // 새로운 방 생성
            s1.join(roomId); // 방에 참여
            s2.join(roomId);
            s1.data.roomId = roomId; // 소켓에 roomId 저장
            s2.data.roomId = roomId;

            rooms.set(roomId, { p1: s1.id, p2: s2.id, picks: new Map() }); // rooms에 정보 저장

            io.to(roomId).emit('match:ready', {
                roomId,
                players: [
                    { id: s1.id, nick: s1.data.nick || 'Guest' },
                    { id: s2.id, nick: s2.data.nick || 'Guest' }
                ]
            });

            // 매칭 완료 즉시 5라운드 자동 시작
            startMatch(roomId);
        }
    }

    // ======================
    //  승패 결정
    // ======================
    function resultOf(a, b) {
        if (a === 'none' && b === 'none') return Math.random() < 0.5 ? 1 : -1; // 둘 다 미선택 시 임의 패자
        if (a === 'none') return -1; // a 미선택
        if (b === 'none') return 1;  // b 미선택
        if (a === b) return Math.random() < 0.5 ? 1 : -1; // 무승부도 임의 승패
        if ((a==='rock'&&b==='scissors')||(a==='paper'&&b==='rock')||(a==='scissors'&&b==='paper')) return 1;
        return -1;
    }

    // ======================
    //  플레이어 선택 저장
    // ======================
    function receivePick(socket, hand) {
        const roomId = socket.data.roomId;
        if (!roomId || !rooms.has(roomId)) return;
        if (!['rock', 'paper', 'scissors'].includes(hand)) return;
        const room = rooms.get(roomId);
        if (room.roundTimer == null) return; // 라운드 진행 중이 아닐 경우 무시

        room.picks.set(socket.id, hand); // 선택 저장
        socket.to(roomId).emit('opponent:picked'); // 상대에게 알림

        const p1Pick = room.picks.get(room.p1);
        const p2Pick = room.picks.get(room.p2);
        if (p1Pick && p2Pick) decideRound(roomId); // 둘 다 제출 시 판정
    }

    // ======================
    //  방 종료
    // ======================
    function endRoom(roomId) {
        const room = rooms.get(roomId);
        if (!room) return;

        clearTimeout(room.roundTimer); // 타이머 정리

        for (const sid of [room.p1, room.p2]) {
            const s = io.sockets.sockets.get(sid);
            if (s) { 
                s.leave(roomId); 
                s.data.roomId = null; 
                // 🔹 게임 끝나면 userId 초기화 X, 기존 userId 유지, so 다른 계정 로그인 가능
            }
        }
        rooms.delete(roomId);
    }

    // ======================
    //  플레이어 퇴장/매칭취소
    // ======================
    function leave(socket) {
        const idx = queue.indexOf(socket.id);
        if (idx >= 0) queue.splice(idx, 1);

        const roomId = socket.data.roomId;
        if (roomId && rooms.has(roomId)) {
            const room = rooms.get(roomId);
            const oppId = room ? ((room.p1 === socket.id) ? room.p2 : room.p1) : null;

            // **게임 중 매칭 취소 이벤트 발송**
            io.to(roomId).emit('match:abort'); // 클라이언트에서 UI 초기화

            endRoom(roomId);

            if (oppId) {
                const opp = io.sockets.sockets.get(oppId);
                if (opp) opp.emit('system:info', '상대가 나갔습니다. 다시 매칭하세요.');
            }
        }
    }

    // ======================
    //  자동 라운드 엔진 + 러시안룰렛
    // ======================
    function startMatch(roomId) {
        const room = rooms.get(roomId);
        if (!room) return;

        room.round = 0;
        room.picks = new Map();
        room.bullet = Math.floor(Math.random() * 5); // 🔹 0~4 라운드 중 랜덤
        room.detonated = false;

        io.to(roomId).emit('roulette:plan', { total: 5 });
        nextRound(roomId);
    }

    function nextRound(roomId) {
        const room = rooms.get(roomId);
        if (!room) return;
        if (room.round >= 5) { endRoom(roomId); return; }

        room.picks = new Map();
        io.to(roomId).emit('round:start', {
            round: room.round + 1,
            deadline: Date.now() + 7000
        });

        clearTimeout(room.roundTimer);
        room.roundTimer = setTimeout(() => decideRound(roomId), 7000);
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
            round: room.round + 1
        });

        // 🔹 러시안룰렛: bullet 라운드에 터지면 MMR 적용
        if (room.round === room.bullet) {
            io.to(roomId).emit('roulette:bang', {
                roomId,
                round: room.round + 1,
                bulletRound: room.bullet + 1,
                winner,
                loser
            });
            applyRatingResult(winner, loser); // 🔹 MMR 자동 적용
            endRoom(roomId);
            return;
        }

        room.round += 1;
        setTimeout(() => nextRound(roomId), 800);
    }

    // ======================
    //  MMR 업데이트
    // ======================
    async function applyRatingResult(winnerSid, loserSid) {
        try {
            const winnerSocket = io.sockets.sockets.get(winnerSid);
            const loserSocket  = io.sockets.sockets.get(loserSid);
            const winnerUserId = winnerSocket?.data?.userId;
            const loserUserId  = loserSocket?.data?.userId;
            if (!winnerUserId || !loserUserId) return; // Guest는 MMR 적용 생략

            const winDelta = 50;
            const loseDelta = -50;

            // MMR 최소값 0, 기본값 1000 적용
            await pool.query( // [pool 사용]: server.js에서 전달받은 pool 객체 사용
                'UPDATE users SET mmr = GREATEST(0, COALESCE(mmr, 1000) + ?) WHERE id = ?',
                [winDelta, winnerUserId]
            );
            await pool.query( // [pool 사용]: server.js에서 전달받은 pool 객체 사용
                'UPDATE users SET mmr = GREATEST(0, COALESCE(mmr, 1000) + ?) WHERE id = ?',
                [loseDelta, loserUserId]
            );

            // 클라이언트에 알림
            winnerSocket?.emit('rating:update', { delta: winDelta });
            loserSocket?.emit('rating:update',  { delta: loseDelta });

        } catch (err) {
            console.error('MMR update error:', err);
        }
    }

    // ======================
    //  공개 API
    // ======================
    return { joinQueue, receivePick, leave };
}
