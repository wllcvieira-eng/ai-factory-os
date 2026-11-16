import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {timingSafeEqual,createHash} from 'node:crypto';
const port=Number(process.env.PORT||3000), key=process.env.OPENAI_API_KEY, password=process.env.ADMIN_PASSWORD, model=process.env.OPENAI_MODEL||'gpt-4.1-mini';
if(!password||password.length<12){console.error('Configure ADMIN_PASSWORD com pelo menos 12 caracteres.');process.exit(1)}
const hash=x=>createHash('sha256').update(x).digest();
const auth='Basic '+Buffer.from('admin:'+password).toString('base64');
const html=await readFile(new URL('./public/index.html',import.meta.url));
const json=(res,status,obj)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj))};
let calls=[];let busy=false;
http.createServer(async(req,res)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
const path=new URL(req.url,'http://localhost').pathname;
if(path==='/health')return json(res,200,{ok:true});
if(!timingSafeEqual(hash(req.headers.authorization||''),hash(auth))){res.writeHead(401,{'WWW-Authenticate':'Basic realm="AI Factory", charset="UTF-8"','Cache-Control':'no-store'});return res.end('Acesso privado')}
if(req.method==='GET'&&path==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(html)}
if(req.method!=='POST'||path!=='/api/generate')return json(res,404,{error:'Rota não encontrada.'});
if(!String(req.headers['content-type']).startsWith('application/json'))return json(res,415,{error:'Formato inválido.'});
if(req.headers['sec-fetch-site']==='cross-site')return json(res,403,{error:'Origem não autorizada.'});
if(!key)return json(res,503,{error:'Configure OPENAI_API_KEY no servidor.'});
try{let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>20000)return json(res,413,{error:'Solicitação muito extensa.'})}const {prompt}=JSON.parse(raw);if(typeof prompt!=='string'||!prompt.trim()||prompt.length>12000)return json(res,400,{error:'Briefing inválido.'});calls=calls.filter(t=>Date.now()-t<3600000);if(busy||calls.length>=20)return json(res,429,{error:'Limite temporário de geração atingido.'});busy=true;calls.push(Date.now());try{const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,input:prompt,instructions:'Crie conteúdo em português brasileiro. Não invente resultados, depoimentos, fontes ou garantias. Identifique hipóteses. Entregue conteúdo prático e revisável.',max_output_tokens:2500,store:false}),signal:AbortSignal.timeout(60000)});const d=await r.json();if(!r.ok){console.error('OpenAI HTTP',r.status);return json(res,502,{error:'Falha na API de IA (HTTP '+r.status+'). Verifique chave, créditos e modelo no servidor.'})}const text=d.output?.flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('\n');if(!text)return json(res,502,{error:'A IA não retornou texto.'});return json(res,200,{text})}finally{busy=false}}catch(e){return json(res,400,{error:'Não foi possível concluir a solicitação. Verifique os dados e tente novamente.'})}
}).listen(port,'0.0.0.0',()=>console.log('AI Factory OS pronta na porta '+port));
