import {
  MARCH_7TH_SYSTEM_PROMPT,
  IDLE_LINES,
  getMarchReply,
  type MarchReply,
} from "./march7th";

export type RenderType = "static" | "live2d";

export interface Personality {
  systemPrompt: string;
  idleLines: MarchReply[];
  getReply: (rawInput: string) => MarchReply;
}

// 三月七人格模块。两个角色暂共用；注册表结构预留每角色独立人格的扩展位。
const MARCH_PERSONALITY: Personality = {
  systemPrompt: MARCH_7TH_SYSTEM_PROMPT,
  idleLines: IDLE_LINES,
  getReply: (input) => getMarchReply(input),
};

export interface CharacterDef {
  id: string;
  name: string;
  renderType: RenderType;
  imageSrc?: string; // static
  live2dModelPath?: string; // live2d
  personality: Personality;
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: "march7th",
    name: "三月七",
    renderType: "static",
    imageSrc: "./assets/march7th-pet.png",
    personality: MARCH_PERSONALITY,
  },
  {
    id: "march7th-2",
    name: "三月七2",
    renderType: "live2d",
    live2dModelPath: "./models/march7th-2/37.model3.json",
    personality: MARCH_PERSONALITY,
  },
];

export const DEFAULT_CHARACTER_ID = "march7th";

export function getCharacter(id: string | null | undefined): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}
