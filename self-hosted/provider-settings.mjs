import selectedProject from './supabase-project.json' with {type:'json'};

// This file binds only the independent build. Publishable keys are public API
// identifiers; no Supabase admin key or account password belongs in source.
export function supabaseSettings(values={}){
  const get=name=>{const value=values[name];if(value!==undefined&&typeof value!=='string')throw new Error('Supabase settings must be strings.');return value?.trim()||'';};
  const url=get('SUPABASE_URL'),key=get('SUPABASE_PUBLISHABLE_KEY');
  if(Boolean(url)!==Boolean(key))throw new Error('Override SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY together for the intended project.');
  const chosen=url?{url,publishableKey:key}:selectedProject;
  let parsed;try{parsed=new URL(chosen.url);}catch{throw new Error('Use the Supabase project HTTPS origin.');}
  if(!/^https:\/\/[a-z0-9-]{6,80}\.supabase\.co$/.test(parsed.origin)||parsed.pathname!=='/'||parsed.username||parsed.password||parsed.port||parsed.search||parsed.hash)throw new Error('Use the Supabase project HTTPS origin.');
  if(!url&&parsed.hostname.split('.')[0]!==selectedProject.projectRef)throw new Error('The selected Supabase project does not match its URL.');
  let publicKey=/^sb_publishable_[A-Za-z0-9_-]{16,200}$/.test(chosen.publishableKey);
  if(chosen.publishableKey.startsWith('eyJ'))try{publicKey=JSON.parse(Buffer.from(chosen.publishableKey.split('.')[1],'base64url').toString()).role==='anon';}catch{publicKey=false;}
  if(!publicKey)throw new Error('Use a Supabase publishable or anon key, never a privileged key.');
  return {supabaseUrl:parsed.origin,publishableKey:chosen.publishableKey};
}
