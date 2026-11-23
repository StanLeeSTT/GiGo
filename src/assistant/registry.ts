import { getAutonomyPolicySummary } from "./autonomy";
export type ToolState = "available" | "planned";
export interface AssistantTool {
  id: string;
  module: string;
  description: string;
  state: ToolState;
  method?: "GET" | "POST" | "PATCH";
  endpoint?: string;
  approval: "none" | "required";
}
export const ASSISTANT_TOOLS: AssistantTool[] = [
  { id:"jobs.list", module:"Autonomous Operations", description:"List the owner's durable jobs and current queue status; queued does not mean executing.", state:"available", method:"GET", endpoint:"/api/v1/operations/jobs", approval:"none" },
  { id:"jobs.create", module:"Autonomous Operations", description:"Queue an internal task for future execution; does not start work or permit external actions.", state:"available", method:"POST", endpoint:"/api/v1/operations/jobs", approval:"none" },
  { id:"jobs.cancel", module:"Autonomous Operations", description:"Cancel a pending job before execution.", state:"available", method:"PATCH", endpoint:"/api/v1/operations/jobs?id={id}", approval:"none" },
  { id:"projects.list", module:"Projects", description:"List the owner's projects.", state:"available", method:"GET", endpoint:"/api/v1/projects", approval:"none" },
  { id:"projects.create", module:"Projects", description:"Create a project for the owner.", state:"available", method:"POST", endpoint:"/api/v1/projects", approval:"none" },
  { id:"tasks.list", module:"Tasks", description:"List the owner's tasks.", state:"available", method:"GET", endpoint:"/api/v1/tasks", approval:"none" },
  { id:"tasks.create", module:"Tasks", description:"Create a task for the owner.", state:"available", method:"POST", endpoint:"/api/v1/tasks", approval:"none" },
  { id:"tasks.update_status", module:"Tasks", description:"Change the status of an existing task.", state:"available", method:"PATCH", endpoint:"/api/v1/tasks?id={id}", approval:"none" },
  { id:"conversations.list", module:"Assistant Memory", description:"List saved assistant conversations.", state:"available", method:"GET", endpoint:"/api/v1/conversations", approval:"none" },
  { id:"conversations.create", module:"Assistant Memory", description:"Create a saved assistant conversation (API exists; not yet callable by the AI tool runtime).", state:"available", method:"POST", endpoint:"/api/v1/conversations", approval:"none" },
  { id:"messages.list", module:"Assistant Memory", description:"Read messages in one conversation owned by the user.", state:"available", method:"GET", endpoint:"/api/v1/messages?conversation_id={id}", approval:"none" },
  { id:"messages.add", module:"Assistant Memory", description:"Save a user or assistant message in an owned conversation.", state:"available", method:"POST", endpoint:"/api/v1/messages?conversation_id={id}", approval:"none" },
  { id:"memory.search", module:"Assistant Memory", description:"Search relevant saved memories by natural-language query.", state:"available", method:"GET", endpoint:"/api/v1/memory/search", approval:"none" },
  { id:"memory.update", module:"Assistant Memory", description:"Update an existing saved memory when explicitly requested.", state:"available", method:"PATCH", endpoint:"/api/v1/memory?id={id}", approval:"none" },
  { id:"conversations.search", module:"Assistant Memory", description:"Search prior saved conversation messages for relevant context.", state:"available", method:"GET", endpoint:"/api/v1/conversations/search", approval:"none" },
  { id:"memory.list", module:"Assistant Memory", description:"List the owner’s active saved memory items.", state:"available", method:"GET", endpoint:"/api/v1/memory", approval:"none" },
  { id:"memory.create", module:"Assistant Memory", description:"Save a memory item after the user explicitly asks GiGo to remember it.", state:"available", method:"POST", endpoint:"/api/v1/memory", approval:"none" },
  { id:"memory.archive", module:"Assistant Memory", description:"Archive a saved memory item without deleting it.", state:"available", method:"PATCH", endpoint:"/api/v1/memory?id={id}", approval:"none" },
  { id:"research.list", module:"Research & Opportunity Finder", description:"List saved research briefs.", state:"available", method:"GET", endpoint:"/api/v1/research/runs", approval:"none" },
  { id:"research.create", module:"Research & Opportunity Finder", description:"Create a research brief with a question and market scope.", state:"available", method:"POST", endpoint:"/api/v1/research/runs", approval:"none" },
  { id:"research.discover_sources", module:"Research & Opportunity Finder", description:"Discover scholarly source metadata through Crossref and OpenAlex and save it as unreviewed evidence; does not verify full text.", state:"available", method:"POST", endpoint:"/api/v1/assistant/chat (tool runtime)", approval:"none" },
  { id:"research.save_source", module:"Research & Opportunity Finder", description:"Save a source and excerpt as evidence for a research brief.", state:"available", method:"POST", endpoint:"/api/v1/research/sources", approval:"none" },
  { id:"research.save_opportunity", module:"Research & Opportunity Finder", description:"Save a discovered business opportunity and validation steps.", state:"available", method:"POST", endpoint:"/api/v1/research/opportunities", approval:"none" },
  { id:"products.list", module:"Product Studio", description:"List saved product briefs.", state:"available", method:"GET", endpoint:"/api/v1/products", approval:"none" },
  { id:"products.create", module:"Product Studio", description:"Save a product brief as a draft.", state:"available", method:"POST", endpoint:"/api/v1/products", approval:"none" },
  { id:"partners.list", module:"Partner Finder", description:"List saved partner candidates and scorecards.", state:"available", method:"GET", endpoint:"/api/v1/partners", approval:"none" },
  { id:"partners.save_candidate", module:"Partner Finder", description:"Save a creator candidate and calculate the documented score when all evidence-backed components are provided.", state:"available", method:"POST", endpoint:"/api/v1/partners", approval:"none" },
  { id:"leads.list", module:"Lead Intelligence & CRM", description:"List saved CRM leads and do-not-contact flags.", state:"available", method:"GET", endpoint:"/api/v1/leads", approval:"none" },
  { id:"leads.create", module:"Lead Intelligence & CRM", description:"Save a prospect in CRM without contacting them.", state:"available", method:"POST", endpoint:"/api/v1/leads", approval:"none" },
  { id:"offers.list", module:"Offer Builder", description:"List saved offer drafts and economics assumptions.", state:"available", method:"GET", endpoint:"/api/v1/offers", approval:"none" },
  { id:"offers.create", module:"Offer Builder", description:"Save an offer draft and calculate indicative unit economics.", state:"available", method:"POST", endpoint:"/api/v1/offers", approval:"none" },
  { id:"marketing.list_assets", module:"Ghostwriter & Marketing Studio", description:"List the owner’s saved marketing drafts and internal review state.", state:"available", method:"GET", endpoint:"/api/v1/marketing/assets", approval:"none" },
  { id:"marketing.write_assets", module:"Ghostwriter & Marketing Studio", description:"Save platform-specific marketing drafts for owner review; does not publish or send.", state:"available", method:"POST", endpoint:"/api/v1/marketing/assets", approval:"none" },
  { id:"outreach.prepare_campaign", module:"Outreach Studio", description:"Prepare personalised outreach and follow-up sequences.", state:"planned", approval:"required" },
  { id:"outreach.send", module:"Outreach Studio", description:"Send approved outreach to external recipients.", state:"planned", approval:"required" },
  { id:"launch.publish", module:"Launch & Distribution", description:"Publish approved launch content or campaigns.", state:"planned", approval:"required" },
  { id:"commerce.manage_payments", module:"Store, Payments & Fulfilment", description:"Connect checkout, payments and fulfilment providers.", state:"planned", approval:"required" },
  { id:"creative.list_briefs", module:"Creative Studio", description:"List private creative briefs and production status.", state:"available", method:"GET", endpoint:"/api/v1/creative/briefs", approval:"none" },
  { id:"creative.generate_assets", module:"Creative Studio", description:"Save creative briefs and prompts for owner review; does not generate or publish media.", state:"available", method:"POST", endpoint:"/api/v1/creative/briefs", approval:"none" },
  { id:"creative.update_brief", module:"Creative Studio", description:"Update creative production status, output URL and notes.", state:"available", method:"PATCH", endpoint:"/api/v1/creative/briefs", approval:"none" },
  { id:"customers.list_cases", module:"Customer Success & Support", description:"List owner-private support cases and draft responses.", state:"available", method:"GET", endpoint:"/api/v1/customers/cases", approval:"none" },
  { id:"customers.create_case", module:"Customer Success & Support", description:"Create an internal support case without contacting the customer.", state:"available", method:"POST", endpoint:"/api/v1/customers/cases", approval:"none" },
  { id:"customers.update_case", module:"Customer Success & Support", description:"Update support case status, notes or response draft; never sends the response.", state:"available", method:"PATCH", endpoint:"/api/v1/customers/cases", approval:"none" },
  { id:"analytics.snapshot", module:"Analytics", description:"Read counts and workflow status from owner-scoped business records; no fabricated financial metrics.", state:"available", method:"GET", endpoint:"/api/v1/assistant/chat (tool runtime)", approval:"none" },
  { id:"learning.list_plans", module:"Learning & Accountability", description:"List saved learning plans.", state:"available", method:"GET", endpoint:"/api/v1/projects", approval:"none" },
  { id:"learning.create_plan", module:"Learning & Accountability", description:"Create an internal learning plan.", state:"available", method:"POST", endpoint:"/api/v1/projects", approval:"none" },
  { id:"learning.list_milestones", module:"Learning & Accountability", description:"List study milestones for a learning plan.", state:"available", method:"GET", endpoint:"/api/v1/tasks", approval:"none" },
  { id:"learning.add_milestone", module:"Learning & Accountability", description:"Add an internal study milestone.", state:"available", method:"POST", endpoint:"/api/v1/tasks", approval:"none" },
  { id:"learning.update_milestone", module:"Learning & Accountability", description:"Update a study milestone status.", state:"available", method:"PATCH", endpoint:"/api/v1/tasks", approval:"none" }
];
export function getAssistantCapabilities() {
  return {
    assistant: { name:"GiGo", architecture:"permissioned-tool-registry", ai_runtime:"connected" },
    autonomy: getAutonomyPolicySummary(),
    summary: {
      total_tools: ASSISTANT_TOOLS.length,
      available_tools: ASSISTANT_TOOLS.filter(tool => tool.state === "available").length,
      planned_tools: ASSISTANT_TOOLS.filter(tool => tool.state === "planned").length
    },
    modules: [...new Set(ASSISTANT_TOOLS.map(tool => tool.module))].map(module => ({
      name: module,
      tools: ASSISTANT_TOOLS.filter(tool => tool.module === module)
    }))
  };
}
