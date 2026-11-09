import { useMemo, useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Line, Html } from '@react-three/drei';
import type { OrbitControls as Controls } from 'three-stdlib';
import coastlines from '@/satellites/coastlines.json';
import { surfacePoint, type OrbitPosition } from '@/satellites/orbits';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { footprint } from '@/satellites/observation';

type Props={satellites:{id:number;pos:OrbitPosition}[];selected:number;select:(id:number)=>void;orbit:[number,number,number][];ground:[number,number,number][];demoLink:boolean;reset:number;scan:number|null;focusObservation:boolean;ready:()=>void};
const displayPoint=(p:[number,number,number]):[number,number,number]=>{const r=Math.hypot(...p),scale=(1+Math.max(0,r-1)*.35)/r;return [p[0]*scale,p[1]*scale,p[2]*scale];};
function Scene({satellites,selected,select,orbit,ground,demoLink,reset,scan,focusObservation,ready}:Props) {
  const controls=useRef<Controls>(null);
  const {camera,gl}=useThree();
  const reduced=useReducedMotion();
  const colors=useMemo(()=>{const css=getComputedStyle(document.documentElement);const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;const ctx=canvas.getContext('2d');const token=(name:string)=>{if(!ctx)return 'gray';ctx.fillStyle=css.getPropertyValue(name).trim();ctx.fillRect(0,0,1,1);const p=ctx.getImageData(0,0,1,1).data;return `rgb(${p[0]},${p[1]},${p[2]})`;};return {land:token('--card'),line:token('--terrain'),accent:token('--observation'),text:token('--foreground')};},[]);
  const lines=useMemo(()=>coastlines.filter(l=>l.length>2).map(l=>l.map(p=>surfacePoint(p[1],p[0],1.003))),[]);
  useEffect(()=>{const p=focusObservation?surfacePoint(28,-88,8.4):[1.2,1.5,6.8];camera.position.set(p[0],p[1],p[2]);camera.lookAt(0,0,0);controls.current?.target.set(0,0,0);controls.current?.update();},[reset,camera,focusObservation]);
  useEffect(()=>{gl.domElement.parentElement?.setAttribute('data-scene-ready','true');},[gl]);
  useEffect(()=>{ready();},[ready]);
  const chosen=satellites.find(s=>s.id===selected);
  return <>
    <ambientLight intensity={.9}/><directionalLight position={[4,3,5]} intensity={1.6}/>
    <mesh><sphereGeometry args={[1,64,48]}/><meshStandardMaterial color={colors.land} roughness={.85}/></mesh>
    {lines.map((pts,i)=><Line key={i} points={pts} color={colors.line} lineWidth={.7} transparent opacity={.7}/>)}
    {orbit.length>1&&<Line points={orbit.map(displayPoint)} color={colors.accent} lineWidth={1} transparent opacity={.55}/>}
    {ground.length>1&&<Line points={ground} color={colors.accent} lineWidth={1} transparent opacity={.35}/>}
    {satellites.map(s=><mesh key={s.id} position={displayPoint(s.pos.xyz)} onClick={e=>{e.stopPropagation();select(s.id);}}><sphereGeometry args={[s.id===selected?.045:.033,12,8]}/><meshBasicMaterial color={colors.accent}/></mesh>)}
    <mesh position={surfacePoint(37.9,-96.25,1.012)}><sphereGeometry args={[.014,10,8]}/><meshBasicMaterial color={colors.accent}/></mesh>
    {demoLink&&<Html position={surfacePoint(37.9,-96.25,1.04)}><span className="pointer-events-none ml-3 whitespace-nowrap bg-background/90 px-2 py-1 text-[10px] text-foreground">Greenwood County</span></Html>}
    {demoLink&&chosen&&<Line points={[displayPoint(chosen.pos.xyz),surfacePoint(37.9,-96.25,1.015)]} color={colors.accent} dashed dashSize={.08} gapSize={.06} lineWidth={1}/>}
    {scan != null && <Line points={footprint(scan).map(p=>surfacePoint(p[0],p[1],1.018))} color={colors.accent} lineWidth={2} transparent opacity={.8}/>}
    <OrbitControls ref={controls} enableDamping={!reduced} dampingFactor={.12} minDistance={1.6} maxDistance={18} enablePan={false}/>
  </>;
}
export default function SatelliteEarth(props:Props) {
  return <Canvas camera={{position:[1.2,1.5,6.8],fov:46,near:.01,far:100}} dpr={[1,1.5]} fallback={<p className="p-5 text-muted-foreground">3D Earth unavailable.</p>}><Scene {...props}/></Canvas>;
}