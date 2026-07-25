from __future__ import annotations

from uuid import uuid4

from .conversations import ConversationStore
from .models import ChatRequest, ChatResponse
from .provider import OpenAICompatibleProvider, ProviderError
from .safety import evaluate_input, expression_for, review_output
from .settings_store import SettingsStore


OFFLINE_REPLIES = (
    "开拓者，咱现在还没连上模型，不过拍照和陪你说两句可不耽误！",
    "嗯……这题先让咱记在相机旁边。等模型连接好，咱再认真回答你。",
    "本姑娘收到啦！现在是离线陪伴模式，咱先在这里陪着你。",
)


class ChatService:
    def __init__(
        self,
        settings: SettingsStore,
        conversations: ConversationStore,
    ):
        self.settings = settings
        self.conversations = conversations

    async def respond(self, request: ChatRequest) -> ChatResponse:
        user_id = f"msg_{uuid4()}"
        self.conversations.append(
            user_id,
            request.session_id,
            "user",
            request.message,
        )
        safe_reply = evaluate_input(request.message)
        configured = self.settings.load()
        provider_name = configured.routing.companion_chat
        provider_settings = getattr(configured, provider_name)
        fallback = False

        if safe_reply:
            text = safe_reply
            model = "local-safety"
            provider_name = "local"
        elif not provider_settings.api_key or not provider_settings.enabled:
            fallback = True
            text = OFFLINE_REPLIES[
                sum(ord(char) for char in request.message)
                % len(OFFLINE_REPLIES)
            ]
            model = "local-fallback"
            provider_name = "local"
        else:
            history = [
                message.model_dump()
                for message in request.history[-20:]
            ]
            history.append({"role": "user", "content": request.message})
            provider = OpenAICompatibleProvider(provider_settings)
            try:
                raw_text, model = await provider.chat(history)
                text = review_output(raw_text)
            except ProviderError:
                fallback = True
                text = OFFLINE_REPLIES[0]
                model = "local-fallback"
                provider_name = "local"

        assistant_id = f"msg_{uuid4()}"
        self.conversations.append(
            assistant_id,
            request.session_id,
            "assistant",
            text,
            provider_name,
        )
        return ChatResponse(
            session_id=request.session_id,
            message_id=assistant_id,
            text=text,
            expression=expression_for(text),
            provider=provider_name,
            model=model,
            fallback=fallback,
        )
