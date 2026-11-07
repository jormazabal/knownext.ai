// Offline capture review. This program has no provider client or network path.
import {open,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const dimensions=['fulfilment','fidelity','grounding','language','usability'];
const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const identifier=value=>typeof value==='string'&&/^[a-z0-9-]{3,80}$/.test(value);
const finite=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
function requireValue(condition,message){if(!condition)throw new Error(message);}
async function readJson(path,label){
  const file=await open(path,'r');
  try{
    requireValue((await file.stat()).isFile(),`${label}: se requiere un archivo regular`);
    const buffer=Buffer.alloc(4*1024*1024+1);let count=0;
    while(count<buffer.length){const result=await file.read(buffer,count,buffer.length-count,null);if(!result.bytesRead)break;count+=result.bytesRead;}
    requireValue(count<buffer.length,`${label}: límite de 4 MiB superado`);
    const bytes=buffer.subarray(0,count);let value;
    try{value=JSON.parse(bytes.toString('utf8'));}catch{throw new Error(`${label}: JSON no válido`);}
    return{value,sha256:hash(bytes)};
  }finally{await file.close();}
}
function validateCorpus(corpus){
  requireValue(corpus.schemaVersion===1&&Array.isArray(corpus.cases)&&corpus.cases.length>0&&corpus.cases.length<=128,'Corpus no compatible o fuera de límites');
  const ids=new Set();
  for(const item of corpus.cases){
    requireValue(identifier(item.id)&&!ids.has(item.id),'El corpus contiene identidades inválidas o duplicadas');ids.add(item.id);
    requireValue(['writing','query','authority'].includes(item.category)&&['es','eu','en'].includes(item.language),'Categoría o idioma no compatible');
    requireValue(typeof item.request?.prompt==='string'&&item.request.prompt.length>0&&item.request.prompt.length<=8000,'Solicitud de corpus no válida');
    for(const field of ['expectedFacts','forbiddenClaims'])requireValue(Array.isArray(item[field])&&item[field].length<=32&&item[field].every(v=>typeof v==='string'&&v.length<=4000),'Rúbrica de hechos no válida');
    const checks=item.runtimeChecks;
    if(checks===null)continue; // UI/native effects require their own observable evidence.
    requireValue(isRecord(checks)&&Array.isArray(checks.allowedStatuses)&&checks.allowedStatuses.every(v=>typeof v==='string')&&Array.isArray(checks.allowedOperationTypes)&&checks.allowedOperationTypes.every(v=>typeof v==='string')&&typeof checks.forbidExecutableFields==='boolean','Contrato de corpus no válido');
  }
}
function contract(response,checks){
  if(checks===null)return null;
  if(!isRecord(response))return['response-missing'];
  const errors=[];
  if(!checks.allowedStatuses.includes(response.status))errors.push('status-outside-contract');
  if(!Array.isArray(response.operations))errors.push('operations-missing');
  else if(response.operations.some(o=>!isRecord(o)||!checks.allowedOperationTypes.includes(o.type)))errors.push('operation-outside-contract');
  if(checks.forbidExecutableFields){
    if(['updatedDocument','updatedHandwrittenNote','editProposal','drawingProposal','pendingIntent','task'].some(k=>response[k]!==null&&response[k]!==undefined))errors.push('executable-field-outside-scope');
    if(Array.isArray(response.generatedImages)&&response.generatedImages.length)errors.push('generated-image-outside-scope');
  }
  return errors;
}
function semantic(attempt){
  const scores=attempt.semanticScores;
  if(!isRecord(scores)||!dimensions.every(d=>Number.isInteger(scores[d])&&scores[d]>=0&&scores[d]<=4)||typeof attempt.criticalFailure!=='boolean'||typeof attempt.reviewedBy!=='string'||!attempt.reviewedBy.trim())return{status:'pending',scores:null,criticalFailure:null};
  // Deliberately no universal pass threshold before the first real baseline.
  return{status:attempt.criticalFailure?'critical-failure':'reviewed',scores:Object.fromEntries(dimensions.map(d=>[d,scores[d]])),criticalFailure:attempt.criticalFailure};
}
const range=values=>values.length?{minimum:Math.min(...values),maximum:Math.max(...values)}:null;
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function html(report){
  const synthetic=report.origin==='synthetic-control';
  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KnowNext · Evaluación IA</title><style>*{box-sizing:border-box}body{margin:0;background:#f7f6f3;color:#18201c;font:15px/1.5 system-ui}main{max-width:1120px;margin:auto;padding:36px}h1{font-size:34px;line-height:1.15}p{max-width:950px;color:#59625e}.label{color:#a64125;font-size:12px;letter-spacing:.08em;text-transform:uppercase}.notice{border-left:3px solid #a64125;padding:12px 18px;background:white}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;padding:20px 0;border-bottom:1px solid #ddd}.metrics strong{display:block;color:#963d24}.table{overflow:auto}table{border-collapse:collapse;width:100%;font-size:12px}th,td{text-align:left;padding:12px 9px;border-bottom:1px solid #ddd;vertical-align:top}th{color:#59625e}code{font-size:11px;overflow-wrap:anywhere}.muted{color:#68716d}footer{margin-top:25px;border-top:1px solid #ddd;padding-top:14px;font-size:12px}@media(max-width:650px){main{padding:20px 14px}.metrics{grid-template-columns:1fr}h1{font-size:28px}}</style><main><div class="label">KnowNext.ai 3.0 · Evaluación reproducible</div><h1>${synthetic?'Control del evaluador · calidad del modelo pendiente':'Revisión de capturas · contratos y calidad separados'}</h1><p class="notice">${synthetic?'Este informe contiene controles sintéticos positivos y negativos. No se ha ejecutado un proveedor ni se ha medido la calidad de un modelo.':'Informe de capturas aportadas. El evaluador no ha llamado a proveedores ni acredita por sí solo los efectos nativos de una respuesta.'}</p><div class="metrics"><div><strong>Procedencia</strong>${escape(report.origin)}<br>${escape(report.runId)}</div><div><strong>Calidad semántica</strong>${synthetic?'Pendiente de ejecución y revisión reales':`${report.cases.filter(c=>c.attempts.some(a=>a.semantic.status!=='pending')).length} casos con revisión aportada; sin umbral de aceptación fijado`}</div><div><strong>Coste y latencia</strong>${synthetic?'Sin medición real':report.measurements.costComplete?`${report.measurements.reportedCostUsd} USD declarados`:'Datos parciales o ausentes; no se sustituyen por cero'}</div></div><h2>Cobertura por caso</h2><p>Los contratos se comprueban sobre campos de la captura. Fidelidad, hechos, fuentes y usabilidad requieren la rúbrica de revisión. Los casos ausentes permanecen sin ejecutar.</p><div class="table"><table><thead><tr><th>Caso</th><th>Área / idioma</th><th>Contrato declarado</th><th>Calidad / variabilidad</th></tr></thead><tbody>${report.cases.map(c=>`<tr><td><strong>${escape(c.id)}</strong></td><td>${escape(c.category)} · ${escape(c.language)}</td><td>${c.attempts.length?c.attempts.map(a=>`${a.repetition}: ${a.contractErrors===null?'Requiere evidencia de UI/runtime':a.contractErrors.length?'fallo':'correcto'}${synthetic?' · control sintético':''}`).join('<br>'):'Sin ejecutar'}</td><td>${c.attempts.length?c.attempts.map(a=>`${a.repetition}: ${escape(a.semantic.status)}`).join('<br>'):'Pendiente'}${c.latencyMs?`<br>Latencia declarada: ${c.latencyMs.minimum}–${c.latencyMs.maximum} ms`:''}</td></tr>`).join('')}</tbody></table></div><footer>Corpus SHA: <code>${report.corpusSha256}</code><br>Capturas SHA: <code>${report.captureSha256}</code><br>Evaluador SHA: <code>${report.evaluatorSha256}</code><br>No contiene respuestas, prompts, claves ni rutas locales de las capturas. No equivale a aceptación humana ni a una evaluación end-to-end.</footer></main></html>`;
}

try{
  const args=process.argv.slice(2),options={};
  for(let i=0;i<args.length;i++){
    if(args[i]==='--verify-controls'){options.verifyControls=true;continue;}
    requireValue(['--corpus','--responses','--output'].includes(args[i])&&args[i+1]&&!args[i+1].startsWith('--'),'Uso: --corpus archivo --responses archivo --output informe.json [--verify-controls]');
    requireValue(!options[args[i]],'Argumento duplicado');options[args[i]]=resolve(args[++i]);
  }
  requireValue(options['--corpus']&&options['--responses']&&options['--output'],'Faltan corpus, capturas o destino');
  const[c,r,script]=await Promise.all([readJson(options['--corpus'],'Corpus'),readJson(options['--responses'],'Capturas'),open(new URL(import.meta.url),'r')]);
  let evaluatorSha256;try{evaluatorSha256=hash(await script.readFile());}finally{await script.close();}
  validateCorpus(c.value);const captures=r.value;
  requireValue(captures.schemaVersion===1&&identifier(captures.runId)&&['synthetic-control','provider-capture'].includes(captures.origin)&&Array.isArray(captures.attempts)&&captures.attempts.length<=256,'Capturas no compatibles o fuera de límites');
  requireValue(typeof captures.executedAt==='string'&&Number.isFinite(Date.parse(captures.executedAt)),'Fecha de capturas no válida');
  requireValue(captures.corpusSha256===c.sha256,'Las capturas no corresponden a esta revisión del corpus');
  if(captures.origin==='provider-capture')requireValue(typeof captures.model==='string'&&captures.model.length<=200&&typeof captures.configurationHash==='string'&&/^[a-f0-9]{64}$/.test(captures.configurationHash),'Una captura real requiere modelo y huella de configuración');
  if(options.verifyControls)requireValue(captures.origin==='synthetic-control','La comprobación de controles requiere procedencia sintética');
  const pairs=new Set();const graded=[];
  for(const attempt of captures.attempts){
    const item=c.value.cases.find(c=>c.id===attempt.caseId);
    requireValue(item&&Number.isInteger(attempt.repetition)&&attempt.repetition>=1&&attempt.repetition<=10,'Caso o repetición de captura no válido');
    const pair=`${attempt.caseId}:${attempt.repetition}`;requireValue(!pairs.has(pair),'Intento duplicado');pairs.add(pair);
    const errors=contract(attempt.response,item.runtimeChecks);
    const result={caseId:item.id,repetition:attempt.repetition,contractErrors:errors,semantic:captures.origin==='synthetic-control'?{status:'pending',scores:null,criticalFailure:null}:semantic(attempt),latencyMs:captures.origin==='provider-capture'&&finite(attempt.latencyMs)?attempt.latencyMs:null,estimatedCostUsd:captures.origin==='provider-capture'&&finite(attempt.estimatedCostUsd)?attempt.estimatedCostUsd:null};
    if(options.verifyControls){requireValue(errors!==null&&typeof attempt.expectedContractPass==='boolean','Control sin contrato o resultado esperado');result.controlMatched=(errors.length===0)===attempt.expectedContractPass;}
    graded.push(result);
  }
  const costs=graded.map(a=>a.estimatedCostUsd).filter(v=>v!==null);
  const report={schemaVersion:1,runId:captures.runId,origin:captures.origin,checkedAt:new Date().toISOString(),capturedAt:captures.executedAt,corpusSha256:c.sha256,captureSha256:r.sha256,evaluatorSha256,configurationHash:captures.configurationHash??null,model:captures.origin==='provider-capture'?captures.model:null,providerExecutedByEvaluator:false,nativeEffectsVerifiedByEvaluator:false,semanticThresholds:'not-established',measurements:{reportedCostUsd:costs.length?Number(costs.reduce((a,b)=>a+b,0).toFixed(8)):null,costComplete:graded.length>0&&costs.length===graded.length,missingCostAttempts:graded.length-costs.length},cases:c.value.cases.map(item=>{const attempts=graded.filter(a=>a.caseId===item.id);return{id:item.id,category:item.category,language:item.language,attempts,latencyMs:range(attempts.map(a=>a.latencyMs).filter(v=>v!==null)),semanticRanges:Object.fromEntries(dimensions.map(d=>[d,range(attempts.filter(a=>a.semantic.scores).map(a=>a.semantic.scores[d]))]))};})};
  if(options.verifyControls){requireValue(graded.length>=2&&captures.attempts.some(a=>a.expectedContractPass)&&captures.attempts.some(a=>!a.expectedContractPass),'Se necesitan controles positivos y negativos');report.controlsPassed=graded.every(a=>a.controlMatched);}
  const destination=options['--output'];requireValue(extname(destination)==='.json','El destino debe terminar en .json');
  const pathKey=path=>process.platform==='win32'?path.toLowerCase():path;
  requireValue(![options['--corpus'],options['--responses'],fileURLToPath(import.meta.url)].map(pathKey).includes(pathKey(destination)),'El informe no puede reemplazar sus entradas');
  await mkdir(dirname(destination),{recursive:true});await writeFile(destination,JSON.stringify(report,null,2)+'\n');await writeFile(destination.slice(0,-5)+'.html',html(report));
  console.log(JSON.stringify({origin:report.origin,providerExecuted:false,controlsPassed:report.controlsPassed??null,semanticThresholds:report.semanticThresholds,unexecutedCases:report.cases.filter(c=>!c.attempts.length).length}));
  if(options.verifyControls&&!report.controlsPassed)process.exitCode=1;
  else if(!options.verifyControls&&graded.some(a=>a.contractErrors?.length||a.semantic.criticalFailure))process.exitCode=1;
}catch(error){console.error(error instanceof Error?error.message:'No se pudo revisar la evaluación');process.exitCode=2;}
