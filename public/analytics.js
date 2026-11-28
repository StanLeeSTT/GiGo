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

  const whopStatus=document.querySelector("#whop-sales-status"),whopStats=document.querySelector("#whop-sales-stats"),whopPartners=document.querySelector("#whop-partner-sales");
  try{
    const report=await api.request("/api/v1/whop/sales");
    const currencies=Array.isArray(report?.currencies)?report.currencies:[];
    const partners=Array.isArray(report?.partner_sales)?report.partner_sales:[];
    const totalPayments=currencies.reduce((sum,item)=>sum+Number(item.successful_payments||0),0);
    const totalRefunds=currencies.reduce((sum,item)=>sum+Number(item.refunds||0),0);
    const totalFailed=currencies.reduce((sum,item)=>sum+Number(item.failed_payments||0),0);
    const totalDisputes=currencies.reduce((sum,item)=>sum+Number(item.disputes||0),0);
    const amounts=currencies.map(item=>String(item.currency||"UNKNOWN")+" "+Number(item.observed_sales_amount||0).toLocaleString()).join(" · ")||"No sales recorded";
    whopStats.innerHTML=[
      countCard("Verified events",Number(report?.event_count||0),"Latest "+Number(report?.limited_to_latest||500)+" events"),
      countCard("Successful payments",totalPayments,"Whop payment.succeeded events"),
      countCard("Observed sales",amounts,"Grouped by currency; not net proceeds"),
      countCard("Refund events",totalRefunds,"Observed refund.created events"),
      countCard("Failed payments",totalFailed,"Whop payment.failed events"),
      countCard("Disputes",totalDisputes,"Whop dispute.created events")
    ].join("");
    whopPartners.innerHTML=partners.length?partners.map(item=>moduleCard("Partner "+String(item.partner_id),Number(item.successful_payments||0)+" sales",String(item.currency||"UNKNOWN")+" "+Number(item.observed_sales_amount||0).toLocaleString()+" observed","/partners")).join(""):'<article class="module-card"><h3>Partner attribution</h3><p>No attributed partner sales have been received yet.</p></article>';
    whopStatus.textContent=Number(report?.event_count||0)?"Read-only Whop event feed connected · "+partners.length+" attributed partner record(s).":"Webhook receiver is ready; no Whop payment events have been recorded yet.";
  }catch(error){
    whopStatus.textContent="Whop monitoring is not configured or the sales ledger is not available yet. "+String(error?.message||"");
    whopStats.innerHTML="";
    whopPartners.innerHTML="";
  }

  const timestamp=new Date().toLocaleString();
  status.textContent="Snapshot refreshed "+timestamp+(failed.length?" · Some modules were unavailable; displayed counts may be incomplete.":" · All queried modules responded.");
}
document.querySelector("#refresh-analytics").addEventListener("click",loadAnalytics);
loadAnalytics();
