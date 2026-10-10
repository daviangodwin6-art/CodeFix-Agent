"""The only file that knows about the LLM provider. Swap providers here."""
import json
import os
import time
from pathlib import Path

FAKE_FILE = Path(__file__).parent.parent / "tests" / "fake_llm_tinyauth.json"


_fake_calls = {}  # (script file, step) -> calls made so far; fake provider only


class LLMError(Exception):
    pass


def complete(prompt):
    """Send one prompt, get back the model's text (expected to be JSON)."""
    if os.getenv("LLM_PROVIDER", "gemini") == "fake":
        # Scripted responses keyed by the prompt's first line ("STEP: localize" / "STEP: edit").
        path = os.getenv("FAKE_LLM_FILE") or str(FAKE_FILE)
        step = prompt.split("\n", 1)[0].removeprefix("STEP: ")
        answer = json.loads(Path(path).read_text(encoding="utf-8"))[step]
        if isinstance(answer, list):  # one answer per call (the last one repeats), to script a retry
            n = _fake_calls[path, step] = _fake_calls.get((path, step), -1) + 1
            answer = answer[min(n, len(answer) - 1)]
        return json.dumps(answer)

    key = os.getenv("GEMINI_API_KEY")
    if not key:
        raise LLMError("GEMINI_API_KEY is not set. Copy .env.example to .env and add your key "
                       "(or set LLM_PROVIDER=fake for the offline demo).")
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=key)
    config = types.GenerateContentConfig(response_mime_type="application/json", temperature=0)
    last = None
    # GEMINI_MODEL may list fallbacks: "first,second". Each retry moves to the next model.
    models = [m.strip() for m in os.getenv("GEMINI_MODEL", "gemini-3.7-flash").split(",") if m.strip()]
    for i, wait in enumerate((0, 5, 15, 30, 60)):  # retries for rate limits and "high demand" 503s
        time.sleep(wait)
        try:
            text = client.models.generate_content(
                model=models[i % len(models)], contents=prompt, config=config).text
            if text:
                return text
            last = "empty response"
        except Exception as e:  # SDK raises several error types; all mean "call failed"
            last = f"{type(e).__name__}: {e}"
            if getattr(e, "code", 503) not in (429, 500, 503, 504):
                break  # bad key, unknown model, bad request: retrying cannot help
    raise LLMError(f"Gemini call failed: {str(last)[:500]}")


def complete_json(prompt):
    """complete() parsed as JSON. Raises ValueError if the model did not return a JSON object."""
    text = complete(prompt).strip()
    if text.startswith("```"):
        text = text.strip("`").removeprefix("json")
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("model returned JSON that is not an object")
    return data
