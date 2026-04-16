# --- START OF FILE app.py ---
from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room
from threading import Timer
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

def auto_delete_room(room_code):
    """Автоматически удаляет комнату, если учитель долго не возвращался"""
    if room_code in rooms:
        socketio.emit('room_closed', to=room_code)
        del rooms[room_code]
        print(f"Room {room_code} auto-deleted due to teacher inactivity.")

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
    rooms[room_code] = {'teacher_sid': request.sid, 'students': {}, 'timer': None}
    join_room(room_code)
    emit('room_created', {'room_code': room_code})

@socketio.on('rejoin_teacher')
def handle_rejoin_teacher(data):
    room_code = data.get('room_code')
    if room_code in rooms:
        room = rooms[room_code]
        room['teacher_sid'] = request.sid
        join_room(room_code)
        
        # Отменяем таймер авто-удаления, так как учитель вернулся
        if room['timer']:
            room['timer'].cancel()
            room['timer'] = None

        # Формируем список текущих учеников для восстановления интерфейса учителя
        students_data = []
        for name, student in room['students'].items():
            students_data.append({
                'name': name,
                'board_data': student['board_data'],
                'ready': student['ready']
            })
        emit('teacher_rejoined', {'room_code': room_code, 'students': students_data})
    else:
        emit('error', {'msg': 'Комната не найдена или была удалена', 'action': 'recreate'})

@socketio.on('delete_room')
def handle_delete_room(data):
    room_code = data.get('room_code')
    if room_code in rooms and rooms[room_code]['teacher_sid'] == request.sid:
        if rooms[room_code]['timer']:
            rooms[room_code]['timer'].cancel()
        emit('room_closed', to=room_code)
        del rooms[room_code]

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

@socketio.on('disconnect')
def handle_disconnect():
    # Проверяем, не отключился ли учитель
    for room_code, room in list(rooms.items()):
        if room['teacher_sid'] == request.sid:
            # Запускаем таймер на 5 минут (300 секунд)
            timer = Timer(300.0, auto_delete_room, args=[room_code])
            timer.start()
            room['timer'] = timer
            break

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=80, debug=True)