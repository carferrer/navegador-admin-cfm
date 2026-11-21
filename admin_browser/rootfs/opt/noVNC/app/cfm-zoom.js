// Local touch controls. Scale through noVNC so its pointer coordinates stay correct.
export function installMobileZoom(UI) {
    if (!navigator.maxTouchPoints) return;
    const bar = document.createElement('div');
    bar.id = 'cfm-zoom';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Ampliación local');
    bar.style.cssText = 'position:fixed;bottom:max(8px,env(safe-area-inset-bottom));right:8px;z-index:20;display:flex;gap:4px;padding:4px;background:#222;border-radius:8px;color:white';
    document.body.append(bar);
    let active;
    const buttons = [['−', 'Reducir'], ['+', 'Ampliar'], ['Ajustar a pantalla', 'Ajustar a pantalla']].map(([text, label]) => {
        const b = document.createElement('button');
        b.textContent = text; b.type = 'button'; b.setAttribute('aria-label', label);
        b.style.cssText = 'min-width:44px;min-height:44px;font:16px system-ui;border:0;border-radius:5px';
        b.disabled = true; bar.append(b); return b;
    });
    setInterval(() => {
        const r = UI.rfb;
        if (!r || r._rfbConnectionState !== 'connected') {
            buttons.forEach(b => b.disabled = true); return;
        }
        if (active === r) return;
        active = r;
        const canvas = r._canvas, screen = r._screen, display = r._display;
        if (!canvas || !screen || !display || typeof r._updateScale !== 'function')
            throw Error('La interfaz noVNC no es compatible con la ampliación local');
        let zoom = 1, gesture = null;
        r.resizeSession = false; r.clipViewport = false; r.scaleViewport = true;
        canvas.style.flexShrink = '0';
        r._updateScale = () => {
            if (!display.width || !display.height) return;
            display.scale = Math.min(screen.clientWidth / display.width, screen.clientHeight / display.height) * zoom;
        };
        const change = (value, x, y) => {
            const rect = canvas.getBoundingClientRect(), old = display.scale;
            const point = {x: (x - rect.left) / old, y: (y - rect.top) / old};
            zoom = Math.max(1, Math.min(4, value));
            r._updateScale();
            const next = canvas.getBoundingClientRect();
            screen.scrollLeft += next.left + point.x * display.scale - x;
            screen.scrollTop += next.top + point.y * display.scale - y;
            if (zoom === 1) { screen.scrollLeft = 0; screen.scrollTop = 0; }
            bar.dataset.zoom = String(zoom);
        };
        const centered = value => { const b = screen.getBoundingClientRect(); change(value, b.left + b.width / 2, b.top + b.height / 2); };
        buttons[0].onclick = () => centered(zoom / 1.25);
        buttons[1].onclick = () => centered(zoom * 1.25);
        buttons[2].onclick = () => centered(1);
        buttons.forEach(b => b.disabled = false);
        centered(1);
        const pos = t => ({x:t.clientX, y:t.clientY});
        const pair = touches => ({x:(touches[0].clientX + touches[1].clientX)/2, y:(touches[0].clientY + touches[1].clientY)/2,
            distance:Math.hypot(touches[0].clientX-touches[1].clientX, touches[0].clientY-touches[1].clientY)});
        const mouse = (type, p, button = 0) => canvas.dispatchEvent(new MouseEvent(type, {bubbles:true, clientX:p.x, clientY:p.y, button, buttons:type==='mousedown' ? (button===2 ? 2 : 1) : 0}));
        const handle = e => {
            // Own the whole touch sequence, including the first finger, so pinch never sends a remote click or Ctrl+wheel.
            e.preventDefault(); e.stopImmediatePropagation();
            const ts = e.touches;
            if (e.type === 'touchcancel') { gesture = null; return; }
            if (e.type === 'touchstart') {
                if (ts.length >= 2) { const p = pair(ts); gesture = {pair:p, zoom, moved:true}; }
                else { const p = pos(ts[0]); gesture = {start:p, last:p, moved:false, time:Date.now()}; }
                return;
            }
            if (!gesture) return;
            if (e.type === 'touchmove') {
                if (ts.length >= 2 && gesture.pair) {
                    const p = pair(ts), previous = gesture.pair;
                    change(zoom * p.distance / Math.max(1,previous.distance), previous.x, previous.y);
                    screen.scrollLeft += previous.x-p.x; screen.scrollTop += previous.y-p.y;
                    gesture.pair = p;
                } else if (ts.length === 1 && gesture.last) {
                    const p = pos(ts[0]), last = gesture.last;
                    if (Math.hypot(p.x-gesture.start.x,p.y-gesture.start.y)>8) gesture.moved = true;
                    if (gesture.moved) {
                        if (zoom > 1) { screen.scrollLeft += last.x-p.x; screen.scrollTop += last.y-p.y; }
                        else canvas.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,clientX:p.x,clientY:p.y,deltaX:last.x-p.x,deltaY:last.y-p.y}));
                    }
                    gesture.last = p;
                }
                return;
            }
            if (!ts.length) {
                if (!gesture.moved && gesture.start) {
                    const button = Date.now()-gesture.time > 600 ? 2 : 0;
                    mouse('mousemove',gesture.start); mouse('mousedown',gesture.start,button); mouse('mouseup',gesture.start,button);
                }
                gesture = null;
            } // Ignore the remaining finger after a pinch until all fingers lift.
        };
        for (const type of ['touchstart','touchmove','touchend','touchcancel'])
            canvas.addEventListener(type, handle, {capture:true, passive:false});
    }, 250);
}
