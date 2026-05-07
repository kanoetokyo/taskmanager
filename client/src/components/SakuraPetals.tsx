import { useEffect, useRef } from "react";

interface Clover {
  x: number;
  y: number;
  size: number;
  speedY: number;
  speedX: number;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
  swing: number;
  swingSpeed: number;
  swingOffset: number;
  isLucky: boolean; // 四つ葉かどうか（低確率）
}

const CLOVER_COUNT = 24;

function createClover(canvasWidth: number, canvasHeight: number, fromTop = false): Clover {
  return {
    x: Math.random() * canvasWidth,
    y: fromTop ? -20 - Math.random() * 100 : Math.random() * canvasHeight,
    size: 7 + Math.random() * 9,
    speedY: 0.5 + Math.random() * 0.9,
    speedX: -0.4 + Math.random() * 0.8,
    rotation: Math.random() * Math.PI * 2,
    rotationSpeed: (Math.random() - 0.5) * 0.03,
    opacity: 0.30 + Math.random() * 0.35,
    swing: 18 + Math.random() * 26,
    swingSpeed: 0.007 + Math.random() * 0.010,
    swingOffset: Math.random() * Math.PI * 2,
    isLucky: Math.random() < 0.15, // 15%の確率で四つ葉
  };
}

// ハート型の葉っぱ1枚を描画するヘルパー
function drawHeart(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  ctx.moveTo(0, r * 0.3);
  ctx.bezierCurveTo(-r * 1.0, -r * 0.2, -r * 1.0, -r * 1.1, 0, -r * 0.5);
  ctx.bezierCurveTo( r * 1.0, -r * 1.1,  r * 1.0, -r * 0.2, 0,  r * 0.3);
  ctx.closePath();
}

function drawClover(ctx: CanvasRenderingContext2D, clover: Clover, time: number) {
  ctx.save();

  const swingX = clover.x + Math.sin(time * clover.swingSpeed + clover.swingOffset) * clover.swing;

  ctx.translate(swingX, clover.y);
  ctx.rotate(clover.rotation);
  ctx.globalAlpha = clover.opacity;

  const r = clover.size * 0.48;
  const leafCount = clover.isLucky ? 4 : 3;
  const baseAngle = clover.isLucky ? -Math.PI / 4 : -Math.PI / 2;
  const angleStep = (Math.PI * 2) / leafCount;

  // 葉の色（四つ葉は少し明るい黄緑）
  const leafColor = clover.isLucky
    ? { center: "rgba(160, 220, 80, 1)", mid: "rgba(120, 195, 55, 1)", edge: "rgba(80, 155, 30, 0.7)" }
    : { center: "rgba(110, 195, 70, 1)", mid: "rgba(80, 165, 45, 1)",  edge: "rgba(50, 125, 20, 0.7)" };

  // 各葉を描画
  for (let i = 0; i < leafCount; i++) {
    const angle = baseAngle + angleStep * i;
    ctx.save();
    ctx.rotate(angle);
    ctx.translate(0, -r * 0.55);

    drawHeart(ctx, r);

    const grad = ctx.createRadialGradient(0, -r * 0.1, 0, 0, 0, r * 1.0);
    grad.addColorStop(0,   leafColor.center);
    grad.addColorStop(0.5, leafColor.mid);
    grad.addColorStop(1,   leafColor.edge);
    ctx.fillStyle = grad;
    ctx.fill();

    // 葉脈
    ctx.beginPath();
    ctx.moveTo(0, r * 0.25);
    ctx.lineTo(0, -r * 0.45);
    ctx.strokeStyle = "rgba(40, 100, 20, 0.30)";
    ctx.lineWidth = 0.6;
    ctx.stroke();

    ctx.restore();
  }

  // 中心の小さな円
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = clover.isLucky ? "rgba(130, 200, 60, 0.9)" : "rgba(80, 150, 40, 0.85)";
  ctx.fill();

  // 茎
  ctx.beginPath();
  ctx.moveTo(0, r * 0.2);
  ctx.quadraticCurveTo(r * 0.3, r * 1.0, r * 0.1, r * 1.6);
  ctx.strokeStyle = "rgba(50, 120, 30, 0.55)";
  ctx.lineWidth = 0.9;
  ctx.stroke();

  ctx.restore();
}

export default function SakuraPetals() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cloversRef = useRef<Clover[]>([]);
  const rafRef = useRef<number>(0);
  const timeRef = useRef<number>(0);

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

    // 初期クローバーを生成（画面全体にランダム配置）
    cloversRef.current = Array.from({ length: CLOVER_COUNT }, () =>
      createClover(canvas.width, canvas.height, false)
    );

    const animate = () => {
      timeRef.current += 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      cloversRef.current = cloversRef.current.map((clover) => {
        const newY = clover.y + clover.speedY;
        const newX = clover.x + clover.speedX;
        const newRotation = clover.rotation + clover.rotationSpeed;

        // 画面外に出たら上から再生成
        if (newY > canvas.height + 40) {
          return createClover(canvas.width, canvas.height, true);
        }

        drawClover(ctx, { ...clover, x: newX, y: newY, rotation: newRotation }, timeRef.current);

        return { ...clover, x: newX, y: newY, rotation: newRotation };
      });

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ opacity: 1 }}
      aria-hidden="true"
    />
  );
}
