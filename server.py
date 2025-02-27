from flask import Flask, request, jsonify
from flask_socketio import SocketIO, emit
import os

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

# 환경변수에서 비밀번호 가져오기
ROOM_PASSWORD = os.getenv("ROOM_PASSWORD", "")

@app.route("/join-room", methods=["POST"])
def join_room():
    data = request.json
    entered_password = data.get("password")

    if entered_password == ROOM_PASSWORD:
        return jsonify({"message": "Access Granted"}), 200
    else:
        return jsonify({"message": "Access Denied"}), 403

# WebSocket 채팅
@socketio.on("message")
def handle_message(msg):
    emit("message", msg, broadcast=True)

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000)
