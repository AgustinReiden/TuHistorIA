export function jsonResponse(res, status, data){ res.setHeader('Content-Type','application/json'); res.status(status).send(JSON.stringify(data)); }
export function requireSecret(req){ const got=req.headers['x-mvp-secret']; if(!process.env.MVP_SHARED_SECRET||got!==process.env.MVP_SHARED_SECRET){ const e=new Error('Forbidden'); e.code=403; throw e; } }
