const api=window.GIGO_API,esc=api.esc;
const status=document.querySelector("#outreach-status"),campaignList=document.querySelector("#campaign-list"),workspace=document.querySelector("#campaign-workspace");
const campaignForm=document.querySelector("#campaign-form"),recipientForm=document.querySelector("#recipient-form"),templateForm=document.querySelector("#template-form"),approvalForm=document.querySelector("#approval-form");
const kindSelect=document.querySelector("#campaign-kind"),campaignState=document.querySelector("#campaign-state");
let campaigns=[],selected=null,recipients=[],templates=[];
function say(message){status.textContent=message;}
function card(title,detail,meta=""){return '<article class="data-card"><div><strong>'+esc(title)+'</strong><p>'+esc(detail||"")+'</p><small>'+esc(meta)+'</small></div></article>';}
async function loadCampaigns(){
 try{campaigns=await api.request("/api/v1/outreach/campaigns")||[];campaignList.innerHTML=campaigns.map(c=>'<article class="data-card"><div><strong>'+esc(c.name)+'</strong><p>'+esc(c.objective)+'</p><small>'+esc(c.campaign_kind||"general")+' · '+esc(c.status)+' · '+esc(c.approval_status||"not approved")+'</small></div><button class="secondary-button" type="button" data-open-campaign="'+esc(c.id)+'">Open</button></article>').join("")||'<div class="empty-card">No campaigns yet. Create a draft to begin.</div>';say(campaigns.length+" campaign(s) loaded.");if(selected){const fresh=campaigns.find(c=>c.id===selected.id);if(fresh)selected=fresh;renderSelected();}}
 catch(e){say("Could not load campaigns: "+e.message);}
}
function renderSelected(){
 if(!selected){workspace.hidden=true;return;}
 workspace.hidden=false;document.querySelector("#selected-campaign-title").textContent=selected.name;campaignState.textContent=(selected.status||"draft")+" · "+(selected.approval_status||"not approved");kindSelect.value=selected.campaign_kind||"general";
}
async function loadCampaignDetails(){
 if(!selected)return;
 const id=encodeURIComponent(selected.id);
 try{
  [recipients,templates]=await Promise.all([api.request("/api/v1/outreach/campaigns/"+id+"/recipients"),api.request("/api/v1/outreach/campaigns/"+id+"/templates")]);
  recipients=recipients||[];templates=templates||[];
  document.querySelector("#recipient-list").innerHTML=recipients.map(r=>{
   const reviewed=r.contact_authorization_status==="approved"&&r.marketing_contact_registered;
   const evidence=r.contact_authorization_evidence_url||"";
   return '<article class="data-card"><div><strong>'+esc(r.recipient_name||r.email)+'</strong><p>'+esc(r.organisation||"")+' · '+esc(r.email)+'</p><small>'+esc(r.status)+' · contact basis: '+esc(r.contact_authorization_status||"unreviewed")+' · marketing registered: '+(r.marketing_contact_registered?"yes":"no")+'</small>'+(r.stop_reason?'<p>'+esc(r.stop_reason)+'</p>':'')+'</div><div class="form-actions"><button class="secondary-button" data-review-recipient="'+esc(r.id)+'" data-review-state="approved" type="button" '+(reviewed?"disabled":"")+'>Approve eligibility</button><button class="secondary-button" data-review-recipient="'+esc(r.id)+'" data-review-state="blocked" type="button">Block</button></div></article>';
  }).join("")||'<div class="empty-card">No recipients added yet.</div>';
  document.querySelector("#template-list").innerHTML=templates.map(t=>card("Sequence "+t.sequence_number+" · "+t.message_type,t.subject_template,t.approved_at?"Approved":"Draft template")).join("")||'<div class="empty-card">No templates saved yet.</div>';
 }catch(e){document.querySelector("#recipient-list").textContent="Could not load campaign details: "+e.message;}
}
campaignForm.addEventListener("submit",async e=>{
 e.preventDefault();const f=new FormData(campaignForm);const payload={name:f.get("name"),objective:f.get("objective"),offer_summary:f.get("offer_summary")||null};
 say("Creating draft campaign…");try{const rows=await api.request("/api/v1/outreach/campaigns",{method:"POST",body:JSON.stringify(payload)});selected=Array.isArray(rows)?rows[0]:rows;campaignForm.reset();await loadCampaigns();renderSelected();await loadCampaignDetails();say("Draft campaign created. No message was sent.");}catch(error){say("Campaign creation failed: "+error.message);}
});
campaignList.addEventListener("click",async e=>{const b=e.target.closest("[data-open-campaign]");if(!b)return;selected=campaigns.find(c=>c.id===b.dataset.openCampaign)||null;renderSelected();await loadCampaignDetails();});
document.querySelector("#save-campaign-kind").addEventListener("click",async()=>{
 if(!selected)return;try{await api.request("/api/v1/outreach/campaigns/"+encodeURIComponent(selected.id)+"/kind",{method:"POST",body:JSON.stringify({campaign_kind:kindSelect.value})});selected.campaign_kind=kindSelect.value;say("Campaign type saved. Partnership messages carry the required 50/50 terms.");await loadCampaigns();}catch(e){say("Could not change campaign type: "+e.message);}
});
recipientForm.addEventListener("submit",async e=>{
 e.preventDefault();if(!selected)return;const f=new FormData(recipientForm);const payload={email:f.get("email"),recipient_name:f.get("recipient_name")||null,organisation:f.get("organisation")||null};
 try{await api.request("/api/v1/outreach/campaigns/"+encodeURIComponent(selected.id)+"/recipients",{method:"POST",body:JSON.stringify(payload)});recipientForm.reset();await loadCampaignDetails();say("Recipient added as unreviewed. No contact was sent.");}catch(error){say("Recipient was not added: "+error.message);}
});
document.querySelector("#recipient-list").addEventListener("click",async e=>{
 const b=e.target.closest("[data-review-recipient]");if(!b||!selected)return;
 const id=b.dataset.reviewRecipient,state=b.dataset.reviewState;
 let payload={contact_authorization_status:state};
 if(state==="approved"){
  const basis=prompt("Documented contact basis: consent, existing_relationship, legitimate_interest_assessed, or other_documented");
  if(!["consent","existing_relationship","legitimate_interest_assessed","other_documented"].includes(basis||"")){say("Eligibility review cancelled: choose a supported documented basis.");return;}
  const url=prompt("HTTPS evidence URL supporting this contact basis");
  if(!url||!/^https:\/\/[^\s]+$/i.test(url)){say("Eligibility review cancelled: a valid HTTPS evidence URL is required.");return;}
  if(!confirm("Confirm that this person is registered in the provider's marketing audience and that contact is lawful under applicable rules?"))return;
  payload={contact_authorization_status:"approved",contact_authorization_basis:basis,contact_authorization_evidence_url:url,marketing_contact_registered:true};
 }
 try{await api.request("/api/v1/outreach/recipients/"+encodeURIComponent(id)+"/eligibility",{method:"POST",body:JSON.stringify(payload)});await loadCampaignDetails();say("Recipient eligibility updated. Always verify legal basis and provider rules independently.");}catch(error){say("Eligibility update failed: "+error.message);}
});
templateForm.addEventListener("submit",async e=>{
 e.preventDefault();if(!selected)return;const sequence=Number(document.querySelector("#template-sequence").value),subject=document.querySelector("#template-subject").value.trim(),body=document.querySelector("#template-body").value.trim();
 const all=subject+"\n"+body,fields=[...new Set([...all.matchAll(/\{\{([a-z_]+)\}\}/g)].map(m=>m[1]))];
 try{await api.request("/api/v1/outreach/campaigns/"+encodeURIComponent(selected.id)+"/templates",{method:"POST",body:JSON.stringify({sequence_number:sequence,subject_template:subject,body_template:body,personalization_fields:fields})});templateForm.reset();await loadCampaignDetails();say("Template saved as a draft. It has not been approved or sent.");}catch(error){say("Template was not saved: "+error.message);}
});
approvalForm.addEventListener("submit",async e=>{
 e.preventDefault();if(!selected)return;
 const followups=document.querySelector("#followups-enabled").checked;
 const delaysRaw=document.querySelector("#followup-delays").value.trim();
 const delays=followups?delaysRaw.split(",").map(x=>Number(x.trim())):[];
 if(followups&&(!delaysRaw||delays.some(x=>!Number.isInteger(x)||x<1||x>30))){say("Enter follow-up delays as whole days from 1 to 30.");return;}
 const maxMessages=Number(document.querySelector("#max-messages").value);
 if((followups&&maxMessages<delays.length+1)||(!followups&&maxMessages!==1)){say("Maximum messages per recipient must match the initial message plus the enabled follow-ups.");return;}
 const payload={sender_email:document.querySelector("#sender-email").value.trim(),sender_name:document.querySelector("#sender-name").value.trim(),max_recipients:Number(document.querySelector("#max-recipients").value),max_messages_per_recipient:maxMessages,initial_send_enabled:true,followups_enabled:followups,followup_delays_days:delays,send_window_start:document.querySelector("#send-start").value,send_window_end:document.querySelector("#send-end").value,timezone:document.querySelector("#send-timezone").value.trim(),quiet_hours_start:null,quiet_hours_end:null};
 if(!confirm("Approve this campaign policy? This authorizes the bounded campaign configuration only; GiGo currently has no live sender and will not transmit messages."))return;
 try{await api.request("/api/v1/outreach/campaigns/"+encodeURIComponent(selected.id)+"/approve",{method:"POST",body:JSON.stringify(payload)});say("Campaign policy approved and recorded. No sender was invoked and no messages were sent.");await loadCampaigns();}catch(error){say("Campaign approval failed: "+error.message);}
});
document.querySelector("#prepare-campaign").addEventListener("click",async()=>{
 if(!selected)return;if(!confirm("Prepare messages only for recipients whose eligibility and marketing registration have been approved? This does not send messages."))return;
 const output=document.querySelector("#prepare-result");output.textContent="Preparing eligible recipients…";
 try{const result=await api.request("/api/v1/outreach/campaigns/"+encodeURIComponent(selected.id)+"/prepare",{method:"POST",body:JSON.stringify({})});output.textContent="Prepared recipients: "+result.prepared_recipients+". Skipped: "+result.skipped_recipients+". Provider send performed: no.";await loadCampaignDetails();}
 catch(error){output.textContent="Preparation failed: "+error.message;}
});
loadCampaigns();