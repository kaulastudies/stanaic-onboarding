import { createHmac, timingSafeEqual } from 'node:crypto';

const error = (status, message) => { throw Object.assign(new Error(message), { status }); };
const isLiveKey = key => /^(?:sk|rk)_live_/.test(key||'');
const json = (body, status=200) => Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export const PAYMENT_SETUP = ['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET'];
export function paymentStatus(env={}) {
  const missing=PAYMENT_SETUP.filter(key=>!env[key]);
  return {provider:'stripe',configured:missing.length===0,missing,mode:isLiveKey(env.STRIPE_SECRET_KEY)?'live':'test',settlementRule:'Only a verified paid webhook activates enrolment.'};
}

// Verify the original bytes before JSON parsing. A new signature is generated on
// each provider retry; event-id deduplication is a separate durable DB concern.
export function verifyStripeEvent(raw, signature, secret, now=Date.now(), tolerance=300) {
  if(!secret)error(503,'Stripe webhook signing is not configured. Set STRIPE_WEBHOOK_SECRET.');
  if(typeof signature!=='string'||signature.length>4096)error(400,'Invalid Stripe signature.');
  const fields=signature.split(',').map(part=>part.trim().split('='));
  const timestamps=fields.filter(([k])=>k==='t').map(([,v])=>v);
  if(timestamps.length!==1||!/^\d+$/.test(timestamps[0]))error(400,'Invalid Stripe signature timestamp.');
  const timestamp=Number(timestamps[0]);
  if(!Number.isSafeInteger(timestamp)||Math.abs(now/1000-timestamp)>tolerance)error(400,'Stripe signature timestamp is outside the allowed tolerance.');
  const signatures=fields.filter(([k,v])=>k==='v1'&&/^[a-f0-9]{64}$/i.test(v)).map(([,v])=>Buffer.from(v,'hex'));
  const body=Buffer.isBuffer(raw)?raw:Buffer.from(raw);
  const digest=createHmac('sha256',secret).update(`${timestamp}.`).update(body).digest();
  if(!signatures.some(candidate=>candidate.length===digest.length&&timingSafeEqual(candidate,digest)))error(400,'Invalid Stripe signature.');
  let event;try{event=JSON.parse(body.toString('utf8'));}catch{error(400,'Invalid webhook JSON.');}
  if(!event||typeof event.id!=='string'||!/^evt_[A-Za-z0-9_]+$/.test(event.id)||typeof event.type!=='string')error(400,'Invalid Stripe event.');
  return event;
}

export function paidCheckoutEvent(event) {
  if(!['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type))return null;
  const session=event.data?.object;
  if(session?.object!=='checkout.session'||session.mode!=='payment')error(400,'Unsupported Checkout session.');
  if(session.payment_status!=='paid')return null; // Completed is not always paid.
  if(typeof session.id!=='string'||!/^cs_/.test(session.id)||typeof session.metadata?.orderId!=='string')error(400,'Checkout order metadata is missing.');
  if(!Number.isSafeInteger(session.amount_total)||session.amount_total<0||!/^[a-z]{3}$/.test(session.currency||''))error(400,'Invalid Checkout amount or currency.');
  return {eventId:event.id,provider:'stripe',providerSessionId:session.id,orderId:session.metadata.orderId,ownerId:session.metadata.ownerId||null,amountMinor:session.amount_total,currency:session.currency.toUpperCase(),paymentIntent:typeof session.payment_intent==='string'?session.payment_intent:null,livemode:event.livemode===true};
}

// Refund creation is an instruction to Stripe. Only signed follow-up events
// settle the internal refund record; an HTTP response never means funds arrived.
export function stripeRefundEvent(event) {
  if(!['refund.created','refund.updated','refund.failed'].includes(event.type))return null;
  const refund=event.data?.object;
  if(refund?.object!=='refund'||typeof refund.id!=='string'||!/^(re|pyr)_/.test(refund.id))error(400,'Invalid refund event.');
  if(typeof refund.metadata?.orderId!=='string'||typeof refund.payment_intent!=='string'||!/^pi_/.test(refund.payment_intent))error(400,'Refund order metadata is missing.');
  if(!Number.isSafeInteger(refund.amount)||refund.amount<=0||!/^[a-z]{3}$/.test(refund.currency||''))error(400,'Invalid refund amount or currency.');
  if(!['pending','requires_action','succeeded','failed','canceled'].includes(refund.status))error(400,'Invalid refund status.');
  return {eventId:event.id,type:event.type,providerRefundId:refund.id,orderId:refund.metadata.orderId,paymentIntent:refund.payment_intent,amountMinor:refund.amount,currency:refund.currency.toUpperCase(),status:refund.status,livemode:event.livemode===true};
}

export async function createFullRefund(order,env={},fetcher=fetch) {
  if(PAYMENT_SETUP.some(key=>!env[key]))error(503,'Refunds are not connected. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in the server environment.');
  if(!order?.orderId||!Number.isSafeInteger(order.amountMinor)||order.amountMinor<=0||typeof order.paymentIntent!=='string'||!/^pi_/.test(order.paymentIntent))error(409,'This paid order has no refundable provider transaction.');
  if(order.status!=='paid')error(409,'Only a paid order can be refunded.');
  const form=new URLSearchParams({payment_intent:order.paymentIntent,amount:String(order.amountMinor),reason:'requested_by_customer','metadata[orderId]':order.orderId});
  let response;
  try{response=await fetcher('https://api.stripe.com/v1/refunds',{method:'POST',headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':`stanaic-refund-${order.orderId}`,...(env.STRIPE_API_VERSION?{'Stripe-Version':env.STRIPE_API_VERSION}:{})},body:form,signal:AbortSignal.timeout(15000)});}catch{error(502,'The refund response was interrupted. Its outcome is uncertain. Reconcile or retry this same refund request; do not create another request.');}
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.id||data.object!=='refund'||data.payment_intent!==order.paymentIntent||data.amount!==order.amountMinor||String(data.currency).toUpperCase()!==order.currency.toUpperCase())error(502,'The provider could not confirm a matching refund request. The order has not been marked refunded.');
  if(!['pending','requires_action','succeeded','failed','canceled'].includes(data.status))error(502,'The provider returned an unknown refund state. Finance must reconcile the request.');
  return {refundId:data.id,providerStatus:data.status,status:'awaiting_provider_confirmation'};
}

export function checkoutForm(order,origin) {
  if(!order?.id||!Number.isSafeInteger(order.amountMinor)||order.amountMinor<=0||!/^[A-Z]{3}$/.test(order.currency||''))error(400,'The order has no valid payable amount.');
  if(!['pending','Pending'].includes(order.status))error(409,'This order is not awaiting payment.');
  const root=new URL(origin);if(root.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(root.hostname))error(400,'Checkout requires the configured HTTPS application origin.');
  return new URLSearchParams({
    mode:'payment',success_url:`${root.origin}/workspace?mode=live&view=payments&checkout=returned`,cancel_url:`${root.origin}/workspace?mode=live&view=payments&checkout=cancelled`,
    'line_items[0][quantity]':'1','line_items[0][price_data][currency]':order.currency.toLowerCase(),
    'line_items[0][price_data][unit_amount]':String(order.amountMinor),'line_items[0][price_data][product_data][name]':String(order.title||'STANAIC programme enrolment').slice(0,200),
    client_reference_id:order.id,'metadata[orderId]':order.id,'metadata[ownerId]':order.ownerId||'',
    'payment_intent_data[metadata][orderId]':order.id,
  });
}

export async function retrieveCheckoutSession(order,env={},fetcher=fetch) {
  if(!env.STRIPE_SECRET_KEY)error(503,'Payments are not connected.');
  if(typeof order.checkoutSessionId!=='string'||!/^cs_[A-Za-z0-9_]+$/.test(order.checkoutSessionId))error(409,'The stored checkout session is invalid. Finance must reconcile it.');
  let response;try{response=await fetcher('https://api.stripe.com/v1/checkout/sessions/'+encodeURIComponent(order.checkoutSessionId),{method:'GET',headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,...(env.STRIPE_API_VERSION?{'Stripe-Version':env.STRIPE_API_VERSION}:{})},signal:AbortSignal.timeout(15000)});}catch{error(502,'The existing checkout could not be verified. No replacement was created.');}
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.id!==order.checkoutSessionId||data.object!=='checkout.session'||data.metadata?.orderId!==order.id||data.metadata?.ownerId!==order.ownerId||data.amount_total!==order.amountMinor||String(data.currency).toUpperCase()!==order.currency.toUpperCase()||data.livemode!==isLiveKey(env.STRIPE_SECRET_KEY))error(409,'The existing provider session does not match this order. Finance must reconcile it.');
  if(!['open','expired','complete'].includes(data.status))error(409,'The checkout state is unknown. No replacement was created.');
  if(data.status==='open'){
    let url;try{url=new URL(data.url);}catch{error(502,'The existing checkout has no valid payment link.');}
    if(url.protocol!=='https:'||url.hostname!=='checkout.stripe.com')error(502,'The provider returned an unexpected checkout destination.');
  }
  return data;
}

export async function createCheckoutSession(order,origin,env={},fetcher=fetch) {
  if(PAYMENT_SETUP.some(key=>!env[key]))error(503,'Payments are not connected. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in the server environment.');
  const form=checkoutForm(order,origin);
  let response;
  try{response=await fetcher('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':order.checkoutRequestKey||`stanaic-checkout-${order.id}`,...(env.STRIPE_API_VERSION?{'Stripe-Version':env.STRIPE_API_VERSION}:{})},body:form,signal:AbortSignal.timeout(15000)});}catch{error(502,'The checkout response was interrupted. Retry this order using the same checkout request.');}
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.id||typeof data.url!=='string')error(502,'The payment provider could not create Checkout. No payment status was changed.');
  let url;try{url=new URL(data.url);}catch{error(502,'The payment provider returned an invalid checkout URL.');}
  if(url.protocol!=='https:'||url.hostname!=='checkout.stripe.com')error(502,'The payment provider returned an unexpected checkout destination.');
  return {sessionId:data.id,url:url.href,status:'awaiting_provider_payment'};
}

// Adapters are injected so signature/provider logic can be tested independently
// of the platform state store. No browser amount, currency or paid flag is used.
/** @param {Request} request @param {any} [options] */
export async function handlePayments(request,options={}) {
  const {pool,identity,env={},getOrder,recordSession,reserveCheckout,applyEvent,getRefund,recordRefund,applyRefundEvent,fetcher=fetch}=options;
  try{
    const url=new URL(request.url),path=url.pathname.replace(/^\/api\/payments\/?/,'');
    if(path==='status'&&request.method==='GET')return json(paymentStatus(env));
    if(path==='webhook'&&request.method==='POST'){
      const length=Number(request.headers.get('content-length')||0);if(length>512000)error(413,'Webhook payload is too large.');
      const raw=Buffer.from(await request.arrayBuffer());if(raw.length>512000)error(413,'Webhook payload is too large.');
      const event=verifyStripeEvent(raw,request.headers.get('stripe-signature'),env.STRIPE_WEBHOOK_SECRET);
      const payment=paidCheckoutEvent(event),refund=stripeRefundEvent(event);if(!payment&&!refund)return json({received:true,ignored:true});
      const expectedLive=isLiveKey(env.STRIPE_SECRET_KEY);
      if(!env.STRIPE_SECRET_KEY)error(503,'Payments are not connected. Set STRIPE_SECRET_KEY.');
      if((payment||refund).livemode!==expectedLive)error(400,'The event does not match the configured payment mode.');
      if(refund){
        if(typeof applyRefundEvent!=='function')error(503,'The refund reconciliation adapter is unavailable.');
        return json({received:true,...await applyRefundEvent(pool,env,refund)});
      }
      if(typeof applyEvent!=='function')error(503,'The payment order adapter is unavailable.');
      const result=await applyEvent(pool,env,{...payment,type:event.type,paymentStatus:'paid',checkoutSessionId:payment.providerSessionId});
      return json({received:true,...result});
    }
    if(!['checkout','refund'].includes(path)||request.method!=='POST')error(404,'Payment action not found.');
    if(request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')error(403,'Use the application to create Checkout.');
    if(!request.headers.get('content-type')?.startsWith('application/json'))error(415,'JSON is required.');
    const raw=await request.text();if(raw.length>4000)error(413,'Checkout request is too large.');
    let data;try{data=JSON.parse(raw);}catch{error(400,'Invalid Checkout request.');}
    if(!data||typeof data.orderId!=='string'||data.orderId.length>100)error(400,'An order identifier is required.');
    if(!identity?.id||identity.emailVerified!==true)error(401,'Sign in with a verified account before paying for your order.');
    if(path==='refund'){
      if(typeof getRefund!=='function'||typeof recordRefund!=='function')error(503,'The finance refund adapter is unavailable.');
      const order=await getRefund(pool,identity,env,data.orderId);
      const result=await createFullRefund(order,env,fetcher);
      await recordRefund(pool,identity,env,data.orderId,result.refundId);
      return json(result,202);
    }
    if(PAYMENT_SETUP.some(key=>!env[key]))error(503,'Payments are not connected. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in the server environment.');
    if(typeof getOrder!=='function'||typeof recordSession!=='function')error(503,'The payment order adapter is unavailable.');
    let order=await getOrder(pool,identity,env,data.orderId),reservation=null;
    if(order.checkoutSessionId){
      const existing=await retrieveCheckoutSession(order,env,fetcher);
      if(existing.payment_status==='paid'||existing.status==='complete')error(409,'This checkout is complete. Await signed payment reconciliation; do not create another payment.');
      if(existing.status==='open')return json({sessionId:existing.id,url:existing.url,status:'awaiting_provider_payment',reused:true});
      if(existing.status!=='expired')error(409,'Only a provider-confirmed expired checkout can be renewed.');
      if(typeof reserveCheckout!=='function')error(503,'Checkout renewal is unavailable. Finance must reconcile the expired session.');
      reservation=await reserveCheckout(pool,identity,env,order.id,existing.id);
      if(!Number.isSafeInteger(reservation?.attempt)||reservation.attempt<1)error(503,'Checkout renewal generation was not reserved safely.');
      order={...order,...reservation,checkoutRequestKey:reservation.checkoutRequestKey||`stanaic-checkout-${order.id}-renew-${reservation.attempt}`};
    }
    const session=await createCheckoutSession(order,env.APP_ORIGIN||url.origin,env,fetcher);
    await recordSession(pool,identity,env,order.id,session.sessionId,reservation);
    return json({...session,renewed:!!reservation},201);
  }catch(err){return json({error:err.status?err.message:'Payment processing is temporarily unavailable.'},err.status||503);}
}
