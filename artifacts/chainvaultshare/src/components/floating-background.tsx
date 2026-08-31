import { useEffect, useRef } from "react";

interface Particle {
  px: number; // 0-1 fraction of canvas width
  py: number; // 0-1 fraction of canvas height
  z: number;
  vpx: number;
  vpy: number;
  vz: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  rotVX: number;
  rotVY: number;
  rotVZ: number;
  type: number;
  size: number;
  opacity: number;
}

function rotatePoint(x: number, y: number, z: number, rx: number, ry: number, rz: number) {
  let nx: number, ny: number, nz: number;
  ny = y * Math.cos(rx) - z * Math.sin(rx);
  nz = y * Math.sin(rx) + z * Math.cos(rx);
  y = ny; z = nz;
  nx = x * Math.cos(ry) + z * Math.sin(ry);
  nz = -x * Math.sin(ry) + z * Math.cos(ry);
  x = nx; z = nz;
  nx = x * Math.cos(rz) - y * Math.sin(rz);
  ny = x * Math.sin(rz) + y * Math.cos(rz);
  return { x: nx, y: ny, z: nz };
}

function project(x: number, y: number, z: number, fov: number, cx: number, cy: number) {
  const perspective = fov / (fov + z);
  return { sx: x * perspective + cx, sy: y * perspective + cy, scale: perspective };
}

function drawFile(
  ctx: CanvasRenderingContext2D,
  rx: number, ry: number, rz: number,
  size: number, opacity: number, z: number, fov: number, cx: number, cy: number,
  isDark: boolean
) {
  const w = size, h = size * 1.3, fold = size * 0.35;
  const verts: [number, number, number][] = [
    [-w/2, -h/2, 0], [w/2-fold, -h/2, 0], [w/2, -h/2+fold, 0],
    [w/2, h/2, 0], [-w/2, h/2, 0],
    [w/2-fold, -h/2, 0], [w/2-fold, -h/2+fold, 0], [w/2, -h/2+fold, 0],
  ];
  const proj = verts.map(([vx, vy, vz]) => {
    const r = rotatePoint(vx, vy, vz, rx, ry, rz);
    return project(r.x, r.y, r.z + z, fov, cx, cy);
  });

  const color = isDark
    ? `rgba(0,255,230,${opacity * 0.75})`
    : `rgba(0,60,45,${opacity * 0.85})`;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(proj[0].sx, proj[0].sy);
  for (let i = 1; i <= 4; i++) ctx.lineTo(proj[i].sx, proj[i].sy);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(proj[5].sx, proj[5].sy);
  ctx.lineTo(proj[6].sx, proj[6].sy);
  ctx.lineTo(proj[7].sx, proj[7].sy);
  ctx.stroke();

  const lineColor = isDark ? `rgba(0,255,230,${opacity * 0.3})` : `rgba(0,60,45,${opacity * 0.4})`;
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1.2;
  for (const ly of [0.1*h, 0.25*h, 0.4*h]) {
    const a = rotatePoint(-w*0.3, ly, 0, rx, ry, rz);
    const b = rotatePoint(w*0.35, ly, 0, rx, ry, rz);
    const pa = project(a.x, a.y, a.z+z, fov, cx, cy);
    const pb = project(b.x, b.y, b.z+z, fov, cx, cy);
    ctx.beginPath(); ctx.moveTo(pa.sx, pa.sy); ctx.lineTo(pb.sx, pb.sy); ctx.stroke();
  }
  ctx.restore();
}

function drawFolder(
  ctx: CanvasRenderingContext2D,
  rx: number, ry: number, rz: number,
  size: number, opacity: number, z: number, fov: number, cx: number, cy: number,
  isDark: boolean
) {
  const w = size*1.2, h = size*0.9, tab = size*0.35, tabH = size*0.18;
  const verts: [number, number, number][] = [
    [-w/2, -h/2+tabH, 0], [-w/2+tab, -h/2+tabH, 0],
    [-w/2+tab+size*0.1, -h/2, 0], [-w/2+tab+size*0.35, -h/2, 0],
    [w/2, -h/2+tabH, 0], [w/2, h/2, 0], [-w/2, h/2, 0],
  ];
  const proj = verts.map(([vx, vy, vz]) => {
    const r = rotatePoint(vx, vy, vz, rx, ry, rz);
    return project(r.x, r.y, r.z+z, fov, cx, cy);
  });

  ctx.save();
  ctx.strokeStyle = isDark ? `rgba(100,255,190,${opacity*0.75})` : `rgba(0,90,45,${opacity*0.85})`;
  ctx.lineWidth = 1.8;
  ctx.lineJoin = "round";
  ctx.beginPath();
  proj.forEach((p, i) => { if (i===0) ctx.moveTo(p.sx,p.sy); else ctx.lineTo(p.sx,p.sy); });
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawLock(
  ctx: CanvasRenderingContext2D,
  rx: number, ry: number, rz: number,
  size: number, opacity: number, z: number, fov: number, cx: number, cy: number,
  isDark: boolean
) {
  const w = size*0.7, h = size*0.55, sr = size*0.28;
  const body: [number,number,number][] = [[-w/2,0,0],[w/2,0,0],[w/2,h,0],[-w/2,h,0]];
  const proj = body.map(([vx,vy,vz]) => {
    const r = rotatePoint(vx,vy,vz,rx,ry,rz);
    return project(r.x,r.y,r.z+z,fov,cx,cy);
  });

  ctx.save();
  ctx.strokeStyle = isDark ? `rgba(200,165,255,${opacity*0.75})` : `rgba(90,0,180,${opacity*0.85})`;
  ctx.lineWidth = 1.8;
  ctx.lineJoin = "round";
  ctx.beginPath();
  proj.forEach((p,i) => { if(i===0) ctx.moveTo(p.sx,p.sy); else ctx.lineTo(p.sx,p.sy); });
  ctx.closePath();
  ctx.stroke();

  const arcPts: {sx:number;sy:number}[] = [];
  for (let i=0; i<=12; i++) {
    const angle = Math.PI + (Math.PI*i)/12;
    const ax = Math.cos(angle)*sr, ay = Math.sin(angle)*sr - sr*0.1;
    const r = rotatePoint(ax,ay,0,rx,ry,rz);
    arcPts.push(project(r.x,r.y,r.z+z,fov,cx,cy));
  }
  ctx.beginPath();
  arcPts.forEach((p,i) => { if(i===0) ctx.moveTo(p.sx,p.sy); else ctx.lineTo(p.sx,p.sy); });
  ctx.stroke();
  ctx.restore();
}

export function FloatingBackground({ isDark }: { isDark: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const isDarkRef = useRef(isDark);
  
  // Track actual mouse coordinates
  const mouseRef = useRef({ x: -1000, y: -1000, active: false });
  // Interpolated mouse follower coordinates
  const followRef = useRef({ x: -1000, y: -1000 });

  useEffect(() => { isDarkRef.current = isDark; }, [isDark]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
      mouseRef.current.active = true;
      if (followRef.current.x === -1000) {
        followRef.current.x = e.clientX;
        followRef.current.y = e.clientY;
      }
    };
    window.addEventListener("mousemove", handleMouseMove);

    // Increase count to 48 for a richer layout representation
    const COUNT = 48;
    const particles: Particle[] = [];
    for (let i = 0; i < COUNT; i++) {
      particles.push({
        px: Math.random(),
        py: Math.random(),
        z: Math.random() * 320 - 100, // Z depth range
        vpx: (Math.random() - 0.5) * 0.00015,
        vpy: (Math.random() - 0.5) * 0.00015,
        vz: (Math.random() - 0.5) * 0.07,
        rotX: Math.random() * Math.PI * 2,
        rotY: Math.random() * Math.PI * 2,
        rotZ: Math.random() * Math.PI * 2,
        rotVX: (Math.random() - 0.5) * 0.004,
        rotVY: (Math.random() - 0.5) * 0.006,
        rotVZ: (Math.random() - 0.5) * 0.003,
        type: Math.floor(Math.random() * 3),
        size: 16 + Math.random() * 26, // Increased size range for thicker visibility
        opacity: 0.25 + Math.random() * 0.55,
      });
    }
    particlesRef.current = particles;

    const fov = 500;
    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);
      const dark = isDarkRef.current;

      // Draw interactive glowing 3D-feeling cursor follower
      if (mouseRef.current.active) {
        const mouse = mouseRef.current;
        const follow = followRef.current;
        
        // Interpolate cursor follower coordinates with ease (spring inertia)
        follow.x += (mouse.x - follow.x) * 0.08;
        follow.y += (mouse.y - follow.y) * 0.08;

        ctx.save();
        // Outer glowing 3D aura
        const glowRad = 80;
        const gradient = ctx.createRadialGradient(follow.x, follow.y, 5, follow.x, follow.y, glowRad);
        if (dark) {
          gradient.addColorStop(0, "rgba(0, 255, 230, 0.12)");
          gradient.addColorStop(0.5, "rgba(100, 255, 190, 0.03)");
          gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
        } else {
          gradient.addColorStop(0, "rgba(0, 180, 160, 0.08)");
          gradient.addColorStop(0.5, "rgba(0, 180, 160, 0.02)");
          gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
        }
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(follow.x, follow.y, glowRad, 0, Math.PI * 2);
        ctx.fill();

        // 3D-angled reticle cursor indicator
        ctx.strokeStyle = dark ? "rgba(0, 255, 230, 0.4)" : "rgba(0, 120, 100, 0.5)";
        ctx.lineWidth = 1.5;
        
        // Draw cybernetic crosshair or bracket rings
        ctx.beginPath();
        ctx.arc(follow.x, follow.y, 16, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(follow.x, follow.y, 16, 1.15 * Math.PI, 1.85 * Math.PI);
        ctx.stroke();
        
        // Small inner target dot
        ctx.fillStyle = dark ? "rgba(0, 255, 230, 0.7)" : "rgba(0, 120, 100, 0.8)";
        ctx.beginPath();
        ctx.arc(follow.x, follow.y, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Draw 3D floating particles with mouse parallax
      for (const p of particlesRef.current) {
        p.px += p.vpx;
        p.py += p.vpy;
        p.z += p.vz;
        p.rotX += p.rotVX;
        p.rotY += p.rotVY;
        p.rotZ += p.rotVZ;

        // Wrap around boundaries
        if (p.px > 1.05) p.px = -0.05;
        if (p.px < -0.05) p.px = 1.05;
        if (p.py > 1.05) p.py = -0.05;
        if (p.py < -0.05) p.py = 1.05;
        if (p.z > 320) p.vz *= -1;
        if (p.z < -100) p.vz *= -1;

        // Calculate depth (closer particles have higher scale and parallax reaction)
        const depth = (p.z + 100) / 420; // 0 to 1 scale
        const effectiveOpacity = p.opacity * (0.3 + depth * 0.7);

        // Standard positions
        let screenX = p.px * w;
        let screenY = p.py * h;

        // 3D Parallax offset based on mouse position
        if (mouseRef.current.active) {
          const mouse = mouseRef.current;
          const dx = (mouse.x - w / 2) * 0.06 * depth;
          const dy = (mouse.y - h / 2) * 0.06 * depth;
          screenX += dx;
          screenY += dy;
        }

        if (p.type === 0) {
          drawFile(ctx, p.rotX, p.rotY, p.rotZ, p.size, effectiveOpacity, p.z, fov, screenX, screenY, dark);
        } else if (p.type === 1) {
          drawFolder(ctx, p.rotX, p.rotY, p.rotZ, p.size, effectiveOpacity, p.z, fov, screenX, screenY, dark);
        } else {
          drawLock(ctx, p.rotX, p.rotY, p.rotZ, p.size, effectiveOpacity, p.z, fov, screenX, screenY, dark);
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0, width: "100vw", height: "100vh", opacity: isDark ? 1 : 0.85 }}
    />
  );
}
