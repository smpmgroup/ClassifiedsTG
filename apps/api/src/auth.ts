import crypto from 'node:crypto';
import type { Config } from './config.js';

export type TelegramUser = { id:number; first_name:string; last_name?:string; username?:string; language_code?:string; photo_url?:string };
export function validateInitData(raw:string, botToken:string, maxAgeSeconds:number, nowSeconds=Math.floor(Date.now()/1000)): { user:TelegramUser; hash:string; queryId?:string } {
  const params=new URLSearchParams(raw); const received=params.get('hash'); if(!received || !/^[a-f0-9]{64}$/i.test(received)) throw new Error('INIT_DATA_SIGNATURE_INVALID');
  params.delete('hash'); const dataCheck=[...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
  const secret=crypto.createHmac('sha256','WebAppData').update(botToken).digest(); const expected=crypto.createHmac('sha256',secret).update(dataCheck).digest();
  const actual=Buffer.from(received,'hex'); if(actual.length!==expected.length || !crypto.timingSafeEqual(actual,expected)) throw new Error('INIT_DATA_SIGNATURE_INVALID');
  const authDate=Number(params.get('auth_date')); if(!Number.isSafeInteger(authDate) || authDate>nowSeconds+30 || nowSeconds-authDate>maxAgeSeconds) throw new Error('INIT_DATA_EXPIRED');
  let user:TelegramUser; try { user=JSON.parse(params.get('user') || ''); } catch { throw new Error('INIT_DATA_USER_INVALID'); }
  if(!Number.isSafeInteger(user.id) || !user.first_name) throw new Error('INIT_DATA_USER_INVALID');
  return { user, hash:received, queryId:params.get('query_id') || undefined };
}

export async function telegramMembership(config:Config, userId:number): Promise<string> {
  const response=await fetch(`https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/getChatMember`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({chat_id:config.TELEGRAM_GROUP_ID.toString(),user_id:userId}) });
  const body=await response.json() as {ok:boolean;result?:{status:string;is_member?:boolean};description?:string}; if(!body.ok || !body.result) throw new Error(`TELEGRAM_MEMBERSHIP_FAILED: ${body.description || response.status}`);
  const {status,is_member}=body.result; if(status==='restricted' && is_member===false) return 'left'; return status;
}
