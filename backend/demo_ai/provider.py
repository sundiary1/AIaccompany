import json
from collections.abc import AsyncIterator
from urllib.parse import urlsplit

import httpx

from .config import Settings

MAX_RESPONSE_BYTES = 2_000_000


class AIError(Exception):
    def __init__(self, code: str, message: str, retryable: bool = True, usage=None):
        super().__init__(code)
        self.code, self.message, self.retryable = code, message, retryable
        self.usage = usage or {}

    def public(self) -> dict:
        return {"code": self.code, "message": self.message, "retryable": self.retryable}


def provider_error(status: int, body: bytes) -> AIError:
    # Inspect privately for classification only; never relay provider messages.
    text = body.decode("utf-8", errors="replace").lower()
    if status == 402 or any(
        word in text
        for word in (
            "insufficient_quota",
            "insufficient_balance",
            "余额不足",
            "credit balance",
        )
    ):
        return AIError("quota", "服务额度不足，请检查供应商账户余额。", False)
    if status == 429:
        return AIError("rate_limit", "小屿的服务暂时繁忙，请稍后重试。")
    if status in {401, 403}:
        return AIError("authentication", "AI 服务认证失败，请检查服务端配置。", False)
    if status == 404 or "model_not_found" in text:
        return AIError(
            "model", "模型或接口不可用，请检查服务端的地址和模型名称。", False
        )
    return AIError("provider", "AI 服务暂时无法回复，请稍后重试。")


async def bounded_body(response: httpx.Response) -> bytes:
    result = bytearray()
    async for chunk in response.aiter_bytes():
        result.extend(chunk)
        if len(result) > MAX_RESPONSE_BYTES:
            raise AIError("response_size", "回复超出限制，请缩短问题后重试。", False)
    return bytes(result)


def json_content(body: bytes) -> str:
    try:
        data = json.loads(body)
        content = data["choices"][0]["message"]["content"]
        if isinstance(content, str) and content:
            return content
    except (ValueError, KeyError, IndexError, TypeError):
        pass
    raise AIError("protocol", "AI 服务返回格式不兼容，请检查供应商适配设置。", False)


class ChatCompletionsProvider:
    """Only this server-side adapter knows the provider protocol and address."""

    def __init__(self, settings: Settings, client: httpx.AsyncClient):
        self.settings, self.client = settings, client

    async def complete(self, messages: list[dict[str, str]]) -> tuple[str, dict]:
        """Bounded, single-call JSON extraction; no fallback or automatic retries."""
        settings = self.settings
        payload = {
            "model": settings.model,
            "messages": messages,
            settings.token_parameter: settings.max_output_tokens,
            "stream": False,
        }
        if urlsplit(settings.base_url).hostname == "api.deepseek.com":
            payload["thinking"] = {"type": "disabled"}
            payload["response_format"] = {"type": "json_object"}
        async with self.client.stream(
            "POST",
            settings.base_url.rstrip("/") + "/chat/completions",
            json=payload,
            headers={"Authorization": f"Bearer {settings.api_key}"},
        ) as response:
            body = await bounded_body(response)
            if response.status_code >= 400:
                raise provider_error(response.status_code, body)
            try:
                data = json.loads(body)
            except ValueError:
                raise AIError(
                    "protocol", "记忆提取返回格式不兼容，未保存。", False
                ) from None
            raw = data.get("usage") if isinstance(data, dict) else None
            raw = raw if isinstance(raw, dict) else {}
            usage = {
                key: min(max(value, 0), 100000000)
                for key in ["prompt_tokens", "completion_tokens"]
                if isinstance((value := raw.get(key)), int)
                and not isinstance(value, bool)
            }
            try:
                text = json_content(body)
            except AIError as error:
                error.usage = usage
                raise
            if data["choices"][0].get("finish_reason") == "length":
                raise AIError(
                    "memory_truncated", "记忆提取超出长度限制，未保存。", False, usage
                )
            return text, usage

    async def stream(self, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        settings = self.settings
        endpoint = settings.base_url.rstrip("/") + "/chat/completions"
        payload = {
            "model": settings.model,
            "messages": messages,
            settings.token_parameter: settings.max_output_tokens,
            "stream": settings.stream_mode != "off",
        }
        if urlsplit(settings.base_url).hostname == "api.deepseek.com":
            # Official DeepSeek defaults to thinking; concise companion replies
            # should use visible text within the demo's small output budget.
            payload["thinking"] = {"type": "disabled"}
        headers = {"Authorization": f"Bearer {settings.api_key}"}
        # No generic retries: avoid duplicate completions and accidental fees.
        for attempt in range(2):
            async with self.client.stream(
                "POST", endpoint, json=payload, headers=headers
            ) as response:
                if response.status_code >= 400:
                    body = await bounded_body(response)
                    lowered = body.decode("utf-8", errors="replace").lower()
                    unsupported = "stream" in lowered and any(
                        word in lowered
                        for word in (
                            "not support",
                            "unsupported",
                            "not allowed",
                            "不支持",
                        )
                    )
                    if (
                        attempt == 0
                        and settings.stream_mode == "auto"
                        and unsupported
                        and response.status_code in {400, 422, 501}
                    ):
                        payload["stream"] = False
                        continue
                    raise provider_error(response.status_code, body)
                if "text/event-stream" not in response.headers.get("content-type", ""):
                    # Some compatible providers ignore stream=true and return JSON.
                    yield json_content(await bounded_body(response))
                    return
                data_lines: list[str] = []
                total_bytes = 0
                terminal = False
                received = False
                async for line in response.aiter_lines():
                    total_bytes += len(line.encode("utf-8"))
                    if total_bytes > MAX_RESPONSE_BYTES:
                        raise AIError(
                            "response_size", "回复超出限制，请缩短问题后重试。", False
                        )
                    if line.startswith("data:"):
                        data_lines.append(line[5:].lstrip())
                    elif line == "" and data_lines:
                        data = "\n".join(data_lines)
                        data_lines = []
                        if data == "[DONE]":
                            terminal = True
                            break
                        try:
                            event = json.loads(data)
                            if "error" in event:
                                raise provider_error(502, data.encode())
                            for choice in event.get("choices", []):
                                if choice.get("finish_reason"):
                                    terminal = True
                                text = choice.get("delta", {}).get("content")
                                if isinstance(text, str) and text:
                                    received = True
                                    yield text
                        except (ValueError, KeyError, TypeError, AttributeError):
                            raise AIError(
                                "protocol", "AI 回复格式异常，请重试。"
                            ) from None
                if not terminal or not received:
                    raise AIError("interrupted", "回复连接意外中断，请重试。")
                return
