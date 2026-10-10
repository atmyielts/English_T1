type AuthClient = { auth:{getUser(token:string):PromiseLike<{data:{user:{id:string;email?:string;email_confirmed_at?:string|null}|null};error:unknown}>} };
export async function requireCandidateAccount(req:Request,client:AuthClient) {
  const header=req.headers.get('Authorization')??'';
  const match=/^Bearer ([^\s]+)$/i.exec(header);
  if(!match||match[1].length>8192)return {ok:false as const,status:401,error:'Sign in to start or resume your exam.'};
  try {
    const {data,error}=await client.auth.getUser(match[1]);
    if(error&&typeof error==='object'&&'status' in error&&(Number(error.status)>=500||Number(error.status)===429))
      return {ok:false as const,status:503,error:'Account verification is temporarily unavailable. Try again.'};
    if(error||!data.user||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(data.user.id))return {ok:false as const,status:401,error:'Sign in to start or resume your exam.'};
    const email=data.user.email?.trim().toLowerCase();
    if(!email||!data.user.email_confirmed_at)return {ok:false as const,status:403,error:'Verify your email before starting your exam.'};
    return {ok:true as const,userId:data.user.id,email};
  }catch{return {ok:false as const,status:503,error:'Account verification is temporarily unavailable. Try again.'};}
}
