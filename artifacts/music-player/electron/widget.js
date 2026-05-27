'use strict';
var state={title:'',artist:'',coverUrl:null,isPlaying:false,duration:0,position:0,sentAt:0};
var elIdle=document.getElementById('idle');
var elTi=document.getElementById('ti');
var elTtl=document.getElementById('ttl');
var elSub=document.getElementById('sub');
var elImg=document.getElementById('art-img');
var elPh=document.getElementById('art-ph');
var elIcP=document.getElementById('ico-p');
var elIcPa=document.getElementById('ico-pa');
var elFill=document.getElementById('prog-fill');
var rafId=null;
var saveTm=null;

function calcPos(){
  if(!state.sentAt||!state.isPlaying) return state.position;
  return Math.min(state.position+(Date.now()-state.sentAt)/1000, state.duration||0);
}

function tick(){
  if(state.isPlaying&&state.duration>0){
    var pct=(Math.min(calcPos()/state.duration,1)*100).toFixed(2);
    elFill.style.width=pct+'%';
  }
  rafId=requestAnimationFrame(tick);
}

function applyState(){
  var has=!!state.title;
  elIdle.style.display=has?'none':'block';
  elTi.style.display=has?'block':'none';
  if(has){elTtl.textContent=state.title;elSub.textContent=state.artist||'Unknown artist';}
  if(state.coverUrl){
    elImg.src=state.coverUrl;elImg.style.display='block';elPh.style.display='none';
  } else {elImg.style.display='none';elPh.style.display='block';}
  elIcP.style.display=state.isPlaying?'none':'block';
  elIcPa.style.display=state.isPlaying?'block':'none';
  if(!state.isPlaying&&state.duration>0){
    elFill.style.width=(Math.min(state.position/state.duration,1)*100).toFixed(2)+'%';
  }
}

// Buttons
document.getElementById('btn-x').onclick=function(){window.electronAPI.widgetHide();};
document.getElementById('btn-prev').onclick=function(){window.electronAPI.widgetAction('prev');};
document.getElementById('btn-next').onclick=function(){window.electronAPI.widgetAction('next');};
document.getElementById('btn-play').onclick=function(){window.electronAPI.widgetAction('play-pause');};

// Progress click → seek
document.getElementById('prog-track').addEventListener('click',function(e){
  if(!state.duration) return;
  var r=this.getBoundingClientRect();
  var pct=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));
  window.electronAPI.widgetAction({type:'seek',position:pct*state.duration});
});

// Receive state
window.electronAPI.onWidgetState(function(s){
  state=s;
  applyState();
});

// Receive moved → debounced localStorage save
window.electronAPI.onWidgetMoved(function(pos){
  clearTimeout(saveTm);
  saveTm=setTimeout(function(){
    try{localStorage.setItem('widget-pos',JSON.stringify(pos));}catch(e){}
  },300);
});

// Restore saved position
try{
  var saved=localStorage.getItem('widget-pos');
  if(saved){
    var p=JSON.parse(saved);
    if(typeof p.x==='number'&&typeof p.y==='number'){
      window.electronAPI.widgetInitPosition(p);
    }
  }
}catch(e){}

// Start RAF loop
rafId=requestAnimationFrame(tick);
applyState();
