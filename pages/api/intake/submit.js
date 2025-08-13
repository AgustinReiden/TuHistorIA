import { supabase } from '../../../lib/supabase'; import { jsonResponse, requireSecret } from '../../../lib/utils';
export default async function handler(req,res){ try{ if(req.method!=='POST') return jsonResponse(res,405,{error:'Method not allowed'}); requireSecret(req);
const { store, sessionId, brief, sinopsis, primera_pagina } = req.body || {}; if(!store||!sessionId||!brief) return jsonResponse(res,400,{error:'missing fields'});
const { data, error } = await supabase.from('intakes').insert({ store, session_id: sessionId, brief, sinopsis, primera_pagina, status:'received' }).select().single();
if(error) return jsonResponse(res,500,{error:error.message}); return jsonResponse(res,200,{ok:true,intake_id:data.id}); }catch(e){ const code=e.code===403?403:500; return jsonResponse(res,code,{error:e.message||'error'});} }
