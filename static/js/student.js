// --- START OF FILE student.js ---
const socket = io();
let roomCode = '', studentName = '', isReady = false;

// --- Автовосстановление сессии ---
window.addEventListener('DOMContentLoaded', () => {
    const savedRoom = localStorage.getItem('mathRoom');
    const savedName = localStorage.getItem('mathName');

    if (savedName) document.getElementById('studentName').value = savedName;
    if (savedRoom && savedName) {
        document.getElementById('roomCode').value = savedRoom;
        document.getElementById('btnJoin').click(); 
    }
});

// --- Настройки холста ---
const VIRTUAL_WIDTH = 1600; 
const VIRTUAL_HEIGHT = 1000;
const viewport = document.getElementById('viewport');
const wrapper = document.getElementById('canvasWrapper');
const mainCanvas = document.getElementById('mainCanvas');
const draftCanvas = document.getElementById('draftCanvas');
const brushCursor = document.getElementById('brushCursor');
const ctx = mainCanvas.getContext('2d', { willReadFrequently: true });
const draftCtx = draftCanvas.getContext('2d');

wrapper.style.width = VIRTUAL_WIDTH + 'px';
wrapper.style.height = VIRTUAL_HEIGHT + 'px';
mainCanvas.width = draftCanvas.width = VIRTUAL_WIDTH;
mainCanvas.height = draftCanvas.height = VIRTUAL_HEIGHT;

let camScale = 1;
let camX = 0, camY = 0;
let currentBg = 'bg-grid';

function fitCanvasToScreen() {
    const padding = 20;
    const scaleX = (window.innerWidth - padding) / VIRTUAL_WIDTH;
    const scaleY = (window.innerHeight - padding) / VIRTUAL_HEIGHT;
    camScale = Math.min(scaleX, scaleY);
    
    camX = (window.innerWidth - (VIRTUAL_WIDTH * camScale)) / 2;
    camY = (window.innerHeight - (VIRTUAL_HEIGHT * camScale)) / 2;
    updateTransform();
}

let tool = 'pen', color = '#000000', size = 2, isDrawing = false;
let startPos = {x: 0, y: 0};
let history = []; 

function saveHistory() {
    history.push(mainCanvas.toDataURL('image/png'));
    if (history.length > 15) history.shift();
}
saveHistory(); 

function constrainPan() {
    const scaledW = VIRTUAL_WIDTH * camScale;
    const scaledH = VIRTUAL_HEIGHT * camScale;
    const margin = 100;

    if (scaledW < window.innerWidth) camX = (window.innerWidth - scaledW) / 2;
    else camX = Math.min(Math.max(camX, window.innerWidth - scaledW - margin), margin);

    if (scaledH < window.innerHeight) camY = (window.innerHeight - scaledH) / 2;
    else camY = Math.min(Math.max(camY, window.innerHeight - scaledH - margin), margin);
}

function updateTransform() {
    constrainPan();
    wrapper.style.transform = `translate(${camX}px, ${camY}px) scale(${camScale})`;
    updateCursorSize();
}
window.onresize = fitCanvasToScreen;

// --- Авторизация ---
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
    fitCanvasToScreen();
    checkOrientation();
    if(navigator.wakeLock) navigator.wakeLock.request('screen').catch(()=>{});
});

socket.on('restore_board', (data) => {
    if (data.board_data) {
        let img = new Image();
        img.onload = () => { 
            ctx.clearRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
            // ИСПРАВЛЕНИЕ: Растягиваем сжатую картинку на весь холст!
            ctx.drawImage(img, 0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT); 
            saveHistory(); 
        };
        img.src = data.board_data;
    }
});

function updateCursorSize() {
    brushCursor.style.width = (size * camScale * (tool === 'eraser' ? 10 : 1)) + 'px';
    brushCursor.style.height = (size * camScale * (tool === 'eraser' ? 10 : 1)) + 'px';
    brushCursor.style.backgroundColor = tool === 'eraser' ? 'rgba(255,255,255,0.8)' : color;
    brushCursor.style.borderColor = tool === 'eraser' ? '#000' : 'rgba(0,0,0,0.3)';
}

function moveCursor(e) {
    if(tool === 'hand' || e.touches) { brushCursor.style.display = 'none'; return; }
    brushCursor.style.display = 'block';
    brushCursor.style.left = e.clientX + 'px';
    brushCursor.style.top = e.clientY + 'px';
}
viewport.addEventListener('mousemove', moveCursor);
viewport.addEventListener('mouseleave', () => brushCursor.style.display = 'none');

function getBoardPos(e) {
    let clientX = e.touches ? e.touches[0].clientX : e.clientX;
    let clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - camX) / camScale, y: (clientY - camY) / camScale, cx: clientX, cy: clientY };
}

function startAction(e) {
    if (isReady || e.target.closest('.toolbar') || e.target.closest('.action-btn')) return;
    isDrawing = true;
    const pos = getBoardPos(e);
    startPos = pos;

    if (tool === 'pen' || tool === 'eraser') {
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(pos.x, pos.y);
        if (tool === 'eraser') {
            ctx.globalCompositeOperation = "destination-out";
            ctx.lineWidth = size * 10;
        } else {
            ctx.globalCompositeOperation = "source-over";
            ctx.strokeStyle = color;
            ctx.lineWidth = size;
        }
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
    }
}

function moveAction(e) {
    if(e.touches) brushCursor.style.display = 'none';
    if (!isDrawing || isReady) return;
    const pos = getBoardPos(e);

    if (tool === 'hand') {
        camX += (pos.cx - startPos.cx);
        camY += (pos.cy - startPos.cy);
        startPos.cx = pos.cx; startPos.cy = pos.cy;
        updateTransform();
    } 
    else if (tool === 'line') {
        draftCtx.clearRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
        draftCtx.beginPath();
        draftCtx.moveTo(startPos.x, startPos.y);
        draftCtx.lineTo(pos.x, pos.y);
        draftCtx.strokeStyle = color;
        draftCtx.lineWidth = size;
        draftCtx.lineCap = 'round';
        draftCtx.stroke();
    }
    else {
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
    }
}

function endAction(e) {
    if (!isDrawing || isReady) return;
    isDrawing = false;
    ctx.globalCompositeOperation = "source-over"; 
    
    if (tool === 'line') {
        ctx.drawImage(draftCanvas, 0, 0);
        draftCtx.clearRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
        sendUpdate();
    } else if (tool !== 'hand') {
        saveHistory();
        sendUpdate();
    }
}

viewport.addEventListener('mousedown', startAction);
viewport.addEventListener('mousemove', moveAction);
window.addEventListener('mouseup', endAction); 

viewport.addEventListener('touchstart', (e) => { if(e.target.id==='viewport' || e.target.tagName==='CANVAS') e.preventDefault(); startAction(e); }, {passive: false});
viewport.addEventListener('touchmove', (e) => { if(e.target.id==='viewport' || e.target.tagName==='CANVAS') e.preventDefault(); moveAction(e); }, {passive: false});
window.addEventListener('touchend', (e) => { endAction(e); });

function changeZoom(delta) {
    if(isReady) return;
    const oldScale = camScale;
    camScale = Math.min(Math.max(camScale + delta, 0.2), 3);
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    camX = cx - (cx - camX) * (camScale / oldScale);
    camY = cy - (cy - camY) * (camScale / oldScale);
    updateTransform();
}
document.getElementById('btnZoomIn').onclick = () => changeZoom(0.2);
document.getElementById('btnZoomOut').onclick = () => changeZoom(-0.2);

document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.onclick = () => {
        if(isReady) return;
        document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        tool = btn.dataset.tool;
        viewport.style.cursor = tool === 'hand' ? 'grab' : 'crosshair';
        updateCursorSize();
    }
});

document.querySelectorAll('.color-btn').forEach(btn => {
    btn.onclick = () => {
        if(isReady) return;
        document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        color = btn.dataset.color;
        if(tool === 'eraser' || tool === 'hand') document.querySelector('.tool-btn[data-tool="pen"]').click();
        updateCursorSize();
    }
});

document.querySelectorAll('.size-btn').forEach(btn => {
    btn.onclick = () => {
        if(isReady) return;
        document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        size = parseInt(btn.dataset.size);
        updateCursorSize();
    }
});

document.querySelectorAll('.tool-btn[data-bg]').forEach(btn => {
    btn.onclick = () => {
        if(isReady) return;
        document.querySelectorAll('.tool-btn[data-bg]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentBg = btn.dataset.bg;
        wrapper.className = currentBg;
        sendUpdate(); 
    }
});

document.getElementById('btnClear').onclick = () => {
    if(isReady) return;
    ctx.clearRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
    saveHistory();
    sendUpdate(); 
};

document.getElementById('btnUndo').onclick = () => {
    if(isReady || history.length <= 1) return;
    history.pop();
    let img = new Image();
    img.onload = () => {
        ctx.clearRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
        ctx.drawImage(img, 0, 0);
        sendUpdate(); 
    };
    img.src = history[history.length - 1];
};

function getExportImage(quality, scale = 1.0) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = VIRTUAL_WIDTH * scale; 
    tempCanvas.height = VIRTUAL_HEIGHT * scale;
    const tCtx = tempCanvas.getContext('2d');
    
    tCtx.scale(scale, scale);
    tCtx.fillStyle = '#ffffff';
    tCtx.fillRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
    
    if (currentBg === 'bg-grid') {
        tCtx.strokeStyle = '#cbd5e0'; tCtx.lineWidth = 1;
        for(let i=0; i<VIRTUAL_WIDTH; i+=80) { tCtx.beginPath(); tCtx.moveTo(i,0); tCtx.lineTo(i,VIRTUAL_HEIGHT); tCtx.stroke(); }
        for(let i=0; i<VIRTUAL_HEIGHT; i+=80) { tCtx.beginPath(); tCtx.moveTo(0,i); tCtx.lineTo(VIRTUAL_WIDTH,i); tCtx.stroke(); }
    } else if (currentBg === 'bg-lines') {
        tCtx.strokeStyle = '#cbd5e0'; tCtx.lineWidth = 1;
        for(let i=0; i<VIRTUAL_HEIGHT; i+=80) { tCtx.beginPath(); tCtx.moveTo(0,i); tCtx.lineTo(VIRTUAL_WIDTH,i); tCtx.stroke(); }
    }
    
    tCtx.drawImage(mainCanvas, 0, 0);
    return tempCanvas.toDataURL('image/jpeg', quality);
}

function sendUpdate(isFinal = false) {
    if (isReady && !isFinal) return; 
    const scale = isFinal ? 1.0 : 0.4;
    const quality = isFinal ? 0.7 : 0.5;

    socket.emit('draw_update', { 
        room_code: roomCode, 
        name: studentName, 
        board_data: getExportImage(quality, scale), 
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
            if (isReady) feedback.className = 'feedback-overlay feedback-locked';
            else feedback.className = 'feedback-overlay';
        }, duration);
    }
}

btnAnswer.onclick = () => {
    isReady = !isReady;
    brushCursor.style.display = 'none';
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
    ctx.clearRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
    draftCtx.clearRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
    history = []; saveHistory();
    sendUpdate(); 
});

// Если учитель нажал "Завершить урок" или комната удалилась сама
socket.on('room_closed', () => {
    alert("Учитель завершил урок.");
    localStorage.removeItem('mathRoom'); 
    location.reload(); 
});

socket.on('kicked', () => {
    localStorage.removeItem('mathRoom'); 
    location.reload(); 
});