FROM python:3.9

WORKDIR /app

COPY server.py /app/
RUN pip install flask flask_socketio eventlet

ENV ROOM_PASSWORD=""

CMD ["python", "server.py"]
