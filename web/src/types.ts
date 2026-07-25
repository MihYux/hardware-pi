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
  voice: VoiceSettings;
  updated_at: string;
};

export type VoiceSettings = {
  enabled: boolean;
  auto_play: boolean;
  volume: number;
  rate: number;
  voice_rights_confirmed: boolean;
  voice_id: string;
  sample_rate: number;
  instruction: string;
  provider?: "dashscope";
  base_url?: string;
  model?: string;
  configured?: boolean;
  provider_enabled?: boolean;
};

export type ContentType =
  | "daily"
  | "photo"
  | "postcard"
  | "relationship"
  | "version_preheat"
  | "version_launch"
  | "version_sustain"
  | "recall";

export type CompanionProfile = {
  display_name: string;
  region: "china" | "japan" | "north_america";
  language: string;
  time_zone: string;
  allowed_content_types: ContentType[];
  proactive_contact_enabled: boolean;
  recall_enabled: boolean;
  personalization_enabled: boolean;
  memory_enabled: boolean;
  quiet_hours: {
    start: string;
    end: string;
  };
  weekly_contact_limit: number;
  onboarding_completed: boolean;
  consent_version: string;
  paused: boolean;
  joined_at: string | null;
  updated_at: string;
};

export type MemoryRecord = {
  id: string;
  type: "choice" | "photo" | "postcard" | "milestone" | "version" | "return";
  title: string;
  summary: string;
  character_text: string;
  source_type: string;
  reusable_by_character: boolean;
  user_confirmed: boolean;
  created_at: string;
  updated_at: string;
};

export type Communication = {
  id: string;
  type: ContentType;
  title: string;
  body: string;
  review_status: "approved";
  sent_at: string;
  created_at: string;
  read_at: string | null;
  favorite: boolean;
  liked: boolean;
  remind_later: boolean;
  action: {
    kind: "none" | "open_album" | "open_version_demo";
    target_id: string | null;
  };
  delivery_mode: "system" | "proactive";
  template_id: string;
  source_delivery_id: string;
  review_mode: "local_rules" | "local_fallback" | "hybrid";
  review_reason: string;
};

export type ReleaseDeliveryStatus = {
  counts: {
    queued: number;
    deferred: number;
    delivered: number;
    rejected: number;
  };
  recent: Array<{
    delivery_id: string;
    status: "queued" | "deferred" | "delivered" | "rejected";
    last_reason: string;
    created_at: string;
    updated_at: string;
    delivered_at: string | null;
  }>;
};

export type CompanionSnapshot = {
  schema_version: number;
  profile: CompanionProfile;
  memories: MemoryRecord[];
  communications: Communication[];
  release_delivery: ReleaseDeliveryStatus;
  counts: {
    memories: number;
    communications: number;
    unread_communications: number;
  };
};
