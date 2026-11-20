const api=window.GIGO_API;
const $=s=>document.querySelector(s);
const fmt=v=>v?new Date(v).toLocaleString(): "Not scheduled";
const card=(title,sub,badge="")=>'<article class="data-card"><div><h3>'+api.esc(title)+'</h3><p>'+api.esc(sub||"")+'</p></div>'+(badge?'<span class="status-pill">'+api.esc(badge)+'</span>':"")+'</article>';
async function load(){
 const [approvals,schedules,notices,events]=await Promise.all([
  api.request("/api/v1/operations/approvals?status=pending"),
  api.request("/api/v1/operations/schedules"),
  api.request("/api/v1/operations/notifications"),
  api.request("/api/v1/operations/events")
 ]);
 $("#count-approvals").textContent=approvals.length;
 $("#count-schedules").textContent=schedules.filter(x=>x.is_enabled).length;
 $("#count-notifications").textContent=notices.filter(x=>x.channel==="in_app"&&["queued","processing"].includes(x.status)).length;
 $("#count-events").textContent=events.length;
 $("#approval-list").innerHTML=approvals.length?approvals.map(a=>'<article class="data-card"><div><h3>'+api.esc(a.title)+'</h3><p>'+api.esc(a.summary)+'<br>Risk: '+api.esc(a.risk_level)+' · Requested: '+fmt(a.created_at)+(a.expires_at?' · Expires: '+fmt(a.expires_at):"")+'</p><p class="muted-label">Action: '+api.esc(a.action_type)+'</p></div><div class="operation-actions"><button class="primary-button" data-decision="approved" data-id="'+api.esc(a.id)+'">Approve</button><button class="secondary-button" data-decision="rejected" data-id="'+api.esc(a.id)+'">Reject</button></div></article>').join(""):'<div class="empty-card">No pending approvals.</div>';
 $("#schedule-list").innerHTML=schedules.length?schedules.map(s=>card(s.name,s.schedule_type+" · "+s.job_type+" · Next: "+fmt(s.next_run_at),s.is_enabled?"Enabled":"Paused")).join(""):'<div class="empty-card">No routines saved yet.</div>';
 $("#event-list").innerHTML=events.length?events.slice(0,30).map(e=>card(e.title,e.detail||e.event_type+" · "+fmt(e.created_at),e.severity)).join(""):'<div class="empty-card">No operations events recorded yet.</div>';
 $("#notification-list").innerHTML=notices.length?notices.slice(0,30).map(n=>card(n.title,n.body+" · "+fmt(n.created_at),n.status)).join(""):'<div class="empty-card">The in-app notification queue is empty.</div>';
 $("#approval-list").querySelectorAll("[data-decision]").forEach(b=>b.addEventListener("click",async()=>{b.disabled=true;try{await api.request("/api/v1/operations/approvals?id="+encodeURIComponent(b.dataset.id),{method:"PATCH",body:JSON.stringify({status:b.dataset.decision,decision_note:"Owner decision from Operations Centre"})});await load();}catch(e){alert(e.message);b.disabled=false;}}));
}
$("#schedule-form").addEventListener("submit",async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector("button"),v=Object.fromEntries(new FormData(f));b.disabled=true;$("#schedule-note").textContent="Saving routine…";let config={};if(v.schedule_type==="interval"){const n=Number(v.timing);if(!Number.isInteger(n)||n<5||n>10080){$("#schedule-note").textContent="Enter an interval from 5 to 10080 minutes.";b.disabled=false;return;}config={interval_minutes:n};}else if(v.schedule_type==="daily"){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(v.timing)){ $("#schedule-note").textContent="Enter daily time in 24-hour format, e.g. 08:00.";b.disabled=false;return;}config={time:v.timing,timezone:"Africa/Lagos"};}else if(v.schedule_type==="weekly"){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(v.timing)){ $("#schedule-note").textContent="Enter time in 24-hour format, e.g. 08:00.";b.disabled=false;return;}config={time:v.timing,timezone:"Africa/Lagos",day_of_week:1};}try{await api.request("/api/v1/operations/schedules",{method:"POST",body:JSON.stringify({name:v.name.trim(),schedule_type:v.schedule_type,schedule_config:config,job_type:v.job_type,job_input:{},is_enabled:true})});f.reset();$("#schedule-note").textContent="Routine saved. It will not run until the scheduler is implemented.";await load();}catch(err){$("#schedule-note").textContent=err.message;}finally{b.disabled=false;}});
$("#refresh-operations").addEventListener("click",()=>load().catch(e=>alert(e.message)));
load().catch(e=>{["#approval-list","#schedule-list","#event-list","#notification-list"].forEach(s=>$(s).textContent=e.message);});
