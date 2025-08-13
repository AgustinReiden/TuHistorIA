import { openai } from '../../../lib/openai';
import { supabase } from '../../../lib/supabase';
import { jsonResponse, requireSecret } from '../../../lib/utils';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Document, Packer, Paragraph, HeadingLevel, TextRun, PageBreak } from 'docx';

const generator = fs.readFileSync(path.join(process.cwd(), 'prompts/book_generator.md'), 'utf8');

const MODEL = process.env.OPENAI_MODEL_BOOK || 'gpt-4.1-mini';
const CHAPTER_CAP = parseInt(process.env.CHAPTER_CAP || '0', 10); // 0 = sin límite

function usesResponsesAPI(model) {
  return /^gpt-5/i.test(model); // usa Responses si empieza con "gpt-5"
}

function toParagraphs(text) {
  const lines = String(text || '').split(/\r?\n/);
  const paras = [];
  for (const line of lines) {
    if (line.trim().length === 0) {
      paras.push(new Paragraph(''));
    } else {
      paras.push(new Paragraph(new TextRun(line)));
    }
  }
  return paras.length ? paras : [new Paragraph('')];
}

// Intenta Chat Completions y si falla por temperature lo reintenta sin esa prop
async function safeChatCreate(params) {
  try {
    return await openai.chat.completions.create(params);
  } catch (e) {
    const msg = String(e?.message || '');
    if (msg.includes("Unsupported value: 'temperature'")) {
      const { temperature, ...rest } = params;
      return await openai.chat.completions.create(rest);
    }
    throw e;
  }
}

// Responses API helpers (serie 5)
async function responsesJSON(systemPrompt, userPrompt) {
  const r = await openai.responses.create({
    model: MODEL,
    // No seteamos temperature; dejamos default del modelo
    input: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    // Pedimos JSON llano
    response_format: { type: 'json_object' }
  });
  const txt = r.output_text || '{}';
  return txt;
}

function extractJSON(text, fallbackKey) {
  try {
    // Primero intento: ya es JSON puro
    return JSON.parse(text);
  } catch {
    // Segundo intento: extraer bloque desde primera { a última }
    const m = String(text).match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch {}
    }
  }
  // Fallback
  return fallbackKey ? { [fallbackKey]: [] } : {};
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' });
    requireSecret(req);

    const { intake_id } = req.body || {};
    if (!intake_id) return jsonResponse(res, 400, { error: 'intake_id required' });

    const { data: intake, error: e1 } = await supabase
      .from('intakes')
      .select('*')
      .eq('id', intake_id)
      .single();
    if (e1 || !intake) return jsonResponse(res, 404, { error: e1?.message || 'intake not found' });

    // 1) OUTLINE
    let outlineJson;

    if (usesResponsesAPI(MODEL)) {
      const txt = await responsesJSON(
        generator,
        'BRIEF:\n' + JSON.stringify(intake.brief, null, 2) + '\nGenera SOLO el campo "outline" en JSON válido.'
      );
      outlineJson = extractJSON(txt, 'outline');
    } else {
      const outlineResp = await safeChatCreate({
        model: MODEL,
        messages: [
          { role: 'system', content: generator },
          { role: 'user', content: 'BRIEF:\n' + JSON.stringify(intake.brief, null, 2) + '\nGenera SOLO el campo "outline" en JSON válido.' }
        ]
      });
      const outlineText = outlineResp.choices?.[0]?.message?.content || '{}';
      outlineJson = extractJSON(outlineText, 'outline');
    }

    const outline = Array.isArray(outlineJson?.outline) ? outlineJson.outline : [];
    if (!outline.length) {
      return jsonResponse(res, 400, { error: 'No se pudo generar outline. Verificá el brief o el modelo.' });
    }

    const effectiveOutline = CHAPTER_CAP > 0 ? outline.slice(0, CHAPTER_CAP) : outline;

    // 2) CAPÍTULOS
    const chapters = [];

    for (const item of effectiveOutline) {
      let chJson;
      const prompt = 'BRIEF:\n' + JSON.stringify(intake.brief, null, 2) +
        '\nEscribe el CAPITULO ' + item.n + ' titulado "' + item.titulo +
        '" (JSON con campo "capitulos":[{n,titulo,texto}]).';

      if (usesResponsesAPI(MODEL)) {
        const txt = await responsesJSON(generator, prompt);
        chJson = extractJSON(txt, 'capitulos');
      } else {
        const chResp = await safeChatCreate({
          model: MODEL,
          messages: [
            { role: 'system', content: generator },
            { role: 'user', content: prompt }
          ]
        });
        const t = chResp.choices?.[0]?.message?.content || '{}';
        chJson = extractJSON(t, 'capitulos');
      }

      const cap = Array.isArray(chJson.capitulos) && chJson.capitulos.length ? chJson.capitulos[0] : null;
      if (cap) chapters.push(cap);
    }

    if (!chapters.length) {
      return jsonResponse(res, 400, { error: 'No se generaron capítulos. Probá con menos capítulos o cambiá de modelo.' });
    }

    // 3) DOCX
    const docChildren = [];

    if (intake.brief?.dedicatoria) {
      docChildren.push(new Paragraph({ text: 'Dedicatoria', heading: HeadingLevel.HEADING_1 }));
      docChildren.push(...toParagraphs(intake.brief.dedicatoria));
      docChildren.push(new Paragraph({ children: [new PageBreak()] }));
    }

    docChildren.push(new Paragraph({ text: intake.brief?.titulo_provisional || 'Libro sin título', heading: HeadingLevel.TITLE }));
    docChildren.push(new Paragraph(' '));

    if (intake.sinopsis) {
      docChildren.push(new Paragraph({ text: 'Sinopsis', heading: HeadingLevel.HEADING_1 }));
      docChildren.push(...toParagraphs(intake.sinopsis));
      docChildren.push(new Paragraph({ children: [new PageBreak()] }));
    }

    chapters.forEach((c, i) => {
      docChildren.push(new Paragraph({ text: c.titulo || ('Capítulo ' + (i + 1)), heading: HeadingLevel.HEADING_1 }));
      docChildren.push(new Paragraph(' '));
      docChildren.push(...toParagraphs(c.texto || ''));
      if (i < chapters.length - 1) docChildren.push(new Paragraph({ children: [new PageBreak()] }));
    });

    const doc = new Document({ sections: [{ children: docChildren }] });
    const buf = await Packer.toBuffer(doc);
    const fileName = `libro_${intake_id}_${uuidv4().slice(0, 8)}.docx`;

    const up = await supabase.storage.from('books').upload(fileName, buf, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: false
    });
    if (up.error) return jsonResponse(res, 500, { error: up.error.message });

    // URL pública (bucket público). Si tu bucket es privado, usa createSignedUrl:
    const pub = supabase.storage.from('books').getPublicUrl(fileName);
    let url = pub.data?.publicUrl || '';

    // // Bucket PRIVADO (descomenta si lo usás privado)
    // const signed = await supabase.storage.from('books').createSignedUrl(fileName, 60 * 60 * 24 * 7); // 7 días
    // url = signed.data?.signedUrl || '';

    await supabase.from('book_jobs').insert({
      intake_id,
      status: 'completed',
      output_url: url
    });

    return jsonResponse(res, 200, { ok: true, url, chapters: chapters.length, model: MODEL });
  } catch (e) {
    const code = e.code === 403 ? 403 : 500;
    return jsonResponse(res, code, { error: e.message || 'error' });
  }
}
