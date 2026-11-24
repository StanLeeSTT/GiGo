const api=window.GIGO_API;
const status=document.querySelector("#analytics-status"),stats=document.querySelector("#analytics-stats"),pipeline=document.querySelector("#analytics-pipeline");
const modules=[
  ["projects","/api/v1/projects"],
  ["tasks","/api/v1/tasks"],
  ["research","/api/v1/research/runs"],
  ["partners","/api/v1/partners"],
  ["leads","/api/v1/leads"],
  ["offers","/api/v1/offers"],
  ["campaigns","/api/v1/outreach/campaigns"],
  ["marketing","/api/v1/marketing/assets"],
  ["creative","/api/v1/creative/briefs"],
  ["support","/api/v1/customers/cases"]
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
  const projects=data.projects||[],tasks=data.tasks||[],research=data.research||[],partners=data.partners||[],leads=data.leads||[],offers=data.offers||[],campaigns=data.campaigns||[],marketing=data.marketing||[],creative=data.creative||[],support=data.support||[];
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
    countCard("Approved campaigns",approvedCampaigns,"Approved active campaign policies"),
    countCard("Marketing drafts",marketing.length,"Saved content awaiting review or publishing"),
    countCard("Creative briefs",creative.length,"Saved creative production briefs"),
    countCard("Support cases",support.length,"Internal customer support records")
  ].join("");
  pipeline.innerHTML=[
    moduleCard("Projects",projects.length,"Initiatives and delivery status","/projects"),
    moduleCard("Tasks",openTasks,"Open work items","/tasks"),
    moduleCard("Research",research.length,"Briefs and evidence records","/research"),
    moduleCard("Leads & CRM",leads.length,"Prospects and pipeline records","/leads"),
    moduleCard("Partner Studio",partners.length,"Creator and distribution candidates","/partners"),
    moduleCard("Offers",offers.length,"Saved offers and unit-economics drafts","/offers"),
    moduleCard("Outreach",campaigns.length,"Campaigns and approval state","/outreach"),
    moduleCard("Marketing",marketing.length,"Saved copy drafts; publishing is separate","/marketing"),
    moduleCard("Creative Studio",creative.length,"Briefs and production tracking","/creative"),
    moduleCard("Customer Success",support.length,"Internal cases and unsent response drafts","/customers")
  ].join("");
  const timestamp=new Date().toLocaleString();
  status.textContent="Snapshot refreshed "+timestamp+(failed.length?" · Some modules were unavailable; displayed counts may be incomplete.":" · All queried modules responded.");
}
document.querySelector("#refresh-analytics").addEventListener("click",loadAnalytics);
loadAnalytics();

const whopStatus=document.querySelector("#whop-status"),whopStats=document.querySelector("#whop-stats"),whopEvents=document.querySelector("#whop-events");
async function loadWhopEvents(){
  if(!whopStatus||!whopStats||!whopEvents)return;
  whopStatus.textContent="Loading verified Whop events…";
  try{
    const rows=await api.request("/api/v1/whop/events");
    const events=Array.isArray(rows)?rows:(Array.isArray(rows?.data)?rows.data:[]);
    const succeeded=events.filter(x=>x.event_type==="payment.succeeded").length;
    const failed=events.filter(x=>x.event_type==="payment.failed").length;
    const refunds=events.filter(x=>String(x.event_type||"").startsWith("refund.")).length;
    const disputes=events.filter(x=>String(x.event_type||"").startsWith("dispute.")).length;
    whopStats.innerHTML=[
      countCard("Successful payment events",succeeded,"Verified Whop notifications in this view"),
      countCard("Failed payment events",failed,"Payment failure notifications"),
      countCard("Refund events",refunds,"Refund lifecycle notifications"),
      countCard("Dispute events",disputes,"Dispute lifecycle notifications")
    ].join("");
    whopEvents.innerHTML=events.slice(0,20).map(event=>{
      const amount=event.amount===null||event.amount===undefined?"Amount not supplied":(String(event.amount)+" "+String(event.currency||""));
      const partner=event.partner_id?" · Partner "+event.partner_id:"";
      const reference=event.payment_id||event.resource_id||event.event_id;
      return '<article class="module-workbench"><div class="workbench-state"><span class="state-dot"></span><small>'+api.esc(String(event.event_type||"event"))+'</small></div><h3>'+api.esc(amount)+'</h3><p>'+api.esc(reference||"No payment reference")+'</p><small>'+api.esc(event.product_id||"Product not identified")+api.esc(partner)+'</small><p class="welcome-copy">'+api.esc(event.occurred_at?new Date(event.occurred_at).toLocaleString():new Date(event.received_at).toLocaleString())+'</p></article>';
    }).join("")||'<p class="welcome-copy">No Whop events recorded yet. Configure the signed webhook and complete a sandbox purchase to populate this feed.</p>';
    whopStatus.textContent=events.length+" verified Whop event(s) loaded. Showing the latest 20.";
  }catch(error){
    whopStats.innerHTML="";
    whopEvents.innerHTML="";
    whopStatus.textContent=error.message||"Whop sales events are not available yet. Apply migration 0047 and configure the webhook secrets.";
  }
}
document.querySelector("#refresh-whop")?.addEventListener("click",loadWhopEvents);
loadWhopEvents();
