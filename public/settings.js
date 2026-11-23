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
