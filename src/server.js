import 'dotenv/config'; // .env파일을 자동으로 읽어서 process.env에 넣어주는 설정
import express from 'express'; // 노드js의 웹프레임워크 http요청응답을 편하게 다루기 위해
import http from 'http'; // express는 앱로직, http는 진짜 서버소켓
import { Server } from 'socket.io'; // 브라우저와 실시간 데이터를 주고받기 위해
import path from 'path'; // 경로 관련 도우미
import { fileURLToPath } from 'url'; // es모듈에서 __dirname이 없기 때문에 현재 파일 경로 알아내기
import { createMatchMaker } from './matchmaking.js'; // 게임/매칭 로직 모듈
import authRouter from '../routes/authRoutes.js';
import session from 'express-session';
import mysql from 'mysql2/promise'; // MySQL 연동

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename); // __dirname은 현재 파일 경로

const app = express(); // 웹서버의 중심 객체

// EJS 설정
app.set('view engine', 'ejs'); // 렌더링 방식 ejs 사용
app.set('views', path.join(__dirname, '..', 'views')); // views 폴더 지정

app.use(express.urlencoded({ extended: false }));

// 세션
app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 1000 * 60 * 60,
        },
    })
);

// req.session.user가 모든 EJS에서 접근 가능하도록 설정
app.use((req, res, next) => {
    res.locals.currentUser = req.session ? req.session.user || null : null;
    next();
});

// 정적 파일
app.use(express.static(path.join(__dirname, 'public'))); 
// /public 폴더 안 파일을 브라우저에서 바로 접근 가능

// 라우팅: 메인 페이지 렌더
app.get('/', (req, res) => {
    res.render('index', {
        title: '안내면 진다 가위바위보',
        currentUser: req.session ? req.session.user || null : null,
    });
});

app.use(authRouter);

// ======================
// MySQL DB 연결
// ======================
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});

const server = http.createServer(app); // 실제 http 서버
const io = new Server(server); // 실시간 소켓 io 서버

// [수정된 부분]: createMatchMaker 함수에 io와 db 객체 모두 전달
const matchMaker = createMatchMaker(io, db); // 실제 게임 로직 담당

io.on('connection', (socket) => {
    console.log('connected:', socket.id); // 누군가 브라우저에서 들어오면 자동 호출

    // =====================
    // 닉네임 설정
    // =====================
    socket.on('set_nick', (nick) => {
        socket.data.nick = String(nick || '').slice(0, 16) || 'Guest';
    });

    // =====================
    // 로그인 정보
    // =====================
    socket.on('login_info', ({ userId, nickname }) => {
        // 🚨 핵심: 소켓 단위 고유화하여 기존 세션 덮어쓰기 방지
        const myUid = userId ?? null;
        socket.data.userId = myUid; // DB userId와 매칭
        socket.data.nick = nickname || 'Guest';  // 닉네임 저장

        // 같은 계정 중복 접속 시 기존 소켓 강제 종료
        if (myUid != null) {
            const dupSocket = Array.from(io.sockets.sockets.values()).find(
                s => s.data.userId === myUid && s.id !== socket.id
            );
            if (dupSocket) {
                dupSocket.emit('system:info', '다른 브라우저에서 로그인되어 기존 연결이 종료됩니다.');
                matchMaker.leave(dupSocket);        // 기존 소켓 큐/방에서 제거
                dupSocket.disconnect();             // 소켓 종료
            }
        }
    });

    // =====================
    // 게임 나가기
    // =====================
    socket.on('leave_game', () => {
        matchMaker.leave(socket); // 수동으로 방 나가기 처리
    });

    // =====================
    // 채팅
    // =====================
    socket.on('chat:send', (msg) => {
        const roomId = socket.data.roomId;
        const text = String(msg ?? '').slice(0, 300);
        if (!text) return;

        if (!roomId) {
            socket.emit('system:info', '매칭이 된 후 채팅할 수 있어요.');
            return;
        }

        const nick = socket.data.nick || 'Player';
        const payload = { id: socket.id, nick, msg: text, ts: Date.now() };

        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[${new Date().toLocaleString('ko-KR', { hour12: false })}] CHAT
• Room   : ${roomId}
• From   : ${payload.nick} (${payload.id})
• Message: ${payload.msg}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

        io.to(roomId).emit('chat:message', payload);
    });

    // =====================
    // 매칭 시작
    // =====================
    socket.on('join_queue', () => matchMaker.joinQueue(socket));

    // =====================
    // 손 선택
    // =====================
    socket.on('pick', (hand) => matchMaker.receivePick(socket, hand));

    // =====================
    // 매칭 취소
    // =====================
    socket.on('leave_queue', () => {
        matchMaker.leave(socket);           // 큐/방에서 제거
        socket.emit('queue:left');          // 클라이언트에 알림
    });

    // =====================
    // 접속 종료
    // =====================
    socket.on('disconnect', () => {
        matchMaker.leave(socket); // 접속 종료 시 큐/방 정리
        console.log('❌ disconnected:', socket.id);
    });

    // =====================
    // MMR 업데이트 이벤트
    // =====================
    socket.on('rating:update', async ({ delta }) => {
        const userId = socket.data.userId;
        if (!userId) return;

        try {
            // DB에서 기존 MMR 조회
            const [rows] = await db.query('SELECT mmr FROM users WHERE id = ?', [userId]);
            let currentMMR = rows[0] ? rows[0].mmr : 1000; // MMR 없으면 기본값 1000

            let newMMR = currentMMR + delta;
            newMMR = Math.max(0, newMMR); // 최소값 0

            if (rows[0]) {
                // 기존 유저: 업데이트
                await db.query('UPDATE users SET mmr = ? WHERE id = ?', [newMMR, userId]);
            } else {
                // 새 유저: INSERT
                await db.query('INSERT INTO users (id, mmr) VALUES (?, ?)', [userId, newMMR]);
            }

            console.log(`MMR 변화: ${delta > 0 ? '+' : ''}${delta} | User: ${userId} | New MMR: ${newMMR}`);

            // 클라이언트에 즉시 반영
            socket.emit('rating:updated', { delta, newMMR });
        } catch (err) {
            console.error('MMR 업데이트 오류:', err);
        }
    });

});

const PORT = Number(process.env.WEB_PORT || 3000);
server.listen(PORT, () => console.log(`✅ http://localhost:${PORT}`));
