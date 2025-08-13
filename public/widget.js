(function(){const STYLE=`#mvp-chat-launcher{position:fixed;right:20px;bottom:20px;padding:12px 14px;border-radius:999px;background:#111;color:#fff;cursor:pointer;z-index:999999}
#mvp-chat{position:fixed;right:20px;bottom:80px;width:360px;max-width:calc(100vw - 40px);height:520px;background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.2);display:none;flex-direction:column;overflow:hidden;z-index:999999}
#mvp-chat header{padding:12px 14px;border-bottom:1px solid #eee;font-weight:600;background:#fafafa}
#mvp-chat .msgs{flex:1;padding:12px;overflow:auto}
.msg{margin:6px 0;padding:10px 12px;border-radius:12px;max-width:80%}.me{background:#111;color:#fff;margin-left:auto}.bot{background:#f1f3f5;color:#111;margin-right:auto}
#mvp-chat .input{display:flex;gap:8px;border-top:1px solid #eee;padding:10px;background:#fff}textarea{flex:1;border:1px solid #ddd;border-radius:10px;padding:10px;resize:none;height:48px}button{border:0;border-radius:10px;padding:10px 12px;background:#111;color:#fff;cursor:pointer}`;
const SECRET=window.MVP_SHARED_SECRET||"";const BACKEND=window.MVP_BACKEND_URL||"";const STORE=window.Shopify&&Shopify.shop?Shopify.shop:window.location.hostname;
function el(t,c,h){const e=document.createElement(t);if(c)e.className=c;if(h)e.innerHTML=h;return e;}function addMsg(s,t){const m=el('div','msg '+s);m.textContent=t;msgs.appendChild(m);msgs.scrollTop=msgs.scrollHeight;}
const style=el('style');style.innerHTML=STYLE;document.head.appendChild(style);
const launcher=el('div',null,'📝 Crear mi libro');launcher.id='mvp-chat-launcher';document.body.appendChild(launcher);
const panel=el('div');panel.id='mvp-chat';panel.style.display='none';const header=el('header',null,'Asistente para tu libro');const msgs=el('div','msgs');const inputBar=el('div','input');const ta=el('textarea');ta.placeholder='Escribe aquí...';const sendBtn=el('button',null,'Enviar');inputBar.appendChild(ta);inputBar.appendChild(sendBtn);
const cta=el('div','cta');const finalizeBtn=el('button',null,'Finalizar y enviar brief');cta.appendChild(finalizeBtn);panel.appendChild(header);panel.appendChild(msgs);panel.appendChild(inputBar);panel.appendChild(cta);document.body.appendChild(panel);
let sessionId=localStorage.getItem('mvp_session_id')||(Date.now()+'-'+Math.random().toString(36).slice(2));localStorage.setItem('mvp_session_id',sessionId);let briefJSON=null;
async function callPreview(message){const r=await fetch(BACKEND+'/api/chat/preview',{method:'POST',headers:{'Content-Type':'application/json','x-mvp-secret':SECRET},body:JSON.stringify({store:STORE,sessionId,message})});if(!r.ok)throw new Error('Error '+r.status);return await r.json();}
async function submitIntake(brief,sinopsis,primera_pagina){const r=await fetch(BACKEND+'/api/intake/submit',{method:'POST',headers:{'Content-Type':'application/json','x-mvp-secret':SECRET},body:JSON.stringify({store:STORE,sessionId,brief,sinopsis,primera_pagina})});if(!r.ok)throw new Error('Error '+r.status);return await r.json();}
launcher.addEventListener('click',()=>{panel.style.display=panel.style.display==='none'?'flex':'none';});
async function send(){const text=ta.value.trim();if(!text)return;addMsg('me',text);ta.value='';addMsg('bot','Pensando...');try{const data=await callPreview(text);msgs.lastChild.remove();if(data&&data.preview){addMsg('bot',data.preview);}if(data&&data.brief){briefJSON=data.brief;}}catch(e){msgs.lastChild.remove();addMsg('bot','Error. Intenta nuevamente.');}}
sendBtn.addEventListener('click',send);ta.addEventListener('keydown',(e)=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}});
finalizeBtn.addEventListener('click',async()=>{if(!briefJSON){addMsg('bot','Aún no tengo el BRIEF completo.');return;}addMsg('bot','Guardando tu brief...');try{await submitIntake(briefJSON,briefJSON.sinopsis||'',briefJSON.primera_pagina||'');addMsg('bot','¡Listo! Recibimos tu brief.');}catch(e){addMsg('bot','No pude guardar el brief.');}});
setTimeout(()=>{addMsg('bot','¡Hola! Soy tu asistente para crear un libro de ~200 páginas. ¿Qué historia querés escribir y para quién es?');},500);
})();
