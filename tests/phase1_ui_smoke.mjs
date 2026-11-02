// Headless Edge checks against real Vue screens with an isolated mocked Tauri bridge.
import {spawn} from 'node:child_process'
import {mkdtemp,writeFile,mkdir} from 'node:fs/promises'
import os from 'node:os'
import net from 'node:net'
import path from 'node:path'
import assert from 'node:assert/strict'
const out=path.resolve('test-results/phase1');await mkdir(out,{recursive:true})
const allocator=net.createServer();await new Promise(resolve=>allocator.listen(0,'127.0.0.1',resolve));const debugPort=allocator.address().port;await new Promise(resolve=>allocator.close(resolve))
const profile=await mkdtemp(path.join(os.tmpdir(),'pharmacy-phase1-'))
const edge=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--no-first-run','--no-default-browser-check','--disable-gpu',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']})
edge.stderr.on('data',data=>process.stderr.write(data))
edge.on('error',error=>console.error('Browser launch failed:',error))
let socket
const delay=ms=>new Promise(r=>setTimeout(r,ms))
const results=[]
try{
 let targets
 for(let i=0;i<100;i++){try{targets=await(await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();if(targets.length)break}catch{}await delay(100)}
 assert(targets?.length,'Headless browser did not start')
 socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl)
 await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})})
 let seq=0;const pending=new Map()
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const task=pending.get(m.id);pending.delete(m.id);m.error?task?.reject(new Error(JSON.stringify(m.error))):task?.resolve(m.result)}})
 const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))})
 const evaluate=async(expression)=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
 async function until(expression){for(let i=0;i<150;i++){if(await evaluate(expression))return;await delay(100)}throw new Error(`Timed out: ${expression}`)}
 await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Emulation.setDeviceMetricsOverride',{width:1024,height:600,deviceScaleFactor:1,mobile:false})
 async function open(view){await cdp('Page.navigate',{url:'http://127.0.0.1:1422/tests/ui/phase1.html?view='+encodeURIComponent(view)});await until('window.fixtureReady===true');await delay(250)}
 async function shot(name){const r=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(out,name+'.png'),Buffer.from(r.data,'base64'))}
 const rect=selector=>`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}})()`
 function inside(r,name){assert(r&&r.width>0&&r.height>0,`${name} missing`);assert(r.x>=0&&r.y>=0&&r.right<=1025&&r.bottom<=601,`${name} clipped: ${JSON.stringify(r)}`)}
 await open('/login');inside(await evaluate(rect('.login-card')),'login card');inside(await evaluate(rect('.login-button')),'login submit');assert.equal(await evaluate("document.querySelector('input#username')?.getAttribute('autocomplete')"),'username');await shot('login-1024x600');results.push('Login fits 1024x600; labels and autocomplete target native inputs')
 await open('/');await until("document.querySelector('.alerts-table tbody tr')!==null");inside(await evaluate(rect('.alerts-card')),'dashboard alerts');assert.equal(await evaluate("document.querySelectorAll('.quick-actions button').length"),4);await shot('dashboard-1024x600');results.push('Dashboard metric/quick-action/alert panels fit 1024x600');await evaluate("document.querySelectorAll('.quick-actions button')[1].click()");await until("document.querySelector('.purchase-terminal .status-tab-active')?.textContent.includes('Receivable')")
 await open('/pos');inside(await evaluate(rect('.pos-complete')),'checkout');inside(await evaluate(rect('.pos-summary')),'summary');inside(await evaluate(rect('.pos-payment-actions')),'payment methods');assert(await evaluate("document.querySelector('.pos-table-scroll').clientHeight>40"));
 for(const [key,method] of [['F9','card'],['F10','mobile'],['F8','cash']]){await cdp('Input.dispatchKeyEvent',{type:'keyDown',key});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key});assert.equal(await evaluate(`document.querySelector('.pos-pay-button.${method}').getAttribute('aria-pressed')`),'true')}
 await evaluate("fixture.calls.length=0;var input=document.querySelector('#pos-product-search');input.value='123456789';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));")
 await until("document.querySelectorAll('.pos-line-description').length===1")
 assert.equal(await evaluate("fixture.calls.filter(c=>c.command==='database_select'&&(c.query.includes('SELECT * FROM products')||c.query.includes('SELECT * FROM product_batches'))).length"),2)
 inside(await evaluate(rect('.pos-complete')),'populated checkout');await shot('pos-light-1024x600');await evaluate("document.documentElement.dataset.theme='dark';document.documentElement.classList.add('dark')");await delay(350);assert.equal(await evaluate("getComputedStyle(document.querySelector('.pos-table-scroll')).backgroundColor"),'rgb(30, 41, 59)');assert.equal(await evaluate("getComputedStyle(document.querySelector('.pos-summary-total strong')).color"),'rgb(94, 234, 212)');await shot('pos-dark-1024x600');results.push('Barcode + immediate Enter adds once in two queries; F8/F9/F10 work; checkout and summary visible in light/dark')
 await open('/pos');await evaluate("fixture.openUnits=0;window.confirm=()=>true;var scan=document.querySelector('#pos-product-search');scan.value='123456789';scan.dispatchEvent(new Event('input',{bubbles:true}));scan.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true}));");await until("document.querySelector('.pos-break-pill')?.textContent.includes('Strip opening confirmed')");results.push('Confirmed loose-strip opening remains visible on its sale line');
 await open('/estimates');await evaluate("var trigger=document.querySelector('.documents-terminal>.tool-header button');trigger.focus();trigger.click()")
 await until("document.querySelector('.commercial-document-editor')!==null")
 await evaluate("var controls=[...document.querySelector('.commercial-document-editor').querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')].filter(e=>e.getClientRects().length);controls[controls.length-1].focus()")
 await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab'});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab'});assert(await evaluate('document.activeElement===controls[0]'));await shot('estimate-dialog-1024x600')
 await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape'});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape'});assert(await evaluate("!document.querySelector('.commercial-document-editor')&&!!document.querySelector('.documents-terminal')&&document.activeElement===trigger"));results.push('Estimate dialog traps Tab; Escape closes only the inner dialog and restores focus')
 await open('/expenses');await evaluate("[...document.querySelectorAll('.commercial-table-scroll button')].find(b=>b.textContent.includes('Void')).click()")
 await until("document.querySelector('.commercial-dialog')!==null");assert(await evaluate("document.querySelector('.commercial-dialog .bg-destructive').disabled"));assert(await evaluate("document.querySelector('.commercial-dialog [role=alert]').textContent.includes('closed drawer')"));await shot('closed-drawer-void-1024x600');results.push('Closed-drawer expense void blocked with an actionable inline reason')
 await open('/estimates');await evaluate("fixture.shortage=true;testRouter.push({path:'/pos',query:{document:'d1'}})");await until("document.querySelector('.pos-source-error')?.textContent.includes('Missing stock')");assert(await evaluate("document.querySelector('.pos-source-error').textContent.includes('Test medicine: 0/2')"));results.push('Source document shortage lists item and available/requested units')
 await open('/estimates');await evaluate("fixture.expired=true;testRouter.push({path:'/pos',query:{document:'d1'}})");await until("document.querySelector('.pos-source-error')?.textContent.includes('expired')");results.push('Expired estimate explains how to renew validity')
 await open('/estimates');await evaluate("fixture.converted=true;testRouter.push({path:'/pos',query:{document:'d1'}})");await until("document.querySelector('.pos-source-error')?.textContent.includes('cancelled, converted')");results.push('Unavailable/cancelled/converted source documents cannot be loaded')
 await open('/estimates');await evaluate("testRouter.push({path:'/pos',query:{document:'d1'}})");await until("document.querySelector('.pos-source-document strong')?.textContent.includes('EST-TEST')");assert(await evaluate("/Changed prices:.*1/s.test(document.querySelector('.pos-source-document').textContent)"));inside(await evaluate(rect('.pos-complete')),'document checkout');await shot('source-document-1024x600');results.push('Valid source shows number, current-price notice and changed-price count; checkout stays visible')
 await open('/estimates');await evaluate("localStorage.setItem('pharmacy-pos-language','ur')")
 // Router URL is /estimates after the fixture loads: reload the fixture explicitly for Urdu.
 await open('/estimates');assert(await evaluate("document.querySelector('.tool-header h1').textContent.includes('تخمینے')"));await shot('estimates-urdu-1024x600');results.push('Primary commercial labels render in Urdu')
 await writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2))
}catch(e){console.error(e);process.exitCode=1
 if(socket?.readyState===1){try{const id=900000;socket.send(JSON.stringify({id,method:'Page.captureScreenshot',params:{format:'png',captureBeyondViewport:false}}));await new Promise(resolve=>{const timer=setTimeout(resolve,1000);socket.addEventListener('message',async m=>{const r=JSON.parse(m.data);if(r.id===id&&r.result?.data){await writeFile(path.join(out,'failure.png'),Buffer.from(r.result.data,'base64'));clearTimeout(timer);resolve()}})})}catch{}}
}finally{if(socket?.readyState===1)socket.send(JSON.stringify({id:999999,method:'Browser.close'}));socket?.close();edge.kill()}

