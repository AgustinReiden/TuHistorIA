import { openai } from '../../../lib/openai';
import { jsonResponse, requireSecret } from '../../../lib/utils';
import fs from 'fs';
import path from 'path';

const guide = fs.readFileSync(path.join(process.cwd(), 'prompts/intake_guide.md'), 'utf8');
const MODEL = process.env.OPENAI_MODEL_PREVIEW || 'gpt-4.1-mini';

function usesResponsesAPI(model) {
  return /^gpt-5/i.test(model); // Serie 5 → Responses API
}

function extractJSON(text) {
  try { return JSON.parse(text); } catch {}
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' });
    requireSecret(req);

    const { message } = req.body || {};
    if (!message) return jsonResponse(res, 400, { error: 'message required' });

    // ---- MODO DEMO (opcional) ----
    if (process.env.MOCK_OPENAI === '1') {
      const demo = {
        brief: {
          titulo_provisional: "Amor en Palermo",
          genero: "Romance",
          subgeneros: ["Contemporáneo"],
          tono: ["Emocional","Cálido"],
          publico_objetivo: "Adultos jóvenes",
          punto_de_vista: "primera",
          ambientacion: { lugar: "Buenos Aires", epoca: "Actualidad" },
          temas: ["Segundas oportunidades"],
          protagonistas: [{nombre:"Violeta", edad:29, rasgos:"barista creativa", objetivo:"reencontrar el amor", arco:"aprender a confiar"}],
          antagonistas: [{nombre:"Miedo al compromiso", motivacion:"autoprotección"}],
          personajes_clave: ["Mateo, músico"],
          conflicto_central: "Relación a distancia",
          estructura: "tres_actos",
          capitulos_estimados: 20,
          limites_contenido: ["sin violencia gráfica"],
          elementos_personalizados: {nombres_reales:[], anecdotas:[]},
          idioma: "es-AR",
          dedicatoria: "Para mi abuela",
          notas_extra: ""
        },
        sinopsis: "Violeta y Mateo se reencuentran en Palermo...",
        primera_pagina: "La tarde en Palermo olía a jazmín..."
      };
      return jsonResponse(res, 200, {
        ok: true,
        preview: `${demo.sinopsis}\n\n${demo.primera_pagina}`,
        brief: demo
      });
    }
    // -------------------------------

    let text = '';
    let obj = null;

    if (usesResponsesAPI(MODEL)) {
      // Serie 5 → Responses API: usar text.format (no response_format)
      const r = await openai.responses.create({
        model: MODEL,
        input: [
          { role: 'system', content: guide },
          { role: 'user', content: message }
        ],
        text: { format: 'json' } // <-- parche clave
      });
      const raw = r.output_text ?? (r.output?.[0]?.content?.[0]?.text?.value ?? '{}');
      obj = extractJSON(raw);
      text = raw;
    } else {
      // Serie 4.1 → Chat Completions (sin temperature)
      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: guide },
          { role: 'user', content: message }
        ]
      });
      text = completion.choices?.[0]?.message?.content || '';
      obj = extractJSON(text);
    }

    let brief = null;
    let previewText = text;

    if (obj && obj.brief) {
      brief = obj;
      const sinopsis = obj.sinopsis || '';
      const primera = obj.primera_pagina || '';
      previewText = `${sinopsis}\n\n${primera}`.trim();
    }

    return jsonResponse(res, 200, { ok: true, preview: previewText, brief, model: MODEL });
  } catch (e) {
    const code = e.code === 403 ? 403 : 500;
    return jsonResponse(res, code, { error: e.message || 'error' });
  }
}
