import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createResendAdapter, outboundIdempotencyKey, OUTBOUND_PROVIDER_ADAPTERS } from "../src/outreach/providers.ts";

const message={
 id:"11111111-1111-4111-8111-111111111111",
 recipientId:"22222222-2222-4222-8222-222222222222",
 purpose:"transactional",
 recipientIsRegisteredContact:false,
 to:"recipient@example.com",
 fromEmail:"hello@example.com",
 fromName:"GiGo",
 replyTo:"reply@example.com",
 subject:"A concise introduction",
 text:"Hello, this is the approved message.\n\n— STANLEE"
};

test("Resend adapter sends a validated signed message with a stable idempotency key",async()=>{
 let captured;
 const adapter=createResendAdapter({apiKey:"test-key",fetchImpl:async(url,init)=>{captured={url,init};return new Response(JSON.stringify({id:"resend-message-123"}),{status:200,headers:{"content-type":"application/json"}});}});
 const result=await adapter.send(message,"transactional_api",outboundIdempotencyKey(message.id));
 assert.deepEqual(result,{kind:"accepted",providerMessageId:"resend-message-123"});
 assert.equal(captured.url,"https://api.resend.com/emails");
 assert.equal(captured.init.headers.authorization,"Bearer test-key");
 assert.equal(captured.init.headers["idempotency-key"],outboundIdempotencyKey(message.id));
 const body=JSON.parse(captured.init.body);
 assert.deepEqual(body.to,["recipient@example.com"]);
 assert.equal(body.from,"GiGo <hello@example.com>");
 assert.equal(body.text,message.text);
 assert.equal(body.reply_to,"reply@example.com");
});

test("Resend adapter rejects invalid, unsigned, oversized or mismatched messages before network access",async()=>{
 let calls=0;
 const adapter=createResendAdapter({apiKey:"test-key",fetchImpl:async()=>{calls++;return new Response("{}",{status:200});}});
 const invalid=[
  {...message,text:"No signature"},
  {...message,subject:"x".repeat(81)},
  {...message,to:"not-an-email"},
  {...message,fromName:"Bad\r\nHeader"},
  {...message,text:"x".repeat(501)+"\n— STANLEE"}
 ];
 for(const item of invalid){
  const result=await adapter.send(item,"transactional_api",outboundIdempotencyKey(message.id));
  assert.equal(result.kind,"rejected_before_send");
 }
 const mismatch=await adapter.send(message,"transactional_api","wrong-key");
 assert.equal(mismatch.kind,"rejected_before_send");
 assert.equal(calls,0);
});

test("Resend rate limits are retryable only when explicitly rejected; uncertain outcomes are not retried",async()=>{
 const rateLimited=createResendAdapter({apiKey:"test-key",fetchImpl:async()=>new Response("{}",{status:429})});
 const limited=await rateLimited.send(message,"transactional_api",outboundIdempotencyKey(message.id));
 assert.deepEqual(limited,{kind:"rejected_before_send",code:"PROVIDER_RATE_LIMITED",message:"Resend rejected the request before acceptance. Respect its retry window and account limits.",retryable:true});

 const serverError=createResendAdapter({apiKey:"test-key",fetchImpl:async()=>new Response("{}",{status:503})});
 const uncertain=await serverError.send(message,"transactional_api",outboundIdempotencyKey(message.id));
 assert.equal(uncertain.kind,"unknown");

 const networkError=createResendAdapter({apiKey:"test-key",fetchImpl:async()=>{throw new Error("socket closed");}});
 const network=await networkError.send(message,"transactional_api",outboundIdempotencyKey(message.id));
 assert.equal(network.kind,"unknown");
});

test("Resend webhook verification checks Svix HMAC, timestamp and raw body",async()=>{
 const rawBody='{"type":"email.delivered","data":{"email_id":"resend-message-123"}}';
 const secretBytes=Buffer.from("private webhook secret");
 const secret="whsec_"+secretBytes.toString("base64");
 const messageId="msg_123";
 const timestamp=String(Math.floor(Date.now()/1000));
 const signature=createHmac("sha256",secretBytes).update(messageId+"."+timestamp+"."+rawBody).digest("base64");
 const request=new Request("https://gigo.example/webhook",{headers:{
  "svix-id":messageId,"svix-timestamp":timestamp,"svix-signature":"v1,"+signature
 }});
 const adapter=createResendAdapter({apiKey:"test-key",webhookSecret:secret,fetchImpl:async()=>new Response("{}")});
 assert.equal(await adapter.verifyWebhook(request,rawBody),true);
 assert.equal(await adapter.verifyWebhook(request,rawBody+" "),false);
 const staleTimestamp=String(Math.floor(Date.now()/1000)-600);
 const staleSignature=createHmac("sha256",secretBytes).update(messageId+"."+staleTimestamp+"."+rawBody).digest("base64");
 const staleRequest=new Request("https://gigo.example/webhook",{headers:{
  "svix-id":messageId,"svix-timestamp":staleTimestamp,"svix-signature":"v1,"+staleSignature
 }});
 assert.equal(await adapter.verifyWebhook(staleRequest,rawBody),false);
});

test("adapter remains unregistered so external sending stays disabled",()=>{
 assert.deepEqual(OUTBOUND_PROVIDER_ADAPTERS,[]);
});

test("Resend refuses promotional outreach to contacts not registered with the provider",async()=>{
 let calls=0;
 const adapter=createResendAdapter({apiKey:"test-key",fetchImpl:async()=>{calls++;return new Response(JSON.stringify({id:"unexpected"}),{status:200});}});
 const cold={...message,purpose:"relationship_outreach",recipientIsRegisteredContact:false};
 const rejected=await adapter.send(cold,"marketing_campaign",outboundIdempotencyKey(message.id));
 assert.equal(rejected.kind,"rejected_before_send");
 assert.equal(calls,0);
 const registered={...cold,recipientIsRegisteredContact:true};
 const accepted=await adapter.send(registered,"marketing_campaign",outboundIdempotencyKey(message.id));
 assert.equal(accepted.kind,"accepted");
 assert.equal(calls,1);
});
