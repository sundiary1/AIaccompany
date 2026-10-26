import asyncio
import json
from dataclasses import replace
from pathlib import Path

import anyio
import httpx
from pydantic import ValidationError

from .database import StorageError
from .memory_models import Candidate, Extraction
from .memory_rules import eligible_source, source_facts
from .provider import AIError, ChatCompletionsProvider

EXTRACTION_PROMPT = (Path(__file__).parent / "prompts/memory_extraction.txt").read_text(
    encoding="utf-8"
)


class LLMExtractor:
    is_mock = False

    def __init__(self, settings, client):
        memory_settings = replace(
            settings,
            model=settings.memory_model or settings.model,
            max_output_tokens=settings.memory_tokens,
            stream_mode="off",
        )
        self.provider = ChatCompletionsProvider(memory_settings, client)

    async def extract(self, source, existing):
        references = [
            {k: row[k] for k in ["id", "content", "revision"]} for row in existing[:8]
        ]
        data = {
            "user_message": {"id": source["id"], "content": source["content"]},
            "existing": references,
        }
        while len(json.dumps(data, ensure_ascii=False)) > 5000 and references:
            references.pop()
        return await self.provider.complete(
            [
                {"role": "system", "content": EXTRACTION_PROMPT},
                {"role": "user", "content": json.dumps(data, ensure_ascii=False)},
            ]
        )


class MockExtractor:
    is_mock = True

    async def extract(self, source, _existing):
        candidates = []
        for evidence, fact in source_facts(source["content"]):
            if fact and len(evidence) <= 180:
                candidates.append(
                    Candidate(
                        content=fact.content,
                        category=fact.category,
                        source_message_id=source["id"],
                        evidence=evidence,
                        action="add",
                    )
                )
        return json.dumps(
            {"memories": [c.model_dump(mode="json") for c in candidates[:3]]},
            ensure_ascii=False,
        ), {}


class MemoryWorker:
    def __init__(self, repository, extractor, settings):
        self.repository, self.extractor, self.settings = repository, extractor, settings
        self.pending_failure = None

    async def _fail(self, job, code):
        # Retry only the local failure bookkeeping, never the paid extraction.
        self.pending_failure = (job, code)
        await self.repository.fail(job, code)
        self.pending_failure = None

    async def run_once(self):
        if self.pending_failure:
            await self._fail(*self.pending_failure)
            return True
        job = await self.repository.claim(
            self.settings.memory_daily_calls, mock=self.extractor.is_mock
        )
        if job is None:
            return False
        source = job["source"]
        task = None
        try:
            # Screen the whole source BEFORE sending it to a second model.
            if not eligible_source(
                source["content"], self.settings.api_key
            ) or not source_facts(source["content"]):
                await self.repository.finish_job(job, [])
                return True
            if not self.extractor.is_mock:
                await self.repository.mark_call(job)
            task = asyncio.create_task(
                self.extractor.extract(source, job["references"])
            )
            async with asyncio.timeout(self.settings.memory_timeout):
                while not task.done():
                    await asyncio.wait({task}, timeout=0.25)
                    if not await self.repository.active(job):
                        if (
                            task.done()
                            and not task.cancelled()
                            and task.exception() is None
                        ):
                            _, returned_usage = task.result()
                            await self.repository.record_usage(job, returned_usage)
                        elif (
                            task.done()
                            and not task.cancelled()
                            and isinstance(task.exception(), AIError)
                        ):
                            await self.repository.record_usage(
                                job, task.exception().usage
                            )
                        else:
                            task.cancel()
                        await asyncio.gather(task, return_exceptions=True)
                        return True
                text, usage = await task
            await self.repository.record_usage(job, usage)
            if len(text) > 12000:
                raise AIError("memory_json_size", "记忆输出过长，未保存。", False)
            result = Extraction.model_validate_json(text)
            await self.repository.finish_job(job, result.memories)
        except asyncio.CancelledError:
            with anyio.CancelScope(shield=True):
                await self._fail(job, "interrupted")
            raise
        except (
            TimeoutError,
            ValidationError,
            ValueError,
            AIError,
            StorageError,
            httpx.TimeoutException,
        ) as error:
            code = (
                error.code
                if isinstance(error, (AIError, StorageError))
                else "memory_timeout"
                if isinstance(error, (TimeoutError, httpx.TimeoutException))
                else "memory_json"
            )
            try:
                if isinstance(error, AIError) and error.usage:
                    await self.repository.record_usage(job, error.usage)
            finally:
                await self._fail(job, code)
        except Exception:
            await self._fail(job, "memory_provider")
        finally:
            if task:
                if not task.done():
                    task.cancel()
                await asyncio.gather(task, return_exceptions=True)
        return True

    async def run(self):
        while True:
            try:
                worked = await self.run_once()
            except StorageError:
                worked = False
            await asyncio.sleep(0.15 if worked else 1)
