const api=window.GIGO_API,box=document.querySelector("#provider-status");
api.request("/api/v1/assistant/providers").then(data=>{if(!data.configured){box.innerHTML='<div class="empty-card">No eligible free AI provider configured yet.</div>';return;}box.innerHTML=data.providers.map(p=>`<article class="data-card"><div><h3>${api.esc(p.provider)}</h3><p>${p.key_count} configured key(s) · Models: ${p.models.map(api.esc).join(", ")}</p><p>Key IDs: ${p.key_ids.map(api.esc).join(", ")}</p></div><span class="status-pill">Configured</span></article>`).join("");}).catch(e=>box.textContent=e.message);

const signatureInput=document.querySelector("#message-signature"),signatureButton=document.querySelector("#save-message-signature"),signatureStatus=document.querySelector("#signature-status");
if(signatureInput&&signatureButton&&signatureStatus){
  api.request("/api/v1/settings/message-signature").then(data=>{
    if(data.configured&&typeof data.signature_name==="string"){signatureInput.value=data.signature_name;signatureStatus.textContent="Saved signature: "+data.signature_name;}
    else signatureStatus.textContent="Signature is not saved in the database yet. Save it after migration 0038 is applied.";
  }).catch(error=>{signatureStatus.textContent="Signature settings are not connected yet: "+error.message;});
  signatureButton.addEventListener("click",async()=>{
    const signature_name=signatureInput.value.trim();
    signatureButton.disabled=true;signatureStatus.textContent="Saving…";
    try{const data=await api.request("/api/v1/settings/message-signature",{method:"POST",body:JSON.stringify({signature_name})});signatureInput.value=data.signature_name;signatureStatus.textContent="Saved signature: "+data.signature_name;}
    catch(error){signatureStatus.textContent=error.message;}
    finally{signatureButton.disabled=false;}
  });
}

const autonomyStatus=document.querySelector("#autonomy-status"),initializeAutonomy=document.querySelector("#initialize-autonomy"),toggleAutonomyPause=document.querySelector("#toggle-autonomy-pause"),autonomyPolicies=document.querySelector("#autonomy-policies"),autonomyAudit=document.querySelector("#autonomy-audit");
if(autonomyStatus&&initializeAutonomy&&toggleAutonomyPause&&autonomyPolicies){
  let autonomyState=null;
  const scopeLabels={observe:"Observe workspace data",analyse:"Analyse and research",draft:"Create drafts",internal_execute:"Execute internal workspace actions"};
  async function loadAutonomy(){
    try{
      autonomyState=await api.request("/api/v1/autonomy");
      initializeAutonomy.hidden=autonomyState.initialized===true;
      toggleAutonomyPause.disabled=!autonomyState.initialized;
      toggleAutonomyPause.textContent=autonomyState.is_paused?"Resume internal tools":"Pause all tools";
      autonomyStatus.textContent=autonomyState.initialized?(autonomyState.is_paused?"GiGo is PAUSED. "+(autonomyState.pause_reason||""):"GiGo is UNPAUSED. Only enabled, audited internal scopes can run."):"No durable autonomy state exists. GiGo remains paused until initialized.";
      if(autonomyAudit){
        try{
          const audit=await api.request("/api/v1/autonomy/audit?limit=20");
          const events=Array.isArray(audit.events)?audit.events:[];
          autonomyAudit.innerHTML=events.length?events.map(event=>'<article class="data-card"><div><strong>'+api.esc(event.tool_name)+' · '+api.esc(event.decision)+'</strong><p>'+api.esc(event.reason_code)+' · '+api.esc(new Date(event.created_at).toLocaleString())+'</p><p>'+api.esc(event.result_summary||"")+'</p></div></article>').join(""):'<div class="empty-card">No autonomy events recorded yet.</div>';
        }catch(error){autonomyAudit.textContent="Audit history unavailable: "+error.message;}
      }
      const rows=Array.isArray(autonomyState.policies)?autonomyState.policies:[];
      autonomyPolicies.innerHTML=Object.entries(scopeLabels).map(([scope,label])=>{
        const row=rows.find(item=>item.scope===scope);
        const checked=row?.enabled===true;
        return '<label class="data-card" style="display:flex;align-items:center;gap:12px"><input type="checkbox" data-autonomy-scope="'+scope+'" '+(checked?"checked":"")+' '+(!autonomyState.initialized?"disabled":"")+'><span>'+api.esc(label)+'</span></label>';
      }).join("")+'<article class="data-card"><div><strong>External execution</strong><p>Disabled — campaign-bound approval and provider controls are not yet connected.</p></div><span class="status-pill">Blocked</span></article>';
    }catch(error){autonomyStatus.textContent="Autonomy settings unavailable: "+error.message+" GiGo tools remain fail-closed.";toggleAutonomyPause.disabled=true;initializeAutonomy.disabled=false;}
  }
  initializeAutonomy.addEventListener("click",async()=>{
    initializeAutonomy.disabled=true;autonomyStatus.textContent="Initializing with global pause enabled…";
    try{await api.request("/api/v1/autonomy/initialize",{method:"POST",body:JSON.stringify({})});await loadAutonomy();}
    catch(error){autonomyStatus.textContent=error.message;}
    finally{initializeAutonomy.disabled=false;}
  });
  toggleAutonomyPause.addEventListener("click",async()=>{
    if(!autonomyState)return;
    toggleAutonomyPause.disabled=true;
    try{await api.request("/api/v1/autonomy/pause",{method:"POST",body:JSON.stringify({is_paused:!autonomyState.is_paused,reason:!autonomyState.is_paused?"Paused by owner from settings":null})});await loadAutonomy();}
    catch(error){autonomyStatus.textContent=error.message;}
    finally{toggleAutonomyPause.disabled=false;}
  });
  autonomyPolicies.addEventListener("change",async event=>{
    const input=event.target.closest("[data-autonomy-scope]");if(!input||!autonomyState)return;
    input.disabled=true;
    try{await api.request("/api/v1/autonomy/policies",{method:"POST",body:JSON.stringify({scope:input.dataset.autonomyScope,enabled:input.checked,require_approval:false,limits:{}})});await loadAutonomy();}
    catch(error){autonomyStatus.textContent=error.message;await loadAutonomy();}
  });
  loadAutonomy();
}
