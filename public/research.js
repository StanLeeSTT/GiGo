const api=window.GIGO_API;
const status=document.querySelector("#research-status"),list=document.querySelector("#research-list"),detail=document.querySelector("#research-detail");
let selected=null;
const esc=api.esc;
function formData(form){return Object.fromEntries(new FormData(form).entries());}
function showError(error){status.textContent=error?.message||"The research request failed.";}
async function loadRuns(){
 try{const data=await api.request("/api/v1/research/runs");const rows=Array.isArray(data)?data:[];list.innerHTML=rows.length?rows.map(row=>'<button class="module-workbench research-item" data-id="'+esc(row.id)+'"><strong>'+esc(row.title)+'</strong><p>'+esc(row.research_question)+'</p><small>'+esc(row.status)+' · '+esc(new Date(row.created_at).toLocaleDateString())+'</small></button>').join(""):'<p class="welcome-copy">No research briefs yet. Create your first one above.</p>';status.textContent=rows.length+" research brief(s) saved.";list.querySelectorAll("[data-id]").forEach(button=>button.addEventListener("click",()=>selectRun(rows.find(row=>row.id===button.dataset.id))));}
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
 document.querySelector("#source-list").innerHTML=(sources||[]).map(s=>'<div class="module-workbench"><strong>'+esc(s.title)+'</strong><p>'+esc(s.excerpt||"No excerpt saved.")+'</p><a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">Open source</a><small> · '+esc(s.evidence_status)+'</small></div>').join("")||'<p class="welcome-copy">No evidence sources saved yet.</p>';
 document.querySelector("#opportunity-list").innerHTML=(opportunities||[]).map(o=>'<div class="module-workbench"><strong>'+esc(o.title)+'</strong><p>'+esc(o.customer_problem)+'</p><small>'+esc(o.status)+'</small></div>').join("")||'<p class="welcome-copy">No opportunities recorded yet.</p>';
 }catch(error){showError(error);}
}
document.querySelector("#research-form").addEventListener("submit",async event=>{
 event.preventDefault();const form=event.currentTarget;const data=formData(form);status.textContent="Saving research brief…";
 try{const result=await api.request("/api/v1/research/runs",{method:"POST",body:JSON.stringify(data)});form.reset();status.textContent="Research brief saved.";await loadRuns();if(result?.[0])await selectRun(result[0]);}
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
