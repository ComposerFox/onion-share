const express = require('express');
const multer = require('multer');
const WebSocket = require('ws');
const { exec } = require('child_process');
const bodyParser = require('body-parser');
require('dotenv').config();
const fs = require('fs');

const app = express();
const wss = new WebSocket.Server({ noServer: true });
const port = 3000;

const rooms = {}; // 방 정보 저장

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public')); // 정적 파일 서빙

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

    const torCommand = `docker run -d --name ${roomName} -e ROOM_PASSWORD=${password} tor-image`;
    exec(torCommand, (error, stdout, stderr) => {
        if (error) return res.status(500).send('Failed to create room');

        const containerId = stdout.trim();
        const onionLink = `http://${containerId}.onion`;
        rooms[roomName] = { containerId, onionLink, password };

        res.json({ roomName, onionLink });
    });
});

// ✅ 방 입장 요청 처리 (비밀번호 검증)
app.post('/join-room', (req, res) => {
    const { roomName, password } = req.body;

    if (!rooms[roomName]) return res.status(404).send('Room not found');
    if (rooms[roomName].password !== password) return res.status(403).send('Incorrect password');

    res.json({ success: true, roomName, onionLink: rooms[roomName].onionLink });
});

// ✅ 방 삭제 요청 처리
app.post('/delete-room', (req, res) => {
    const { roomName } = req.body;
    if (!rooms[roomName]) return res.status(404).send('Room not found');

    const containerId = rooms[roomName].containerId;
    exec(`docker stop ${containerId} && docker rm ${containerId}`, (error, stdout, stderr) => {
        if (error) return res.status(500).send('Failed to delete room');

        const roomDir = `./uploads/${roomName}`;
        if (fs.existsSync(roomDir)) fs.rmSync(roomDir, { recursive: true, force: true });

        delete rooms[roomName];
        res.send('Room deleted successfully');
    });
});

// ✅ WebSocket 연결 처리 (실시간 채팅)
wss.on('connection', ws => {
    ws.on('message', message => {
        wss.clients.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    });
});

// ✅ 서버 실행
app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${port}`);
});
