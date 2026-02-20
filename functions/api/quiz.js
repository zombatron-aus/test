import { json, requireUser, loadModule, canAccessModule, getProgress } from "./_helpers.js";

function shuffle(arr){
  const a = [...arr];
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

export async function onRequestGet({request, env}){
  const {user} = await requireUser(env, request);
  if(!user) return json({error:"Unauthorized"}, 401);
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const mod = await loadModule(env, id);
  if(!mod) return json({error:"Not found"}, 404);
  if(!canAccessModule(user, mod)) return json({error:"Forbidden"}, 403);

  const prog = await getProgress(env, user.id);
  const p = prog[id] || {};
  const pages = mod.pages || [];
  if(pages.length && (p.pageIndex||0) < (pages.length-1)){
    return json({error:"Not eligible"}, 403);
  }

  const qs = (mod.quiz && mod.quiz.questions) ? mod.quiz.questions : [];
  // shuffle answers per question and return mapping in a one-time token stored in KV? Simpler: store mapping in progress attempt
  // We'll return shuffled answers and store correct indices mapping in progress temp
  const rendered = qs.map(q=>{
    const answers = q.answers || [];
    const order = shuffle(answers.map((a,i)=>({a,i})));
    const newAnswers = order.map(x=>x.a);
    const correctIndex = order.findIndex(x=>x.i===q.correctIndex);
    return { q:q.q, answers:newAnswers, _correctIndex: correctIndex };
  });

  // persist quiz key for verification
  p.quizKey = rendered.map(x=>x._correctIndex);
  p.quizKeyAt = Date.now();
  prog[id] = p;
  await env.BW_LMS.put(`progress:${user.id}`, JSON.stringify(prog));

  return json({
    module: {id:mod.id, title:mod.title, styling:mod.styling||{}},
    questions: rendered.map(x=>({q:x.q, answers:x.answers}))
  }, 200);
}
