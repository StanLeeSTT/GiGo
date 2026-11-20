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
  { id:"research.save_source", module:"Research & Opportunity Finder", description:"Save a source and excerpt as evidence for a research brief.", state:"available", method:"POST", endpoint:"/api/v1/research/sources", approval:"none" },
  { id:"research.save_opportunity", module:"Research & Opportunity Finder", description:"Save a discovered business opportunity and validation steps.", state:"available", method:"POST", endpoint:"/api/v1/research/opportunities", approval:"none" },
  { id:"products.design", module:"Product Studio", description:"Research demand and design a digital or service product.", state:"planned", approval:"none" },
  { id:"partners.find_and_score", module:"Partner Finder", description:"Discover and score potential creator partners using the documented due-diligence policy.", state:"planned", approval:"none" },
  { id:"leads.discover_and_manage", module:"Lead Intelligence & CRM", description:"Find, qualify and organise prospective customers.", state:"planned", approval:"none" },
  { id:"offers.build", module:"Offer Builder", description:"Develop positioning, offer structure and unit economics.", state:"planned", approval:"none" },
  { id:"marketing.write_assets", module:"Ghostwriter & Marketing Studio", description:"Draft platform-specific marketing and sales assets.", state:"planned", approval:"none" },
  { id:"outreach.prepare_campaign", module:"Outreach Studio", description:"Prepare personalised outreach and follow-up sequences.", state:"planned", approval:"required" },
  { id:"outreach.send", module:"Outreach Studio", description:"Send approved outreach to external recipients.", state:"planned", approval:"required" },
  { id:"launch.publish", module:"Launch & Distribution", description:"Publish approved launch content or campaigns.", state:"planned", approval:"required" },
  { id:"commerce.manage_payments", module:"Store, Payments & Fulfilment", description:"Connect checkout, payments and fulfilment providers.", state:"planned", approval:"required" },
  { id:"creative.generate_assets", module:"Creative Studios", description:"Create approved campaign and product creative assets.", state:"planned", approval:"none" },
  { id:"customers.support", module:"Customer Success & Support", description:"Prepare customer support responses and workflows.", state:"planned", approval:"required" },
  { id:"analytics.review_performance", module:"Analytics", description:"Analyse business, campaign and product performance.", state:"planned", approval:"none" },
  { id:"learning.plan_and_track", module:"Learning & Accountability", description:"Create learning plans, milestones and reminders.", state:"planned", approval:"none" }
];
export function getAssistantCapabilities() {
  return {
    assistant: { name:"GiGo", architecture:"permissioned-tool-registry", ai_runtime:"connected" },
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
