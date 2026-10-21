const academyName='deploy (academy, apps/academy, apps/academy/dist, schood-academy)';
export function academySmokeDeploymentDecision(plan,run,jobs){
 if(!run||run.status!=='completed'||run.conclusion!=='success')throw Error('The triggering Pages run must complete successfully.');
 if(!plan||plan.schemaVersion!==1||typeof plan.deploy!=='boolean'||!/^[a-f0-9]{40}$/.test(plan.head??'')||plan.head!==run.head_sha)throw Error('The Pages plan must identify the exact triggering commit.');
 if(!Array.isArray(jobs)||!jobs.some(j=>j.name==='plan'&&j.status==='completed'&&j.conclusion==='success'))throw Error('A successful Pages planning job is required.');
 const academy=jobs.find(j=>j.name===academyName);
 if(plan.deploy){if(!academy||academy.status!=='completed'||academy.conclusion!=='success')throw Error('The required Academy deployment did not succeed.');return{runSmoke:true,reason:'Academy deploy job succeeded'};}
 if(academy||jobs.some(j=>j.name?.startsWith('deploy ('))||!jobs.some(j=>j.name==='deploy'&&j.status==='completed'&&j.conclusion==='skipped'))throw Error('The skipped Pages plan conflicts with its actual deployment jobs.');
 return{runSmoke:false,reason:'Pages explicitly planned no frontend publication for this commit'};
}
