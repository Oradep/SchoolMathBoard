// --- START OF FILE static/js/teacher.js ---
const socket = io();
let roomCode = '';
let isFrozen = false;
let currentModalStudent = null;
let tBoard = null;
let tUpdateTimer = null; // Таймер оптимизации для учителя

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
    document.getElementById('headerActions').style.display = 'flex';

    tBoard = new Whiteboard({
        viewportId: 'tViewport',
        wrapperId: 'tWrapper',
        mainCanvasId: 'tMainCanvas',
        draftCanvasId: 'tDraftCanvas',
        cursorId: 'tCursor',
        defaultColor: '#e53e3e', // Красный маркер
        defaultSize: 4,
        onUpdate: () => {
            // Оптимизация сети: отправляем исправления с задержкой 800мс
            clearTimeout(tUpdateTimer);
            tUpdateTimer = setTimeout(() => sendCorrectionToStudent(), 800);
        }
    });
    tBoard.bindToolbarUI('teacherUI');
}

function sendCorrectionToStudent() {
    if(!currentModalStudent || !tBoard) return;
    const finalData = tBoard.getExportImage('image/png', 1.0, 1.0, false);
    socket.emit('teacher_correction', {
        room_code: roomCode,
        name: currentModalStudent,
        board_data: finalData
    });
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
                <button class="kebab-btn" style="color: var(--danger); font-size: 16px; border:none;" onclick="reject('${data.name}')" title="Отклонить ответ">❌</button>
                <div class="dropdown">
                    <button class="kebab-btn">⋮</button>
                    <div class="dropdown-content">
                        <button onclick="kick('${data.name}')">🗑 Удалить ученика</button>
                    </div>
                </div>
            </div>
            <div class="board-thumb-container">
                <img class="board-thumb" id="thumb-${data.name}" src="${data.board_data || ''}">
            </div>
            <h3 style="text-align:center; margin-top:10px; color:#2d3748;">${data.name}</h3>
        `;
        card.querySelector('.board-thumb-container').onclick = function() {
            openInteractiveCheck(data.name, card.querySelector('.board-thumb').src);
        };
        grid.appendChild(card);
    } else if(data.board_data) {
        document.getElementById(`thumb-${data.name}`).src = data.board_data;
    }
    
    if (data.ready) card.classList.add('ready');
    else card.classList.remove('ready');
}

socket.on('update_student', (data) => renderStudentCard(data));

socket.on('board_updated', (data) => {
    let img = document.getElementById(`thumb-${data.name}`);
    if (img) img.src = data.board_data;
    
    if (currentModalStudent === data.name && tBoard && !tBoard.isDrawing) {
        tBoard.loadImage(data.board_data, true);
    }
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

document.getElementById('btnFreeze').onclick = function() {
    isFrozen = !isFrozen;
    socket.emit('toggle_freeze', {room_code: roomCode, is_frozen: isFrozen});
    this.innerHTML = isFrozen ? '❄️ Разморозить' : '❄️ Заморозить';
    this.classList.toggle('btn-primary');
    this.classList.toggle('btn-outline');
};

function reject(name) {
    socket.emit('reject_answer', {room_code: roomCode, name: name});
    document.getElementById(`student-${name.replace(/\s+/g, '-')}`).classList.remove('ready');
}

function kick(name) {
    if(confirm(`Точно удалить ученика: ${name}?`)) {
        socket.emit('kick_student', {room_code: roomCode, name: name});
        document.getElementById(`student-${name.replace(/\s+/g, '-')}`).remove();
    }
}

// === КРАСИВЫЙ ЭКСПОРТ В PDF ===
document.getElementById('btnExportPDF').onclick = async function() {
    const btn = this;
    const cards = document.querySelectorAll('.student-card');
    if (cards.length === 0) {
        alert("Нет досок для скачивания.");
        return;
    }

    btn.innerText = '⏳ Сохраняем...';
    btn.disabled = true;

    const container = document.createElement('div');
    container.style.width = '800px'; 
    container.style.padding = '40px';
    container.style.background = '#ffffff';
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

    container.innerHTML = `
        <div style="border-bottom: 3px solid #4299e1; padding-bottom: 10px; margin-bottom: 30px;">
            <h1 style="color: #2d3748; margin: 0; font-size: 32px;">Отчет по уроку</h1>
            <p style="color: #718096; margin: 5px 0 0 0; font-size: 18px;">Код комнаты: <b style="color: #4299e1;">${roomCode}</b></p>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;" id="pdfGrid"></div>
    `;

    const pdfGrid = container.querySelector('#pdfGrid');

    cards.forEach(card => {
        let name = card.querySelector('h3').innerText;
        let imgSrc = card.querySelector('img').src;
        if (imgSrc && imgSrc.startsWith('data:image')) {
            // В PDF убран фон сетки. Только белая карточка и линии ученика.
            pdfGrid.innerHTML += `
                <div style="border: 2px solid #e2e8f0; border-radius: 12px; padding: 15px; background: #f8fafc; text-align: center;">
                    <div style="width: 100%; height: 220px; border-radius: 8px; border: 1px solid #cbd5e0; margin-bottom: 10px; position: relative; overflow: hidden; background: #fff;">
                        <img src="${imgSrc}" style="width: 100%; height: 100%; object-fit: contain; position: absolute; top: 0; left: 0;">
                    </div>
                    <h3 style="margin: 0; color: #2d3748; font-size: 18px;">${name}</h3>
                </div>
            `;
        }
    });

    document.body.appendChild(container);

    try {
        const { jsPDF } = window.jspdf;
        const canvas = await html2canvas(container, { scale: 2, useCORS: true });
        const imgData = canvas.toDataURL('image/jpeg', 0.9);
        
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

        let heightLeft = pdfHeight;
        let position = 0;

        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
        heightLeft -= pdf.internal.pageSize.getHeight();

        while (heightLeft > 0) {
            position = heightLeft - pdfHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
            heightLeft -= pdf.internal.pageSize.getHeight();
        }

        pdf.save(`Урок_${roomCode}.pdf`);
    } catch (e) {
        console.error("Ошибка генерации PDF:", e);
        alert("Произошла ошибка при создании PDF.");
    } finally {
        document.body.removeChild(container);
        btn.innerText = '📥 Скачать PDF';
        btn.disabled = false;
    }
};

function openInteractiveCheck(name, imgSrc) {
    currentModalStudent = name;
    document.getElementById('boardModal').style.display = 'flex';
    if(tBoard) {
        tBoard.history = []; 
        tBoard.loadImage(imgSrc, true);
        setTimeout(() => tBoard.fitCanvasToScreen(), 100);
    }
}

window.closeModal = function(e, force = false) {
    if (force || e.target.id === 'boardModal') {
        document.getElementById('boardModal').style.display = 'none';
        currentModalStudent = null;
        // Очищаем таймер, чтобы изменения не отправились кому-то еще
        clearTimeout(tUpdateTimer);
    }
}