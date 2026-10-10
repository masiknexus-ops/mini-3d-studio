'use strict';
(()=>{
const $=id=>document.getElementById(id), canvas=$('viewport'), host=canvas.parentElement;
const gl=canvas.getContext('webgl',{alpha:false,antialias:true,preserveDrawingBuffer:true});
if(!gl){$('status').textContent='WebGL není dostupné. Zkus zapnout hardwarovou akceleraci prohlížeče.';return}
const vs=`attribute vec3 aPos;attribute vec3 aNormal;uniform mat4 uMVP;uniform mat3 uRotation;varying vec3 vNormal;varying vec3 vPos;void main(){vec3 p=uRotation*aPos;vPos=p;vNormal=normalize(uRotation*aNormal);gl_Position=uMVP*vec4(aPos,1.0);}`;
const fs=`precision highp float;varying vec3 vNormal;varying vec3 vPos;uniform vec3 uBase;uniform vec4 uLights;uniform vec3 uKeyColor,uFillColor,uRimColor;uniform vec3 uKeyDir,uFillDir,uRimDir;void main(){vec3 n=normalize(vNormal);vec3 viewDir=normalize(vec3(0.,0.,5.)-vPos);vec3 color=uBase*uLights.w*.8;vec3 dirs[3];dirs[0]=normalize(uKeyDir);dirs[1]=normalize(uFillDir);dirs[2]=normalize(uRimDir);vec3 cols[3];cols[0]=uKeyColor;cols[1]=uFillColor;cols[2]=uRimColor;for(int i=0;i<3;i++){float power=i==0?uLights.x:(i==1?uLights.y:uLights.z);float diffuse=max(dot(n,dirs[i]),0.);float spec=pow(max(dot(reflect(-dirs[i],n),viewDir),0.),40.)*.42*power; color+=(uBase*diffuse*power+vec3(spec))*cols[i];}color=vec3(1.)-exp(-color*.85);gl_FragColor=vec4(pow(clamp(color,0.,1.),vec3(.93)),1.);}`;
function shader(type,src){let s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s}
const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vs));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
const attrib={pos:gl.getAttribLocation(program,'aPos'),normal:gl.getAttribLocation(program,'aNormal')},uni={};for(const n of ['uMVP','uRotation','uBase','uLights','uKeyColor','uFillColor','uRimColor','uKeyDir','uFillDir','uRimDir'])uni[n]=gl.getUniformLocation(program,n);
const buffer=gl.createBuffer(),lineBuffer=gl.createBuffer();const gridBuffer=gl.createBuffer();
let shape='cube',smoothShade=true,wire=false,showNormals=false,spin=false,gridVisible=true,axesVisible=true,rx=24,ry=32,zoom=5.5,hue=210,phase=0,drag=null,last=0,dirty=true,mesh=null;
let lights={key:1.5,fill:.8,rim:1.3,ambient:.32};
const presets={studio:[1.5,.8,1.3,.32],soft:[1.2,1.1,.5,.55],dramatic:[2,.15,1.8,.07],neon:[.7,1.5,2,.13],product:[1.8,1.3,1.7,.45],sunset:[1.9,.35,.9,.25]};
const lightNames={key:'Key Light · Warm',fill:'Fill Light · Cool',rim:'Rim Light',ambient:'Ambient'};
const sub=(a,b)=>a.map((v,i)=>v-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),norm=a=>{const d=Math.hypot(...a)||1;return a.map(v=>v/d)};
function geometry(){
let verts=[],faces=[];
if(shape==='cube'){verts=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];faces=[[0,3,2,1],[4,5,6,7],[0,1,5,4],[3,7,6,2],[0,4,7,3],[1,2,6,5]]}
else if(shape==='pyramid'){verts=[[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1],[0,1.6,0]];faces=[[0,3,2,1],[0,1,4],[1,2,4],[2,3,4],[3,0,4]]}
else if(shape==='diamond'){verts=[[0,1.5,0],[1,0,0],[0,0,1],[-1,0,0],[0,0,-1],[0,-1.5,0]];faces=[[0,2,1],[0,3,2],[0,4,3],[0,1,4],[5,1,2],[5,2,3],[5,3,4],[5,4,1]]}
else{
// Unique north/south pole vertices: no degenerate quad at either pole.
const lon=64,lat=40;verts.push([0,1,0]);
for(let j=1;j<lat;j++){let t=j*Math.PI/lat;for(let i=0;i<lon;i++){let p=2*Math.PI*i/lon;verts.push([Math.sin(t)*Math.cos(p),Math.cos(t),Math.sin(t)*Math.sin(p)])}}
const south=verts.length;verts.push([0,-1,0]);
for(let i=0;i<lon;i++)faces.push([0,1+i,1+(i+1)%lon]);
for(let j=0;j<lat-2;j++)for(let i=0;i<lon;i++){let a=1+j*lon+i,b=1+j*lon+(i+1)%lon,c=a+lon,d=b+lon;faces.push([a,b,d,c])}
const last=1+(lat-2)*lon;for(let i=0;i<lon;i++)faces.push([last+i,south,last+(i+1)%lon]);
}
const tris=[],lines=[],normLines=[];
for(const f0 of faces){const face=f0.slice(),a=verts[face[0]],b=verts[face[1]],c=verts[face[2]];let n=norm(cross(sub(b,a),sub(c,a)));let center=face.reduce((s,i)=>s.map((v,k)=>v+verts[i][k]/face.length),[0,0,0]);if(dot(n,center)<0){face.reverse();n=n.map(v=>-v)}
for(let j=1;j<face.length-1;j++){const tri=[face[0],face[j],face[j+1]];for(const id of tri){let v=verts[id],normal=shape==='sphere'&&smoothShade?norm(v):n;tris.push(...v,...normal)}}
for(let j=0;j<face.length;j++){let p=verts[face[j]],q=verts[face[(j+1)%face.length]];lines.push(...p,...q)}
normLines.push(...center,...center.map((v,i)=>v+n[i]*.18))
}
mesh={tri:new Float32Array(tris),lines:new Float32Array(lines),normals:new Float32Array(normLines)};dirty=true;
}

// World-space grid and axis guides. They are rendered as unlit geometry with depth testing.
function guideGeometry(){const data=[];function segment(a,b,color){data.push(...a,...color,...b,...color)}for(let i=-10;i<=10;i++){if(i!==0){const col=i%5===0?[.29,.38,.50]:[.19,.26,.35];segment([i,-1.55,-10],[i,-1.55,10],col);segment([-10,-1.55,i],[10,-1.55,i],col)}}return new Float32Array(data)}
const gridData=guideGeometry();
function drawGuides(proj,view,rot){if(!gridVisible&&!axesVisible)return;
const gv=`attribute vec3 aPosition;attribute vec3 aColor;uniform mat4 uTransform;varying vec3 vColor;void main(){gl_Position=uTransform*vec4(aPosition,1.);vColor=aColor;}`;
const gf=`precision mediump float;varying vec3 vColor;void main(){gl_FragColor=vec4(vColor,1.);}`;
if(!drawGuides.program){const p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,gv));gl.attachShader(p,shader(gl.FRAGMENT_SHADER,gf));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));drawGuides.program=p;drawGuides.position=gl.getAttribLocation(p,'aPosition');drawGuides.color=gl.getAttribLocation(p,'aColor');drawGuides.transform=gl.getUniformLocation(p,'uTransform')}
const p=drawGuides.program;gl.useProgram(p);const mvp=matMul(proj,matMul(view,rot));gl.uniformMatrix4fv(drawGuides.transform,false,mvp);
gl.bindBuffer(gl.ARRAY_BUFFER,gridBuffer);gl.enableVertexAttribArray(drawGuides.position);gl.enableVertexAttribArray(drawGuides.color);gl.vertexAttribPointer(drawGuides.position,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(drawGuides.color,3,gl.FLOAT,false,24,12);
if(gridVisible){gl.bufferData(gl.ARRAY_BUFFER,gridData,gl.STATIC_DRAW);gl.drawArrays(gl.LINES,0,gridData.length/6)}
if(axesVisible){const axis=new Float32Array([-10,-1.54,0,1,.30,.30,10,-1.54,0,1,.30,.30,0,-1.54,-10,.25,.5,1,0,-1.54,10,.25,.5,1,0,-1.54,0,.36,1,.5,0,5,0,.36,1,.5]);gl.bufferData(gl.ARRAY_BUFFER,axis,gl.STATIC_DRAW);gl.drawArrays(gl.LINES,0,axis.length/6)}
gl.useProgram(program);
}
function updateGizmo(){const c=$('orientation');if(!c)return;const x=c.getContext('2d'),dpr=Math.min(devicePixelRatio||1,2),s=112;if(c.width!==s*dpr){c.width=s*dpr;c.height=s*dpr}x.setTransform(dpr,0,0,dpr,0,0);x.clearRect(0,0,s,s);const r=rotation();const axes=[{v:[1,0,0],name:'X',color:'#ff6a70'},{v:[0,1,0],name:'Y',color:'#67e99c'},{v:[0,0,1],name:'Z',color:'#68aaff'}];for(const a of axes){const v=[r[0]*a.v[0]+r[3]*a.v[1]+r[6]*a.v[2],r[1]*a.v[0]+r[4]*a.v[1]+r[7]*a.v[2],r[2]*a.v[0]+r[5]*a.v[1]+r[8]*a.v[2]];a.point=v;a.z=v[2]}axes.sort((a,b)=>a.z-b.z);for(const a of axes){const [xx,yy,zz]=a.point,px=56+xx*32,py=56-yy*32;x.strokeStyle=a.color;x.globalAlpha=zz<0?.4:1;x.lineWidth=2.5;x.beginPath();x.moveTo(56,56);x.lineTo(px,py);x.stroke();x.fillStyle=a.color;x.beginPath();x.arc(px,py,11,0,Math.PI*2);x.fill();x.fillStyle='#08121f';x.font='bold 12px Segoe UI';x.textAlign='center';x.textBaseline='middle';x.fillText(a.name,px,py)}x.globalAlpha=1}

function matMul(a,b){let out=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)out[c*4+r]+=a[k*4+r]*b[c*4+k];return out}
function rotation(){let a=rx*Math.PI/180,b=(ry+phase)*Math.PI/180,ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b);return new Float32Array([cb,sb*sa,-sb*ca,0,ca,sa,sb,-cb*sa,cb*ca])}
function draw(){const rect=host.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}gl.viewport(0,0,w,h);gl.clearColor(.07,.11,.17,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.frontFace(gl.CCW);
const rot=rotation(),model=new Float32Array([rot[0],rot[1],rot[2],0,rot[3],rot[4],rot[5],0,rot[6],rot[7],rot[8],0,0,0,0,1]);
const view=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,-zoom,1]);
const f=1/Math.tan(Math.PI/7),aspect=w/h,near=.1,far=100;const proj=new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0]);
gl.uniformMatrix4fv(uni.uMVP,false,matMul(proj,matMul(view,model)));gl.uniformMatrix3fv(uni.uRotation,false,rot);
const h6=(hue%360)/60,k=Math.floor(h6),t=h6-k,base=[[1,t,0],[1-t,1,0],[0,1,t],[0,1-t,1],[t,0,1],[1,0,1-t]][k].map(v=>.23+.77*v);
gl.uniform3fv(uni.uBase,base);gl.uniform4f(uni.uLights,lights.key,lights.fill,lights.rim,lights.ambient);
gl.uniform3f(uni.uKeyColor,1,.76,.52);gl.uniform3f(uni.uFillColor,.41,.68,1);gl.uniform3f(uni.uRimColor,.86,.92,1);
gl.uniform3fv(uni.uKeyDir,norm([-.65,.75,1]));gl.uniform3fv(uni.uFillDir,norm([.85,.2,.7]));gl.uniform3fv(uni.uRimDir,norm([.3,.8,-1]));
gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,mesh.tri,gl.STATIC_DRAW);gl.enableVertexAttribArray(attrib.pos);gl.enableVertexAttribArray(attrib.normal);gl.vertexAttribPointer(attrib.pos,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(attrib.normal,3,gl.FLOAT,false,24,12);gl.drawArrays(gl.TRIANGLES,0,mesh.tri.length/6);drawGuides(proj,view,model);updateGizmo();
if(wire||showNormals){gl.disable(gl.CULL_FACE);gl.bindBuffer(gl.ARRAY_BUFFER,lineBuffer);const data=wire?mesh.lines:mesh.normals;const expanded=new Float32Array(data.length*2);for(let i=0;i<data.length/3;i++){expanded.set(data.subarray(i*3,i*3+3),i*6);expanded.set([0,0,1],i*6+3)}gl.bufferData(gl.ARRAY_BUFFER,expanded,gl.DYNAMIC_DRAW);gl.vertexAttribPointer(attrib.pos,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(attrib.normal,3,gl.FLOAT,false,24,12);gl.uniform3f(uni.uBase,wire?.85:.12,wire?.85:1,wire?.85:.35);gl.uniform4f(uni.uLights,0,0,0,3);gl.drawArrays(gl.LINES,0,expanded.length/6)}
}
function markActive(selector,selected){document.querySelectorAll(selector).forEach(b=>b.classList.toggle('active',b.dataset.shape===selected||b.dataset.preset===selected))}
function buildLights(){const el=$('lights');el.replaceChildren();for(const id of ['key','fill','rim','ambient']){const box=document.createElement('div'),label=document.createElement('label');label.className='sliderlabel';label.textContent=lightNames[id];const output=document.createElement('output');output.textContent=lights[id].toFixed(2);label.appendChild(output);const input=document.createElement('input');input.type='range';input.min=0;input.max=2.5;input.step=.05;input.value=lights[id];input.addEventListener('input',()=>{lights[id]=+input.value;output.textContent=lights[id].toFixed(2);markActive('[data-preset]',null);dirty=true});box.append(label,input);el.appendChild(box)}}
document.querySelectorAll('[data-shape]').forEach(b=>b.addEventListener('click',()=>{shape=b.dataset.shape;geometry();markActive('[data-shape]',shape)}));
document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{['key','fill','rim','ambient'].forEach((id,i)=>lights[id]=presets[b.dataset.preset][i]);buildLights();markActive('[data-preset]',b.dataset.preset);dirty=true}));
canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing'});
canvas.addEventListener('pointermove',e=>{if(!drag)return;ry+=(e.clientX-drag[0])*.45;rx=Math.max(-89,Math.min(89,rx+(e.clientY-drag[1])*.45));drag=[e.clientX,e.clientY];dirty=true});
for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,()=>{drag=null;canvas.style.cursor='grab'});
canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(3.5,Math.min(12,zoom+Math.sign(e.deltaY)*.3));$('zoom').value=zoom;$('zoomValue').textContent=zoom.toFixed(1);dirty=true},{passive:false});
$('zoom').addEventListener('input',e=>{zoom=+e.target.value;$('zoomValue').textContent=zoom.toFixed(1);dirty=true});
$('hue').addEventListener('input',e=>{hue=+e.target.value;$('hueValue').textContent=hue+'°';dirty=true});
$('smooth').addEventListener('change',e=>{smoothShade=e.target.checked;geometry()});
$('wire').addEventListener('change',e=>{wire=e.target.checked;dirty=true});
$('normals').addEventListener('change',e=>{showNormals=e.target.checked;dirty=true});
$('spin').addEventListener('change',e=>{spin=e.target.checked;dirty=true});$('grid').addEventListener('change',e=>{gridVisible=e.target.checked;dirty=true});$('axes').addEventListener('change',e=>{axesVisible=e.target.checked;dirty=true});
function reset(){rx=24;ry=32;zoom=5.5;hue=210;shape='cube';smoothShade=true;wire=false;showNormals=false;spin=false;gridVisible=true;axesVisible=true;phase=0;lights={key:1.5,fill:.8,rim:1.3,ambient:.32};$('zoom').value=zoom;$('zoomValue').textContent=zoom.toFixed(1);$('hue').value=hue;$('hueValue').textContent=hue+'°';for(const id of ['wire','normals','spin'])$(id).checked=false;$('smooth').checked=true;$('grid').checked=true;$('axes').checked=true;markActive('[data-shape]',shape);markActive('[data-preset]','studio');buildLights();geometry();$('status').textContent='Scéna resetována'}
async function save(){try{draw();const result=await window.studioDesktop.savePNG(canvas.toDataURL('image/png'));$('status').textContent=result.ok?'PNG uloženo':result.canceled?'Ukládání zrušeno':'Chyba ukládání'}catch(e){$('status').textContent='Chyba: '+e.message}}
$('save').addEventListener('click',save);$('reset').addEventListener('click',reset);
window.studioDesktop.onCommand(command=>{if(command==='save')save();else if(command==='reset')reset();else if(['wire','normals','spin'].includes(command))$(command).click()});
function frame(t){const dt=Math.min(.05,(t-last)/1000||0);last=t;if(spin){phase+=dt*30;dirty=true}if(dirty){draw();dirty=false}requestAnimationFrame(frame)}
geometry();buildLights();requestAnimationFrame(frame);
})();