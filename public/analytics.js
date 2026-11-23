const api=window.GIGO_API;
const status=document.querySelector("#analytics-status"),stats=document.querySelector("#analytics-stats"),pipeline=document.querySelector("#analytics-pipeline");
const modules=[
  ["projects","/api/v1/projects"],
  ["tasks","/api/v1/tasks"],
  ["research","/api/v1/research/runs"],
  ["partners","/api/v1/partners"],
  ["leads","/api/v1/leads"],
  ["offers","/api/v1/offers"],
  ["campaigns","/api/v1/outreach/campaigns"]
];
function countCard(label,value,detail){return '<article class="stat-card"><span>'+api.esc(label)+'</span><strong>'+api.esc(value)+'</strong><small>'+api.esc(detail)+'</small></article>';}
function moduleCard(label,value,detail,href){return '<a class="module-card" href="'+href+'"><h3>'+api.esc(label)+'</h3><strong>'+api.esc(value)+'</strong><p>'+api.esc(detail)+'</p><b>Open module →</b></a>';}
async function loadAnalytics(){
  status.textContent="Loading saved workspace data…";
  const results=await Promise.allSettled(modules.map(async([name,path])=>[name,await api.request(path)]));
  const data={};const failed=[];
  for(const result of results){
    if(result.status!=="fulfilled"){failed.push("one or more modules");continue;}
    const [name,value]=result.value;
    data[name]=Array.isArray(value)?value:(Array.isArray(value?.data)?value.data:[]);
  }
  const projects=data.projects||[],tasks=data.tasks||[],research=data.research||[],partners=data.partners||[],leads=data.leads||[],offers=data.offers||[],campaigns=data.campaigns||[];
  const activeProjects=projects.filter(x=>x.status==="active").length;
  const openTasks=tasks.filter(x=>!["done","completed","cancelled"].includes(String(x.status||"").toLowerCase())).length;
  const approvedCampaigns=campaigns.filter(x=>x.approval_status==="approved"&&x.status==="active").length;
  stats.innerHTML=[
    countCard("Active projects",activeProjects,"Saved projects marked active"),
    countCard("Open tasks",openTasks,"Tasks not completed or cancelled"),
    countCard("Research briefs",research.length,"Saved research runs"),
    countCard("Leads",leads.length,"Owner CRM records"),
    countCard("Partner candidates",partners.length,"Saved partner profiles"),
    countCard("Offer drafts",offers.length,"Saved offer records"),
    countCard("Outreach campaigns",campaigns.length,"Campaign records"),
    countCard("Approved campaigns",approvedCampaigns,"Approved active campaign policies")
  ].join("");
  pipeline.innerHTML=[
    moduleCard("Projects",projects.length,"Initiatives and delivery status","/projects"),
    moduleCard("Tasks",openTasks,"Open work items","/tasks"),
    moduleCard("Research",research.length,"Briefs and evidence records","/research"),
    moduleCard("Leads & CRM",leads.length,"Prospects and pipeline records","/leads"),
    moduleCard("Partner Studio",partners.length,"Creator and distribution candidates","/partners"),
    moduleCard("Offers",offers.length,"Saved offers and unit-economics drafts","/offers"),
    moduleCard("Outreach",campaigns.length,"Campaigns and approval state","/outreach")
  ].join("");
  const timestamp=new Date().toLocaleString();
  status.textContent="Snapshot refreshed "+timestamp+(failed.length?" · Some modules were unavailable; displayed counts may be incomplete.":" · All queried modules responded.");
}
document.querySelector("#refresh-analytics").addEventListener("click",loadAnalytics);
loadAnalytics();
