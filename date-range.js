export function monthDates(value) {
  if(!/^\d{4}-\d{2}$/.test(value))return null;
  const [year,month]=value.split('-').map(Number);
  if(year<1000||month<1||month>12)return null;
  const last=new Date(year,month,0).getDate();
  return {dateFrom:`${value}-01`,dateTo:`${value}-${last}`};
}
export function formatDateRange(range) {
  if(!range?.dateFrom||!range?.dateTo)return '—';
  const month=monthDates(range.dateFrom.slice(0,7));
  const format=value=>new Intl.DateTimeFormat('pl-PL',{day:'numeric',month:'short',year:'numeric'}).format(new Date(`${value}T12:00:00`));
  if(month&&range.dateFrom===month.dateFrom&&range.dateTo===month.dateTo){
    const label=new Intl.DateTimeFormat('pl-PL',{month:'long',year:'numeric'}).format(new Date(`${range.dateFrom}T12:00:00`));
    return label.charAt(0).toUpperCase()+label.slice(1);
  }
  if(range.dateFrom===range.dateTo)return format(range.dateFrom);
  return `${format(range.dateFrom)} – ${format(range.dateTo)}`;
}
