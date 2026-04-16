// --- START OF FILE teacher.js ---
const socket = io();
let roomCode = '';

socket.on('connect', () => { 
    const savedRoom = localStorage.getItem('mathTeacherRoom');
    if (savedRoom) {
        socket.emit('rejoin_teacher', { room_code: savedRoom });
    } else {
        socket.emit('create_room'); 
    }
});

socket.on('room_created', (data) => {
    roomCode = data.room_code;
    localStorage.setItem('mathTeacherRoom', roomCode);
    setupTeacherUI();
});

socket.on('teacher_rejoined', (data) => {
    roomCode = data.room_code;
    setupTeacherUI();
    
    // Восстанавливаем карточки учеников
    document.getElementById('studentsGrid').innerHTML = '';
    data.students.forEach(student => {
        renderStudentCard(student);
    });
});

socket.on('error', (data) => {
    if (data.action === 'recreate') {
        localStorage.removeItem('mathTeacherRoom');
        socket.emit('create_room');
    }
});

function setupTeacherUI() {
    document.getElementById('roomCodeDisplay').innerText = roomCode;
    document.getElementById('btnNext').style.display = 'block';
    document.getElementById('btnEndLesson').style.display = 'block';
}

document.getElementById('btnEndLesson').onclick = () => {
    if (confirm("Вы уверены, что хотите завершить урок? Все доски учеников будут стерты, а комната удалена.")) {
        socket.emit('delete_room', { room_code: roomCode });
        localStorage.removeItem('mathTeacherRoom');
        location.href = '/';
    }
};

function renderStudentCard(data) {
    let grid = document.getElementById('studentsGrid');
    let cardId = `student-${data.name.replace(/\s+/g, '-')}`;
    let card = document.getElementById(cardId);

    if (!card) {
        card = document.createElement('div');
        card.className = 'student-card';
        card.id = cardId;
        card.innerHTML = `
            <div class="card-actions">
                <button class="btn btn-danger" onclick="reject('${data.name}')">❌</button>
                <button class="btn" style="background: #a0aec0; color:white;" onclick="kick('${data.name}')">Удалить</button>
            </div>
            <img class="board-thumb" id="thumb-${data.name}" src="${data.board_data || ''}">
            <h3 style="text-align:center; margin-top:10px; color:#2d3748;">${data.name}</h3>
        `;
        card.querySelector('.board-thumb').onclick = function() {
            document.getElementById('fullBoardImg').src = this.src;
            document.getElementById('boardModal').style.display = 'flex';
        };
        grid.appendChild(card);
    } else if(data.board_data) {
        document.getElementById(`thumb-${data.name}`).src = data.board_data;
    }
    
    if (data.ready) card.classList.add('ready');
    else card.classList.remove('ready');
}

socket.on('update_student', (data) => {
    renderStudentCard(data);
});

socket.on('board_updated', (data) => {
    let img = document.getElementById(`thumb-${data.name}`);
    if (img) img.src = data.board_data;
});

socket.on('student_ready', (data) => {
    let img = document.getElementById(`thumb-${data.name}`);
    if (img) img.src = data.board_data;
    let card = document.getElementById(`student-${data.name.replace(/\s+/g, '-')}`);
    if (card) card.classList.add('ready');
});

socket.on('student_unready', (data) => {
    let card = document.getElementById(`student-${data.name.replace(/\s+/g, '-')}`);
    if (card) card.classList.remove('ready');
});

document.getElementById('btnNext').onclick = () => {
    socket.emit('next_task', {room_code: roomCode});
    document.querySelectorAll('.student-card').forEach(c => c.classList.remove('ready'));
};

function reject(name) {
    socket.emit('reject_answer', {room_code: roomCode, name: name});
    document.getElementById(`student-${name.replace(/\s+/g, '-')}`).classList.remove('ready');
}

function kick(name) {
    if(confirm(`Удалить ${name}?`)) {
        socket.emit('kick_student', {room_code: roomCode, name: name});
        document.getElementById(`student-${name.replace(/\s+/g, '-')}`).remove();
    }
}