import { fromIso, normalizeWeeklyHours } from './reminders.js';

// One definition for the striped chart segment and the displayed overtime total.
export function dailyWorkLimit(day,{weeklyHours=null,dailyTargetHours=8}={}) {
  if(day.targetSeconds>0)return day.targetSeconds;
  const schedule=normalizeWeeklyHours(weeklyHours,dailyTargetHours);
  return Math.round((schedule[fromIso(day.date).getDay()] || dailyTargetHours || 8)*3600);
}
export function dailyOvertime(day,settings) {
  return Math.max(0,Number(day.seconds||0)-dailyWorkLimit(day,settings));
}
export function totalOvertime(days,settings) {
  return days.reduce((sum,day)=>sum+dailyOvertime(day,settings),0);
}
