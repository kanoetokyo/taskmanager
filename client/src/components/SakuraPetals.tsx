import { useEffect, useRef } from "react";

interface Leaf {
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
  colorIndex: number; // 葉の色バリエーション
}

const LEAF_COUNT = 22;

// 新緑カラーパレット
const LEAF_COLORS = [
  { center: "rgba(120, 200, 80, 1)",  mid: "rgba(90, 170, 55, 1)",  edge: "rgba(60, 130, 30, 0.7)"  }, // 明るい緑
  { center: "rgba(150, 210, 100, 1)", mid: "rgba(110, 185, 65, 1)", edge: "rgba(75, 145, 40, 0.7)"  }, // 黄緑
  { center: "rgba(100, 185, 70, 1)",  mid: "rgba(75, 160, 50, 1)",  edge: "rgba(50, 120, 25, 0.7)"  }, // 深緑
  { center: "rgba(170, 220, 110, 1)", mid: "rgba(130, 200, 80, 1)", edge: "rgba(90, 160, 50, 0.7)"  }, // 若葉
];

function createLeaf(canvasWidth: number, canvasHeight: number, fromTop = false): Leaf {
  return {
    x: Math.random() * canvasWidth,
    y: fromTop ? -20 - Math.random() * 100 : Math.random() * canvasHeight,
    size: 8 + Math.random() * 10,
    speedY: 0.5 + Math.random() * 0.9,
    speedX: -0.4 + Math.random() * 0.8,
    rotation: Math.random() * Math.PI * 2,
    rotationSpeed: (Math.random() - 0.5) * 0.035,
    opacity: 0.30 + Math.random() * 0.35,
    swing: 20 + Math.random() * 28,
    swingSpeed: 0.007 + Math.random() * 0.010,
    swingOffset: Math.random() * Math.PI * 2,
    colorIndex: Math.floor(Math.random() * LEAF_COLORS.length),
  };
}

function drawLeaf(ctx: CanvasRenderingContext2D, leaf: Leaf, time: number) {
  ctx.save();

  const swingX = leaf.x + Math.sin(time * leaf.swingSpeed + leaf.swingOffset) * leaf.swing;

  ctx.translate(swingX, leaf.y);
  ctx.rotate(leaf.rotation);
  ctx.globalAlpha = leaf.opacity;

  const s = leaf.size;
  const color = LEAF_COLORS[leaf.colorIndex];

  // 葉っぱ形状（楕円ベースの木の葉型）
  ctx.beginPath();
  ctx.save();
  ctx.scale(1, 1.8);
  ctx.arc(0, 0, s * 0.52, 0, Math.PI * 2);
  ctx.restore();

  // グラデーション塗り（中心から外側へ）
  const grad = ctx.createRadialGradient(0, -s * 0.15, 0, 0, 0, s * 0.6);
  grad.addColorStop(0,   color.center);
  grad.addColorStop(0.5, color.mid);
  grad.addColorStop(1,   color.edge);
  ctx.fillStyle = grad;
  ctx.fill();

  // 中央の葉脈（メイン）
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.85);
  ctx.lineTo(0,  s * 0.85);
  ctx.strokeStyle = "rgba(40, 100, 20, 0.35)";
  ctx.lineWidth = 0.7;
  ctx.stroke();

  // 左右の葉脈（サブ）
  for (let i = -1; i <= 1; i += 2) {
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.3);
    ctx.lineTo(i * s * 0.42, s * 0.15);
    ctx.strokeStyle = "rgba(40, 100, 20, 0.22)";
    ctx.lineWidth = 0.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, s * 0.1);
    ctx.lineTo(i * s * 0.38, s * 0.55);
    ctx.stroke();
  }

  ctx.restore();
}

export default function SakuraPetals() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const leavesRef = useRef<Leaf[]>([]);
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

    // 初期葉っぱを生成（画面全体にランダム配置）
    leavesRef.current = Array.from({ length: LEAF_COUNT }, () =>
      createLeaf(canvas.width, canvas.height, false)
    );

    const animate = () => {
      timeRef.current += 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      leavesRef.current = leavesRef.current.map((leaf) => {
        const newY = leaf.y + leaf.speedY;
        const newX = leaf.x + leaf.speedX;
        const newRotation = leaf.rotation + leaf.rotationSpeed;

        // 画面外に出たら上から再生成
        if (newY > canvas.height + 30) {
          return createLeaf(canvas.width, canvas.height, true);
        }

        drawLeaf(ctx, { ...leaf, x: newX, y: newY, rotation: newRotation }, timeRef.current);

        return { ...leaf, x: newX, y: newY, rotation: newRotation };
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
