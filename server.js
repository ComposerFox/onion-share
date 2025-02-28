const express = require('express');
const multer = require('multer');
const WebSocket = require('ws');
const { exec } = require('child_process');
const bodyParser = require('body-parser');
const { createProxyMiddleware } = require('http-proxy-middleware');
require('dotenv').config();
const fs = require('fs');

const app = express();
const port = 3000;

const axios = require('axios'); // Flask API 호출을 위해 axios 추가

const rooms = {}; // 방 정보 저장

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public')); // 정적 파일 서빙

// ✅ 동적 WebSocket 프록시 설정 (각 방의 포트에 맞게 자동 연결)
app.use('/ws/:roomName', (req, res, next) => {
    const { roomName } = req.params;
    if (!rooms[roomName]) {
        return res.status(404).json({ error: 'Room not found' });
    }

    const targetPort = rooms[roomName].port; // 해당 방의 WebSocket 포트
    createProxyMiddleware({
        target: `http://127.0.0.1:${targetPort}`,
        ws: true,
        changeOrigin: true
    })(req, res, next);
});

// 파일 업로드 설정
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = `./uploads/${req.body.roomName}`;
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage: storage });

// ✅ 방 생성 요청 처리
app.post('/create-room', (req, res) => {
    const { roomName, password } = req.body;

    const roomPort = Math.floor(5000 + Math.random() * 1000);  // 5000~5999 범위에서 랜덤 포트 생성
    const torCommand = `docker run -d --name ${roomName} -e ROOM_PASSWORD=${password} -p ${roomPort}:5000 tor-image`;
    
    exec(torCommand, (error, stdout, stderr) => {
        if (error) return res.status(500).send('Failed to create room');

        const containerId = stdout.trim();
        const onionLink = `http://${containerId}.onion:${roomPort}`;
        rooms[roomName] = { containerId, onionLink, port: roomPort };

        res.json({ roomName, onionLink, websocketUrl: `ws://127.0.0.1:3000/ws/${roomName}` }); // WebSocket 주소 반환
    });
});

// ✅ 방 입장 요청 처리 (비밀번호 검증)
app.post('/join-room', async (req, res) => {
    const { roomName, password } = req.body;

    if (!rooms[roomName]) {
        return res.status(404).json({ error: 'Room not found' });
    }

    const targetPort = rooms[roomName].port; // 해당 방의 Flask 서버 포트

    try {
        // ✅ Flask 서버에 비밀번호 검증 요청
        const response = await axios.post(`http://127.0.0.1:${targetPort}/join-room`, { password });

        if (response.status === 200) {
            res.json({ success: true, roomName, onionLink: rooms[roomName].onionLink, websocketUrl: `ws://127.0.0.1:3000/ws/${roomName}` });
        } else {
            res.status(403).json({ error: 'Incorrect password' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to connect to room' });
    }
});

// ✅ 방 삭제 요청 처리
app.post('/delete-room', (req, res) => {
    const { roomName } = req.body;
    if (!rooms[roomName]) return res.status(404).json({ error: 'Room not found' });

    const containerId = rooms[roomName].containerId;
    exec(`docker stop ${containerId} && docker rm ${containerId}`, (error, stdout, stderr) => {
        if (error) return res.status(500).send('Failed to delete room');

        const roomDir = `./uploads/${roomName}`;
        if (fs.existsSync(roomDir)) fs.rmSync(roomDir, { recursive: true, force: true });

        delete rooms[roomName];
        res.send('Room deleted successfully');
    });
});

// ✅ 서버 실행
app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${port}`);
});
