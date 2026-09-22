"""Versioned routing selected after local synthetic deliberation comparisons."""
MODEL_ROUTING_VERSION = "mixed-deliberation-v1"
MODELS = {
    "extraction": "gpt-5.6-luna",
    "themes": "gpt-5.6-luna",
    "common-ground": "gpt-6-astra",
    "report": "gpt-6-astra",
}
TIMEOUTS = {"extraction": 20, "themes": 20, "common-ground": 60, "report": 40}


def model_request(task):
    # The pinned SDK supports max_completion_tokens and extra_body. These body
    # fields are serialized at the top level without upgrading unrelated APIs.
    return {"model": MODELS[task], "max_completion_tokens": 8000,
            "extra_body": {"reasoning_effort": "low", "store": False}}


def model_client_options(task):
    return {"timeout": TIMEOUTS[task], "max_retries": 0}


def generation_metadata(task, response):
    return {"routingVersion": MODEL_ROUTING_VERSION, "requestedModel": MODELS[task],
            "model": getattr(response, "model", None) or MODELS[task], "reasoningEffort": "low"}
