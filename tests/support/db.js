import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
export function database(t){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys = ON');
  for(const file of readdirSync(new URL('../../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../../drizzle/'+file,import.meta.url),'utf8'));
  t.after(()=>sqlite.close());
  function prepare(query,values=[]){return {bind(...args){return prepare(query,args);},async first(){return sqlite.prepare(query).get(...values)||null;},async all(){return {results:sqlite.prepare(query).all(...values)};},async run(){return sqlite.prepare(query).run(...values);}};}
  return {sqlite,prepare,async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
}
