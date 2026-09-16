import { db } from 'hatchable';
export const access='user';
export default async function(req,res){
 const u=req.user;
 if(req.method==='GET'){
  const {rows}=await db.query(`SELECT l.id,l.name,l.code,(SELECT count(*)::int FROM fantasy_league_members m2 WHERE m2.league_id=l.id) members FROM fantasy_leagues l JOIN fantasy_league_members m ON m.league_id=l.id WHERE m.user_id=$1 ORDER BY CASE WHEN l.code='BALLER' THEN 0 ELSE 1 END,l.created_at DESC`,[u.id]);
  return res.json(rows);
 }
 if(req.method==='POST'){
  const action=String(req.body?.action||'');
  if(action==='create'){
   const name=String(req.body?.name||'').trim().slice(0,40);if(name.length<2)return res.status(400).json({error:'League name is too short.'});
   const code=Math.random().toString(36).slice(2,8).toUpperCase();
   const {rows}=await db.query('INSERT INTO fantasy_leagues(name,code,owner_user_id) VALUES($1,$2,$3) RETURNING id,name,code',[name,code,u.id]);
   await db.query('INSERT INTO fantasy_league_members(league_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[rows[0].id,u.id]);return res.json({...rows[0],joined:true});
  }
  if(action==='join'){
   const code=String(req.body?.code||'').trim().toUpperCase();
   const {rows}=await db.query('SELECT id,name,code FROM fantasy_leagues WHERE code=$1',[code]);if(!rows[0])return res.status(404).json({error:'League code not found.'});
   await db.query('INSERT INTO fantasy_league_members(league_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[rows[0].id,u.id]);
   const c=await db.query('SELECT count(*)::int members FROM fantasy_league_members WHERE league_id=$1',[rows[0].id]);return res.json({...rows[0],joined:true,members:c.rows[0].members});
  }
  return res.status(400).json({error:'Unknown league action.'});
 }
 return res.status(405).json({error:'Method not allowed'});
}