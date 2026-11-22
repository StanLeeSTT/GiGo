import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import https from "node:https";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createCollectionWorkerStore } from "../src/collection/store.ts";
import { registerCollectionAdapter } from "../src/collection/adapters.ts";
import { runCollectionWorkerBatch } from "../src/collection/worker.ts";

const USER_AGENT = "GiGoSafeCollector/0.1";
const MAX_HTML_BYTES = 512 * 1024;
const MAX_ROBOTS_BYTES = 32 * 1024;
const REQUEST_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;

function ipv4Number(address) {
  if (isIP(address) !== 4) return null;
  return address.split(".").reduce((n, part) => ((n * 256) + Number(part)) >>> 0, 0) >>> 0;
}
function inCidr(address, base, bits) {
  const ip = ipv4Number(address), network = ipv4Number(base);
  if (ip === null || network === null) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ip & mask) === (network & mask);
}
export function isPublicIpv4(address) {
  if (ipv4Number(address) === null) return false;
  const denied = [["0.0.0.0",8],["10.0.0.0",8],["100.64.0.0",10],["127.0.0.0",8],["169.254.0.0",16],["172.16.0.0",12],["192.0.0.0",24],["192.0.2.0",24],["192.88.99.0",24],["192.168.0.0",16],["198.18.0.0",15],["198.51.100.0",24],["203.0.113.0",24],["224.0.0.0",4],["240.0.0.0",4]];
  return !denied.some(([base,bits]) => inCidr(address,base,bits));
}
function validateUrl(raw) {
  const url = new URL(raw), host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw new Error("Only credential-free HTTPS URLs on port 443 are allowed.");
  if (!host.includes(".") || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || isIP(host)) throw new Error("The destination hostname is not permitted.");
  return url;
}
async function pinnedAddress(hostname) {
  const records = await lookup(hostname, { all: true, family: 4, verbatim: true });
  if (!records.length || records.some(record => !isPublicIpv4(record.address))) throw new Error("DNS resolved outside the permitted public IPv4 range.");
  return records[0].address;
}
export async function safeHttpsGet(rawUrl, options = {}) {
  const url = validateUrl(rawUrl), address = await pinnedAddress(url.hostname);
  const maxBytes = options.maxBytes ?? MAX_HTML_BYTES, signal = options.signal;
  if (signal?.aborted) throw new Error("Request aborted.");
  return new Promise((resolve,reject) => {
    let settled = false;
    const finish = (fn,value) => { if (settled) return; settled = true; signal?.removeEventListener("abort",onAbort); fn(value); };
    const onAbort = () => request.destroy(new Error("Request aborted."));
    const request = https.request({
      protocol:"https:", hostname:url.hostname, port:443, method:"GET",
      path:url.pathname+url.search, agent:false, servername:url.hostname,
      lookup(_hostname,_options,callback) { callback(null,address,4); },
      headers:{"user-agent":USER_AGENT,"accept":"text/html,application/xhtml+xml,text/plain;q=0.5","accept-encoding":"identity","connection":"close"}
    }, response => {
      const chunks=[]; let bytes=0;
      response.on("data",chunk => { bytes+=chunk.length; if(bytes>maxBytes) response.destroy(new Error("Response exceeded byte limit.")); else chunks.push(chunk); });
      response.on("end",() => finish(resolve,{status:response.statusCode??0,headers:response.headers,body:Buffer.concat(chunks).toString("utf8"),resolvedAddress:address}));
      response.on("error",error => finish(reject,error));
    });
    request.setTimeout(REQUEST_TIMEOUT_MS,() => request.destroy(new Error("Request timed out.")));
    request.on("error",error => finish(reject,error));
    signal?.addEventListener("abort",onAbort,{once:true});
    request.end();
  });
}
function redirectTarget(response,currentUrl) {
  if(![301,302,303,307,308].includes(response.status)) return null;
  const location=response.headers.location;
  if(typeof location!=="string"||!location) throw new Error("Redirect missing location.");
  return new URL(location,currentUrl).toString();
}
async function getWithRedirects(rawUrl,options={}) {
  let current=validateUrl(rawUrl).toString(), requestCount=0;
  for(let hop=0;hop<=MAX_REDIRECTS;hop++) {
    const currentParsed=validateUrl(current);
    const hadRobotsCache=robotsCache.has(currentParsed.origin);
    if(!(await checkRobots(currentParsed,options.signal))) throw new Error("Robots policy disallows this page or redirect destination.");
    if(!hadRobotsCache) requestCount++;
    const response=await safeHttpsGet(current,options);
    requestCount++;
    const next=redirectTarget(response,current);
    if(!next) return {...response,finalUrl:current,requestCount};
    if(hop===MAX_REDIRECTS) throw new Error("Redirect limit exceeded.");
    current=validateUrl(next).toString();
  }
  throw new Error("Redirect limit exceeded.");
}
export function robotsAllows(robotsText,targetUrl) {
  const parsed=new URL(targetUrl), path=parsed.pathname+parsed.search, groups=[];
  let agents=[],rules=[];
  const flush=()=>{if(agents.length) groups.push({agents,rules});agents=[];rules=[];};
  for(const raw of robotsText.split(/\r?\n/)) {
    const line=raw.split("#",1)[0].trim(); if(!line) continue;
    const colon=line.indexOf(":"); if(colon<0) continue;
    const key=line.slice(0,colon).trim().toLowerCase(), value=line.slice(colon+1).trim();
    if(key==="user-agent") { if(rules.length) flush(); agents.push(value.toLowerCase()); }
    else if((key==="allow"||key==="disallow")&&agents.length&&value) rules.push({allow:key==="allow",value});
  }
  flush();
  const matching=groups.filter(group=>group.agents.some(agent=>agent==="*"||USER_AGENT.toLowerCase().includes(agent)));
  const applicable=matching.flatMap(group=>group.rules);
  // Wildcard/end-anchor syntax is not interpreted by this minimal parser.
  // Fail closed rather than accidentally treating a restrictive rule as a literal prefix.
  if(applicable.some(rule=>/[*$]/.test(rule.value))) return false;
  const matched=applicable.filter(rule=>path.startsWith(rule.value)).sort((a,b)=>b.value.length-a.value.length||Number(b.allow)-Number(a.allow));
  return !matched.length || matched[0].allow;
}
const robotsCache=new Map();
async function checkRobots(url,signal) {
  if(robotsCache.has(url.origin)) {
    const cached=robotsCache.get(url.origin);
    return typeof cached==="string" ? robotsAllows(cached,url.toString()) : cached;
  }
  const response=await safeHttpsGet(new URL("/robots.txt",url.origin).toString(),{maxBytes:MAX_ROBOTS_BYTES,signal});
  const policy=response.status===404||response.status===410 ? true :
    response.status>=200&&response.status<300 ? response.body : false;
  robotsCache.set(url.origin,policy);
  return typeof policy==="string" ? robotsAllows(policy,url.toString()) : policy;
}
function decodeHtml(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(_m,e)=>{
    const k=e.toLowerCase();
    if(k.startsWith("#x")) return String.fromCodePoint(parseInt(k.slice(2),16));
    if(k.startsWith("#")) return String.fromCodePoint(parseInt(k.slice(1),10));
    return ({amp:"&",lt:"<",gt:">",quot:'"',apos:"'",nbsp:" "})[k]??_m;
  }).replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();
}
export function extractPageMetadata(html,finalUrl) {
  const meta=name=>{
    const escaped=name.replaceAll(":","\\:");
    const first=new RegExp("<meta\\b(?=[^>]*(?:name|property)=[\\\"']"+escaped+"[\\\"'])[^>]*content=[\\\"']([^\\\"']*)[\\\"'][^>]*>","i");
    const second=new RegExp("<meta\\b(?=[^>]*content=[\\\"']([^\\\"']*)[\\\"'])(?=[^>]*(?:name|property)=[\\\"']"+escaped+"[\\\"'])[^>]*>","i");
    const match=html.match(first)||html.match(second); return match?decodeHtml(match[1]):null;
  };
  const title=html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const canonical=html.match(/<link\b(?=[^>]*rel=[\"']canonical[\"'])[^>]*href=[\"']([^\"']+)[\"']/i);
  let canonicalUrl=null; if(canonical) { try { canonicalUrl=new URL(canonical[1],finalUrl).toString(); } catch {} }
  return {title:meta("og:title")||(title?decodeHtml(title[1]):null),description:meta("description")||meta("og:description"),canonical_url:canonicalUrl};
}
async function executePublicMetadata(_actor,input,context) {
  robotsCache.clear();
  const urls=input.urls.slice(0,input.max_pages??5), completed=new Set(Array.isArray(context.checkpoint?.completed_urls)?context.checkpoint.completed_urls:[]);
  let pages=0,items=0,requests=0,blocked=0;
  for(const suppliedUrl of urls) {
    if(context.signal.aborted) throw new Error("Collection cancelled.");
    if(completed.has(suppliedUrl)) continue;
    try {
      const start=validateUrl(suppliedUrl);
      const response=await getWithRedirects(start.toString(),{maxBytes:MAX_HTML_BYTES,signal:context.signal});
      requests+=response.requestCount;
      if(response.status===429||response.status>=500) throw new Error("Temporary page response HTTP "+response.status+".");
      if(response.status<200||response.status>=300) {
        blocked++; completed.add(suppliedUrl);
        await context.reportProgress({pages,items,requests,checkpoint:{completed_urls:[...completed],blocked}});
        continue;
      }
      const contentType=String(response.headers["content-type"]??"").toLowerCase();
      if(!contentType.includes("text/html")&&!contentType.includes("application/xhtml+xml")) {
        blocked++; completed.add(suppliedUrl);
        await context.reportProgress({pages,items,requests,checkpoint:{completed_urls:[...completed],blocked}});
        continue;
      }
      const metadata=extractPageMetadata(response.body,response.finalUrl);
      const itemKey=createHash("sha256").update(response.finalUrl).digest("hex");
      await context.emitItem({itemKey,sourceUrl:response.finalUrl,sourcePlatform:"web",sourceType:"web_page_metadata",observedAt:new Date().toISOString(),accessMethod:"pinned_public_https_get",permissionContext:{robots_checked:true,robots_allowed:true,authentication:false,redirects_revalidated:true},record:{url:response.finalUrl,...metadata,http_status:response.status,content_type:contentType}});
      pages++;items++;completed.add(suppliedUrl);
      await context.reportProgress({pages,items,requests,checkpoint:{completed_urls:[...completed],blocked}});
    } catch(error) {
      if(context.signal.aborted) throw error;
      if(String(error?.message??"").startsWith("Robots policy disallows")) {
        completed.add(suppliedUrl); blocked++;
        await context.reportProgress({pages,items,requests,checkpoint:{completed_urls:[...completed],blocked}});
        continue;
      }
      // Network, DNS, timeout, redirect and 429/5xx failures are retryable.
      // Leave the URL out of completed_urls so the durable retry resumes it.
      await context.reportProgress({pages,items,requests,checkpoint:{completed_urls:[...completed],blocked,last_error:String(error?.message??"Collection error").slice(0,160)}});
      throw error;
    }
  }
  return {status:blocked?"partial":"completed",counters:{pages,items,requests},checkpoint:{completed_urls:[...completed],blocked}};
}
export function registerSafeHttpBatchAdapter() {
  registerCollectionAdapter({key:"gigo_safe_http_batch",executionModes:["batch_runner"],supports:capabilities=>capabilities.every(capability=>capability==="web_fetch"),execute:executePublicMetadata});
}
async function findSingleSafeHttpProvider(supabaseUrl, serviceKey) {
  const base = supabaseUrl.replace(/\/+$/, "");
  const headers = { apikey: serviceKey, accept: "application/json" };
  if (!serviceKey.startsWith("sb_secret_")) headers.authorization = "Bearer " + serviceKey;
  const response = await fetch(base + "/rest/v1/collection_providers?provider_key=eq.gigo_safe_http_batch&select=id,status,configuration,capabilities", { headers, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("Provider lookup failed (" + response.status + ").");
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length !== 1 || typeof rows[0]?.id !== "string") {
    throw new Error("Expected exactly one registered safe HTTP provider; found " + (Array.isArray(rows) ? rows.length : "an invalid result") + ".");
  }
  const row = rows[0], config = row.configuration ?? {};
  if (!Array.isArray(row.capabilities) || !row.capabilities.includes("web_fetch")
      || config.adapter_key !== "gigo_safe_http_batch" || config.adapter_version !== 1
      || config.execution_mode !== "batch_runner" || config.runner !== "github_actions"
      || config.network_policy !== "public_https_only" || config.authentication !== "none") {
    throw new Error("Registered provider configuration does not match the reviewed runner.");
  }
  return row;
}
export async function runHealthCheck() {
  const supabaseUrl = process.env.SUPABASE_URL, serviceKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error("Required worker secrets are not configured.");
  registerSafeHttpBatchAdapter();
  const { listRegisteredCollectionAdapters } = await import("../src/collection/adapters.ts");
  const adapter = listRegisteredCollectionAdapters().find(entry => entry.key === "gigo_safe_http_batch");
  if (!adapter || !adapter.executionModes.includes("batch_runner") || !adapter.supports(["web_fetch"])) {
    throw new Error("Safe HTTP adapter self-test failed.");
  }
  // Verify outbound DNS pinning, TLS and bounded HTTPS response handling before
  // advertising this provider as healthy. This probes robots.txt only; it does
  // not collect page content or claim a durable job.
  const egressProbe = await safeHttpsGet("https://example.com/robots.txt", { maxBytes: MAX_ROBOTS_BYTES });
  if (![200, 204, 404, 410].includes(egressProbe.status)) {
    throw new Error("Public HTTPS egress probe returned an unexpected status.");
  }
  const store = createCollectionWorkerStore({ supabaseUrl, serviceKey });
  if (await store.healthCheck() !== "gigo-collection-worker-v1") throw new Error("Collection worker health RPC returned an unexpected version.");
  const provider = await findSingleSafeHttpProvider(supabaseUrl, serviceKey);
  if (!await store.promoteSafeHttpProvider(provider.id)) throw new Error("Provider health promotion was rejected by database policy.");
  process.stdout.write(JSON.stringify({ health_check: "passed", provider_key: "gigo_safe_http_batch", provider_status: "healthy", egress_probe: "passed", jobs_claimed: 0 }) + "\n");
  return { health_check: "passed", provider_status: "healthy", jobs_claimed: 0 };
}
export async function runBatchFromEnvironment() {
  const supabaseUrl=process.env.SUPABASE_URL,serviceKey=process.env.SUPABASE_SECRET_KEY;
  if(!supabaseUrl||!serviceKey) throw new Error("Required worker secrets are not configured.");
  registerSafeHttpBatchAdapter();
  const store=createCollectionWorkerStore({supabaseUrl,serviceKey});
  const result=await runCollectionWorkerBatch(store,{limit:1,leaseSeconds:120});
  process.stdout.write(JSON.stringify(result)+"\n"); return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const task = process.argv.includes("--health-check") ? runHealthCheck : runBatchFromEnvironment;
  task().catch(error=>{process.stderr.write("Collection batch failed: "+String(error?.message??"Unknown error").slice(0,300)+"\n");process.exitCode=1;});
}
