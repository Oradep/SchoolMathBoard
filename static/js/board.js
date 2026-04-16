// --- START OF FILE static/js/board.js ---
class Whiteboard {
    constructor(config) {
        this.viewport = document.getElementById(config.viewportId);
        this.wrapper = document.getElementById(config.wrapperId);
        this.mainCanvas = document.getElementById(config.mainCanvasId);
        this.draftCanvas = document.getElementById(config.draftCanvasId);
        this.cursor = document.getElementById(config.cursorId);
        
        this.ctx = this.mainCanvas.getContext('2d', { willReadFrequently: true });
        this.draftCtx = this.draftCanvas.getContext('2d');

        this.VIRTUAL_WIDTH = 1600;
        this.VIRTUAL_HEIGHT = 1000;
        
        this.wrapper.style.width = this.VIRTUAL_WIDTH + 'px';
        this.wrapper.style.height = this.VIRTUAL_HEIGHT + 'px';
        this.mainCanvas.width = this.draftCanvas.width = this.VIRTUAL_WIDTH;
        this.mainCanvas.height = this.draftCanvas.height = this.VIRTUAL_HEIGHT;

        this.camScale = 1;
        this.camX = 0;
        this.camY = 0;

        this.tool = config.defaultTool || 'pen';
        this.color = config.defaultColor || '#000000';
        this.size = config.defaultSize || 2;
        this.currentBg = 'bg-grid';
        this.isDrawing = false;
        this.isLocked = false;
        this.startPos = { x: 0, y: 0 };
        this.history = [];

        this.onUpdate = config.onUpdate || function() {};

        this.saveHistory();
        this.bindEvents();
        this.fitCanvasToScreen();

        window.addEventListener('resize', () => this.fitCanvasToScreen());
    }

    saveHistory() {
        this.history.push(this.mainCanvas.toDataURL('image/png'));
        if (this.history.length > 15) this.history.shift();
    }

    fitCanvasToScreen() {
        const rect = this.viewport.getBoundingClientRect();
        if(rect.width === 0 || rect.height === 0) return; 
        
        const padding = 20;
        const scaleX = (rect.width - padding) / this.VIRTUAL_WIDTH;
        const scaleY = (rect.height - padding) / this.VIRTUAL_HEIGHT;
        this.camScale = Math.min(scaleX, scaleY);
        
        this.camX = (rect.width - (this.VIRTUAL_WIDTH * this.camScale)) / 2;
        this.camY = (rect.height - (this.VIRTUAL_HEIGHT * this.camScale)) / 2;
        this.updateTransform();
    }

    constrainPan() {
        const rect = this.viewport.getBoundingClientRect();
        const scaledW = this.VIRTUAL_WIDTH * this.camScale;
        const scaledH = this.VIRTUAL_HEIGHT * this.camScale;
        const margin = 100;

        if (scaledW < rect.width) this.camX = (rect.width - scaledW) / 2;
        else this.camX = Math.min(Math.max(this.camX, rect.width - scaledW - margin), margin);

        if (scaledH < rect.height) this.camY = (rect.height - scaledH) / 2;
        else this.camY = Math.min(Math.max(this.camY, rect.height - scaledH - margin), margin);
    }

    updateTransform() {
        this.constrainPan();
        this.wrapper.style.transform = `translate(${this.camX}px, ${this.camY}px) scale(${this.camScale})`;
        this.updateCursorSize();
    }

    updateCursorSize() {
        if(!this.cursor) return;
        this.cursor.style.width = (this.size * this.camScale * (this.tool === 'eraser' ? 10 : 1)) + 'px';
        this.cursor.style.height = (this.size * this.camScale * (this.tool === 'eraser' ? 10 : 1)) + 'px';
        this.cursor.style.backgroundColor = this.tool === 'eraser' ? 'rgba(255,255,255,0.8)' : this.color;
        this.cursor.style.borderColor = this.tool === 'eraser' ? '#000' : 'rgba(0,0,0,0.3)';
    }

    getBoardPos(e) {
        const rect = this.viewport.getBoundingClientRect();
        let clientX = e.touches ? e.touches[0].clientX : e.clientX;
        let clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { 
            x: (clientX - rect.left - this.camX) / this.camScale, 
            y: (clientY - rect.top - this.camY) / this.camScale, 
            cx: clientX - rect.left, 
            cy: clientY - rect.top 
        };
    }

    changeZoom(delta) {
        const oldScale = this.camScale;
        this.camScale = Math.min(Math.max(this.camScale + delta, 0.2), 3);
        const rect = this.viewport.getBoundingClientRect();
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        this.camX = cx - (cx - this.camX) * (this.camScale / oldScale);
        this.camY = cy - (cy - this.camY) * (this.camScale / oldScale);
        this.updateTransform();
    }

    loadImage(imgSrc, saveToHistory = false) {
        if (!imgSrc) return;
        let img = new Image();
        img.onload = () => { 
            this.ctx.clearRect(0, 0, this.VIRTUAL_WIDTH, this.VIRTUAL_HEIGHT);
            this.ctx.drawImage(img, 0, 0, this.VIRTUAL_WIDTH, this.VIRTUAL_HEIGHT); 
            if(saveToHistory) this.saveHistory(); 
        };
        img.src = imgSrc;
    }

    clear() {
        if(this.isLocked) return;
        this.ctx.clearRect(0, 0, this.VIRTUAL_WIDTH, this.VIRTUAL_HEIGHT);
        this.saveHistory();
        this.onUpdate();
    }

    undo() {
        if(this.isLocked || this.history.length <= 1) return;
        this.history.pop();
        let img = new Image();
        img.onload = () => {
            this.ctx.clearRect(0, 0, this.VIRTUAL_WIDTH, this.VIRTUAL_HEIGHT);
            this.ctx.drawImage(img, 0, 0);
            this.onUpdate();
        };
        img.src = this.history[this.history.length - 1];
    }

    // НОВОЕ: Передаем прозрачные PNG идеального качества. Они весят копейки (2-10кб)
    getExportImage(mimeType = 'image/png', quality = 1.0, scale = 1.0, withBackground = false) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.VIRTUAL_WIDTH * scale; 
        tempCanvas.height = this.VIRTUAL_HEIGHT * scale;
        const tCtx = tempCanvas.getContext('2d');
        
        tCtx.scale(scale, scale);
        
        if (withBackground) {
            tCtx.fillStyle = '#ffffff';
            tCtx.fillRect(0, 0, this.VIRTUAL_WIDTH, this.VIRTUAL_HEIGHT);
            
            if (this.currentBg === 'bg-grid') {
                tCtx.strokeStyle = '#cbd5e0'; tCtx.lineWidth = 1;
                for(let i=0; i<this.VIRTUAL_WIDTH; i+=80) { tCtx.beginPath(); tCtx.moveTo(i,0); tCtx.lineTo(i,this.VIRTUAL_HEIGHT); tCtx.stroke(); }
                for(let i=0; i<this.VIRTUAL_HEIGHT; i+=80) { tCtx.beginPath(); tCtx.moveTo(0,i); tCtx.lineTo(this.VIRTUAL_WIDTH,i); tCtx.stroke(); }
            } else if (this.currentBg === 'bg-lines') {
                tCtx.strokeStyle = '#cbd5e0'; tCtx.lineWidth = 1;
                for(let i=0; i<this.VIRTUAL_HEIGHT; i+=80) { tCtx.beginPath(); tCtx.moveTo(0,i); tCtx.lineTo(this.VIRTUAL_WIDTH,i); tCtx.stroke(); }
            }
        }
        
        tCtx.drawImage(this.mainCanvas, 0, 0);
        return tempCanvas.toDataURL(mimeType, quality);
    }

    bindEvents() {
        const startAction = (e) => {
            if (this.isLocked || e.target.closest('.toolbar') || e.target.closest('.action-btn')) return;
            this.isDrawing = true;
            const pos = this.getBoardPos(e);
            this.startPos = pos;

            if (this.tool === 'pen' || this.tool === 'eraser') {
                this.ctx.beginPath();
                this.ctx.moveTo(pos.x, pos.y);
                this.ctx.lineTo(pos.x, pos.y);
                if (this.tool === 'eraser') {
                    this.ctx.globalCompositeOperation = "destination-out";
                    this.ctx.lineWidth = this.size * 10;
                } else {
                    this.ctx.globalCompositeOperation = "source-over";
                    this.ctx.strokeStyle = this.color;
                    this.ctx.lineWidth = this.size;
                }
                this.ctx.lineCap = 'round';
                this.ctx.lineJoin = 'round';
                this.ctx.stroke();
            }
        };

        const moveAction = (e) => {
            if(e.touches && this.cursor) this.cursor.style.display = 'none';
            if (!this.isDrawing || this.isLocked) return;
            if (e.cancelable) e.preventDefault(); // Защита от прокрутки
            
            const pos = this.getBoardPos(e);

            if (this.tool === 'hand') {
                this.camX += (pos.cx - this.startPos.cx);
                this.camY += (pos.cy - this.startPos.cy);
                this.startPos.cx = pos.cx; this.startPos.cy = pos.cy;
                this.updateTransform();
            } 
            else if (this.tool === 'line') {
                this.draftCtx.clearRect(0, 0, this.VIRTUAL_WIDTH, this.VIRTUAL_HEIGHT);
                this.draftCtx.beginPath();
                this.draftCtx.moveTo(this.startPos.x, this.startPos.y);
                this.draftCtx.lineTo(pos.x, pos.y);
                this.draftCtx.strokeStyle = this.color;
                this.draftCtx.lineWidth = this.size;
                this.draftCtx.lineCap = 'round';
                this.draftCtx.stroke();
            }
            else {
                this.ctx.lineTo(pos.x, pos.y);
                this.ctx.stroke();
            }
        };

        const endAction = (e) => {
            if (!this.isDrawing || this.isLocked) return;
            this.isDrawing = false;
            this.ctx.globalCompositeOperation = "source-over"; 
            
            if (this.tool === 'line') {
                this.ctx.drawImage(this.draftCanvas, 0, 0);
                this.draftCtx.clearRect(0, 0, this.VIRTUAL_WIDTH, this.VIRTUAL_HEIGHT);
                this.saveHistory();
                this.onUpdate();
            } else if (this.tool !== 'hand') {
                this.saveHistory();
                this.onUpdate();
            }
        };

        this.viewport.addEventListener('mousedown', startAction);
        this.viewport.addEventListener('mousemove', moveAction);
        window.addEventListener('mouseup', endAction); 

        this.viewport.addEventListener('touchstart', startAction, {passive: false});
        this.viewport.addEventListener('touchmove', moveAction, {passive: false});
        window.addEventListener('touchend', endAction);

        if(this.cursor) {
            this.viewport.addEventListener('mousemove', (e) => {
                if(this.tool === 'hand' || e.touches || this.isLocked) { this.cursor.style.display = 'none'; return; }
                this.cursor.style.display = 'block';
                this.cursor.style.left = e.clientX + 'px';
                this.cursor.style.top = e.clientY + 'px';
            });
            this.viewport.addEventListener('mouseleave', () => this.cursor.style.display = 'none');
        }
    }

    bindToolbarUI(containerId) {
        const container = document.getElementById(containerId);
        if(!container) return;

        container.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
            btn.onclick = () => {
                container.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.tool = btn.dataset.tool;
                this.viewport.style.cursor = this.tool === 'hand' ? 'grab' : 'crosshair';
                this.updateCursorSize();
            }
        });

        container.querySelectorAll('.color-btn').forEach(btn => {
            btn.onclick = () => {
                container.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.color = btn.dataset.color;
                if(this.tool === 'eraser' || this.tool === 'hand') {
                    let penBtn = container.querySelector('.tool-btn[data-tool="pen"]');
                    if(penBtn) penBtn.click();
                }
                this.updateCursorSize();
            }
        });

        container.querySelectorAll('.size-btn').forEach(btn => {
            btn.onclick = () => {
                container.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.size = parseInt(btn.dataset.size);
                this.updateCursorSize();
            }
        });

        container.querySelectorAll('.tool-btn[data-bg]').forEach(btn => {
            btn.onclick = () => {
                container.querySelectorAll('.tool-btn[data-bg]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentBg = btn.dataset.bg;
                this.wrapper.className = this.currentBg;
                this.onUpdate(); 
            }
        });

        let btnClear = container.querySelector('.btn-clear');
        if(btnClear) btnClear.onclick = () => this.clear();

        let btnUndo = container.querySelector('.btn-undo');
        if(btnUndo) btnUndo.onclick = () => this.undo();

        let btnZoomIn = container.querySelector('.btn-zoom-in');
        if(btnZoomIn) btnZoomIn.onclick = () => this.changeZoom(0.2);

        let btnZoomOut = container.querySelector('.btn-zoom-out');
        if(btnZoomOut) btnZoomOut.onclick = () => this.changeZoom(-0.2);
    }
}