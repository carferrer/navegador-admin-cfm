import assert from 'node:assert/strict';
import {chromium, webkit} from 'playwright';

export async function testMobileZoom(origin, pass) {
    for (const engine of [chromium, webkit]) {
        const browser = await engine.launch();
        try {
            const context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
            await context.addCookies([{name:'test_ingress',value:'admin',url:origin}]);
            const page = await context.newPage(), errors=[];
            page.on('pageerror',e=>errors.push(e.message));
            await page.goto(origin+'/panel');
            const frame = await (await page.waitForSelector('iframe')).contentFrame();
            await frame.waitForFunction(()=>document.querySelector('#cfm-zoom button')?.disabled===false);
            await frame.evaluate(async()=>{
                const text=[...document.scripts].map(s=>s.textContent).find(s=>s.includes('import UI from'));
                window.mobileRfb=(await import(text.match(/import UI from "([^"]+)"/)[1])).default.rfb;
                window.remoteSize=[mobileRfb._display.width,mobileRfb._display.height];
                window.pointerEvents=[];
                const original=mobileRfb._handleMouseButton.bind(mobileRfb);
                mobileRfb._handleMouseButton=(x,y,mask)=>{pointerEvents.push({x:mobileRfb._display.absX(x),y:mobileRfb._display.absY(y),mask});original(x,y,mask);};
            });
            await frame.getByRole('button',{name:'Ampliar',exact:true}).click();
            assert.equal(await frame.locator('#cfm-zoom').getAttribute('data-zoom'),'1.25');
            await frame.getByRole('button',{name:'Reducir',exact:true}).click();
            assert.equal(await frame.locator('#cfm-zoom').getAttribute('data-zoom'),'1');
            const pinch=await frame.evaluate(()=>{
                const c=mobileRfb._canvas;
                window.touch=(type,points)=>{const e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(e,'touches',{value:points.map(([clientX,clientY])=>({clientX,clientY}))});c.dispatchEvent(e);};
                const b=c.getBoundingClientRect(), y=b.top+b.height/2;
                touch('touchstart',[[150,y]]);touch('touchstart',[[150,y],[240,y]]);
                touch('touchmove',[[100,y],[290,y]]);touch('touchend',[[100,y]]);touch('touchend',[]);
                return {zoom:Number(document.querySelector('#cfm-zoom').dataset.zoom),events:pointerEvents.length};
            });
            assert.ok(pinch.zoom>2);assert.equal(pinch.events,0,'Pinch must not send remote mouse input');
            const pan=await frame.evaluate(()=>{
                const c=mobileRfb._canvas,b=c.getBoundingClientRect(),y=Math.max(100,b.top+30),s=mobileRfb._screen;
                const before=s.scrollLeft;touch('touchstart',[[200,y]]);touch('touchmove',[[150,y]]);touch('touchend',[]);
                const after=s.scrollLeft;
                const rect=c.getBoundingClientRect(),p={x:180,y:Math.max(100,rect.top+30)};
                const expected={x:Math.floor((p.x-rect.left)/mobileRfb._display.scale),y:Math.floor((p.y-rect.top)/mobileRfb._display.scale)};
                touch('touchstart',[[p.x,p.y]]);touch('touchend',[]);
                return {before,after,expected,events:pointerEvents};
            });
            assert.ok(pan.after>pan.before);assert.equal(pan.events.length,2);
            assert.ok(Math.abs(pan.events[0].x-pan.expected.x)<=1);assert.ok(Math.abs(pan.events[0].y-pan.expected.y)<=1);
            assert.deepEqual(pan.events.map(e=>e.mask),[1,0]);
            assert.equal(await frame.evaluate(()=>document.captureElement),null);
            await frame.evaluate(()=>{window.pointerEvents.length=0;touch('touchstart',[[180,200]]);touch('touchcancel',[]);touch('touchend',[]);});
            assert.equal(await frame.evaluate(()=>pointerEvents.length),0);
            await page.setViewportSize({width:844,height:390});
            await frame.getByRole('button',{name:'Ajustar a pantalla',exact:true}).click();
            const fit=await frame.evaluate(()=>({zoom:document.querySelector('#cfm-zoom').dataset.zoom,width:mobileRfb._canvas.getBoundingClientRect().width,available:mobileRfb._screen.clientWidth,size:[mobileRfb._display.width,mobileRfb._display.height],original:remoteSize}));
            assert.equal(fit.zoom,'1');assert.ok(fit.width<=fit.available+1);assert.deepEqual(fit.size,fit.original);
            assert.deepEqual(errors,[]);
            await page.screenshot({path:'/results/mobile-'+engine.name()+'.png'});
            pass(engine.name()+': mobile zoom buttons, pinch without remote input, pan, accurate tap, rotation and unchanged remote resolution');
        } finally { await browser.close(); }
    }
}
