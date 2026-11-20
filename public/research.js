const api=window.GIGO_API;
const status=document.querySelector("#research-status"),list=document.querySelector("#research-list"),detail=document.querySelector("#research-detail");
let selected=null;
const esc=api.esc;
function formData(form){return Object.fromEntries(new FormData(form).entries());}
function showError(error){status.textContent=error?.message||"The research request failed.";}
async function loadRuns(){
 try{const data=await api.request("/api/v1/research/runs");const rows=Array.isArray(data.data)?data.data:[];list.innerHTML=rows.length?rows.map(row=>'<button class="module-workbench research-item" data-id="'+esc(row.id)+'"><strong>'+esc(row.title)+'</strong><p>'+esc(row.research_question)+'</p><small>'+esc(row.status)+' · '+esc(new Date(row.created_at).toLocaleDateString())+'</small></button>').join(""):'<p class="welcome-copy">No research briefs yet. Create your first one above.</p>';status.textContent=rows.length+" research brief(s) saved.";list.querySelectorAll("[data-id]").forEach(button=>button.addEventListener("click",()=>selectRun(rows.find(row=>row.id===button.dataset.id))));}
 catch(error){showError(error);}
}
async function selectRun(row){
 selected=row;detail.hidden=false;document.querySelector("#selected-title").textContent=row.title;document.querySelector("#selected-question").textContent=row.research_question;
 await loadRelated();
}
async function loadRelated(){
 if(!selected)return;
 try{
 const [sources,opportunities]=await Promise.all([
 api.request("/api/v1/research/sources?research_run_id="+encodeURIComponent(selected.id)),
 api.request("/api/v1/research/opportunities?research_run_id="+encodeURIComponent(selected.id))
 ]);
 document.querySelector("#source-list").innerHTML=(sources.data||[]).map(s=>'<div class="module-workbench"><strong>'+esc(s.title)+'</strong><p>'+esc(s.excerpt||"No excerpt saved.")+'</p><a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">Open source</a><small> · '+esc(s.evidence_status)+'</small></div>').join("")||'<p class="welcome-copy">No evidence sources saved yet.</p>';
 document.querySelector("#opportunity-list").innerHTML=(opportunities.data||[]).map(o=>'<div class="module-workbench"><strong>'+esc(o.title)+'</strong><p>'+esc(o.customer_problem)+'</p><small>'+esc(o.status)+'</small></div>').join("")||'<p class="welcome-copy">No opportunities recorded yet.</p>';
 }catch(error){showError(error);}
}
document.querySelector("#research-form").addEventListener("submit",async event=>{
 event.preventDefault();const form=event.currentTarget;const data=formData(form);status.textContent="Saving research brief…";
 try{const result=await api.request("/api/v1/research/runs",{method:"POST",body:JSON.stringify(data)});form.reset();status.textContent="Research brief saved.";await loadRuns();if(result.data?.[0])await selectRun(result.data[0]);}
 catch(error){showError(error);}
});
document.querySelector("#source-form").addEventListener("submit",async event=>{
 event.preventDefault();if(!selected)return;const form=event.currentTarget;const data=formData(form);status.textContent="Saving evidence source…";
 try{await api.request("/api/v1/research/sources",{method:"POST",body:JSON.stringify({...data,research_run_id:selected.id,source_type:"web"})});form.reset();status.textContent="Evidence source saved.";await loadRelated();}
 catch(error){showError(error);}
});
document.querySelector("#opportunity-form").addEventListener("submit",async event=>{
 event.preventDefault();if(!selected)return;const form=event.currentTarget;const data=formData(form);data.validation_steps=data.validation_steps.split("\n").map(v=>v.trim()).filter(Boolean);
 status.textContent="Saving opportunity…";
 try{await api.request("/api/v1/research/opportunities",{method:"POST",body:JSON.stringify({...data,research_run_id:selected.id})});form.reset();status.textContent="Opportunity saved.";await loadRelated();}
 catch(error){showError(error);}
});
loadRuns();
