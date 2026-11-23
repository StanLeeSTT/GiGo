export type AutonomyScope = "observe" | "analyse" | "draft" | "internal_execute" | "external_execute";
export type ToolActionClass = AutonomyScope | "financial" | "unknown";

export interface AutonomyPolicy {
  enabledScopes: readonly AutonomyScope[];
  externalExecutionRequiresApproval: boolean;
}

export interface AutonomyDecision {
  allowed: boolean;
  action: ToolActionClass;
  reason: string;
  approvalRequired: boolean;
}

/**
 * GiGo's default policy deliberately permits useful internal work while keeping
 * consequential external side effects approval-gated. Financial execution is a
 * hard deny and is not represented as an enable-able scope.
 */
export const DEFAULT_AUTONOMY_POLICY: AutonomyPolicy = {
  enabledScopes: ["observe", "analyse", "draft", "internal_execute"],
  externalExecutionRequiresApproval: true
};

const TOOL_ACTIONS: Readonly<Record<string, ToolActionClass>> = {
  research_list: "observe",
  research_create: "draft",
  research_discover_sources: "analyse",
  research_save_source: "draft",
  research_save_opportunity: "draft",
  products_list: "observe",
  products_create: "draft",
  partners_list: "observe",
  partners_save_candidate: "draft",
  leads_list: "observe",
  leads_create: "draft",
  offers_list: "observe",
  offers_create: "draft",
  marketing_list_assets: "observe",
  marketing_create_asset: "draft",
  customers_list_cases: "observe",
  customers_create_case: "draft",
  customers_update_case: "internal_execute",
  customers_list_cases: "observe",
  customers_create_case: "draft",
  customers_update_case: "internal_execute",
  jobs_list: "observe",
  jobs_create: "draft",
  jobs_cancel: "internal_execute",
  projects_list: "observe",
  projects_create: "draft",
  tasks_list: "observe",
  tasks_create: "draft",
  tasks_update_status: "internal_execute",
  conversations_list: "observe",
  conversations_create: "draft",
  messages_list: "observe",
  messages_add: "draft",
  memory_search: "observe",
  memory_update: "internal_execute",
  conversations_search: "observe",
  memory_list: "observe",
  memory_create: "draft",
  memory_archive: "internal_execute",

  // These names are reserved for future adapters and remain gated.
  "outreach.send": "external_execute",
  "launch.publish": "external_execute",
  "customers.send_response": "external_execute",
  "commerce.manage_payments": "financial"
};

const FINANCIAL_ACTION_PATTERN = /(?:^|[._-])(pay(?:ment|ments)?|purchase|buy|checkout|charge|refund|transfer|withdraw|deposit|payout|subscription|subscribe|billing|invoice_payment|bank|wallet_send|invest|investment|trade|trading|loan|borrow|lend|tip|donate|spend)(?:$|[._-])/i;

export function classifyToolAction(toolName: string): ToolActionClass {
  const normalized = toolName.trim().toLowerCase();
  if (!normalized) return "unknown";
  if (FINANCIAL_ACTION_PATTERN.test(normalized)) return "financial";
  return TOOL_ACTIONS[normalized] ?? "unknown";
}

export function authorizeToolAction(
  toolName: string,
  options: {
    policy?: AutonomyPolicy;
    approved?: boolean;
  } = {}
): AutonomyDecision {
  const policy = options.policy ?? DEFAULT_AUTONOMY_POLICY;
  const action = classifyToolAction(toolName);

  if (action === "financial") {
    return {
      allowed: false,
      action,
      reason: "FINANCIAL_ACTION_HARD_DENY: GiGo may prepare financial information, but only the owner can authorize or execute money movement or financial commitments.",
      approvalRequired: false
    };
  }
  if (action === "unknown") {
    return { allowed: false, action, reason: "UNKNOWN_TOOL_DENIED: this tool is not registered in GiGo's autonomy policy.", approvalRequired: false };
  }
  if (action === "external_execute") {
    if (!policy.enabledScopes.includes("external_execute")) {
      return { allowed: false, action, reason: "EXTERNAL_EXECUTION_DISABLED: this external action is not enabled in the current permission policy.", approvalRequired: policy.externalExecutionRequiresApproval };
    }
    if (policy.externalExecutionRequiresApproval && options.approved !== true) {
      return { allowed: false, action, reason: "EXPLICIT_APPROVAL_REQUIRED: this external action has not been approved.", approvalRequired: true };
    }
    return { allowed: true, action, reason: "External action is within the enabled scope and has explicit approval.", approvalRequired: false };
  }
  if (!policy.enabledScopes.includes(action)) {
    return { allowed: false, action, reason: "AUTONOMY_SCOPE_DISABLED: the current policy does not grant this action scope.", approvalRequired: false };
  }
  return { allowed: true, action, reason: "Allowed by the current GiGo autonomy policy.", approvalRequired: false };
}

export function getAutonomyPolicySummary(policy: AutonomyPolicy = DEFAULT_AUTONOMY_POLICY) {
  return {
    enabled_scopes: [...policy.enabledScopes],
    external_execution_requires_approval: policy.externalExecutionRequiresApproval,
    financial_execution: "hard_denied",
    financial_hard_deny_is_overridable: false
  } as const;
}
