import 'dotenv/config';
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONN_LIMIT || 10),
  queueLimit: 0
});

/**
 * Promise 기반의 Pool에서 Connection을 획득하여 연결 성공/실패를 테스트합니다.
 * 이 코드는 파일을 불러올 때 즉시 실행됩니다.
 */
(async () => {
  let connection;
  try {
    // getConnection()은 Promise를 반환하므로 await으로 기다립니다.
    connection = await pool.getConnection(); 
    console.log("✅ MySQL 연결 성공!");
    
  } catch (err) {
    // 연결 시도 중 오류가 발생하면 (ex: 잘못된 비밀번호, 서버 다운 등)
    console.error("❌ MySQL 연결 실패:", err.message);
    
  } finally {
    // 연결을 받았으면 (connection 객체가 있으면) 반드시 Pool에 반환해야 합니다.
    if (connection) {
      connection.release(); 
    }
  }
})();

export default pool;