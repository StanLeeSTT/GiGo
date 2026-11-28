const api=window.GIGO_API;
const status=document.querySelector("#launch-status"),projectSelect=document.querySelector("#launch-project-select"),taskList=document.querySelector("#launch-task-list"),progress=document.querySelector("#launch-progress");
const projectForm=document.querySelector("#launch-project-form"),taskForm=document.querySelector("#launch-task-form");
let projects=[],tasks=[];
const checklist=[
 ["Validate the customer problem","Confirm the target customer, problem evidence and demand signals.","high"],
 ["Validate the offer and economics","Check positioning, delivery effort, pricing assumptions and costs; do not invent projections.","high"],
 ["Complete the product or service","Prepare the minimum deliverable and quality checklist.","high"],
 ["Prepare the landing page and sales assets","Draft the page, offer explanation, FAQs and call to action.","normal"],
 ["Prepare launch content","Create the approved content calendar and draft assets.","normal"],
 ["Prepare distribution and partner plan","Identify authorized channels and prepare partner materials; no messages are sent here.","normal"],
 ["Prepare customer support","Document onboarding, common questions, issue handling and refund policy for owner review.","normal"],
 ["Set up measurement and post-launch review","Define evidence-based metrics and a review date; do not invent revenue or ROI.","normal"]
];
function selectedProject(){return projects.find(p=>p.id===projectSelect.value)||null;}
async function load(){
 try{
  [projects,tasks]=await Promise.all([api.request("/api/v1/projects"),api.request("/api/v1/tasks")]);
  projects=Array.isArray(projects)?projects:[];tasks=Array.isArray(tasks)?tasks:[];
  const previous=projectSelect.value;
  projectSelect.innerHTML='<option value="">Choose a project</option>'+projects.map(p=>'<option value="'+api.esc(p.id)+'">'+api.esc(p.name)+'</option>').join("");
  if(projects.some(p=>p.id===previous))projectSelect.value=previous;
  renderTasks();status.textContent=projects.length+" project(s) · "+tasks.length+" task(s) loaded.";
 }catch(error){status.textContent="Launch workspace unavailable: "+error.message;}
}
function renderTasks(){
 const project=selectedProject();
 const rows=project?tasks.filter(t=>t.project_id===project.id):[];
 const done=rows.filter(t=>t.status==="done").length;
 progress.textContent=rows.length?Math.round(done/rows.length*100)+"% complete":"No milestones";
 taskList.innerHTML=project?(rows.map(t=>'<article class="data-card"><div><strong>'+api.esc(t.title)+'</strong><p>'+api.esc(t.description||"")+'</p><small>'+api.esc(t.priority||"normal")+' priority</small></div><select data-launch-status="'+api.esc(t.id)+'"><option value="todo" '+(t.status==="todo"?"selected":"")+'>To do</option><option value="in_progress" '+(t.status==="in_progress"?"selected":"")+'>In progress</option><option value="blocked" '+(t.status==="blocked"?"selected":"")+'>Blocked</option><option value="done" '+(t.status==="done"?"selected":"")+'>Done</option><option value="cancelled" '+(t.status==="cancelled"?"selected":"")+'>Cancelled</option></select></article>').join("")||'<div class="empty-card">No milestones for this project yet.</div>'):'<div class="empty-card">Choose a project to view its launch milestones.</div>';
}
projectSelect.addEventListener("change",renderTasks);
taskList.addEventListener("change",async event=>{
 const select=event.target.closest("[data-launch-status]");if(!select)return;
 select.disabled=true;
 try{await api.request("/api/v1/tasks?id="+encodeURIComponent(select.dataset.launchStatus),{method:"PATCH",body:JSON.stringify({status:select.value})});await load();}
 catch(error){status.textContent="Could not update milestone: "+error.message;select.disabled=false;}
});
projectForm.addEventListener("submit",async event=>{
 event.preventDefault();const button=projectForm.querySelector("button");button.disabled=true;status.textContent="Creating launch project…";
 try{
  const rows=await api.request("/api/v1/projects",{method:"POST",body:JSON.stringify({name:document.querySelector("#launch-project-name").value.trim(),description:document.querySelector("#launch-project-description").value.trim()||"Launch project managed in GiGo."})});
  const created=Array.isArray(rows)?rows[0]:rows;projectForm.reset();await load();if(created?.id){projectSelect.value=created.id;renderTasks();}status.textContent="Launch project created.";
 }catch(error){status.textContent="Project creation failed: "+error.message;}
 finally{button.disabled=false;}
});
document.querySelector("#create-launch-checklist").addEventListener("click",async()=>{
 const project=selectedProject();if(!project){status.textContent="Choose a project first.";return;}
 const button=document.querySelector("#create-launch-checklist");button.disabled=true;
 try{
  const existing=new Set(tasks.filter(t=>t.project_id===project.id).map(t=>String(t.title||"").toLowerCase()));
  const missing=checklist.filter(item=>!existing.has(("launch: "+item[0]).toLowerCase()));
  for(const [title,description,priority] of missing){
   await api.request("/api/v1/tasks",{method:"POST",body:JSON.stringify({project_id:project.id,title:"Launch: "+title,description,priority})});
  }
  await load();status.textContent=missing.length?missing.length+" launch milestones created.":"The standard launch checklist already exists.";
 }catch(error){status.textContent="Could not create checklist: "+error.message;}
 finally{button.disabled=false;}
});
taskForm.addEventListener("submit",async event=>{
 event.preventDefault();const project=selectedProject();if(!project){status.textContent="Choose a project before adding a milestone.";return;}
 const button=taskForm.querySelector("button");button.disabled=true;
 try{
  await api.request("/api/v1/tasks",{method:"POST",body:JSON.stringify({project_id:project.id,title:"Launch: "+document.querySelector("#launch-task-title").value.trim(),description:document.querySelector("#launch-task-description").value.trim()||null,priority:document.querySelector("#launch-task-priority").value})});
  taskForm.reset();await load();status.textContent="Launch milestone saved.";
 }catch(error){status.textContent="Could not save milestone: "+error.message;}
 finally{button.disabled=false;}
});
load();
