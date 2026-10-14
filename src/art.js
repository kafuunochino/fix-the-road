import { ports } from './rules.js';
const ends = [[50,-4],[104,50],[50,104],[-4,50]];
export const svg = content => `<svg viewBox="0 0 100 100" aria-hidden="true">${content}</svg>`;
const linePath = (a,b) => {
  const p=ends[a],q=ends[b];
  return (a+2)%4===b ? `M${p} L${q}` : `M${p} L${50+(p[0]-50)*.48} ${50+(p[1]-50)*.48} Q50 50 ${50+(q[0]-50)*.48} ${50+(q[1]-50)*.48} L${q}`;
};
export function carArt(color='#f5ae35') {
  return svg(`<rect x="14" y="19" width="24" height="9" rx="4" fill="#525c50"/><rect x="14" y="72" width="24" height="9" rx="4" fill="#525c50"/><rect x="65" y="19" width="18" height="9" rx="4" fill="#525c50"/><rect x="65" y="72" width="18" height="9" rx="4" fill="#525c50"/><rect x="10" y="23" width="80" height="54" rx="14" fill="${color}" stroke="#fff6da" stroke-width="2"/><path d="M63 29h12q9 0 9 10v22q0 10-9 10H63z" fill="#fff0c2"/><path d="M60 31v38" stroke="#c28a49" stroke-width="3"/><rect x="17" y="31" width="34" height="38" rx="6" fill="#fff7df" opacity=".4"/><rect x="87" y="31" width="6" height="10" rx="2" fill="#fff8d8"/><rect x="87" y="59" width="6" height="10" rx="2" fill="#fff8d8"/>`);
}
function building(tile) {
  const [x,y]=ends[tile.direction];
  const road=`<path d="M50 50L${x} ${y}" stroke="#bec1af" stroke-width="30"/><path d="M50 50L${x} ${y}" stroke="#f7f5e8" stroke-width="2" stroke-dasharray="6 7"/>`;
  if(tile.type==='source') return road+`<rect x="22" y="29" width="56" height="48" rx="7" fill="#a7b8bc"/><path d="M16 32L50 13L84 32Z" fill="#7b9699"/><rect x="32" y="42" width="36" height="33" rx="3" fill="#e4e6da"/><path d="M34 49h32M34 57h32M34 65h32" stroke="#acb9ad" stroke-width="3"/><circle cx="50" cy="28" r="5" fill="#e9e6b6"/>`;
  if(tile.destination==='bakery') return road+`<rect x="21" y="30" width="58" height="43" rx="5" fill="#f0c98c"/><path d="M16 31L50 12L84 31Z" fill="#bd8f78"/><rect x="45" y="49" width="19" height="25" rx="7" fill="#b2936d"/><rect x="27" y="42" width="13" height="16" rx="2" fill="#fff2c5"/><rect x="18" y="33" width="64" height="11" rx="3" fill="#f2deac"/><path d="M22 35v7M34 35v7M46 35v7M58 35v7M70 35v7" stroke="#d8ac72" stroke-width="6"/><path d="M43 23q7-8 14 0v5H43z" fill="#ffe5ac"/>`;
  return road+`<rect x="25" y="30" width="51" height="40" rx="5" fill="#c6badc"/><path d="M20 31L50 12L81 31Z" fill="#9a87b9"/><rect x="43" y="46" width="17" height="26" rx="8" fill="#8d7da5"/><path d="M23 71h55" stroke="#a7b98b" stroke-width="10" stroke-linecap="round"/><path d="M26 68V51M73 68V49" stroke="#8ca970" stroke-width="3"/><circle cx="26" cy="47" r="8" fill="#eeb4a9"/><circle cx="73" cy="46" r="8" fill="#dfbbdf"/><circle cx="26" cy="47" r="3" fill="#ffe9bb"/><circle cx="73" cy="46" r="3" fill="#ffe9bb"/>`;
}
export function tileArt(tile, preview=false) {
  if(tile.type==='park') {
    const d=tile.decor;
    if(d===0) return svg(`<path d="M28 71h44" stroke="#c0d4b2" stroke-width="10" stroke-linecap="round"/><path d="M50 41v32" stroke="#a7ad80" stroke-width="5"/><circle cx="49" cy="37" r="22" fill="#b8cf9b"/><path d="M51 17q26 28 4 40q28-3 17-29z" fill="#a9c38d"/>`);
    if(d===1) return svg(`<ellipse cx="50" cy="62" rx="29" ry="12" fill="#c6dbc0"/><path d="M32 57q-12-14 4-20q6-13 18-5q21-7 23 11q13 23-17 24z" fill="#bed4b0"/><circle cx="41" cy="45" r="3" fill="#efdbb0"/><circle cx="61" cy="50" r="3" fill="#efdbb0"/>`);
    if(d===2) return svg(`<path d="M34 66V53M65 55V42" stroke="#adc18d" stroke-width="3"/><circle cx="34" cy="50" r="6" fill="#e3cfb4"/><circle cx="65" cy="40" r="6" fill="#e5dbac"/><path d="M49 75l6-9M20 34l7 1" stroke="#c1d3af" stroke-width="3"/>`);
    if(d===3) return svg(`<path d="M28 42h44v7H28zM28 54h44v7H28z" fill="#bdc6a5"/><path d="M33 38v31M67 38v31" stroke="#aab997" stroke-width="4"/><ellipse cx="50" cy="73" rx="28" ry="5" fill="#cbdcc0"/>`);
    return svg(`<ellipse cx="52" cy="57" rx="25" ry="12" fill="#bcd5c5"/><ellipse cx="49" cy="53" rx="20" ry="8" fill="#c7e0d4"/><path d="M42 51h12" stroke="#e3eee0" stroke-width="2" stroke-linecap="round"/><path d="M25 66l3-10M78 41l-3 9" stroke="#afc591" stroke-width="3"/>`);
  }
  if(tile.type==='source'||tile.type==='destination') return svg(building(tile));
  const active=ports(tile),p=linePath(...active);
  let ghost='';
  if(tile.type==='switch') {
    const other=tile.exits[1-tile.switchState];
    ghost=`<path d="${linePath(tile.stem,other)}" fill="none" stroke="#e0d2a3" stroke-width="30"/><path d="${linePath(tile.stem,other)}" fill="none" stroke="#f5ebcd" stroke-width="2" stroke-dasharray="5 6"/>`;
  }
  return svg(`${ghost}<path d="${p}" fill="none" stroke="${tile.type==='switch'?'#bdb59a':'#bcc4b7'}" stroke-width="36"/><path d="${p}" fill="none" stroke="#f7f6e9" stroke-width="2.5" stroke-dasharray="7 7"/>${preview?`<path class="route-line" d="${p}" fill="none" stroke="#7eaa64" stroke-width="5"/>`:''}${tile.type==='switch'?'<circle cx="50" cy="50" r="10" fill="#f4d17a" stroke="#fff4cc" stroke-width="3"/>':''}`);
}
