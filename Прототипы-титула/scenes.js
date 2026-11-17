(() => {
  'use strict';
  const stage=document.getElementById('stage'), canvas=document.getElementById('scene');
  const ctx=canvas.getContext('2d'), mode=document.body.dataset.scene;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const W=1600,H=900,DPR=Math.min(devicePixelRatio||1,2);
  canvas.width=W*DPR;canvas.height=H*DPR;
  // The deck's background vocabulary and palette, kept separate from the 3D scenes.
  const backdrop=document.createElement('div');backdrop.className='bgfx';backdrop.ariaHidden='true';
  const bgWords=['токен','вектор','внимание','контекст','0.42','−0.17','0.93','Q · K · V','вес'];
  for(let i=0;i<22;i++){
    const token=document.createElement('span');token.textContent=bgWords[i%bgWords.length];
    token.style.cssText=`left:${(i*37.3+3)%96}%;top:${(i*23.7+9)%97}%;font-size:${14+(i*7)%11}px;opacity:${.05+(i%7)*.009};animation-delay:-${i*1.6}s`;
    backdrop.append(token);
  }
  stage.insertBefore(backdrop,canvas);
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),mix=(a,b,t)=>a+(b-a)*t;
  const smooth=t=>t*t*(3-2*t),out=t=>1-Math.pow(1-t,3);
  const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]);
  const mul=(a,k)=>a.map(v=>v*k),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const unit=a=>mul(a,1/(Math.hypot(...a)||1)),vmix=(a,b,t)=>a.map((v,i)=>mix(v,b[i],t));
  const color=(a,k=1)=>'rgb('+a.map(v=>Math.round(clamp(v*k,0,255))).join(',')+')';
  const labels=mode==='foundation'?['Уверенность','Обратная сторона','Без опоры']:['Опора','Продолжение','Над пустотой'];
  let step=0,position=0,from=0,started=0,duration=2400,raf=0;
  const stateNames=mode==='foundation'?['Это точно.','А что за ответом?','Почему модель выдумывает']:['Сначала есть опора.','Текст продолжается. Опоры больше нет.','Почему модель выдумывает'];
  const buttons=labels.map((label,i)=>{
    const b=document.createElement('button');b.textContent=i+1;b.ariaLabel=`Шаг ${i+1}: ${label}`;
    b.addEventListener('click',()=>go(i));document.getElementById('steps').append(b);return b;
  });
  function fit(){stage.style.transform=`translate(-50%,-50%) scale(${Math.min(innerWidth/W,innerHeight/H)})`;}
  addEventListener('resize',fit);fit();
  function go(n,replay=false){
    const next=clamp(n,0,2);if(next===step&&!replay)return;
    from=position;step=next;started=performance.now();duration=mode==='bridge'?3100:2700;
    if(reduced){position=step;from=step;}
    stage.dataset.step=step;
    document.querySelectorAll('.copy').forEach((e,i)=>e.setAttribute('aria-hidden',i!==step));
    buttons.forEach((b,i)=>{if(i===step)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});
    document.getElementById('previous').disabled=step===0;
    document.getElementById('next').innerHTML=step===2?'Ещё раз <span>↺</span>':'Дальше <span>→</span>';
    document.getElementById('chapter-no').textContent=String(step+1).padStart(2,'0');
    document.getElementById('chapter-label').textContent=labels[step];
    document.getElementById('status').textContent=`Шаг ${step+1} из 3. ${stateNames[step]}`;
    history.replaceState(null,'','#step='+(step+1));
    cancelAnimationFrame(raf);raf=requestAnimationFrame(frame);
  }
  function advance(){go(step===2?0:step+1);}
  async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen?.();}catch{}}
  document.getElementById('next').onclick=advance;
  document.getElementById('previous').onclick=()=>go(step-1);
  document.getElementById('restart').onclick=()=>go(0,true);
  document.getElementById('fullscreen').onclick=fullscreen;
  canvas.onclick=advance;
  addEventListener('hashchange',()=>{
    const requested=Number(new URLSearchParams(location.hash.slice(1)).get('step'));
    if(Number.isInteger(requested)&&requested>=1&&requested<=3)go(requested-1);
  });
  addEventListener('keydown',e=>{
    if(e.target.closest('button,a')&&[' ','Enter'].includes(e.key))return;
    if(['ArrowRight','PageDown',' ','Enter'].includes(e.key)){e.preventDefault();advance();}
    else if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();go(step-1);}
    else if(e.key==='Home'||e.key.toLowerCase()==='r'){e.preventDefault();go(0,true);}
    else if(e.key==='End'){e.preventDefault();go(2);}
    else if(e.key.toLowerCase()==='f'){e.preventDefault();fullscreen();}
  });

  // Small perspective renderer. All geometry is local; no external runtime or network.
  class Scene {
    constructor(eye,target,cx,cy,focal){
      this.eye=eye;this.forward=unit(sub(target,eye));this.right=unit(cross(this.forward,[0,1,0]));
      this.up=cross(this.right,this.forward);this.cx=cx;this.cy=cy;this.focal=focal;this.faces=[];this.opacity=1;
    }
    point(p){const d=sub(p,this.eye),z=dot(d,this.forward);return [this.cx+dot(d,this.right)*this.focal/z,this.cy-dot(d,this.up)*this.focal/z,z];}
    face(points,fill,texture=null,normal=null){
      const mid=mul(points.reduce((s,p)=>add(s,p),[0,0,0]),1/points.length);
      if(normal&&dot(sub(this.eye,mid),normal)<=0)return;
      const pp=points.map(p=>this.point(p));if(pp.some(p=>p[2]<.15))return;
      const shade=normal?(.68+.32*Math.max(0,dot(normal,unit([-.4,.85,1])))):1;
      this.faces.push({points,pp,depth:dot(sub(mid,this.eye),this.forward),fill:color(fill,shade),texture,opacity:this.opacity});
    }
    box(x,y,z,w,h,d,fill,textures={}){
      const a=x-w/2,b=x+w/2,c=y-h/2,e=y+h/2,f=z-d/2,g=z+d/2;
      this.face([[a,e,g],[b,e,g],[b,c,g],[a,c,g]],fill,textures.front,[0,0,1]);
      this.face([[b,e,f],[a,e,f],[a,c,f],[b,c,f]],fill,textures.back,[0,0,-1]);
      this.face([[a,e,f],[a,e,g],[a,c,g],[a,c,f]],fill,null,[-1,0,0]);
      this.face([[b,e,g],[b,e,f],[b,c,f],[b,c,g]],fill,null,[1,0,0]);
      this.face([[a,e,f],[b,e,f],[b,e,g],[a,e,g]],fill,textures.top,[0,1,0]);
      this.face([[a,c,g],[b,c,g],[b,c,f],[a,c,f]],fill,null,[0,-1,0]);
    }
    beam(a,b,width,fill){
      const along=unit(sub(b,a)),side=mul(unit(cross(along,[1,.1,0])),width/2),up=mul(unit(cross(along,side)),width/2);
      const corners=p=>[add(add(p,side),up),add(sub(p,side),up),sub(sub(p,side),up),sub(add(p,side),up)];
      const aa=corners(a),bb=corners(b);
      for(let i=0;i<4;i++){const j=(i+1)%4;this.face([aa[i],aa[j],bb[j],bb[i]],fill);}
    }
    paint(){
      ctx.save();
      this.faces.sort((a,b)=>b.depth-a.depth);
      for(const f of this.faces){
        ctx.globalAlpha=f.opacity;
        ctx.fillStyle=f.fill;ctx.beginPath();f.pp.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.fill();
        if(f.texture) this.texture(f.texture,f.points);
      }
      ctx.restore();
    }
    texture(image,points){
      const at=(u,v)=>this.point(vmix(vmix(points[0],points[1],u),vmix(points[3],points[2],u),v));
      const n=5;
      for(let i=0;i<n;i++)for(let j=0;j<n;j++){
        const u=i/n,v=j/n,u1=(i+1)/n,v1=(j+1)/n;
        const a=at(u,v),b=at(u1,v),c=at(u1,v1),d=at(u,v1);
        texturedTriangle(image,[a,b,c],[[u,v],[u1,v],[u1,v1]]);
        texturedTriangle(image,[a,c,d],[[u,v],[u1,v1],[u,v1]]);
      }
    }
  }
  function texturedTriangle(image,dst,uv){
    const s=uv.map(p=>[p[0]*image.width,p[1]*image.height]);
    const [x0,y0]=s[0],[x1,y1]=s[1],[x2,y2]=s[2];
    const det=x0*(y1-y2)+x1*(y2-y0)+x2*(y0-y1);if(Math.abs(det)<1e-6)return;
    const solve=axis=>{
      const q=dst.map(p=>p[axis]);
      return [(q[0]*(y1-y2)+q[1]*(y2-y0)+q[2]*(y0-y1))/det,
        (q[0]*(x2-x1)+q[1]*(x0-x2)+q[2]*(x1-x0))/det,
        (q[0]*(x1*y2-x2*y1)+q[1]*(x2*y0-x0*y2)+q[2]*(x0*y1-x1*y0))/det];
    };
    const x=solve(0),y=solve(1),cx=dst.reduce((s,p)=>s+p[0],0)/3,cy=dst.reduce((s,p)=>s+p[1],0)/3;
    // Slight overlap prevents anti-aliased seams between projected texture triangles.
    const clip=dst.map(p=>{const d=Math.hypot(p[0]-cx,p[1]-cy)||1;return [p[0]+(p[0]-cx)*.35/d,p[1]+(p[1]-cy)*.35/d];});
    ctx.save();ctx.beginPath();clip.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.clip();
    ctx.transform(x[0],y[0],x[1],y[1],x[2],y[2]);ctx.drawImage(image,0,0);ctx.restore();
  }
  function makeTexture(w,h,paint){const c=document.createElement('canvas');c.width=w;c.height=h;paint(c.getContext('2d'),w,h);return c;}
  const textures={};
  function buildTextures(){
    textures.stone=makeTexture(800,650,(c,w,h)=>{
      c.fillStyle='#DCE6F5';c.fillRect(0,0,w,h);let seed=23;const r=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
      for(let i=0;i<6500;i++){c.fillStyle=`rgba(107,105,91,${r()*.075})`;c.fillRect(r()*w,r()*h,1+r()*5,1+r()*2);}
      for(let i=0;i<35;i++){const y=r()*h;c.strokeStyle='rgba(132,128,111,.07)';c.lineWidth=.5+r();c.beginPath();c.moveTo(0,y);c.bezierCurveTo(w*.25,y+20,w*.7,y-15,w,y+8);c.stroke();}
      c.strokeStyle='#95AED2';c.lineWidth=1.4;c.strokeRect(33,29,w-66,h-58);c.strokeRect(41,37,w-82,h-74);
      c.textAlign='center';c.fillStyle='#2F5FA8';c.font='500 22px "JetBrains Mono"';c.fillText('НЕОСПОРИМО',w/2,180);
      c.font='600 122px Piazzolla';c.fillStyle='#2F5FA8';c.fillText('ФАКТ',w/2,365);
      c.fillStyle='#6D88AD';c.fillRect(w/2-58,406,116,2);c.font='400 19px "JetBrains Mono"';c.fillText('ПРОВЕРКИ НЕ ТРЕБУЕТ',w/2,465);
    });
    textures.back=makeTexture(800,650,(c,w,h)=>{
      c.fillStyle='#F6E2E0';c.fillRect(0,0,w,h);
      for(let i=0;i<70;i++){c.fillStyle=`rgba(90,68,38,${.03+(i%4)*.012})`;c.fillRect(0,i*10,w,1);}
      c.translate(w/2,h/2);c.rotate(-.08);c.textAlign='center';c.fillStyle='#B3372E';c.font='500 36px "JetBrains Mono"';c.fillText('ДЕКОРАЦИЯ',0,0);c.font='400 18px "JetBrains Mono"';c.fillText('ЛИЦЕВАЯ СТОРОНА →',0,43);
    });
    const words=['Ответ','звучит','убедительно.','Даже','без','опоры','на','факты.'];
    textures.words=words.map((word,i)=>makeTexture(Math.max(360,word.length*72+80),240,(c,w,h)=>{
      c.fillStyle=i<3?'#DCE6F5':'#F6E2E0';c.fillRect(0,0,w,h);c.strokeStyle=i<3?'#9AB3D9':'#D6928C';c.lineWidth=2;c.strokeRect(15,15,w-30,h-30);
      c.fillStyle=i<3?'#17202B':'#B3372E';c.font='600 104px Piazzolla';c.textAlign='center';c.textBaseline='middle';c.fillText(word,w/2,h/2-4,w-50);
    }));
    textures.facts=[1,2,3].map(i=>makeTexture(300,600,(c,w,h)=>{
      c.fillStyle='#DCE6F5';c.fillRect(0,0,w,h);c.strokeStyle='#AFC3DF';c.lineWidth=2;c.strokeRect(24,20,w-48,h-40);
      c.textAlign='center';c.fillStyle='#2F5FA8';c.font='400 26px "JetBrains Mono"';c.fillText('ФАКТ',w/2,180);c.font='600 86px Piazzolla';c.fillText('0'+i,w/2,295);
    }));
  }
  function background(p){
    ctx.setTransform(DPR,0,0,DPR,0,0);ctx.globalAlpha=1;ctx.clearRect(0,0,W,H);
  }
  function ellipse(x,y,rx,ry,alpha){ctx.save();ctx.translate(x,y);ctx.scale(rx,ry);const g=ctx.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,`rgba(72,88,74,${alpha})`);g.addColorStop(1,'rgba(72,88,74,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,1,0,Math.PI*2);ctx.fill();ctx.restore();}
  function foundation(p){
    const reveal=clamp(p),end=clamp(p-1),angle=mix(0,2.04,smooth(reveal))+end*.15;
    const radius=mix(10,12,end),eye=[Math.sin(angle)*radius,4.2,Math.cos(angle)*radius];
    const scene=new Scene(eye,[0,1.5,0],mix(800,1110,smooth(reveal))+end*80,580,1110);
    const foot=scene.point([0,0,0]);ellipse(foot[0]+40,foot[1]+12,300,58,.18*(1-end*.7));
    ctx.strokeStyle='rgba(47,95,168,.10)';ctx.lineWidth=1;
    const a=scene.point([-12,0,-1.6]),b=scene.point([12,0,-1.6]);ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();
    scene.opacity=1-end*.66;
    // A painted facade, not a solid block. From the front it conceals its braces.
    scene.box(0,1.22,0,3.15,2.44,.055,[220,230,245],{front:textures.stone,back:textures.back});
    scene.box(0,.055,.015,3.4,.11,.18,[186,204,229]);
    scene.box(0,2.48,.015,3.42,.09,.18,[220,230,245]);
    scene.box(0,2.57,.018,3.62,.09,.24,[233,239,248]);
    for(const x of [-1.43,1.43]){
      scene.box(x,1.22,-.065,.075,2.4,.08,[133,150,173]);
      scene.beam([x,.04,-.95],[x,1.72,-.09],.065,[130,147,170]);
      scene.box(x,.025,-.56,.10,.05,1.13,[115,133,156]);
    }
    scene.box(0,1.22,-.07,2.9,.08,.08,[133,150,173]);
    scene.paint();
    const quote=scene.point([0,2.94,0]);const answer=document.getElementById('floating-answer');answer.style.left=quote[0]+'px';answer.style.top=quote[1]+'px';
    const edge=scene.point([1.1,.9,-.4]);const note=document.getElementById('scene-note');note.style.left=clamp(edge[0]-45,820,1190)+'px';note.style.top=clamp(edge[1]+95,590,755)+'px';
  }
  const widths=[1.43,1.65,2.65,1.06,.92,1.42,.72,1.55];
  const starts=[];let acc=-5.65;for(const w of widths){starts.push(acc);acc+=w+.075;}
  const supportedEnd=starts[2]+widths[2]+.12;
  function bridge(p){
    const reveal=clamp(p),end=clamp(p-1),q=smooth(reveal);
    const eye=vmix(vmix([1,5.3,11],[5.6,6.4,14.3],q),[6.4,4.7,16.2],end);
    const target=vmix(vmix([-2.8,-.7,0],[0,-.6,0],q),[.4,-.8,0],end);
    const scene=new Scene(eye,target,mix(1050,845,q)-end*25,mix(640,660,end),1100);
    // The left bank is finite. Nothing is drawn beneath the unsupported words.
    scene.box(-6.6,-5.05,0,13.2+2*supportedEnd,5.2,3.8,[194,206,222]);
    scene.box(-6.6,-2.39,0,13.2+2*supportedEnd,.12,4,[231,235,241]);
    for(let i=0;i<3;i++){
      const x=starts[i]+widths[i]/2;
      scene.box(x,-.88,0,.60,2.95,.67,[195,211,234],{front:textures.facts[i]});
      scene.box(x,-2.30,0,.90,.19,.95,[185,202,226]);
      scene.box(x,.57,0,.85,.15,.98,[220,230,245]);
    }
    for(let i=0;i<widths.length;i++){
      const built=i<3?1:clamp((reveal-(.10+(i-3)*.13))/.25);if(built<=0)continue;
      const x=starts[i]+widths[i]/2,y=.77+(1-out(built))*1.7,z=(1-out(built))*.45;
      const opacity=scene.opacity;scene.opacity=built;
      scene.box(x,y,z,widths[i],.21,1.06,i<3?[190,207,232]:[218,158,151],{top:textures.words[i]});
      scene.opacity=opacity;
    }
    scene.paint();
    // A fine seam makes the end of factual support visible without a loud marker.
    const seamA=scene.point([supportedEnd,.55,.62]),seamB=scene.point([supportedEnd,-2.32,.62]);
    if(reveal>.65&&end<.8){ctx.save();ctx.globalAlpha=clamp((reveal-.65)*3)*(1-end);ctx.strokeStyle='#B3372E';ctx.setLineDash([3,6]);ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(seamA[0],seamA[1]);ctx.lineTo(seamB[0],seamB[1]);ctx.stroke();ctx.restore();}
    const note=document.getElementById('scene-note');note.style.left=clamp(seamA[0]+30,650,1110)+'px';note.style.top=clamp(seamA[1]+125,560,770)+'px';
  }
  function frame(now){
    const t=reduced?1:clamp((now-started)/duration);position=mix(from,step,smooth(t));background(position);
    if(mode==='foundation')foundation(position);else bridge(position);
    if(t<1)raf=requestAnimationFrame(frame);
  }
  document.fonts.ready.then(()=>{
    buildTextures();const requested=Number(new URLSearchParams(location.hash.slice(1)).get('step'));
    if(Number.isInteger(requested)&&requested>=1&&requested<=3){step=requested-1;position=step;}
    go(step,true);
  });
})();
