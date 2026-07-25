import { useEffect, useRef } from "react";
// 用 pixi-live2d-display（cubism4）渲染。该组件由 CharacterVisual 用 React.lazy 引入，
// 使 pixi + pixi-live2d-display 单独成块，仅在 Live2D 角色挂载时才下载。
// CubismCore 运行时也按需注入 <script>（静态角色用户完全不会加载它）。

let corePromise: Promise<void> | null = null;
function ensureCubismCore(): Promise<void> {
  const w = window as unknown as { Live2DCubismCore?: unknown };
  if (w.Live2DCubismCore) return Promise.resolve();
  if (corePromise) return corePromise;
  corePromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "./lib/live2dcubismcore.min.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("加载 CubismCore 失败"));
    document.head.appendChild(script);
  });
  return corePromise;
}

interface Live2DStageProps {
  modelPath: string;
}

export function Live2DStage({ modelPath }: Live2DStageProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let app: any = null;
    let cancelled = false;

    (async () => {
      try {
        await ensureCubismCore();
        if (cancelled || !hostRef.current) return;
        const PIXI = await import("pixi.js");
        const { Live2DModel } = await import("pixi-live2d-display/cubism4");
        const host = hostRef.current;
        const w = host.clientWidth || 200;
        const h = host.clientHeight || 220;

        app = new PIXI.Application({
          transparent: true,
          autoStart: true,
          width: w,
          height: h,
          backgroundAlpha: 0,
        });
        const canvas = app.view as HTMLCanvasElement;
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        // 关键：画布不拦截指针事件，点击/拖拽照常冒泡到外层 <motion.button>，交互零变化
        canvas.style.pointerEvents = "none";
        host.appendChild(canvas);

        const model = await Live2DModel.from(modelPath);
        if (cancelled) {
          app.stage.removeChildren();
          app.destroy({ children: true, texture: true, baseTexture: true });
          app = null;
          return;
        }
        app.stage.addChild(model);
        // 直接拉伸填满画布（顶左对齐，避免头部被裁）
        const mw = model.width || 1;
        const mh = model.height || 1;
        model.scale.set(w / mw, h / mh);
        model.x = 0;
        model.y = 0;
        model.autoInteract = false; // 不接管交互；动画（呼吸/眨眼）仍由 ticker 驱动
      } catch (error) {
        console.error("[Live2DStage] 初始化失败", error);
      }
    })();

    return () => {
      cancelled = true;
      try {
        app?.destroy?.({ children: true, texture: true, baseTexture: true });
      } catch {
        /* 忽略销毁错误 */
      }
      if (hostRef.current) hostRef.current.innerHTML = "";
    };
  }, [modelPath]);

  return <div ref={hostRef} className="live2d-host" />;
}

export default Live2DStage;
