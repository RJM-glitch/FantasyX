import {mkdir,writeFile} from 'node:fs/promises';
import {gameweek,standings} from '../fpl-data.js';
await mkdir('public',{recursive:true});
try{
  const table=await standings();
  const gameweeks={};
  for(let gw=1;gw<=38;gw++)gameweeks[gw]=await gameweek(gw);
  const data={generatedAt:new Date().toISOString(),season:'2026/27',table,gameweeks};
  await writeFile('public/football-snapshot.js','window.FX_FOOTBALL_SNAPSHOT='+JSON.stringify(data)+';');
  console.log('Football snapshot built');
}catch(e){
  console.warn('Football snapshot fallback:',e.message);
  await writeFile('public/football-snapshot.js','window.FX_FOOTBALL_SNAPSHOT={season:"2026/27",table:[],gameweeks:{}};');
}