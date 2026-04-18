import { useEffect, useRef } from "react";

interface Petal {
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
}

const PETAL_COUNT = 28;

function createPetal(canvasWidth: number, canvasHeight: number, fromTop = false): Petal {
  return {
    x: Math.random() * canvasWidth,
    y: fromTop ? -20 - Math.random() * 100 : Math.random() * canvasHeight,
    size: 6 + Math.random() * 8,
    speedY: 0.6 + Math.random() * 1.0,
    speedX: -0.3 + Math.random() * 0.6,
    rotation: Math.random() * Math.PI * 2,
    rotationSpeed: (Math.random() - 0.5) * 0.04,
    opacity: 0.35 + Math.random() * 0.35,
    swing: 18 + Math.random() * 24,
    swingSpeed: 0.008 + Math.random() * 0.012,
    swingOffset: Math.random() * Math.PI * 2,
  };
}

function drawPetal(ctx: CanvasRenderingContext2D, petal: Petal, time: number) {
  ctx.save();

  const swingX = petal.x + Math.sin(time * petal.swingSpeed + petal.swingOffset) * petal.swing;

  ctx.translate(swingX, petal.y);
  ctx.rotate(petal.rotation);
  ctx.globalAlpha = petal.opacity;

  // 桜の花びら形状（楕円を2枚組み合わせたハート型）
  ctx.beginPath();
  const w = petal.size;
  const h = petal.size * 1.4;

  // 左の楕円
  ctx.save();
  ctx.rotate(-0.4);
  ctx.scale(1, 1.5);
  ctx.arc(-w * 0.25, 0, w * 0.5, 0, Math.PI * 2);
  ctx.restore();

  // 右の楕円
  ctx.save();
  ctx.rotate(0.4);
  ctx.scale(1, 1.5);
  ctx.arc(w * 0.25, 0, w * 0.5, 0, Math.PI * 2);
  ctx.restore();

  // グラデーション塗り
  const grad = ctx.createRadialGradient(0, -h * 0.1, 0, 0, 0, w);
  grad.addColorStop(0, "rgba(255, 220, 230, 1)");
  grad.addColorStop(0.5, "rgba(255, 183, 197, 1)");
  grad.addColorStop(1, "rgba(240, 150, 170, 0.7)");
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.restore();
}

export default function SakuraPetals() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const petalsRef = useRef<Petal[]>([]);
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

    // 初期花びらを生成（画面全体にランダム配置）
    petalsRef.current = Array.from({ length: PETAL_COUNT }, () =>
      createPetal(canvas.width, canvas.height, false)
    );

    const animate = () => {
      timeRef.current += 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      petalsRef.current = petalsRef.current.map((petal) => {
        // 落下・横移動
        const newY = petal.y + petal.speedY;
        const newX = petal.x + petal.speedX;
        const newRotation = petal.rotation + petal.rotationSpeed;

        // 画面外に出たら上から再生成
        if (newY > canvas.height + 30) {
          return createPetal(canvas.width, canvas.height, true);
        }

        drawPetal(ctx, { ...petal, x: newX, y: newY, rotation: newRotation }, timeRef.current);

        return { ...petal, x: newX, y: newY, rotation: newRotation };
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
