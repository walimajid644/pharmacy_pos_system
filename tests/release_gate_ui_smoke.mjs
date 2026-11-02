// Headless Edge checks against real Vue screens with an isolated mocked Tauri bridge.
import {spawn} from 'node:child_process'
import {mkdtemp,writeFile,mkdir} from 'node:fs/promises'
import os from 'node:os'
import net from 'node:net'
import path from 'node:path'
import assert from 'node:assert/strict'
const out=path.resolve('test-results/release-gate');await mkdir(out,{recursive:true})
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
 async function open(view,role='admin'){await cdp('Page.navigate',{url:'http://127.0.0.1:1422/tests/ui/phase1.html?view='+encodeURIComponent(view)+'&role='+role});await until('window.fixtureReady===true');await delay(250)}
 async function shot(name){const r=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(out,name+'.png'),Buffer.from(r.data,'base64'))}
 const rect=selector=>`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}})()`
 function inside(r,name){assert(r&&r.width>0&&r.height>0,`${name} missing`);assert(r.x>=0&&r.y>=0&&r.right<=1025&&r.bottom<=601,`${name} clipped: ${JSON.stringify(r)}`)}



 async function app(){await cdp('Page.navigate',{url:'http://127.0.0.1:1422/tests/ui/phase1.html?app=1&view=%2Fpos'});await until('window.fixtureReady===true');await until("document.querySelector('.pos-terminal')!==null");await evaluate("var scan=document.querySelector('#pos-product-search');scan.value='123456789';scan.dispatchEvent(new Event('input',{bubbles:true}));scan.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));");await until('testCart.items.length===1');await evaluate("testDraft.stage({supplierId:'s1',items:[{productId:'p1',quantity:10}],notes:'Unsaved'})")}
 for(const mode of ['ok','fail','hang']){await app();await evaluate(`fixture.logoutMode=${JSON.stringify(mode)};fixture.clockOffset=300001`);await until("location.pathname==='/login'&&!testAuth.isAuthenticated&&testCart.items.length===0&&testDraft.pending===null");inside(await evaluate(rect('button[type=submit]')),'locked login submit');assert(await evaluate("fixture.calls.some(c=>c.command==='logout_user')"));await shot('idle-'+mode);results.push('Five-minute lock clears cart and purchase draft and shows sign-in when native logout '+mode)}
 await app();await evaluate("fixture.clockOffset=240000;window.dispatchEvent(new KeyboardEvent('keydown',{key:'a',bubbles:true}))");await until("fixture.calls.some(c=>c.command==='touch_session')");await evaluate("fixture.clockOffset=300001");await delay(1300);assert(await evaluate("testAuth.isAuthenticated&&testCart.items.length===1"));await evaluate("fixture.clockOffset=540001");await until("location.pathname==='/login'");results.push('Keyboard activity renews idle timeout; the session still locks five minutes after last activity')
 await app();await evaluate("fixture.clockOffset=300001;window.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))");await until("location.pathname==='/login'&&testCart.items.length===0");results.push('First click after a suspended/expired interval locks rather than reviving the old cart')

 await open('/pos');await evaluate("fixture.calls.length=0;fixture.productDelay=100;var s=document.querySelector('#pos-product-search');s.value='123456789';s.dispatchEvent(new Event('input',{bubbles:true}));s.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));s.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));");await until('testCart.items.length===1');assert(await evaluate("testCart.items[0].quantity===1&&fixture.calls.filter(c=>c.command==='database_select'&&(c.query.includes('SELECT * FROM products')||c.query.includes('SELECT * FROM product_batches'))).length===2"));results.push('Delayed barcode lookup shared by input and repeated Enter adds once using two queries')
 await open('/pos');await evaluate("fixture.productDelay=100;var s=document.querySelector('#pos-product-search');s.value='123456789';s.dispatchEvent(new Event('input',{bubbles:true}));s.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));s.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));");await delay(300);assert(await evaluate("testCart.items.length===0&&!document.querySelector('.pos-product-row')&&document.querySelector('#pos-product-search').value===''") );results.push('Escape cancels a pending barcode add and stale results cannot refill the cart')
 await open('/pos');await evaluate("fixture.failProductSearch=true;var s=document.querySelector('#pos-product-search');s.value='123456789';s.dispatchEvent(new Event('input',{bubbles:true}));s.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));");await until("document.querySelector('.pos-result-message.pos-error')!==null");assert(await evaluate('testCart.items.length===0'));results.push('Failed shared barcode search displays an error and leaves cart unchanged')
 await writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2))
}catch(e){console.error(e);process.exitCode=1
 if(socket?.readyState===1){try{const id=900000;socket.send(JSON.stringify({id,method:'Page.captureScreenshot',params:{format:'png',captureBeyondViewport:false}}));await new Promise(resolve=>{const timer=setTimeout(resolve,1000);socket.addEventListener('message',async m=>{const r=JSON.parse(m.data);if(r.id===id&&r.result?.data){await writeFile(path.join(out,'failure.png'),Buffer.from(r.result.data,'base64'));clearTimeout(timer);resolve()}})})}catch{}}
}finally{if(socket?.readyState===1)socket.send(JSON.stringify({id:999999,method:'Browser.close'}));socket?.close();edge.kill()}

