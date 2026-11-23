import 'dotenv/config';
import { createApp } from './src/app.js';
import { connectDB } from './src/db.js';
import { assertAuthConfig } from './src/auth.js';

assertAuthConfig();
await connectDB();
const port = process.env.PORT || 3000;
createApp().listen(port, () => console.log(`Smart Booking is running on port ${port}`));

const _otp=new Map();app.post('/api/otp/send',async(req,res)=>{const t=((req.body&&(req.body.target||req.body.phone||req.body.email))||'').trim().toLowerCase();if(!t||t.length<4)return res.status(400).json({error:'Valid phone or email required'});const c=String(Math.floor(100000+Math.random()*900000));const e=Date.now()+300000;_otp.set(t,{c,e});try{const d=typeof _sbDb==='function'?_sbDb():null;if(d)await d.collection('sb_otps').updateOne({t},{$set:{t,c,e}},{upsert:true});}catch(_){}res.json({ok:true,devOtp:c});});app.post('/api/otp/verify',async(req,res)=>{const t=((req.body&&(req.body.target||req.body.phone||req.body.email))||'').trim().toLowerCase();const o=((req.body&&req.body.otp)||'').trim();if(!t||!o)return res.status(400).json({error:'Target and OTP required'});let r=_otp.get(t);try{const d=typeof _sbDb==='function'?_sbDb():null;if(!r&&d)r=await d.collection('sb_otps').findOne({t});}catch(_){}if(!r)return res.status(400).json({error:'Request OTP first'});if(Date.now()>r.e){_otp.delete(t);return res.status(400).json({error:'OTP expired'});}if(String(r.c)!==o)return res.status(400).json({error:'Invalid OTP'});_otp.delete(t);try{const d=typeof _sbDb==='function'?_sbDb():null;if(d)await d.collection('sb_otps').deleteOne({t});}catch(_){}res.json({ok:true,verified:true});});
