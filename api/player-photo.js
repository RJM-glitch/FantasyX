export const access='public';
export const methods=['GET'];
const DEFAULT_SVG='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 250"><rect width="250" height="250" fill="#f1f1f1"/><circle cx="125" cy="88" r="42" fill="#bbb"/><path d="M48 225c7-55 34-78 77-78s70 23 77 78" fill="#bbb"/></svg>';
export default async function(req,res){
  const id=String(req.query?.id||'').replace(/\\D/g,'');
  if(!id){res.statusCode=302;res.setHeader('Location','/player-default.svg');return res.end();}
  try{
    const r=await fetch('https://resources.premierleague.com/premierleague/photos/players/250x250/p'+id+'.png',{headers:{'User-Agent':'FantasyX/1.0','Accept':'image/*,*/*;q=0.8'}});
    if(!r.ok)throw new Error('photo unavailable');
    const type=r.headers.get('content-type')||'image/png';
    const buf=Buffer.from(await r.arrayBuffer());
    res.statusCode=200;res.setHeader('Content-Type',type);res.setHeader('Cache-Control','public, max-age=86400');return res.end(buf);
  }catch(e){res.statusCode=200;res.setHeader('Content-Type','image/svg+xml');res.setHeader('Cache-Control','public, max-age=3600');return res.end(DEFAULT_SVG);}
}