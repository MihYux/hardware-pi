import { lazy, Suspense } from "react";
import { getCharacter } from "../character/registry";

// Live2D 渲染器懒加载：pixi + pixi-live2d-display + CubismCore 只在选中 Live2D 角色时下载。
const Live2DStage = lazy(() => import("./Live2DStage"));

interface CharacterVisualProps {
  characterId: string;
}

/**
 * 角色视觉。只负责渲染形象本身（静态 <img> 或 Live2D 画布）。
 * 由外层按钮承载交互（点击/拖拽/气泡），这里不带任何交互处理；
 * Live2D 画布 pointer-events:none，确保点击穿透，交互零变化。
 */
export function CharacterVisual({ characterId }: CharacterVisualProps) {
  const character = getCharacter(characterId);

  if (character.renderType === "live2d" && character.live2dModelPath) {
    return (
      <Suspense fallback={null}>
        <Live2DStage modelPath={character.live2dModelPath} />
      </Suspense>
    );
  }

  return (
    <img
      src={character.imageSrc ?? "./assets/march7th-pet.png"}
      alt="桌宠角色"
      draggable={false}
    />
  );
}
