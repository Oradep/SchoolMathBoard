// --- START OF FILE static/js/student.js ---
const socket = io();
let roomCode = '', studentName = '', isReady = false, isServerFrozen = false;
let board;
let updateTimer = null; // Таймер для оптимизации нагрузки

window.addEventListener('DOMContentLoaded', () => {
    const savedRoom = localStorage.getItem('mathRoom');
    const savedName = localStorage.getItem('mathName');

    if (savedName) document.getElementById('studentName').value = savedName;
    if (savedRoom && savedName) {
        document.getElementById('roomCode').value = savedRoom;
        document.getElementById('btnJoin').click(); 
    }
});

function initBoard() {
    board = new Whiteboard({
        viewportId: 'viewport',
        wrapperId: 'canvasWrapper',
        mainCanvasId: 'mainCanvas',
        draftCanvasId: 'draftCanvas',
        cursorId: 'brushCursor',
        onUpdate: () => {
            // DEBOUNCE: Ждем 800мс после последней линии перед отправкой.
            // Это СНИЖАЕТ нагрузку на Wi-Fi на 80-90%.
            clearTimeout(updateTimer);
            updateTimer = setTimeout(() => sendUpdate(false), 800);
        }
    });
    board.bindToolbarUI('studentUI');
}

document.getElementById('btnJoin').onclick = () => {
    roomCode = document.getElementById('roomCode').value.trim();
    studentName = document.getElementById('studentName').value.trim();
    
    if (roomCode.length > 0 && studentName.length > 0) {
        const btn = document.getElementById('btnJoin');
        btn.innerText = 'Подключение...';
        socket.emit('join_student', { room_code: roomCode, name: studentName });
        setTimeout(() => { if(!isReady) btn.innerText = 'Войти'; }, 2000);
    } else {
        alert("Пожалуйста, заполните код комнаты и Ваше имя.");
    }
};

socket.on('error', (data) => {
    alert("Ошибка: " + data.msg);
    document.getElementById('btnJoin').innerText = 'Войти';
    localStorage.removeItem('mathRoom'); 
    document.getElementById('roomCode').value = ''; 
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('workScreen').style.display = 'none';
});

socket.on('join_success', () => {
    localStorage.setItem('mathRoom', roomCode);
    localStorage.setItem('mathName', studentName);

    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('workScreen').style.display = 'block';
    document.body.classList.add('no-gestures');
    
    initBoard();
    checkOrientation();
    if(navigator.wakeLock) navigator.wakeLock.request('screen').catch(()=>{});
});

socket.on('restore_board', (data) => board.loadImage(data.board_data));
socket.on('force_update_board', (data) => board.loadImage(data.board_data, true));

function sendUpdate(isFinal = false) {
    if (isReady && !isFinal) return; 
    clearTimeout(updateTimer); // Если нажали "Ответить", отправляем мгновенно
    
    // Для живого превью масштаб 0.5 (картинка весит 2-5 КБ), для итогового - 1.0
    const scale = isFinal ? 1.0 : 0.5;
    const finalData = board.getExportImage('image/png', 1.0, scale, false);

    socket.emit('draw_update', { 
        room_code: roomCode, 
        name: studentName, 
        board_data: finalData, 
        is_final: isFinal 
    });
}

const btnAnswer = document.getElementById('btnAnswer');
const feedback = document.getElementById('feedback');
let fbTimeout;

function showFeedback(type, duration = 3000) {
    clearTimeout(fbTimeout);
    feedback.className = `feedback-overlay ${type}`;
    if (duration) {
        fbTimeout = setTimeout(() => {
            if (isReady || isServerFrozen) feedback.className = 'feedback-overlay feedback-locked';
            else feedback.className = 'feedback-overlay';
        }, duration);
    }
}

btnAnswer.onclick = () => {
    if(isServerFrozen) return; 
    isReady = !isReady;
    document.getElementById('brushCursor').style.display = 'none';
    board.isLocked = isReady;

    if (isReady) {
        btnAnswer.innerText = 'Изменить ответ';
        btnAnswer.style.background = 'var(--danger)';
        document.querySelectorAll('.toolbar').forEach(el => el.style.opacity = '0.4');
        showFeedback('feedback-locked', 0); 
        sendUpdate(true); 
    } else {
        btnAnswer.innerText = 'Ответить';
        btnAnswer.style.background = 'var(--success)';
        document.querySelectorAll('.toolbar').forEach(el => el.style.opacity = '1');
        showFeedback('');
        socket.emit('cancel_answer', { room_code: roomCode, name: studentName });
    }
};

function checkOrientation() {
    const overlay = document.getElementById('orientationOverlay');
    const workScreen = document.getElementById('workScreen');
    const isWorking = workScreen.style.display === 'block';
    const isPortrait = window.innerHeight > window.innerWidth;
    
    if (isWorking && isPortrait && !sessionStorage.getItem('orientationDismissed')) overlay.style.display = 'flex';
    else overlay.style.display = 'none';
}
window.addEventListener('resize', checkOrientation);

document.getElementById('btnDismissOrientation').onclick = () => {
    sessionStorage.setItem('orientationDismissed', 'true');
    checkOrientation();
};

socket.on('answer_rejected', () => { if(isReady) btnAnswer.click(); showFeedback('feedback-red'); });

socket.on('task_next', () => { 
    if(isReady) btnAnswer.click(); 
    showFeedback('feedback-green'); 
    board.history = [];
    board.clear();
});

socket.on('freeze_board', (data) => {
    isServerFrozen = data.is_frozen;
    board.isLocked = isServerFrozen || isReady;
    
    if(isServerFrozen) {
        showFeedback('feedback-locked', 0);
        document.querySelectorAll('.toolbar').forEach(el => el.style.opacity = '0.4');
        btnAnswer.style.opacity = '0.4';
    } else {
        if(!isReady) {
            showFeedback('');
            document.querySelectorAll('.toolbar').forEach(el => el.style.opacity = '1');
            btnAnswer.style.opacity = '1';
        }
    }
});

socket.on('room_closed', () => {
    alert("Учитель завершил урок.");
    localStorage.removeItem('mathRoom'); 
    location.reload(); 
});

socket.on('kicked', () => {
    localStorage.removeItem('mathRoom'); 
    location.reload(); 
});