import { ChatOpenAI } from "langchain/chat_models/openai";
import { CallbackManager } from "langchain/callbacks";

import { ChatCraftMessage } from "./ChatCraftMessage";
import { ChatCraftModel } from "./ChatCraftModel";
import { getSettings, OPENAI_API_URL } from "./settings";

import type { Tiktoken } from "tiktoken/lite";
import { getReferer } from "./utils";

const usingOfficialOpenAI = () => getSettings().apiUrl === OPENAI_API_URL;

// Each provider does their model naming differently, pick the right one
export const defaultModelForProvider = () => {
  // OpenAI
  if (usingOfficialOpenAI()) {
    return new ChatCraftModel("gpt-3.5-turbo");
  }

  // OpenRouter.ai
  return new ChatCraftModel("openai/gpt-3.5-turbo");
};

export type ChatOptions = {
  model?: ChatCraftModel;
  temperature?: number;
  onFinish?: (text: string) => void;
  onError?: (err: Error) => void;
  onPause?: () => void;
  onResume?: () => void;
  onData?: ({ token, currentText }: { token: string; currentText: string }) => void;
};

// Create the appropriate type of "OpenAI" compatible instance, based on `apiUrl`
const createChatAPI = ({
  temperature,
  onData,
  model,
}: Pick<ChatOptions, "temperature" | "onData" | "model">) => {
  const { apiKey, apiUrl } = getSettings();
  if (!apiKey) {
    throw new Error("Missing API Key");
  }

  // If we're using OpenRouter, add extra headers
  let headers = undefined;
  if (!usingOfficialOpenAI()) {
    headers = {
      "HTTP-Referer": getReferer(),
      "X-Title": "chatcraft.org",
    };
  }

  return new ChatOpenAI(
    {
      openAIApiKey: apiKey,
      temperature: temperature ?? 0,
      // Only stream if the caller wants to handle onData events
      // TODO: need streaming to work with OpenRouter too
      streaming: !!onData,
      // Use the provided model, or fallback to whichever one is default right now
      modelName: model ? model.id : getSettings().model.id,
    },
    {
      basePath: apiUrl,
      baseOptions: {
        headers,
      },
    }
  );
};

export const chatWithLLM = (messages: ChatCraftMessage[], options: ChatOptions = {}) => {
  const buffer: string[] = [];
  const { onData, onFinish, onPause, onResume, onError, temperature, model } = options;

  // Allow the stream to be cancelled
  const controller = new AbortController();

  // Wire-up ESC key to cancel
  const cancel = () => {
    controller.abort();
  };
  const handleCancel = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      cancel();
    }
  };
  addEventListener("keydown", handleCancel);

  // Allow pause and resume
  let isPaused = false;
  const pause = () => {
    isPaused = true;
    if (onPause) {
      onPause();
    }
  };
  const resume = () => {
    isPaused = false;
    if (onResume) {
      onResume();
    }
  };
  const togglePause = () => {
    if (isPaused) {
      resume();
    } else {
      pause();
    }
  };

  // Grab the promise so we can return, but callers can also do everything via events
  const chatAPI = createChatAPI({ temperature, onData, model });
  const promise = chatAPI
    .call(
      // Convert the messages to langchain format before sending
      messages.map((message) => message.toLangChainMessage()),
      {
        options: { signal: controller.signal },
      },
      CallbackManager.fromHandlers({
        handleLLMNewToken(token: string) {
          buffer.push(token);
          if (onData && !isPaused) {
            onData({ token, currentText: buffer.join("") });
          }
        },
      })
    )
    .then(({ content }) => {
      if (onFinish) {
        onFinish(content);
      }
      return content;
    })
    .catch((err) => {
      // Deal with cancelled messages by returning a partial message
      if (err.message.startsWith("Cancel:")) {
        buffer.push("...");
        const text = buffer.join("");
        if (onFinish) {
          onFinish(text);
        }
        return text;
      }

      const handleError = (error: Error) => {
        if (onError) {
          onError(error);
        } else {
          throw error;
        }
      };

      // Try to extract the actual OpenAI API error from what langchain gives us
      // which is JSON embedded in the error text.
      // eslint-disable-next-line no-useless-catch
      try {
        const matches = err.message.match(/{"error".+$/);
        if (matches) {
          const openAiError = JSON.parse(matches[0]);
          handleError(new Error(`OpenAI API Error: ${openAiError.error.message}`));
        } else {
          handleError(err);
        }
      } catch (err2) {
        handleError(err2 as Error);
      }
    })
    .finally(() => {
      removeEventListener("keydown", handleCancel);
    });

  return {
    // Force the promise to always return a string (langchain's returns undefined in some cases)
    promise: promise.then((result) => (typeof result === "string" ? result : "")),
    cancel,
    pause,
    resume,
    togglePause,
  };
};

export async function queryModels(apiKey: string) {
  const { apiUrl } = getSettings();
  const usingOpenAI = usingOfficialOpenAI();
  const res = await fetch(`${apiUrl}/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!res.ok) {
    const { error } = await res.json();
    throw new Error(error?.message ?? `error querying API`);
  }

  const { data } = await res.json();

  return data
    .filter((model: any) => !usingOpenAI || model.id.includes("gpt"))
    .map((model: any) => model.id) as string[];
}

export async function validateOpenAiApiKey(apiKey: string) {
  return !!(await queryModels(apiKey));
}

// Cache this instance on first use
let encoding: Tiktoken;

// TODO: If we're using OpenRouter, we have to alter our token counting logic for other models...
export const countTokens = async (text: string) => {
  if (!encoding) {
    // Warn if this happens when it shouldn't. The UI should only
    // be calling `countTokens()` if we have the setting enabled
    if (!getSettings().countTokens) {
      console.trace("Unexpected call to countTokens() when settings.countTokens not set");
    }

    // We don't bundle these, but load them dynamically at runtime if needed due to size
    const { Tiktoken } = await import("tiktoken/lite");
    const cl100k_base = await import("tiktoken/encoders/cl100k_base.json");
    encoding = new Tiktoken(cl100k_base.bpe_ranks, cl100k_base.special_tokens, cl100k_base.pat_str);
  }

  return encoding.encode(text).length;
};

export const countTokensInMessages = async (messages: ChatCraftMessage[]) => {
  const counts = await Promise.all<number>(messages.map((message) => message.tokens()));
  return counts.reduce((total, current) => total + current, 0);
};

// See https://openai.com/pricing
export const calculateTokenCost = (tokens: number, model: ChatCraftModel) => {
  // Pricing is per 1,000 tokens
  tokens = tokens / 1000;

  if (model.id.startsWith("gpt-4")) {
    return tokens * 0.06;
  }

  if (model.id.startsWith("gpt-3.5")) {
    return tokens * 0.002;
  }

  console.warn(`Unknown pricing for model ${model.toString()}`);
  return 0;
};

export const openRouterPkceWindow = () => {
  const callbackUrl = window.location.href;
  const hostname = new URL(callbackUrl).origin;
  // Redirect the user to the OpenRouter authentication page in the same tab
  window.location.href = `https://openrouter.ai/auth?callback_url=${hostname}`;
};
