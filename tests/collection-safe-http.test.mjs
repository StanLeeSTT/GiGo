import test from "node:test";
import assert from "node:assert/strict";
import { isPublicIpv4, robotsAllows, extractPageMetadata } from "../scripts/collection-batch-worker.mjs";

test("public IPv4 filter rejects private, local, documentation and reserved ranges", () => {
  for (const ip of ["10.0.0.1","127.0.0.1","169.254.1.1","172.16.0.1","192.168.1.1","100.64.0.1","192.0.2.1","198.51.100.2","203.0.113.4","224.0.0.1","240.0.0.1"]) assert.equal(isPublicIpv4(ip),false,ip);
  assert.equal(isPublicIpv4("1.1.1.1"),true);
  assert.equal(isPublicIpv4("8.8.8.8"),true);
});
test("robots rules use longest matching path and allow wins ties",()=>{
  const robots="User-agent: *\nDisallow: /private\nAllow: /private/public\n";
  assert.equal(robotsAllows(robots,"https://example.com/private/page"),false);
  assert.equal(robotsAllows(robots,"https://example.com/private/public/page"),true);
  assert.equal(robotsAllows(robots,"https://example.com/open"),true);
  assert.equal(robotsAllows("User-agent: *\\nDisallow: /*.pdf$","https://example.com/report.pdf"),false);
});
test("metadata extraction returns title, description and canonical URL",()=>{
  const html='<html><head><title>Example &amp; Demo</title><meta name="description" content="A useful page"><link rel="canonical" href="/canonical"></head></html>';
  assert.deepEqual(extractPageMetadata(html,"https://example.com/page"),{title:"Example & Demo",description:"A useful page",canonical_url:"https://example.com/canonical"});
});
