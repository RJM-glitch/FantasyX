export const access='public';
export const methods=['GET'];
const BOOT='https://fantasy.premierleague.com/api/bootstrap-static/';
export default async function(req,res){
 try{
  const r=await fetch(BOOT,{headers:{'Accept':'application/json'}});if(!r.ok)throw new Error('FPL feed unavailable');
  const d=await r.json();
  const teams=d.teams.map(t=>({id:t.id,name:t.name,short:t.short_name}));
  const teamById=new Map(teams.map(t=>[t.id,t]));
  const types={1:'GK',2:'DEF',3:'MID',4:'FWD'};
  const players=d.elements.filter(p=>p.status!=='u'&&teamById.has(p.team)).map(p=>{const t=teamById.get(p.team);const photoId=String(p.photo||'').replace(/\.jpg$/i,'');return {id:p.id,name:p.web_name,first:p.first_name,second:p.second_name,last:p.second_name,team:p.team,club:t.short,clubName:t.name,pos:types[p.element_type],price:p.now_cost/10,points:0,totalPoints:p.total_points||0,news:p.news||'',status:p.status,photo:`https://resources.premierleague.com/premierleague/photos/players/250x250/p${photoId}.png?v=20260916`};});
  res.setHeader('Cache-Control','no-store, max-age=0');return res.json({teams,players,updated:new Date().toISOString(),source:'Current Fantasy Premier League player, club, price and official Premier League photo data'});
 }catch(e){return res.status(502).json({error:'Could not refresh current Fantasy Premier League player database.'});}
}