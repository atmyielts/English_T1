// Form values are wall-clock times in a named branch/calendar zone, never the
// operator's browser zone. Reject DST gaps and folds instead of silently moving
// a lesson or choosing one of two possible instants.
const formatters=new Map<string,Intl.DateTimeFormat>();
export function academyWallTime(instant:Date,zone:string){
  let formatter=formatters.get(zone);
  if(!formatter){
    if(formatters.size>=16)formatters.clear();
    formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});formatters.set(zone,formatter);
  }
  const parts=formatter.formatToParts(instant);
  const part=(kind:string)=>parts.find(item=>item.type===kind)?.value??'';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}
export function academyWallTimeToIso(value:string,zone:string){
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw new Error('Choose a valid date and time.');
  const wallMs=Date.parse(value+':00Z');
  if(!Number.isFinite(wallMs)||new Date(wallMs).toISOString().slice(0,16)!==value)throw new Error('Choose a valid date and time.');
  const offsets=new Set<number>();
  for(let hours=-36;hours<=36;hours+=6){
    const sample=wallMs+hours*3_600_000;
    offsets.add(Date.parse(academyWallTime(new Date(sample),zone)+':00Z')-sample);
  }
  const candidates=[...offsets].map(offset=>new Date(wallMs-offset)).filter(instant=>academyWallTime(instant,zone)===value);
  if(!candidates.length)throw new Error('This local time does not exist because the clock changes. Choose another time.');
  if(candidates.length!==1)throw new Error('This local time occurs twice because the clock changes. Choose an unambiguous time.');
  return candidates[0].toISOString();
}
