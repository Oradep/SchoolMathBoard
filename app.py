# --- START OF FILE app.py ---
from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room
import random

app = Flask(__name__)
app.config['SECRET_KEY'] = 'super-secret-key'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

rooms = {}

def generate_room_code():
    while True:
        code = str(random.randint(1000, 9999))
        if code not in rooms:
            return code

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/teacher')
def teacher_view():
    return render_template('teacher.html')

@app.route('/student')
def student_view():
    return render_template('student.html')

@socketio.on('create_room')
def handle_create_room():
    room_code = generate_room_code()
    rooms[room_code] = {'teacher_sid': request.sid, 'students': {}}
    join_room(room_code)
    emit('room_created', {'room_code': room_code})

@socketio.on('join_student')
def handle_join_student(data):
    room_code = data.get('room_code')
    name = data.get('name')
    if room_code not in rooms:
        emit('error', {'msg': 'Комната не найдена'})
        return

    room = rooms[room_code]
    if name in room['students']:
        student = room['students'][name]
        student['sid'] = request.sid
        emit('restore_board', {'board_data': student['board_data']})
    else:
        room['students'][name] = {'sid': request.sid, 'board_data': None, 'ready': False}
    
    join_room(room_code)
    emit('update_student', {
        'name': name, 
        'board_data': room['students'][name]['board_data'], 
        'ready': room['students'][name]['ready']
    }, to=room['teacher_sid'])
    emit('join_success')

@socketio.on('draw_update')
def handle_draw_update(data):
    room_code = data['room_code']
    name = data['name']
    if room_code in rooms and name in rooms[room_code]['students']:
        rooms[room_code]['students'][name]['board_data'] = data['board_data']
        if data.get('is_final'):
            rooms[room_code]['students'][name]['ready'] = True
            emit('student_ready', {'name': name, 'board_data': data['board_data']}, to=rooms[room_code]['teacher_sid'])
        else:
            emit('board_updated', {'name': name, 'board_data': data['board_data']}, to=rooms[room_code]['teacher_sid'])

@socketio.on('cancel_answer')
def handle_cancel_answer(data):
    room_code = data['room_code']
    name = data['name']
    if room_code in rooms and name in rooms[room_code]['students']:
        rooms[room_code]['students'][name]['ready'] = False
        emit('student_unready', {'name': name}, to=rooms[room_code]['teacher_sid'])

@socketio.on('reject_answer')
def handle_reject_answer(data):
    room_code = data['room_code']
    name = data['name']
    if room_code in rooms and name in rooms[room_code]['students']:
        rooms[room_code]['students'][name]['ready'] = False
        emit('answer_rejected', to=rooms[room_code]['students'][name]['sid'])

@socketio.on('next_task')
def handle_next_task(data):
    room_code = data['room_code']
    if room_code in rooms:
        for name, student in rooms[room_code]['students'].items():
            student['ready'] = False
        emit('task_next', to=room_code)

@socketio.on('kick_student')
def handle_kick(data):
    room_code = data['room_code']
    name = data['name']
    if room_code in rooms and name in rooms[room_code]['students']:
        emit('kicked', to=rooms[room_code]['students'][name]['sid'])
        del rooms[room_code]['students'][name]

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=80, debug=True)