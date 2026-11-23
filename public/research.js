const api=window.GIGO_API;
const status=document.querySelector("#research-status"),list=document.querySelector("#research-list"),detail=document.querySelector("#research-detail");
let selected=null;
const esc=api.esc;
function formData(form){return Object.fromEntries(new FormData(form).entries());}
function safeHttps(value){try{const url=new URL(String(value));return url.protocol==="https:"&&!url.username&&!url.password?url.href:null;}catch{return null;}}
function showError(error){status.textContent=error?.message||"The research request failed.";}
async function loadRuns(){
 try{const data=await api.request("/api/v1/research/runs");const rows=Array.isArray(data)?data:[];list.innerHTML=rows.length?rows.map(row=>'<button class="module-workbench research-item" data-id="'+esc(row.id)+'"><strong>'+esc(row.title)+'</strong><p>'+esc(row.research_question)+'</p><small>'+esc(row.status)+' · '+esc(new Date(row.created_at).toLocaleDateString())+'</small></button>').join(""):'<p class="welcome-copy">No research briefs yet. Create your first one above.</p>';status.textContent=rows.length+" research brief(s) saved.";list.querySelectorAll("[data-id]").forEach(button=>button.addEventListener("click",()=>selectRun(rows.find(row=>row.id===button.dataset.id))));}
 catch(error){showError(error);}
}
async function selectRun(row){
 selected=row;detail.hidden=false;const exportButton=document.querySelector("#export-research-report");if(exportButton)exportButton.disabled=false;document.querySelector("#selected-title").textContent=row.title;document.querySelector("#selected-question").textContent=row.research_question;
 await loadRelated();
}
async function loadRelated(){
 if(!selected)return;
 try{
 const [sources,opportunities,passages,claims,links]=await Promise.all([
  api.request("/api/v1/research/sources?research_run_id="+encodeURIComponent(selected.id)),
  api.request("/api/v1/research/opportunities?research_run_id="+encodeURIComponent(selected.id)),
  api.request("/api/v1/research/evidence-passages?research_run_id="+encodeURIComponent(selected.id)),
  api.request("/api/v1/research/claims?research_run_id="+encodeURIComponent(selected.id)),
  api.request("/api/v1/research/claim-evidence?research_run_id="+encodeURIComponent(selected.id))
 ]);
 document.querySelector("#source-list").innerHTML=(sources||[]).map(s=>'<article class="module-workbench"><strong>'+esc(s.title)+'</strong><p>'+esc(s.excerpt||"No excerpt saved.")+'</p><a href="'+esc(safeHttps(s.url)||"#")+'" target="_blank" rel="noopener noreferrer">Open source</a><p><small>Evidence status: '+esc(s.evidence_status)+'</small></p><div class="form-actions"><select aria-label="Evidence assessment" data-evidence-status="'+esc(s.id)+'"><option value="unreviewed" '+(s.evidence_status==="unreviewed"?"selected":"")+'>Unreviewed</option><option value="supports" '+(s.evidence_status==="supports"?"selected":"")+'>Supports</option><option value="contradicts" '+(s.evidence_status==="contradicts"?"selected":"")+'>Contradicts</option><option value="context" '+(s.evidence_status==="context"?"selected":"")+'>Context</option><option value="rejected" '+(s.evidence_status==="rejected"?"selected":"")+'>Rejected</option></select><button class="secondary-button" type="button" data-save-evidence="'+esc(s.id)+'">Save assessment</button></div></article>').join("")||'<p class="welcome-copy">No evidence sources saved yet.</p>';
 document.querySelector("#opportunity-list").innerHTML=(opportunities||[]).map(o=>'<div class="module-workbench"><strong>'+esc(o.title)+'</strong><p>'+esc(o.customer_problem)+'</p><small>'+esc(o.status)+'</small></div>').join("")||'<p class="welcome-copy">No opportunities recorded yet.</p>';
 const sourceSelect=document.querySelector("#passage-source");
 sourceSelect.innerHTML=(sources||[]).map(x=>'<option value="'+esc(x.id)+'">'+esc(x.title)+'</option>').join("")||'<option value="">Save a source first</option>';
 document.querySelector("#passage-list").innerHTML=(passages||[]).map(p=>'<article class="module-workbench"><p>'+esc(p.passage_text)+'</p><small>'+esc(p.locator_type)+' '+esc(p.locator_value||"")+' · '+esc(p.extraction_method)+' · '+esc(p.review_status)+'</small></article>').join("")||'<p class="welcome-copy">No exact passages saved yet.</p>';
 document.querySelector("#claim-list").innerHTML=(claims||[]).map(c=>'<article class="module-workbench"><p>'+esc(c.claim_text)+'</p><small>'+esc(c.claim_type)+' · verification: '+esc(c.verification_status)+' · confidence: '+esc(c.confidence??"not set")+'</small><div class="form-actions"><select aria-label="Claim verification status" data-claim-status="'+esc(c.id)+'">'+["unverified","supported","mixed","contradicted","insufficient_evidence"].map(v=>'<option value="'+v+'" '+(c.verification_status===v?"selected":"")+'>'+v.replaceAll("_"," ")+'</option>').join("")+'</select><input type="number" min="0" max="100" step="0.01" placeholder="Confidence 0–100" value="'+esc(c.confidence??"")+'" data-claim-confidence="'+esc(c.id)+'"><button class="secondary-button" type="button" data-save-claim="'+esc(c.id)+'">Save review</button></div></article>').join("")||'<p class="welcome-copy">No claims recorded yet.</p>';
 document.querySelector("#link-claim").innerHTML=(claims||[]).map(c=>'<option value="'+esc(c.id)+'">'+esc(c.claim_text.slice(0,120))+'</option>').join("");
 document.querySelector("#link-passage").innerHTML=(passages||[]).map(p=>'<option value="'+esc(p.id)+'">'+esc(p.passage_text.slice(0,120))+'</option>').join("");
 document.querySelector("#claim-evidence-list").innerHTML=(links||[]).map(link=>'<p class="welcome-copy">'+esc(link.relationship)+' · claim '+esc(link.claim_id)+' ↔ passage '+esc(link.passage_id)+'</p>').join("")||'<p class="welcome-copy">No claim/evidence links yet.</p>';
 }catch(error){showError(error);}
}

const exportReportButton=document.querySelector("#export-research-report");
if(exportReportButton) exportReportButton.addEventListener("click",async()=>{
 if(!selected)return;
 exportReportButton.disabled=true;status.textContent="Assembling evidence-backed report…";
 try{
  const response=await api.request("/api/v1/research/report?research_run_id="+encodeURIComponent(selected.id));
  const report=response?.data;
  if(!report?.run)throw new Error("Research report was empty.");
  const lines=["# "+report.run.title,"","**Generated:** "+report.generated_at,"","## Research question",report.run.research_question||"Not recorded","","## Scope",report.run.market_scope||"Not specified","","## Summary",report.run.summary||"Not recorded","","## Findings",report.run.findings||"Not recorded","","## Methodology",report.run.methodology||"Not recorded","","## Claims"];
  (report.claims||[]).forEach((claim,index)=>{
   lines.push("",(index+1)+". **"+claim.verification_status.toUpperCase()+"** — "+claim.claim_text);
   lines.push("   - Type: "+claim.claim_type+" | Confidence: "+(claim.confidence??"not assessed"));
   if(claim.reviewer_note)lines.push("   - Reviewer note: "+claim.reviewer_note);
   const related=(report.claim_evidence||[]).filter(link=>link.claim_id===claim.id);
   related.forEach(link=>{
    const passage=(report.passages||[]).find(item=>item.id===link.passage_id);
    const source=passage&&(report.sources||[]).find(item=>item.id===passage.research_source_id);
    lines.push("   - "+link.relationship.toUpperCase()+": "+(source?.title||"Unknown source")+" — "+(passage?.locator_type||"unspecified")+" "+(passage?.locator_value||""));
   });
  });
  lines.push("","## Sources");
  (report.sources||[]).forEach((source,index)=>lines.push("",(index+1)+". ["+source.title+"]("+source.url+") — "+(source.publisher||"Publisher not recorded")+" | review: "+source.evidence_status));
  lines.push("","## Exact evidence passages");
  (report.passages||[]).forEach((passage,index)=>{
   const source=(report.sources||[]).find(item=>item.id===passage.research_source_id);
   lines.push("",(index+1)+". **"+(source?.title||"Unknown source")+"** ("+passage.locator_type+" "+(passage.locator_value||"")+")","> "+passage.passage_text.replace(/\n/g,"\n> "));
   lines.push("Review: "+passage.review_status+" | Extraction: "+passage.extraction_method);
  });
  lines.push("","## Opportunities");
  (report.opportunities||[]).forEach((opportunity,index)=>lines.push("",(index+1)+". **"+opportunity.title+"**",opportunity.customer_problem,"Target: "+(opportunity.target_customer||"Not specified"),"Solution: "+(opportunity.proposed_solution||"Not specified"),"Revenue model: "+(opportunity.revenue_model||"Not specified"),"Validation: "+(Array.isArray(opportunity.validation_steps)?opportunity.validation_steps.join("; "):"Not recorded"),"Status: "+opportunity.status));
  lines.push("","---",report.verification_notice,"");
  const blob=new Blob([lines.join("\n")],{type:"text/markdown;charset=utf-8"});
  const objectUrl=URL.createObjectURL(blob),link=document.createElement("a");
  link.href=objectUrl;link.download="gigo-research-"+selected.id+".md";link.click();URL.revokeObjectURL(objectUrl);
  status.textContent="Evidence report exported. Check claim statuses before relying on conclusions.";
 }catch(error){showError(error);}
 finally{exportReportButton.disabled=false;}
});

document.querySelector("#research-form").addEventListener("submit",async event=>{
 event.preventDefault();const form=event.currentTarget;const data=formData(form);status.textContent="Saving research brief…";
 try{const result=await api.request("/api/v1/research/runs",{method:"POST",body:JSON.stringify(data)});form.reset();status.textContent="Research brief saved.";await 
document.querySelector("#passage-form").addEventListener("submit",async event=>{
 event.preventDefault();if(!selected)return;const form=event.currentTarget;const data=formData(form);status.textContent="Saving exact evidence passage…";
 try{await api.request("/api/v1/research/evidence-passages",{method:"POST",body:JSON.stringify({...data,research_run_id:selected.id})});form.reset();status.textContent="Passage saved as unreviewed evidence.";await loadRelated();}
 catch(error){showError(error);}
});
document.querySelector("#claim-form").addEventListener("submit",async event=>{
 event.preventDefault();if(!selected)return;const form=event.currentTarget;const data=formData(form);status.textContent="Saving claim…";
 try{await api.request("/api/v1/research/claims",{method:"POST",body:JSON.stringify({...data,research_run_id:selected.id,verification_status:"unverified"})});form.reset();status.textContent="Claim saved as unverified.";await loadRelated();}
 catch(error){showError(error);}
});
document.querySelector("#claim-evidence-form").addEventListener("submit",async event=>{
 event.preventDefault();if(!selected)return;const data=formData(event.currentTarget);status.textContent="Linking evidence…";
 try{await api.request("/api/v1/research/claim-evidence",{method:"POST",body:JSON.stringify({...data,research_run_id:selected.id})});status.textContent="Evidence linked.";await loadRelated();}
 catch(error){showError(error);}
});
document.querySelector("#claim-list").addEventListener("click",async event=>{
 const button=event.target.closest("[data-save-claim]");if(!button)return;const id=button.dataset.saveClaim;
 const select=document.querySelector('[data-claim-status="'+CSS.escape(id)+'"]'),confidence=document.querySelector('[data-claim-confidence="'+CSS.escape(id)+'"]');
 if(!select)return;const body={verification_status:select.value};
 if(confidence?.value!==""){const n=Number(confidence.value);if(!Number.isFinite(n)||n<0||n>100){showError(new Error("Confidence must be between 0 and 100."));return;}body.confidence=n;}
 button.disabled=true;
 try{await api.request("/api/v1/research/claims?id="+encodeURIComponent(id),{method:"PATCH",body:JSON.stringify(body)});status.textContent="Claim review saved. Verification is an owner assessment, not automatic fact-checking.";await loadRelated();}
 catch(error){showError(error);}
 finally{button.disabled=false;}
});

loadRuns();if(result?.[0])await selectRun(result[0]);}
 catch(error){showError(error);}
});
document.querySelector("#source-form").addEventListener("submit",async event=>{
 event.preventDefault();if(!selected)return;const form=event.currentTarget;const data=formData(form);status.textContent="Saving evidence source…";
 try{await api.request("/api/v1/research/sources",{method:"POST",body:JSON.stringify({...data,research_run_id:selected.id,source_type:"web"})});form.reset();status.textContent="Evidence source saved.";await loadRelated();}
 catch(error){showError(error);}
});

document.querySelector("#source-list").addEventListener("click",async event=>{
 const button=event.target.closest("[data-save-evidence]");if(!button||!selected)return;
 const sourceId=button.dataset.saveEvidence,select=document.querySelector('[data-evidence-status="'+CSS.escape(sourceId)+'"]');
 if(!select)return;button.disabled=true;
 try{await api.request("/api/v1/research/sources?id="+encodeURIComponent(sourceId),{method:"PATCH",body:JSON.stringify({evidence_status:select.value})});status.textContent="Evidence assessment saved. This is your review label, not an automatic fact-check.";await loadRelated();}
 catch(error){showError(error);}
 finally{button.disabled=false;}
});
document.querySelector("#opportunity-form").addEventListener("submit",async event=>{
 event.preventDefault();if(!selected)return;const form=event.currentTarget;const data=formData(form);data.validation_steps=data.validation_steps.split("\n").map(v=>v.trim()).filter(Boolean);
 status.textContent="Saving opportunity…";
 try{await api.request("/api/v1/research/opportunities",{method:"POST",body:JSON.stringify({...data,research_run_id:selected.id})});form.reset();status.textContent="Opportunity saved.";await loadRelated();}
 catch(error){showError(error);}
});
loadRuns();

async function loadMaxun(){
 const state=document.querySelector("#maxun-state"),message=document.querySelector("#maxun-message"),container=document.querySelector("#maxun-robots");
 if(!state||!message||!container)return;
 try{
  const status=await api.request("/api/v1/integrations/maxun/status");
  const info=status?.data||{};
  state.textContent=info.connected?"Maxun connected":"Maxun not connected";
  message.textContent=info.message||"Maxun connection status unavailable.";
  if(!info.connected){container.innerHTML='<p class="welcome-copy">After Maxun is deployed, connect its HTTPS backend URL and API key to the GiGo Cloudflare Worker. No collection runs can start before that connection is verified.</p>';return;}
  const response=await api.request("/api/v1/integrations/maxun/robots");
  let robots=response?.data;
  if(robots&&typeof robots==="object"&&!Array.isArray(robots))robots=robots.data||robots.robots||[];
  if(!Array.isArray(robots))robots=[];
  container.innerHTML=robots.length?robots.map(robot=>{
   const id=String(robot.id||"");const name=String(robot.name||robot.title||"Unnamed robot");
   return '<div class="module-workbench"><strong>'+esc(name)+'</strong><p>'+esc(robot.type||"collection robot")+' · '+esc(robot.status||"unknown")+'</p><button class="secondary-button" data-maxun-run="'+esc(id)+'" '+(!id?'disabled':'')+'>Run robot</button><small class="maxun-run-status" data-maxun-result="'+esc(id)+'"></small></div>';
  }).join(""):'<p class="welcome-copy">Maxun is connected, but no collection robots exist yet. Create a robot in the Maxun dashboard first.</p>';
  container.querySelectorAll("[data-maxun-run]").forEach(button=>button.addEventListener("click",async()=>{
   const id=button.dataset.maxunRun;const result=container.querySelector('[data-maxun-result="'+CSS.escape(id)+'"]');
   button.disabled=true;if(result)result.textContent="Starting collection…";
   try{await api.request("/api/v1/integrations/maxun/robots/"+encodeURIComponent(id)+"/runs",{method:"POST"});if(result)result.textContent="Run accepted by Maxun. Refresh this panel later to inspect its status."; }
   catch(error){if(result)result.textContent=error?.message||"Could not start the run.";}
   finally{button.disabled=false;}
  }));
 }catch(error){state.textContent="Maxun status unavailable";message.textContent=error?.message||"Could not check the collection service.";}
}
loadMaxun();
