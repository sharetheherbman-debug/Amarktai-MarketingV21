import { build30DayPlan, extractWebsiteIntelligence, generationFacts, generateStockConcepts } from '../services/brand-bootstrap.service';

describe('automatic brand bootstrap fact policy',()=>{
  const facts=extractWebsiteIntelligence([{url:'https://stable.example/',html:`<!doctype html><html><head><title>North Star Stables</title><meta name="description" content="Horse training and owner education"><style>:root{--brand:#123456}body{font-family:'Inter',sans-serif}</style><link rel="icon" href="/favicon.png"></head><body><h1>Training with clarity</h1><h2>Owner education</h2><a href="/book">Book a consultation</a><p>Guaranteed results for every horse.</p></body></html>`}],{location:'Cape Town'});
  test('separates verified, owner-supplied, inferred and disallowed facts',()=>{
    expect(facts).toEqual(expect.arrayContaining([
      expect.objectContaining({key:'page_title',state:'VERIFIED_FIRST_PARTY'}),expect.objectContaining({key:'location',state:'OWNER_SUPPLIED'}),expect.objectContaining({key:'inferred_tone',state:'INFERRED'}),expect.objectContaining({key:'restricted_claim',state:'DISALLOWED'}),
    ]));
    expect(generationFacts(facts).every((fact)=>['VERIFIED_FIRST_PARTY','OWNER_SUPPLIED'].includes(fact.state))).toBe(true);
    expect(generationFacts(facts).some((fact)=>fact.key==='restricted_claim')).toBe(false);
  });
  test('builds useful concepts and a 30-day draft with no auto publishing',()=>{
    expect(generateStockConcepts(facts).length).toBeGreaterThanOrEqual(3);
    const plan=build30DayPlan(facts,new Date('2026-08-27T00:00:00Z'));
    expect(plan).toHaveLength(30);
    expect(plan[0]).toMatchObject({date:'2026-08-27',status:'draft',approval_status:'pending_owner_review',auto_publish:false});
    expect(plan.every((entry)=>entry.auto_publish===false)).toBe(true);
  });
});
