import 'dotenv/config';// .env파일을 자동으로 읽어서  process.env에 넣어주는 설정
import express from 'express'; // 노드js의 웹프레임워크 http요청응답을 편하게 다뤄줌 ex)app.get
import http from 'http'; // express는 앱로직 http는 진짜 서버소켓
import { Server } from 'socket.io'; // 브라우저와 실시간으로 데이터를 주고받기위해씀
import path from 'path'; // 경로 관련 도우미
import { fileURLToPath } from 'url'; // es모듈에서 __dirname이 없기때문에 현재 파일 경로 알아내기
import { createMatchMaker } from './matchmaking.js'; // 서버부터보는거 맞아? 딴대서 가져오는데?

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);//dirname은 현재 파일경로

const app = express(); //웹서버의 중심객체

// EJS 설정
app.set('view engine', 'ejs');//환경설정 메서드 렌더링방식은 ejs쓸거야~
app.set('views', path.join(__dirname, '..', 'views'));//views  ejs파일이 있는 폴더를 지정

// 정적 파일
app.use(express.static(path.join(__dirname, 'public')));
// /public폴더안에 파일을 브라우저에서 바로접근할수있게함
//express.static 정적 리소스 제공기 
//use 미들웨어

// 라우팅: 메인 페이지 렌더
app.get('/', (req, res) => {
  res.render('index', {
    title: '안내면 진다 가위바위보'
  });
});// es.render()는 views/index.ejs를 렌더링해서 HTML로 바꿔줌.

const server = http.createServer(app); // server는 실제 http서버
const io = new Server(server); // 그위에 실시간 소켓io서버를 덧붙이는거임

const matchMaker = createMatchMaker(io); // 실제 게임 로직을 담당

io.on('connection', (socket) => {
  console.log('connected:', socket.id);//  누군가 브라우저에서 들어오면 자동호출
                                         //socket.id 클라이언트 하나당 부여된 id
  socket.on('set_nick', (nick) => {
    socket.data.nick = String(nick || '').slice(0, 16) || 'Player';// slice(0,16) 은 16자 제한,1||0 은 1이니까  빈문자열이면 player 반환
  }); 

  socket.on('leave_game', () => {
    matchMaker.leave(socket); //  수동으로 방 나가기 처리
  });
  socket.on('chat:send', (msg) => {
  const roomId = socket.data.roomId;
  const text = String(msg ?? '').slice(0, 300);
  if (!text) return;

  if (!roomId) {
    // 매칭 전엔 방이 없어서 브로드캐스트가 안 됩니다.
    socket.emit('system:info', '매칭이 된 후 채팅할 수 있어요.');
    return;
  }

  const nick = socket.data.nick || 'Player';
  const payload = { id: socket.id, nick, msg: text, ts: Date.now() };
  io.to(roomId).emit('chat:message', payload);
  });

  socket.on('join_queue', () => matchMaker.joinQueue(socket)); // 게임할래요 매칭큐넣기

  socket.on('pick', (hand) => matchMaker.receivePick(socket, hand)); // 가위바위보중에 냈다 -> 매칭된 상대와 결과 계산

  socket.on('disconnect', () => {
    matchMaker.leave(socket);//  접속 종료시 -> 큐에서 제거하고 정리
    console.log('❌ disconnected:', socket.id);
  });//disconnect는 내장 이벤트 클라우저가 접속을끊으면 자동실행
});

const PORT = Number(process.env.WEB_PORT || 3000); //.env 웹포트에 있는값 사용하고 없으면 3000
server.listen(PORT, () => console.log(`✅ http://localhost:${PORT}`)); //클라이언트 받을준비
