export type Expression = "bright" | "soft" | "proud" | "curious";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  provider?: string;
  createdAt?: string;
};

export type ChatResponse = {
  session_id: string;
  message_id: string;
  text: string;
  expression: Expression;
  provider: string;
  model: string;
  fallback: boolean;
};

export type ProviderView = {
  enabled: boolean;
  base_url: string;
  model: string;
  configured: boolean;
  api_key_masked: string;
};

export type ControlSettings = {
  schema_version: number;
  deepseek: ProviderView;
  zhipu: ProviderView;
  cosyvoice: ProviderView;
  routing: {
    workbench_generation: "deepseek" | "zhipu";
    region_search: "zhipu";
    companion_chat: "deepseek" | "zhipu";
    companion_review: "deepseek" | "zhipu";
    text_to_speech: "cosyvoice";
  };
  updated_at: string;
};
