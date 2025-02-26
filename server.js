const express = require('express');
const multer = require('multer');
const WebSocket = require('ws');
const { exec } = require('child_process');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const wss = new WebSocket.Server({ noServer: true });
const port = 3000;

// 미들웨어 설정
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// 파일 업로드 설정
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, './uploads/'),
    filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage: storage });

// WebSocket 연결 처리 (실시간 채팅)
const connections = [];
wss.on('connection', ws => {
    connections.push(ws);

    ws.on('message', message => {
        connections.forEach(connection => {
            if (connection !== ws) connection.send(message);
        });
    });

    ws.on('close', () => {
        const index = connections.indexOf(ws);
        if (index !== -1) connections.splice(index, 1);
    });
});

// 방 생성 요청 처리
app.post('/create-room', (req, res) => {
    const { roomName, password } = req.body; // 클라이언트가 입력한 방 이름과 패스워드

    // Docker 컨테이너 실행 명령어에 패스워드를 전달하여 환경 설정
    const torCommand = `docker run -d --name ${roomName} -e ROOM_PASSWORD=${password} tor-image`;
    exec(torCommand, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error: ${stderr}`);
            return res.status(500).send('Failed to create room');
        }

        // 생성된 .onion 주소
        const onionLink = `http://${stdout.trim()}.onion`;
        res.json({ roomName, onionLink, password });
    });
});

// 파일 업로드 처리 라우트
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded.');
    res.send(`File uploaded successfully! <br> Download link: /uploads/${req.file.filename}`);
});

// 기본 라우트
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head><title>OnionShare - File & Chat</title></head>
            <body>
                <h1>OnionShare</h1>
                <form action="/create-room" method="POST">
                    <label for="roomName">Enter Room Name:</label>
                    <input type="text" id="roomName" name="roomName">
                    <label for="password">Set a Password:</label>
                    <input type="password" id="password" name="password">
                    <button type="submit">Create Room</button>
                </form>
            </body>
        </html>
    `);
});

// WebSocket 연결을 처리할 HTTP 서버와 연결
app.server = app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${port}`);
});

app.server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, ws => {
        wss.emit('connection', ws, request);
    });
});
