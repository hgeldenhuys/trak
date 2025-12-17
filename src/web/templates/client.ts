/**
 * Client-Side JavaScript Generator
 *
 * Generates minimal JavaScript for:
 * - SSE (Server-Sent Events) connection and auto-reconnect
 * - DOM updates on data changes
 * - Keyboard navigation (matching TUI bindings)
 * - Help modal toggle
 *
 * Target size: < 5KB
 */

/**
 * Get the client-side JavaScript as a string
 * This is inlined into the HTML to avoid extra HTTP requests
 * Minified to stay under 5KB
 */
export function getClientScript(): string {
  return `(function(){
'use strict';
var s,r=0,f=-1,F=[],H=!1,V=document.querySelector('.content'),v=V?V.dataset.view:'board',
P={'1':'/board','2':'/story','3':'/list','4':'/blocked','5':'/retros','0':'/system'},
O=['board','story','list','blocked','retros','system'],
$=function(i){return document.getElementById(i)},
D=$('status-dot'),T=$('status-text'),U=$('last-update'),M=$('main-content'),
HM=$('help-modal'),CH=$('close-help'),TC=$('toast-container');

function C(){
if(s)s.close();
S('connecting');
try{
s=new EventSource('/api/events');
s.onopen=function(){r=0;S('connected');toast('Connected','success')};
s.onmessage=function(e){try{var d=JSON.parse(e.data);if(d.type==='refresh')R()}catch(x){}};
s.onerror=function(){S('disconnected');s.close();rec()};
s.addEventListener('task',function(){R()});
s.addEventListener('story',function(){R()});
s.addEventListener('refresh',function(){R()})
}catch(e){S('disconnected');rec()}
}

function rec(){if(r>=10){toast('Connection lost','error');return}r++;setTimeout(C,Math.min(1e3*Math.pow(2,r-1),3e4))}
function S(st){if(!D||!T)return;D.className='status-dot '+st;T.textContent={'connected':'Live','disconnected':'Disconnected','connecting':'Connecting...'}[st]||st}
function R(){fetch(location.pathname,{headers:{'X-Partial':'true'}}).then(function(r){return r.text()}).then(function(h){var p=new DOMParser,d=p.parseFromString(h,'text/html'),n=d.querySelector('.content');if(n&&M){var c=M.querySelector('.content');if(c){c.innerHTML=n.innerHTML;uF()}}stamp()}).catch(function(){})}
function stamp(){if(U)U.textContent='Updated: '+new Date().toLocaleTimeString()}

function uF(){F=Array.from(document.querySelectorAll('.task-card,.story-item,.card[tabindex],[data-focusable]'));F.forEach(function(e,i){e.setAttribute('tabindex','0');e.setAttribute('data-focus-index',i)})}
function mF(d){if(!F.length){window.scrollBy(0,d*100);return}var n=f+d;n=Math.max(0,Math.min(F.length-1,n));sF(n)}
function mC(d){var cols=document.querySelectorAll('.kanban-column');if(!cols.length)return;var cc=0;if(f>=0&&F[f]){var col=F[f].closest('.kanban-column');if(col)cc=Array.from(cols).indexOf(col)}var nc=Math.max(0,Math.min(cols.length-1,cc+d));var items=cols[nc].querySelectorAll('.task-card');if(items.length){var i=F.indexOf(items[0]);if(i>=0)sF(i)}}
function sF(i){if(f>=0&&F[f])F[f].classList.remove('focused');f=i;if(f>=0&&F[f]){var e=F[f];e.classList.add('focused');e.focus();e.scrollIntoView({behavior:'smooth',block:'nearest'})}}
function sel(){if(f>=0&&F[f]){var e=F[f],l=e.tagName==='A'?e:e.querySelector('a');if(l&&l.href){nav(l.href);return}if(e.dataset.href){nav(e.dataset.href);return}e.click()}}
function nav(p){location.href=p}
function cyc(d){var i=O.indexOf(v);if(i<0)i=0;i=(i+d+O.length)%O.length;nav('/'+O[i])}
function back(){if(v==='story'&&location.pathname.includes('/story/')){nav('/list');return}if(v!=='board')nav('/board')}
function th(){H=!H;if(HM)HM.classList.toggle('visible',H);if(H&&CH)CH.focus()}
function toast(m,t){if(!TC)return;var e=document.createElement('div');e.className='toast '+(t||'info');e.textContent=m;TC.appendChild(e);setTimeout(function(){e.style.opacity='0';setTimeout(function(){e.remove()},200)},3e3)}

function kd(e){if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')return;var k=e.key;
if(H){if(k==='Escape'||k==='?'){th();e.preventDefault()}return}
if(P[k]){e.preventDefault();nav(P[k]);return}
if(k==='Tab'){e.preventDefault();cyc(e.shiftKey?-1:1);return}
if(k==='?'){e.preventDefault();th();return}
switch(k){
case'j':case'ArrowDown':e.preventDefault();mF(1);break;
case'k':case'ArrowUp':e.preventDefault();mF(-1);break;
case'h':case'ArrowLeft':e.preventDefault();mC(-1);break;
case'l':case'ArrowRight':e.preventDefault();mC(1);break;
case'Enter':case' ':e.preventDefault();sel();break;
case'Escape':e.preventDefault();back();break;
case'G':if(F.length){e.preventDefault();sF(F.length-1)}break
}}

function init(){
C();
document.addEventListener('keydown',kd);
uF();
if(CH)CH.addEventListener('click',th);
if(HM)HM.addEventListener('click',function(e){if(e.target===HM)th()});
document.querySelectorAll('.nav-item').forEach(function(n){n.addEventListener('click',function(){v=n.dataset.view||v})});
if(v==='board'||v==='list')setTimeout(function(){if(F.length)sF(0)},100);
stamp()
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init()
})();`;
}

/**
 * Get minified version of client script (same as regular for now)
 */
export function getClientScriptMinified(): string {
  return getClientScript();
}
